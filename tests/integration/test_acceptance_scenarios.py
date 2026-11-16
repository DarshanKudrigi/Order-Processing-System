import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from src.api.app import app
from src.api.status_listener import handle_status_event
from src.common.events import EventEnvelope
from src.common.models import Inventory, Order, Payment
from src.config.db import AsyncSessionLocal
from src.config.service_bus import in_memory_bus
from src.workers.inventory_worker import inventory_message_handler
from src.workers.notification_worker import notification_message_handler
from src.workers.payment_worker import payment_message_handler
from src.workers.shipping_worker import shipping_message_handler

client = TestClient(app)


async def pump_events_until_idle(max_rounds: int = 15) -> None:
    """Drain all in-memory queues and dispatch to registered worker handlers."""
    for _ in range(max_rounds):
        processed_any = False

        # 1. inventory-sub
        while not in_memory_bus.subscriptions["inventory-sub"].empty():
            msg = in_memory_bus.subscriptions["inventory-sub"].get_nowait()
            env = EventEnvelope.model_validate_json(msg.body)
            await inventory_message_handler(env)
            processed_any = True

        # 2. payment-sub
        while not in_memory_bus.subscriptions["payment-sub"].empty():
            msg = in_memory_bus.subscriptions["payment-sub"].get_nowait()
            env = EventEnvelope.model_validate_json(msg.body)
            await payment_message_handler(env)
            processed_any = True

        # 3. shipping-sub
        while not in_memory_bus.subscriptions["shipping-sub"].empty():
            msg = in_memory_bus.subscriptions["shipping-sub"].get_nowait()
            env = EventEnvelope.model_validate_json(msg.body)
            await shipping_message_handler(env)
            processed_any = True

        # 4. status-sub
        while not in_memory_bus.subscriptions["status-sub"].empty():
            msg = in_memory_bus.subscriptions["status-sub"].get_nowait()
            env = EventEnvelope.model_validate_json(msg.body)
            await handle_status_event(env)
            processed_any = True

        # 5. notification-sub
        while not in_memory_bus.subscriptions["notification-sub"].empty():
            msg = in_memory_bus.subscriptions["notification-sub"].get_nowait()
            env = EventEnvelope.model_validate_json(msg.body)
            await notification_message_handler(env)
            processed_any = True

        if not processed_any:
            break
        await asyncio.sleep(0.01)


@pytest.fixture
def auth_tokens():
    res_asha = client.post(
        "/api/auth/login",
        json={"email": "asha@example.com", "password": "Passw0rd!"},
    )
    res_admin = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "Admin123!"},
    )
    return {
        "customer": res_asha.json()["token"],
        "admin": res_admin.json()["token"],
    }


