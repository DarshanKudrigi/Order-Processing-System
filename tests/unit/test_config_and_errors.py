import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, ValidationError

from src.api.app import app
from src.common.errors import ConflictError, NotFoundError, UnauthorizedError
from src.common.logger import JSONFormatter, logger, set_correlation_id, set_message_id
from src.config.env import Settings

mock_router = APIRouter(prefix="/mock-test")


class SampleInput(BaseModel):
    name: str = Field(..., min_length=2)
    quantity: int = Field(..., ge=1)


@mock_router.post("/validate")
async def handle_validation(payload: SampleInput):
    return {"success": True, "name": payload.name}


@mock_router.get("/conflict")
async def handle_conflict():
    raise ConflictError("Order cannot be cancelled in current status")


@mock_router.get("/not-found")
async def handle_not_found():
    raise NotFoundError("Order not found")


@mock_router.get("/unauthorized")
async def handle_unauthorized():
    raise UnauthorizedError("Missing token")


app.include_router(mock_router)
client = TestClient(app)


def test_invalid_env_validation():
    with pytest.raises(ValidationError):
        Settings(PORT=-1)

    with pytest.raises(ValidationError):
        Settings(JWT_SECRET="short")


def test_validation_error_envelope():
    response = client.post("/mock-test/validate", json={"name": "a", "quantity": 0})
    assert response.status_code == 400
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert data["error"]["message"] == "Invalid request"
    assert isinstance(data["error"]["details"], list)
    assert len(data["error"]["details"]) > 0


def test_custom_app_exceptions():
    res = client.get("/mock-test/conflict")
    assert res.status_code == 409
    assert res.json() == {
        "error": {
            "code": "CONFLICT",
            "message": "Order cannot be cancelled in current status",
        }
    }

    res2 = client.get("/mock-test/not-found")
    assert res2.status_code == 404
    assert res2.json() == {
        "error": {
            "code": "NOT_FOUND",
            "message": "Order not found",
        }
    }


def test_correlation_id_middleware():
    res = client.get("/api/health", headers={"X-Correlation-ID": "custom-corr-123"})
    assert res.status_code == 200
    assert res.headers.get("X-Correlation-ID") == "custom-corr-123"


def test_structured_json_logger():
    set_correlation_id("order-xyz")
    set_message_id("msg-abc")
    formatter = JSONFormatter()
    record = logger.makeRecord("test", 20, "fn", 1, "test message", (), None)
    formatted = formatter.format(record)
    assert "order-xyz" in formatted
    assert "msg-abc" in formatted
