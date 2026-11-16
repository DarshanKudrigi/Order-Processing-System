import uuid

import pytest
from sqlalchemy import select

from src.common.events import build_event_envelope
from src.common.models import Inventory, Order, OrderItem
from src.config.db import AsyncSessionLocal
from src.config.service_bus import in_memory_bus
from src.workers.inventory_worker import (
    handle_order_created,
    handle_release_stock,
)


@pytest.mark.asyncio
async def test_inventory_reservation_success():
    order_id = str(uuid.uuid4())

    # Get initial stock for p_01
    async with AsyncSessionLocal() as session:
        inv = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_01"))
        ).scalar_one()
        initial_avail = inv.quantity_available
        initial_res = inv.quantity_reserved

    # Create OrderCreated envelope for 2 units of p_01
    envelope = build_event_envelope(
        event_type="OrderCreated",
        correlation_id=order_id,
        source="order-api",
        data={
            "orderId": order_id,
            "items": [{"productId": "p_01", "quantity": 2}],
        },
    )

    await handle_order_created(envelope)

    # Check updated stock
    async with AsyncSessionLocal() as session:
        inv_after = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_01"))
        ).scalar_one()
        assert inv_after.quantity_available == initial_avail - 2
        assert inv_after.quantity_reserved == initial_res + 2

    # Check StockReserved message routed to payment-sub
    assert not in_memory_bus.subscriptions["payment-sub"].empty()
    msg = in_memory_bus.subscriptions["payment-sub"].get_nowait()
    assert msg.subject == "StockReserved"
    assert msg.correlation_id == order_id


@pytest.mark.asyncio
async def test_inventory_reservation_failure_insufficient_stock():
    order_id = str(uuid.uuid4())

    # Try to reserve 99999 units of p_01
    envelope = build_event_envelope(
        event_type="OrderCreated",
        correlation_id=order_id,
        source="order-api",
        data={
            "orderId": order_id,
            "items": [{"productId": "p_01", "quantity": 99999}],
        },
    )

    await handle_order_created(envelope)

    # Check StockReservationFailed message routed to notification-sub & status-sub
    assert not in_memory_bus.subscriptions["notification-sub"].empty()
    msg = in_memory_bus.subscriptions["notification-sub"].get_nowait()
    assert msg.subject == "StockReservationFailed"
    assert msg.correlation_id == order_id


@pytest.mark.asyncio
async def test_inventory_release_compensation():
    order_id = str(uuid.uuid4())

    async with AsyncSessionLocal() as session:
        # Create dummy order with items for compensation testing
        order = Order(
            id=order_id,
            order_number=f"ORD-COMP-{order_id[:8]}",
            user_id="u_1029",
            status="PENDING",
            total_amount=100.0,
            currency="INR",
            payment_method="UPI",
            shipping_address={},
        )
        item = OrderItem(
            order_id=order_id,
            product_id="p_01",
            product_name="Mechanical Keyboard",
            unit_price=2499.00,
            quantity=2,
        )
        session.add(order)
        session.add(item)
        await session.commit()

        # Check stock before release
        inv = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_01"))
        ).scalar_one()
        avail_before = inv.quantity_available
        res_before = inv.quantity_reserved

    # Simulate release on PaymentFailed
    envelope = build_event_envelope(
        event_type="PaymentFailed",
        correlation_id=order_id,
        source="payment-worker",
        data={"orderId": order_id, "reason": "PAYMENT_FAILED"},
    )
    await handle_release_stock(envelope)

    # Check stock after release: available should increase by 2, reserved decrease by 2
    async with AsyncSessionLocal() as session:
        inv_after = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_01"))
        ).scalar_one()
        assert inv_after.quantity_available == avail_before + 2
        assert inv_after.quantity_reserved == res_before - 2
