import asyncio
import os
import random

from sqlalchemy import select

from src.common.events import (
    EventEnvelope,
    PaymentCompletedData,
    PaymentFailedData,
    build_event_envelope,
)
from src.common.logger import logger
from src.common.models import Order, Payment
from src.config.db import AsyncSessionLocal
from src.config.env import settings
from src.config.service_bus import bus_manager

CONSUMER_NAME = "payment"
SUBSCRIPTION_NAME = "payment-sub"


def generate_transaction_ref() -> str:
    chars = "0123456789ABCDEF"
    rand_suffix = "".join(random.choices(chars, k=6))
    return f"TXN-{rand_suffix}"


async def handle_payment(envelope: EventEnvelope) -> None:
    order_id = envelope.correlationId

    async with AsyncSessionLocal() as session:
        # Read order
        stmt = select(Order).where(Order.id == order_id)
        order = (await session.execute(stmt)).scalar_one_or_none()
        if not order:
            logger.warning(f"Order {order_id} not found for payment")
            return

        # If CANCELLED, skip payment
        if order.status == "CANCELLED":
            logger.info(
                f"Order {order_id} is CANCELLED. Skipping payment.",
                extra={"correlationId": order_id, "messageId": envelope.messageId},
            )
            return

        # Check if payment already exists (Rule R2 unique per order)
        payment_stmt = select(Payment).where(Payment.order_id == order_id)
        existing_payment = (await session.execute(payment_stmt)).scalar_one_or_none()
        if existing_payment:
            logger.info(
                f"Payment already recorded for order {order_id}. Skipping.",
                extra={"correlationId": order_id, "messageId": envelope.messageId},
            )
            return

        # Simulated gateway delay (1 to 3s in prod, negligible in test mode)
        is_test_env = "pytest" in os.environ.get("_", "") or settings.ENVIRONMENT == "test"
        if not is_test_env:
            delay = random.uniform(1.0, 3.0)
            await asyncio.sleep(delay)

        # Check for failure simulation method TEST_FAIL
        if order.payment_method == "TEST_FAIL":
            payment = Payment(
                order_id=order_id,
                amount=order.total_amount,
                method=order.payment_method,
                status="FAILED",
                transaction_ref=None,
            )
            session.add(payment)
            await session.commit()

            logger.warning(
                f"Payment simulated FAILED for order {order_id}",
                extra={"correlationId": order_id, "messageId": envelope.messageId},
            )
            failed_event = build_event_envelope(
                event_type="PaymentFailed",
                correlation_id=order_id,
                source="payment-worker",
                data=PaymentFailedData(orderId=order_id, reason="PAYMENT_FAILED"),
            )
            await bus_manager.publish_event(failed_event)
            return

        # Payment success
        txn_ref = generate_transaction_ref()
        payment = Payment(
            order_id=order_id,
            amount=order.total_amount,
            method=order.payment_method,
            status="SUCCESS",
            transaction_ref=txn_ref,
        )
        session.add(payment)
        await session.commit()

        logger.info(
            f"Payment SUCCESS for order {order_id}, txn {txn_ref}",
            extra={"correlationId": order_id, "messageId": envelope.messageId},
        )
        completed_event = build_event_envelope(
            event_type="PaymentCompleted",
            correlation_id=order_id,
            source="payment-worker",
            data=PaymentCompletedData(
                orderId=order_id,
                amount=float(order.total_amount),
                transactionRef=txn_ref,
            ),
        )
        await bus_manager.publish_event(completed_event)


async def payment_message_handler(envelope: EventEnvelope) -> None:
    if envelope.eventType == "StockReserved":
        await handle_payment(envelope)
    else:
        logger.info(f"Payment worker ignoring event {envelope.eventType}")


async def run_worker(stop_event: asyncio.Event | None = None) -> None:
    logger.info("Starting Payment Worker listening on payment-sub...")
    await bus_manager.run_consumer(
        subscription_name=SUBSCRIPTION_NAME,
        consumer_name=CONSUMER_NAME,
        handler=payment_message_handler,
        stop_event=stop_event,
    )


if __name__ == "__main__":
    asyncio.run(run_worker())
