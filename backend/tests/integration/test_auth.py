import uuid

from fastapi import Depends
from fastapi.testclient import TestClient

from src.api.app import app
from src.common.auth import require_admin
from src.common.models import User

client = TestClient(app)


# Add an admin-only test route to verify role guards
@app.get("/api/test-admin-only")
async def admin_only_endpoint(_user: User = Depends(require_admin)):
    return {"admin": True}


def test_auth_flow():
    # 1. Register a new customer -> 201
    unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = client.post(
        "/api/auth/register",
        json={
            "name": "Test Customer",
            "email": unique_email,
            "password": "Password123!",
            "role": "CUSTOMER",
        },
    )
    assert reg_res.status_code == 201
    user_data = reg_res.json()
    assert user_data["email"] == unique_email
    assert user_data["name"] == "Test Customer"
    assert user_data["role"] == "CUSTOMER"

    # 2. Register duplicate email -> 409
    dup_res = client.post(
        "/api/auth/register",
        json={
            "name": "Duplicate Customer",
            "email": unique_email,
            "password": "Password123!",
        },
    )
    assert dup_res.status_code == 409
    assert dup_res.json()["error"]["code"] == "CONFLICT"

    # 3. Invalid login credentials -> 401
    bad_login = client.post(
        "/api/auth/login",
        json={"email": unique_email, "password": "WrongPassword!"},
    )
    assert bad_login.status_code == 401
    assert bad_login.json()["error"]["code"] == "UNAUTHORIZED"

    # 4. Successful login -> 200
    login_res = client.post(
        "/api/auth/login",
        json={"email": unique_email, "password": "Password123!"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["token"]
    assert token is not None
    assert login_res.json()["user"]["email"] == unique_email

    # 5. Access /api/auth/me without token -> 401
    me_unauth = client.get("/api/auth/me")
    assert me_unauth.status_code == 401

    # 6. Access /api/auth/me with valid token -> 200
    me_res = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_res.status_code == 200
    assert me_res.json()["email"] == unique_email

    # 7. Customer accessing admin-only endpoint -> 403 Forbidden
    admin_fail = client.get(
        "/api/test-admin-only",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert admin_fail.status_code == 403
    assert admin_fail.json()["error"]["code"] == "FORBIDDEN"

    # 8. Login as seeded admin -> Access admin-only endpoint -> 200
    admin_login = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "Admin123!"},
    )
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["token"]

    admin_ok = client.get(
        "/api/test-admin-only",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_ok.status_code == 200
    assert admin_ok.json()["admin"] is True
