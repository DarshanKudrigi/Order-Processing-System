import pytest
from fastapi.testclient import TestClient

from src.api.app import app
from src.config.service_bus import in_memory_bus

client = TestClient(app)


@pytest.fixture
def auth_tokens():
    # Login as asha
    res_asha = client.post(
        "/api/auth/login",
        json={"email": "asha@example.com", "password": "Passw0rd!"},
    )
    # Login as admin
    res_admin = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "Admin123!"},
    )
    return {
        "customer": res_asha.json()["token"],
        "admin": res_admin.json()["token"],
    }


def test_order_creation_and_lifecycle(auth_tokens):
    customer_token = auth_tokens["customer"]

    # Clear inventory-sub queue before test
    while not in_memory_bus.subscriptions["inventory-sub"].empty():
        in_memory_bus.subscriptions["inventory-sub"].get_nowait()

    # 1. Place order (EP-11)
    payload = {
        "items": [{"productId": "p_17", "quantity": 2}],
        "paymentMethod": "UPI",
        "shippingAddress": {
            "name": "Asha K",
            "line1": "12 MG Road",
            "city": "Mysuru",
            "state": "Karnataka",
            "pincode": "570001",
            "phone": "9876543210",
        },
    }
    res = client.post(
        "/api/orders",
        json=payload,
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert res.status_code == 202
    data = res.json()
    order_id = data["orderId"]
    assert data["status"] == "PENDING"
    # p_17 unit price is 799.00 * 2 = 1598.00
    assert data["totalAmount"] == 1598.00
    assert data["currency"] == "INR"

    # Verify message is visible in inventory-sub queue
    assert not in_memory_bus.subscriptions["inventory-sub"].empty()
    queued_msg = in_memory_bus.subscriptions["inventory-sub"].get_nowait()
    assert queued_msg.subject == "OrderCreated"
    assert queued_msg.correlation_id == order_id

    # 2. List orders (EP-12)
    list_res = client.get(
        "/api/orders",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert list_res.status_code == 200
    orders_list = list_res.json()["data"]
    assert any(o["id"] == order_id for o in orders_list)

    # 3. Order detail (EP-13)
    detail_res = client.get(
        f"/api/orders/{order_id}",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == order_id
    assert detail["status"] == "PENDING"
    assert len(detail["items"]) == 1
    assert detail["items"][0]["productId"] == "p_17"
    assert detail["items"][0]["quantity"] == 2

    # 4. Order events timeline (EP-14)
    events_res = client.get(
        f"/api/orders/{order_id}/events",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert events_res.status_code == 200
    events = events_res.json()
    assert len(events) >= 1
    assert events[0]["eventType"] == "OrderCreated"

    # 5. Cancel order (EP-15)
    cancel_res = client.post(
        f"/api/orders/{order_id}/cancel",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "CANCELLED"

    # Verify OrderCancelled message is visible in inventory-sub
    assert not in_memory_bus.subscriptions["inventory-sub"].empty()
    cancel_msg = in_memory_bus.subscriptions["inventory-sub"].get_nowait()
    assert cancel_msg.subject == "OrderCancelled"
    assert cancel_msg.correlation_id == order_id

    # 6. Attempting to cancel already CANCELLED order -> 409 CONFLICT
    second_cancel = client.post(
        f"/api/orders/{order_id}/cancel",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert second_cancel.status_code == 409
    assert second_cancel.json()["error"]["code"] == "CONFLICT"


def test_order_forbidden_access(auth_tokens):
    # Customer A creates order
    customer_token = auth_tokens["customer"]
    res = client.post(
        "/api/orders",
        json={
            "items": [{"productId": "p_17", "quantity": 1}],
            "paymentMethod": "CARD",
            "shippingAddress": {
                "name": "Asha K",
                "line1": "12 MG Road",
                "city": "Mysuru",
                "state": "Karnataka",
                "pincode": "570001",
                "phone": "9876543210",
            },
        },
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    order_id = res.json()["orderId"]

    # Register a new Customer B
    client.post(
        "/api/auth/register",
        json={
            "name": "Customer B",
            "email": "customer_b@example.com",
            "password": "Password123!",
        },
    )
    login_b = client.post(
        "/api/auth/login",
        json={"email": "customer_b@example.com", "password": "Password123!"},
    )
    token_b = login_b.json()["token"]

    # Customer B attempts to get Customer A's order -> 403 Forbidden
    forbidden_res = client.get(
        f"/api/orders/{order_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert forbidden_res.status_code == 403
    assert forbidden_res.json()["error"]["code"] == "FORBIDDEN"