@pytest.mark.asyncio
async def test_at_02_happy_path_order_reaches_shipped(auth_tokens):
    """AT-02: Place order for in-stock items with UPI.

    Status moves PENDING -> STOCK_RESERVED -> PAID -> SHIPPED. Tracking number shown.
    """
    token = auth_tokens["customer"]

    # Place order
    res = client.post(
        "/api/orders",
        json={
            "items": [{"productId": "p_01", "quantity": 1}],
            "paymentMethod": "UPI",
            "shippingAddress": {
                "name": "Asha K",
                "line1": "12 MG Road",
                "city": "Mysuru",
                "state": "Karnataka",
                "pincode": "570001",
                "phone": "9876543210",
            },
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 202
    order_id = res.json()["orderId"]
    assert res.json()["status"] == "PENDING"

    # Pump message pipeline through all worker subscriptions
    await pump_events_until_idle()

    # Verify final order state: SHIPPED with tracking number and payment ref
    detail_res = client.get(
        f"/api/orders/{order_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["status"] == "SHIPPED"
    assert detail["payment"] is not None
    assert detail["payment"]["status"] == "SUCCESS"
    assert detail["payment"]["transactionRef"].startswith("TXN-")
    assert detail["shipment"] is not None
    assert detail["shipment"]["carrier"] == "DemoExpress"
    assert detail["shipment"]["trackingNumber"].startswith("SHP-")


@pytest.mark.asyncio
async def test_at_03_out_of_stock_failure(auth_tokens):
    """AT-03: Order quantity above available stock.

    Status FAILED with reason INSUFFICIENT_STOCK; stock unchanged; no payment row.
    """
    token = auth_tokens["customer"]

    async with AsyncSessionLocal() as session:
        inv_before = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_21"))
        ).scalar_one()
        avail_before = inv_before.quantity_available
        res_before = inv_before.quantity_reserved

    # p_21 has available stock of 3 (seeded). Request 10 units.
    res = client.post(
        "/api/orders",
        json={
            "items": [{"productId": "p_21", "quantity": 10}],
            "paymentMethod": "UPI",
            "shippingAddress": {
                "name": "Asha K",
                "line1": "12 MG Road",
                "city": "Mysuru",
                "state": "Karnataka",
                "pincode": "570001",
                "phone": "9876543210",
            },
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 202
    order_id = res.json()["orderId"]

    await pump_events_until_idle()

    # Verify order is FAILED with reason INSUFFICIENT_STOCK
    detail = client.get(
        f"/api/orders/{order_id}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert detail["status"] == "FAILED"
    assert detail["failureReason"] == "INSUFFICIENT_STOCK"
    assert detail["payment"] is None

    # Stock counters must remain unchanged
    async with AsyncSessionLocal() as session:
        inv_after = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_21"))
        ).scalar_one()
        assert inv_after.quantity_available == avail_before
        assert inv_after.quantity_reserved == res_before


@pytest.mark.asyncio
async def test_at_04_payment_failed_compensation(auth_tokens):
    """AT-04: Place order with payment method TEST_FAIL.

    Status FAILED with reason PAYMENT_FAILED; reserved stock returns to available.
    """
    token = auth_tokens["customer"]

    async with AsyncSessionLocal() as session:
        inv_before = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_02"))
        ).scalar_one()
        avail_before = inv_before.quantity_available
        res_before = inv_before.quantity_reserved

    res = client.post(
        "/api/orders",
        json={
            "items": [{"productId": "p_02", "quantity": 2}],
            "paymentMethod": "TEST_FAIL",
            "shippingAddress": {
                "name": "Asha K",
                "line1": "12 MG Road",
                "city": "Mysuru",
                "state": "Karnataka",
                "pincode": "570001",
                "phone": "9876543210",
            },
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 202
    order_id = res.json()["orderId"]

    await pump_events_until_idle()

    detail = client.get(
        f"/api/orders/{order_id}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert detail["status"] == "FAILED"
    assert detail["failureReason"] == "PAYMENT_FAILED"
    assert detail["payment"]["status"] == "FAILED"

    # Reserved stock returns to available (compensation)
    async with AsyncSessionLocal() as session:
        inv_after = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_02"))
        ).scalar_one()
        assert inv_after.quantity_available == avail_before
        assert inv_after.quantity_reserved == res_before


@pytest.mark.asyncio
async def test_at_05_cancel_order_compensation(auth_tokens):
    """AT-05: Cancel order while PENDING or STOCK_RESERVED.

    Status CANCELLED; stock released; cancel button disappears / 409 on second cancel.
    """
    token = auth_tokens["customer"]

    async with AsyncSessionLocal() as session:
        inv_before = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_06"))
        ).scalar_one()
        avail_before = inv_before.quantity_available
        res_before = inv_before.quantity_reserved

    res = client.post(
        "/api/orders",
        json={
            "items": [{"productId": "p_06", "quantity": 1}],
            "paymentMethod": "UPI",
            "shippingAddress": {
                "name": "Asha K",
                "line1": "12 MG Road",
                "city": "Mysuru",
                "state": "Karnataka",
                "pincode": "570001",
                "phone": "9876543210",
            },
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    order_id = res.json()["orderId"]

    # Cancel while PENDING
    cancel_res = client.post(
        f"/api/orders/{order_id}/cancel",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "CANCELLED"

    await pump_events_until_idle()

    # Stock unchanged / released
    async with AsyncSessionLocal() as session:
        inv_after = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_06"))
        ).scalar_one()
        assert inv_after.quantity_available == avail_before
        assert inv_after.quantity_reserved == res_before


@pytest.mark.asyncio
async def test_at_07_duplicate_message_redelivery():
    """AT-07: Send the same message twice (re-delivery).

    Only one payment, one shipment, one stock change.
    """
    order_id = str(uuid.uuid4())
    msg_id = f"msg-at-07-{uuid.uuid4().hex[:6]}"

    async with AsyncSessionLocal() as session:
        order = Order(
            id=order_id,
            order_number=f"ORD-DUP-{uuid.uuid4().hex[:6]}",
            user_id="u_1029",
            status="STOCK_RESERVED",
            total_amount=100.00,
            currency="INR",
            payment_method="UPI",
            shipping_address={},
        )
        session.add(order)
        await session.commit()

    envelope = EventEnvelope(
        messageId=msg_id,
        correlationId=order_id,
        eventType="StockReserved",
        version=1,
        occurredAt="2026-11-16T12:00:00Z",
        source="inventory-worker",
        data={"orderId": order_id, "items": []},
    )

    # Process first time
    await payment_message_handler(envelope)

    # Process second time (re-delivery with same messageId)
    await payment_message_handler(envelope)

    # Verify only ONE payment row was created
    async with AsyncSessionLocal() as session:
        payments = (
            (await session.execute(select(Payment).where(Payment.order_id == order_id)))
            .scalars()
            .all()
        )
        assert len(payments) == 1
