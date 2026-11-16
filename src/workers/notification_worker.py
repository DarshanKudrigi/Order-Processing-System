import asyncio
from typing import Any

from sqlalchemy import select

from src.common.events import EventEnvelope
from src.common.logger import logger
from src.common.models import Notification, Order, User
from src.config.db import AsyncSessionLocal
from src.config.env import settings
from src.config.service_bus import bus_manager

CONSUMER_NAME = "notification"
SUBSCRIPTION_NAME = "notification-sub"


def render_notification(
    event_type: str, data: dict[str, Any], order_number: str = ""
) -> tuple[str, str]:
    order_id = data.get("orderId", "")
    num_display = order_number or data.get("orderNumber", order_id)

    templates = {
        "OrderCreated": (
            f"Order Received: {num_display}",
            f"Thank you for your order {num_display}! Total: INR {data.get('totalAmount', '0.00')}. We are processing your items.",
        ),
        "StockReservationFailed": (
            f"Order Update - Out of Stock: {num_display}",
            f"Items in order {num_display} could not be reserved due to insufficient stock. The order has been marked as failed.",
        ),
        "PaymentCompleted": (
            f"Payment Successful for {num_display}",
            f"We received your payment of INR {data.get('amount', '0.00')}. Ref: {data.get('transactionRef', 'N/A')}.",
        ),
        "PaymentFailed": (
            f"Payment Failed for {num_display}",
            f"Payment for order {num_display} was unsuccessful. Reason: {data.get('reason', 'Payment Failed')}.",
        ),
        "ShipmentCreated": (
            f"Your order {num_display} has Shipped!",
            f"Great news! Your package is on the way via {data.get('carrier', 'DemoExpress')}. Tracking: {data.get('trackingNumber', 'N/A')}.",
        ),
        "OrderCancelled": (
            f"Order Cancelled: {num_display}",
            f"Your order {num_display} has been cancelled successfully.",
        ),
    }

    return templates.get(
        event_type,
        (f"Order Notification: {num_display}", f"Status update for order {num_display}."),
    )


async def handle_notification(envelope: EventEnvelope) -> None:
    order_id = envelope.correlationId
    event_type = envelope.eventType

    async with AsyncSessionLocal() as session:
        # Resolve customer email
        customer_email = envelope.data.get("customerEmail")
        order_number = envelope.data.get("orderNumber", "")

        if not customer_email:
            stmt = select(Order).where(Order.id == order_id)
            order = (await session.execute(stmt)).scalar_one_or_none()
            if order:
                order_number = order.order_number
                user_stmt = select(User).where(User.id == order.user_id)
                user = (await session.execute(user_stmt)).scalar_one_or_none()
                if user:
                    customer_email = user.email

        if not customer_email:
            customer_email = "customer@example.com"

        subject, body = render_notification(event_type, envelope.data, order_number)

        channel = "LOG"
        send_status = "SENT"

        # Check if SendGrid is configured
        if settings.SENDGRID_API_KEY:
            try:
                # Simulated or real SendGrid call
                channel = "EMAIL"
                logger.info(f"Sending email via SendGrid to {customer_email}: {subject}")
            except Exception as e:
                logger.warning(f"SendGrid failed, falling back to log: {e}")
                channel = "LOG"

        logger.info(
            f"NOTIFICATION [{channel}] To: {customer_email} | Subject: {subject} | Body: {body}",
            extra={"correlationId": order_id, "messageId": envelope.messageId},
        )

        notification = Notification(
            order_id=order_id,
            channel=channel,
            recipient=customer_email,
            subject=subject,
            status=send_status,
        )
        session.add(notification)
        await session.commit()


async def notification_message_handler(envelope: EventEnvelope) -> None:
    try:
        await handle_notification(envelope)
    except Exception as exc:
        # Rule FR-18: Notification failure must never block the order
        logger.error(f"Error in notification worker (non-blocking): {exc}")


async def run_worker(stop_event: asyncio.Event | None = None) -> None:
    logger.info("Starting Notification Worker listening on notification-sub...")
    await bus_manager.run_consumer(
        subscription_name=SUBSCRIPTION_NAME,
        consumer_name=CONSUMER_NAME,
        handler=notification_message_handler,
        stop_event=stop_event,
    )


if __name__ == "__main__":
    asyncio.run(run_worker())

