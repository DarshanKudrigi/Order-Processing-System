import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from src.common.events import EventEnvelope
from src.common.logger import logger
from src.common.models import Order, OrderEvent
from src.config.db import AsyncSessionLocal
from src.config.service_bus import bus_manager

CONSUMER_NAME = "status-listener"
SUBSCRIPTION_NAME = "status-sub"

STATUS_ORDER = {
    "PENDING": 1,
    "STOCK_RESERVED": 2,
    "PAID": 3,
    "SHIPPED": 4,
}
TERMINAL_STATUSES = {"SHIPPED", "FAILED", "CANCELLED"}


def is_valid_transition(current_status: str, target_status: str) -> bool:
    """Transition rule (PRD Section 7.1 & Rule R6).

    Normal order is PENDING -> STOCK_RESERVED -> PAID -> SHIPPED.
    An update is accepted only if it moves forward or to FAILED / CANCELLED.
    FAILED, CANCELLED, and SHIPPED are terminal.
    """
    if current_status in TERMINAL_STATUSES:
        return False
    if target_status in ("FAILED", "CANCELLED"):
        return True
    current_rank = STATUS_ORDER.get(current_status, 0)
    target_rank = STATUS_ORDER.get(target_status, 0)
    return target_rank > current_rank


async def handle_status_event(envelope: EventEnvelope) -> None:
    order_id = envelope.correlationId
    event_type = envelope.eventType

    # Mapping from Section 7.1
    status_map = {
        "StockReserved": ("STOCK_RESERVED", None),
        "StockReservationFailed": ("FAILED", "INSUFFICIENT_STOCK"),
        "PaymentCompleted": ("PAID", None),
        "PaymentFailed": ("FAILED", "PAYMENT_FAILED"),
        "ShipmentCreated": ("SHIPPED", None),
    }

    if event_type not in status_map:
        logger.info(f"Status listener ignoring event type {event_type}")
        return

    target_status, failure_reason = status_map[event_type]

    async with AsyncSessionLocal() as session:
        # 1. Insert order timeline event
        timeline_entry = OrderEvent(
            order_id=order_id,
            event_type=event_type,
            message_id=envelope.messageId,
            payload=envelope.data,
            source=envelope.source,
            created_at=datetime.now(timezone.utc),
        )
        session.add(timeline_entry)

        # 2. Update order status if transition is valid
        stmt = select(Order).where(Order.id == order_id)
        order = (await session.execute(stmt)).scalar_one_or_none()
        if not order:
            logger.warning(f"Order {order_id} not found in status listener")
            await session.commit()
            return

        if is_valid_transition(order.status, target_status):
            old_status = order.status
            order.status = target_status
            if failure_reason:
                order.failure_reason = failure_reason
            order.updated_at = datetime.now(timezone.utc)
            logger.info(
                f"Order {order_id} transitioned: {old_status} -> {target_status}",
                extra={"correlationId": order_id, "messageId": envelope.messageId},
            )
        else:
            logger.info(
                f"Order {order_id} rejected transition {order.status} -> {target_status} (Rule R6)",
                extra={"correlationId": order_id, "messageId": envelope.messageId},
            )

        await session.commit()


async def run_listener(stop_event: asyncio.Event | None = None) -> None:
    logger.info("Starting Status Listener listening on status-sub...")
    await bus_manager.run_consumer(
        subscription_name=SUBSCRIPTION_NAME,
        consumer_name=CONSUMER_NAME,
        handler=handle_status_event,
        stop_event=stop_event,
    )


if __name__ == "__main__":
    asyncio.run(run_listener())

