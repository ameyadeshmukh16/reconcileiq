import base64
import time

import pytest
from fastapi.testclient import TestClient

from app import cases, config, main
from app.agent import investigator

AUTH = {"Authorization": "Basic " + base64.b64encode(b"admin:s3cret").decode()}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "api.db"))
    monkeypatch.setattr(config, "AUTO_RUN_ON_START", False)
    monkeypatch.setattr(config, "BASIC_AUTH_USER", "admin")
    monkeypatch.setattr(config, "BASIC_AUTH_PASSWORD", "s3cret")
    main.state.active = False

    def fake_investigate(conn, case_id, order=()):           # no network: park the case for review
        cases.transition(conn, case_id, "investigating", "agent", "started")
        cases.transition(conn, case_id, "awaiting_review", "agent", "done",
                         fields={"recommendation": "escalate", "investigation_provider": "vultr",
                                 "investigation_model": "fake"})
    monkeypatch.setattr(investigator, "investigate", fake_investigate)
    with TestClient(main.app) as c:
        yield c


def wait_idle():
    for _ in range(100):
        if not main.state.active:
            return
        time.sleep(0.05)
    raise AssertionError("background investigation never finished")


def test_health_and_reads_are_public(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/cases").status_code == 200
    assert client.get("/api/runs/latest").status_code == 404      # nothing run yet


def test_writes_require_auth(client):
    assert client.post("/api/runs").status_code == 401
    r = client.post("/api/runs", headers={"Authorization": "Basic " + base64.b64encode(b"admin:wrong").decode()})
    assert r.status_code == 401 and "Basic" in r.headers["www-authenticate"]
    assert client.patch("/api/cases/x", json={"decision": "approved", "reason": "r", "actor": "a"}).status_code == 401


def test_writes_fail_closed_when_auth_unconfigured(client, monkeypatch):
    monkeypatch.setattr(config, "BASIC_AUTH_USER", "")
    monkeypatch.setattr(config, "BASIC_AUTH_PASSWORD", "")
    assert client.post("/api/runs", headers=AUTH).status_code == 503
    assert client.post("/api/runs").status_code == 503


def test_run_then_review_flow(client):
    r = client.post("/api/runs", headers=AUTH)
    assert r.status_code == 200
    run = r.json()
    assert run["total_cases"] == 10 and run["in_progress"] is True
    wait_idle()

    latest = client.get("/api/runs/latest").json()
    assert latest["run_id"] == run["run_id"] and latest["in_progress"] is False
    assert latest["by_status"] == {"awaiting_review": 10}
    assert client.get(f"/api/runs/{run['run_id']}").json()["total_cases"] == 10

    rows = client.get("/api/cases?status=awaiting_review&severity=high").json()
    assert rows and all(c["severity"] == "high" for c in rows)
    assert client.get("/api/cases?anomaly_type=missing_evidence").json()[0]["invoice_number"] == "INV-33981"

    case = rows[0]
    detail = client.get(f"/api/cases/{case['case_id']}").json()
    assert detail["case"]["case_id"] == case["case_id"] and detail["timeline"]

    body = {"decision": "approved", "reason": "checked against PO", "actor": "alice"}
    done = client.patch(f"/api/cases/{case['case_id']}", json=body, headers=AUTH)
    assert done.status_code == 200 and done.json()["status"] == "approved" and done.json()["resolved_by"] == "admin (declared reviewer: alice)"
    assert client.get(f"/api/cases/{case['case_id']}").json()["timeline"][-1]["type"] == "decision"
    assert client.get("/api/runs/latest").json()["by_status"]["approved"] == 1   # live counts

    again = client.patch(f"/api/cases/{case['case_id']}", json=body, headers=AUTH)
    assert again.status_code == 409                                          # cannot re-decide


def test_decision_validation(client):
    client.post("/api/runs", headers=AUTH)
    wait_idle()
    cid = client.get("/api/cases").json()[0]["case_id"]
    bad = client.patch(f"/api/cases/{cid}", json={"decision": "approved", "reason": "  ", "actor": "a"}, headers=AUTH)
    assert bad.status_code == 422
    nope = client.patch(f"/api/cases/{cid}", json={"decision": "maybe", "reason": "r", "actor": "a"}, headers=AUTH)
    assert nope.status_code == 422
    missing = client.patch("/api/cases/does-not-exist", json={"decision": "approved", "reason": "r", "actor": "a"}, headers=AUTH)
    assert missing.status_code == 404
    assert client.get("/api/cases/does-not-exist").status_code == 404


def test_cannot_decide_case_still_being_investigated(client, monkeypatch):
    monkeypatch.setattr(main, "run_investigation", lambda: setattr(main.state, "active", False))
    client.post("/api/runs", headers=AUTH)
    received = client.get("/api/cases?status=received").json()
    assert received
    r = client.patch(f"/api/cases/{received[0]['case_id']}",
                     json={"decision": "approved", "reason": "r", "actor": "a"}, headers=AUTH)
    assert r.status_code == 409


def test_rerun_does_not_duplicate_cases(client):
    client.post("/api/runs", headers=AUTH)
    wait_idle()
    client.post("/api/runs", headers=AUTH)
    wait_idle()
    assert len(client.get("/api/cases").json()) == 10


def test_client_cannot_impersonate_another_reviewer(client):
    client.post("/api/runs", headers=AUTH)
    wait_idle()
    cid = client.get("/api/cases").json()[0]["case_id"]
    body = {"decision": "approved", "reason": "r", "actor": "CFO"}
    out = client.patch(f"/api/cases/{cid}", json=body, headers=AUTH).json()
    assert out["resolved_by"].startswith("admin")               # authenticated identity is always recorded
    evt = client.get(f"/api/cases/{cid}").json()["timeline"][-1]
    assert evt["detail"]["authenticated_user"] == "admin" and evt["detail"]["declared_reviewer"] == "CFO"
