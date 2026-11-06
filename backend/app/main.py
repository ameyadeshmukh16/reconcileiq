from fastapi import FastAPI

app = FastAPI(title="ReconcileIQ")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
