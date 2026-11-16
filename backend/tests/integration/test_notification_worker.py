import uuid

import pytest
from sqlalchemy import select

from src.common.events import build_event_envelope
from src.common.models import Notification, Order
from src.config.db import AsyncSessionLocal
from src.workers.notification_worker import handle_notification, render_notification


def test_notification_template_rendering():
    subject, body = render_notification(
        "OrderCreated",
        {"orderNumber": "ORD-20261116-00042", "totalAmount": 1598.00},
    )
    assert "ORD-20261116-00042" in subject
    assert "1598.0" in body

    subject_ship, body_ship = render_notification(
        "ShipmentCreated",
        {"orderNumber": "ORD-123", "trackingNumber": "SHP-9999", "carrier": "DemoExpress"},
    )
    assert "Shipped" in subject_ship
    assert "DemoExpress" in body_ship


@pytest.mark.asyncio
async def test_notification_worker_inserts_row():
    order_id = str(uuid.uuid4())

    async with AsyncSessionLocal() as session:
        order = Order(
            id=order_id,
            order_number=f"ORD-NOTIF-{order_id[:8]}",
            user_id="u_1029",
            status="PENDING",
            total_amount=500.00,
            currency="INR",
            payment_method="UPI",
            shipping_address={},
        )
        session.add(order)
        await session.commit()

    envelope = build_event_envelope(
        event_type="OrderCreated",
        correlation_id=order_id,
        source="order-api",
        data={
            "orderId": order_id,
            "orderNumber": f"ORD-NOTIF-{order_id[:8]}",
            "customerEmail": "asha@example.com",
            "totalAmount": 500.00,
        },
    )

    await handle_notification(envelope)

    async with AsyncSessionLocal() as session:
        notif = (
            await session.execute(select(Notification).where(Notification.order_id == order_id))
        ).scalar_one_or_none()
        assert notif is not None
        assert notif.recipient == "asha@example.com"
        assert notif.channel in ("LOG", "EMAIL")
        assert notif.status == "SENT"
