from fastapi.testclient import TestClient

from src.api.app import app

client = TestClient(app)


def test_smoke_health() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
