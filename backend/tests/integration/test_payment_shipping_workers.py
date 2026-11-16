import uuid

import pytest
from sqlalchemy import select

from src.common.events import build_event_envelope
from src.common.models import Inventory, Order, OrderItem, Payment, Shipment
from src.config.db import AsyncSessionLocal
from src.config.service_bus import in_memory_bus
from src.workers.payment_worker import handle_payment
from src.workers.shipping_worker import handle_shipping


@pytest.mark.asyncio
async def test_payment_worker_success():
    order_id = str(uuid.uuid4())

    async with AsyncSessionLocal() as session:
        order = Order(
            id=order_id,
            order_number=f"ORD-PAY-{order_id[:8]}",
            user_id="u_1029",
            status="STOCK_RESERVED",
            total_amount=1500.00,
            currency="INR",
            payment_method="UPI",
            shipping_address={},
        )
        session.add(order)
        await session.commit()

    envelope = build_event_envelope(
        event_type="StockReserved",
        correlation_id=order_id,
        source="inventory-worker",
        data={"orderId": order_id, "items": [{"productId": "p_01", "quantity": 1}]},
    )

    await handle_payment(envelope)

    # Check payment row created
    async with AsyncSessionLocal() as session:
        payment = (
            await session.execute(select(Payment).where(Payment.order_id == order_id))
        ).scalar_one_or_none()
        assert payment is not None
        assert payment.status == "SUCCESS"
        assert payment.transaction_ref is not None
        assert payment.transaction_ref.startswith("TXN-")

    # Check PaymentCompleted message in shipping-sub
    assert not in_memory_bus.subscriptions["shipping-sub"].empty()
    msg = in_memory_bus.subscriptions["shipping-sub"].get_nowait()
    assert msg.subject == "PaymentCompleted"
    assert msg.correlation_id == order_id


@pytest.mark.asyncio
async def test_payment_worker_test_fail():
    order_id = str(uuid.uuid4())

    async with AsyncSessionLocal() as session:
        order = Order(
            id=order_id,
            order_number=f"ORD-FAIL-{order_id[:8]}",
            user_id="u_1029",
            status="STOCK_RESERVED",
            total_amount=899.00,
            currency="INR",
            payment_method="TEST_FAIL",
            shipping_address={},
        )
        session.add(order)
        await session.commit()

    envelope = build_event_envelope(
        event_type="StockReserved",
        correlation_id=order_id,
        source="inventory-worker",
        data={"orderId": order_id, "items": []},
    )

    await handle_payment(envelope)

    # Check payment row created with FAILED
    async with AsyncSessionLocal() as session:
        payment = (
            await session.execute(select(Payment).where(Payment.order_id == order_id))
        ).scalar_one_or_none()
        assert payment is not None
        assert payment.status == "FAILED"

    # Check PaymentFailed message routed to inventory-sub (for compensation) & status-sub
    assert not in_memory_bus.subscriptions["inventory-sub"].empty()
    msg = in_memory_bus.subscriptions["inventory-sub"].get_nowait()
    assert msg.subject == "PaymentFailed"


@pytest.mark.asyncio
async def test_shipping_worker():
    order_id = str(uuid.uuid4())

    async with AsyncSessionLocal() as session:
        order = Order(
            id=order_id,
            order_number=f"ORD-SHIP-{order_id[:8]}",
            user_id="u_1029",
            status="PAID",
            total_amount=799.00,
            currency="INR",
            payment_method="UPI",
            shipping_address={},
        )
        item = OrderItem(
            order_id=order_id,
            product_id="p_17",
            product_name="Wireless Mouse",
            unit_price=799.00,
            quantity=1,
        )
        # Ensure quantity_reserved is at least 1
        inv = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_17"))
        ).scalar_one()
        inv.quantity_reserved += 1
        session.add(order)
        session.add(item)
        await session.commit()
        res_before = inv.quantity_reserved

    envelope = build_event_envelope(
        event_type="PaymentCompleted",
        correlation_id=order_id,
        source="payment-worker",
        data={"orderId": order_id, "amount": 799.00, "transactionRef": "TXN-123456"},
    )

    await handle_shipping(envelope)

    # Check shipment created
    async with AsyncSessionLocal() as session:
        shipment = (
            await session.execute(select(Shipment).where(Shipment.order_id == order_id))
        ).scalar_one_or_none()
        assert shipment is not None
        assert shipment.carrier == "DemoExpress"
        assert shipment.tracking_number.startswith("SHP-")

        # Check reserved quantity decremented
        inv_after = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_17"))
        ).scalar_one()
        assert inv_after.quantity_reserved == res_before - 1

    # Check ShipmentCreated routed to notification-sub and status-sub
    assert not in_memory_bus.subscriptions["status-sub"].empty()
    msg = in_memory_bus.subscriptions["status-sub"].get_nowait()
    assert msg.subject == "ShipmentCreated"
