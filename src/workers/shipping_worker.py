import asyncio
import random
from datetime import datetime, timezone

from sqlalchemy import select, update

from src.common.events import (
    EventEnvelope,
    ShipmentCreatedData,
    build_event_envelope,
)
from src.common.logger import logger
from src.common.models import Inventory, Order, OrderItem, Shipment
from src.config.db import AsyncSessionLocal
from src.config.service_bus import bus_manager

CONSUMER_NAME = "shipping"
SUBSCRIPTION_NAME = "shipping-sub"


def generate_tracking_number() -> str:
    now_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    rand_seq = random.randint(10000, 99999)
    return f"SHP-{now_str}-{rand_seq}"


async def handle_shipping(envelope: EventEnvelope) -> None:
    order_id = envelope.correlationId

    async with AsyncSessionLocal() as session:
        # Check order
        stmt = select(Order).where(Order.id == order_id)
        order = (await session.execute(stmt)).scalar_one_or_none()
        if not order:
            logger.warning(f"Order {order_id} not found for shipping")
            return

        # Check if shipment already created (Rule R2)
        shipment_stmt = select(Shipment).where(Shipment.order_id == order_id)
        existing_shipment = (await session.execute(shipment_stmt)).scalar_one_or_none()
        if existing_shipment:
            logger.info(
                f"Shipment already exists for order {order_id}. Skipping.",
                extra={"correlationId": order_id, "messageId": envelope.messageId},
            )
            return

        # Insert shipment
        tracking_number = generate_tracking_number()
        shipment = Shipment(
            order_id=order_id,
            tracking_number=tracking_number,
            carrier="DemoExpress",
            status="CREATED",
        )
        session.add(shipment)

        # Decrease quantity_reserved by item quantity (items now shipped)
        items_stmt = select(OrderItem).where(OrderItem.order_id == order_id)
        items = (await session.execute(items_stmt)).scalars().all()

        for item in items:
            update_stmt = (
                update(Inventory)
                .where(
                    Inventory.product_id == item.product_id,
                    Inventory.quantity_reserved >= item.quantity,
                )
                .values(quantity_reserved=Inventory.quantity_reserved - item.quantity)
            )
            await session.execute(update_stmt)

        await session.commit()

        logger.info(
            f"Shipment CREATED for order {order_id}, tracking {tracking_number}",
            extra={"correlationId": order_id, "messageId": envelope.messageId},
        )
        shipment_event = build_event_envelope(
            event_type="ShipmentCreated",
            correlation_id=order_id,
            source="shipping-worker",
            data=ShipmentCreatedData(
                orderId=order_id,
                trackingNumber=tracking_number,
                carrier="DemoExpress",
            ),
        )
        await bus_manager.publish_event(shipment_event)


async def shipping_message_handler(envelope: EventEnvelope) -> None:
    if envelope.eventType == "PaymentCompleted":
        await handle_shipping(envelope)
    else:
        logger.info(f"Shipping worker ignoring event {envelope.eventType}")


async def run_worker(stop_event: asyncio.Event | None = None) -> None:
    logger.info("Starting Shipping Worker listening on shipping-sub...")
    await bus_manager.run_consumer(
        subscription_name=SUBSCRIPTION_NAME,
        consumer_name=CONSUMER_NAME,
        handler=shipping_message_handler,
        stop_event=stop_event,
    )


if __name__ == "__main__":
    asyncio.run(run_worker())
