import logging
import secrets
import threading
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel

from . import cases, config, db, pipeline
from .agent import investigator, llm
from .models import Case, CaseDetail, RunSummary

log = logging.getLogger("reconcileiq")


class _State:
    active = False                       # an investigation batch is scheduled or running
    lock = threading.Lock()              # only one investigation batch at a time


state = _State()


def run_investigation() -> None:
    """Investigate every pending case. Runs in a background thread with its own connection."""
    if not state.lock.acquire(blocking=False):
        return                           # a batch is already running; it will pick up pending cases
    try:
        conn = db.connect()
        try:
            for case_id in [r[0] for r in conn.execute(
                    "SELECT case_id FROM cases WHERE status IN ('received','investigating') ORDER BY flagged_at")]:
                try:
                    investigator.investigate(conn, case_id)
                except Exception as exc:   # noqa: BLE001
                    log.error("investigation failed for %s: %r", case_id, exc)
                    if isinstance(exc, llm.ConfigError) or type(exc).__name__ == "AuthenticationError":
                        break            # misconfiguration fails every case: stop, leave them pending, fix the key
                    investigator.escalate_on_failure(conn, case_id, exc)   # otherwise fail safe to a human
        finally:
            conn.close()
    finally:
        state.active = False
        state.lock.release()


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = pipeline.bootstrap()
    try:
        if config.AUTO_RUN_ON_START:
            if not cases.latest_run_id(conn):
                pipeline.run_pipeline(conn)          # first boot: populate the dashboard
            pending = conn.execute(
                "SELECT COUNT(*) FROM cases WHERE status IN ('received','investigating')").fetchone()[0]
            if pending:
                state.active = True
                threading.Thread(target=run_investigation, daemon=True).start()
    finally:
        conn.close()
    yield


app = FastAPI(title="ReconcileIQ", lifespan=lifespan)
_basic = HTTPBasic(auto_error=False)


def get_conn():
    conn = db.connect()
    try:
        yield conn
    finally:
        conn.close()


def require_auth(creds: Optional[HTTPBasicCredentials] = Depends(_basic)) -> str:
    """HTTP Basic Auth for write endpoints. Fails CLOSED if credentials are not configured."""
    if not config.BASIC_AUTH_USER or not config.BASIC_AUTH_PASSWORD:
        raise HTTPException(503, "Write endpoints are disabled: BASIC_AUTH_USER/PASSWORD not configured")
    ok = creds is not None and \
        secrets.compare_digest(creds.username.encode(), config.BASIC_AUTH_USER.encode()) and \
        secrets.compare_digest(creds.password.encode(), config.BASIC_AUTH_PASSWORD.encode())
    if not ok:
        raise HTTPException(401, "Authentication required", headers={"WWW-Authenticate": 'Basic realm="ReconcileIQ"'})
    return creds.username


def _summary(conn, run_id: str) -> RunSummary:
    try:
        s = cases.run_summary(conn, run_id)
    except cases.NotFoundError:
        raise HTTPException(404, f"Run {run_id} not found")
    s.in_progress = state.active
    return s


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/runs", response_model=RunSummary)
def start_run(background: BackgroundTasks, conn=Depends(get_conn), _user: str = Depends(require_auth)):
    summary = pipeline.run_pipeline(conn)            # deterministic rules: fast, synchronous
    pending = conn.execute("SELECT COUNT(*) FROM cases WHERE status IN ('received','investigating')").fetchone()[0]
    if pending and not state.active:
        state.active = True
        background.add_task(run_investigation)       # LLM investigation: slow, background
    summary.in_progress = state.active
    return summary


@app.get("/api/runs/latest", response_model=RunSummary)
def latest_run(conn=Depends(get_conn)):
    run_id = cases.latest_run_id(conn)
    if not run_id:
        raise HTTPException(404, "No runs yet")
    return _summary(conn, run_id)


@app.get("/api/runs/{run_id}", response_model=RunSummary)
def get_run(run_id: str, conn=Depends(get_conn)):
    return _summary(conn, run_id)


@app.get("/api/cases", response_model=list[Case])
def list_cases(status: Optional[str] = Query(None), severity: Optional[str] = Query(None),
               anomaly_type: Optional[str] = Query(None), conn=Depends(get_conn)):
    return cases.list_cases(conn, status, severity, anomaly_type)


@app.get("/api/cases/{case_id}", response_model=CaseDetail)
def get_case(case_id: str, conn=Depends(get_conn)):
    try:
        return cases.get_case_detail(conn, case_id)
    except cases.NotFoundError:
        raise HTTPException(404, f"Case {case_id} not found")


class Decision(BaseModel):
    # `actor` is the reviewer's SELF-DECLARED name. The recorded identity is the authenticated username.
    decision: Literal["approved", "dismissed"]
    reason: str
    actor: str


@app.patch("/api/cases/{case_id}", response_model=Case)
def decide_case(case_id: str, body: Decision, conn=Depends(get_conn), user: str = Depends(require_auth)):
    if not body.reason.strip() or not body.actor.strip():
        raise HTTPException(422, "reason and actor are required")
    try:
        return cases.decide(conn, case_id, body.decision, user, body.reason, declared_reviewer=body.actor)
    except cases.NotFoundError:
        raise HTTPException(404, f"Case {case_id} not found")
    except cases.TransitionError as exc:
        raise HTTPException(409, str(exc))
