import asyncio
from typing import Any

from sqlalchemy import select, update

from src.common.events import (
    EventEnvelope,
    StockReservationFailedData,
    StockReservedData,
    StockReservedItem,
    build_event_envelope,
)
from src.common.logger import logger
from src.common.models import Inventory, Order, OrderItem
from src.config.db import AsyncSessionLocal
from src.config.service_bus import bus_manager

CONSUMER_NAME = "inventory"
SUBSCRIPTION_NAME = "inventory-sub"


async def handle_order_created(envelope: EventEnvelope) -> None:
    order_id = envelope.correlationId
    items_data: list[dict[str, Any]] = envelope.data.get("items", [])

    async with AsyncSessionLocal() as session:
        async with session.begin():
            reservation_failed = False
            failed_product_id = ""

            for item in items_data:
                prod_id = item["productId"]
                qty = item["quantity"]

                # Atomic update checking availability:
                # UPDATE inventory SET quantity_available = quantity_available - :q,
                # quantity_reserved = quantity_reserved + :q WHERE product_id = :id AND quantity_available >= :q
                stmt = (
                    update(Inventory)
                    .where(
                        Inventory.product_id == prod_id,
                        Inventory.quantity_available >= qty,
                    )
                    .values(
                        quantity_available=Inventory.quantity_available - qty,
                        quantity_reserved=Inventory.quantity_reserved + qty,
                    )
                )
                result = await session.execute(stmt)
                rowcount = getattr(result, "rowcount", 0)
                if rowcount == 0:
                    reservation_failed = True
                    failed_product_id = prod_id
                    break

            if reservation_failed:
                # Transaction will rollback upon exit from session.begin()
                await session.rollback()
                logger.warning(
                    f"Stock reservation failed for order {order_id}, product {failed_product_id}",
                    extra={"correlationId": order_id, "messageId": envelope.messageId},
                )
                fail_event = build_event_envelope(
                    event_type="StockReservationFailed",
                    correlation_id=order_id,
                    source="inventory-worker",
                    data=StockReservationFailedData(
                        orderId=order_id,
                        reason="INSUFFICIENT_STOCK",
                        productId=failed_product_id,
                    ),
                )
                await bus_manager.publish_event(fail_event)
                return

            # Commit happens automatically at end of session.begin()

        logger.info(
            f"Stock reserved successfully for order {order_id}",
            extra={"correlationId": order_id, "messageId": envelope.messageId},
        )
        reserved_event = build_event_envelope(
            event_type="StockReserved",
            correlation_id=order_id,
            source="inventory-worker",
            data=StockReservedData(
                orderId=order_id,
                items=[
                    StockReservedItem(productId=it["productId"], quantity=it["quantity"])
                    for it in items_data
                ],
            ),
        )
        await bus_manager.publish_event(reserved_event)


async def handle_release_stock(envelope: EventEnvelope) -> None:
    order_id = envelope.correlationId

    async with AsyncSessionLocal() as session:
        async with session.begin():
            # Check order and its items
            stmt = select(Order).where(Order.id == order_id)
            order = (await session.execute(stmt)).scalar_one_or_none()
            if not order:
                logger.warning(f"Order {order_id} not found during stock release")
                return

            # Get order items
            items_stmt = select(OrderItem).where(OrderItem.order_id == order_id)
            items = (await session.execute(items_stmt)).scalars().all()

            for item in items:
                # UPDATE inventory SET quantity_available = quantity_available + :q,
                # quantity_reserved = quantity_reserved - :q WHERE product_id = :id AND quantity_reserved >= :q
                stmt_release = (
                    update(Inventory)
                    .where(
                        Inventory.product_id == item.product_id,
                        Inventory.quantity_reserved >= item.quantity,
                    )
                    .values(
                        quantity_available=Inventory.quantity_available + item.quantity,
                        quantity_reserved=Inventory.quantity_reserved - item.quantity,
                    )
                )
                await session.execute(stmt_release)

        logger.info(
            f"Stock released for order {order_id} due to {envelope.eventType}",
            extra={"correlationId": order_id, "messageId": envelope.messageId},
        )


async def inventory_message_handler(envelope: EventEnvelope) -> None:
    if envelope.eventType == "OrderCreated":
        await handle_order_created(envelope)
    elif envelope.eventType in ("OrderCancelled", "PaymentFailed"):
        await handle_release_stock(envelope)
    else:
        logger.info(f"Inventory worker ignoring event {envelope.eventType}")


async def run_worker(stop_event: asyncio.Event | None = None) -> None:
    logger.info("Starting Inventory Worker listening on inventory-sub...")
    await bus_manager.run_consumer(
        subscription_name=SUBSCRIPTION_NAME,
        consumer_name=CONSUMER_NAME,
        handler=inventory_message_handler,
        stop_event=stop_event,
    )


if __name__ == "__main__":
    asyncio.run(run_worker())
