import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from src.api.app import app
from src.api.status_listener import handle_status_event, is_valid_transition
from src.common.events import build_event_envelope
from src.common.models import Order
from src.config.db import AsyncSessionLocal

client = TestClient(app)


def test_transition_rules():
    # Valid forward transitions
    assert is_valid_transition("PENDING", "STOCK_RESERVED") is True
    assert is_valid_transition("STOCK_RESERVED", "PAID") is True
    assert is_valid_transition("PAID", "SHIPPED") is True

    # Valid transitions to terminal states
    assert is_valid_transition("PENDING", "FAILED") is True
    assert is_valid_transition("STOCK_RESERVED", "FAILED") is True
    assert is_valid_transition("PENDING", "CANCELLED") is True

    # Invalid backward transitions
    assert is_valid_transition("STOCK_RESERVED", "PENDING") is False
    assert is_valid_transition("PAID", "STOCK_RESERVED") is False
    assert is_valid_transition("SHIPPED", "PAID") is False

    # Terminal states can never transition
    assert is_valid_transition("SHIPPED", "FAILED") is False
    assert is_valid_transition("FAILED", "PAID") is False
    assert is_valid_transition("CANCELLED", "STOCK_RESERVED") is False


@pytest.mark.asyncio
async def test_status_listener_timeline_and_forward_transitions():
    order_id = str(uuid.uuid4())

    async with AsyncSessionLocal() as session:
        order = Order(
            id=order_id,
            order_number=f"ORD-STAT-{order_id[:8]}",
            user_id="u_1029",
            status="PENDING",
            total_amount=799.00,
            currency="INR",
            payment_method="UPI",
            shipping_address={},
        )
        session.add(order)
        await session.commit()

    # 1. Receive StockReserved -> status becomes STOCK_RESERVED
    evt_stock = build_event_envelope(
        "StockReserved",
        order_id,
        "inventory-worker",
        {"orderId": order_id, "items": [{"productId": "p_17", "quantity": 1}]},
    )
    await handle_status_event(evt_stock)

    async with AsyncSessionLocal() as session:
        o = (await session.execute(select(Order).where(Order.id == order_id))).scalar_one()
        assert o.status == "STOCK_RESERVED"

    # 2. Receive PaymentCompleted -> status becomes PAID
    evt_pay = build_event_envelope(
        "PaymentCompleted",
        order_id,
        "payment-worker",
        {"orderId": order_id, "amount": 799.00, "transactionRef": "TXN-TEST1"},
    )
    await handle_status_event(evt_pay)

    async with AsyncSessionLocal() as session:
        o = (await session.execute(select(Order).where(Order.id == order_id))).scalar_one()
        assert o.status == "PAID"

    # 3. Receive ShipmentCreated -> status becomes SHIPPED
    evt_ship = build_event_envelope(
        "ShipmentCreated",
        order_id,
        "shipping-worker",
        {"orderId": order_id, "trackingNumber": "SHP-12345", "carrier": "DemoExpress"},
    )
    await handle_status_event(evt_ship)

    async with AsyncSessionLocal() as session:
        o = (await session.execute(select(Order).where(Order.id == order_id))).scalar_one()
        assert o.status == "SHIPPED"

    # 4. Late event: receive StockReserved again -> ignored, stays SHIPPED
    await handle_status_event(evt_stock)
    async with AsyncSessionLocal() as session:
        o = (await session.execute(select(Order).where(Order.id == order_id))).scalar_one()
        assert o.status == "SHIPPED"

    # 5. Check GET /api/orders/:id/events returns full timeline
    res_login = client.post(
        "/api/auth/login",
        json={"email": "asha@example.com", "password": "Passw0rd!"},
    )
    token = res_login.json()["token"]

    events_res = client.get(
        f"/api/orders/{order_id}/events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert events_res.status_code == 200
    timeline = events_res.json()
    # Should contain StockReserved, PaymentCompleted, ShipmentCreated, and the late StockReserved
    event_types = [e["eventType"] for e in timeline]
    assert "StockReserved" in event_types
    assert "PaymentCompleted" in event_types
    assert "ShipmentCreated" in event_types
