import asyncio
import json
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from azure.servicebus import ServiceBusMessage, ServiceBusSubQueue
from azure.servicebus.aio import ServiceBusClient

from src.common.errors import MessagingUnavailableError
from src.common.events import EventEnvelope
from src.common.idempotency import is_already_processed, mark_as_processed
from src.common.logger import logger, set_correlation_id, set_message_id
from src.config.db import AsyncSessionLocal
from src.config.env import settings

# Subscription filters from PRD Section 7.2
SUBSCRIPTION_FILTERS: dict[str, set[str]] = {
    "inventory-sub": {"OrderCreated", "OrderCancelled", "PaymentFailed"},
    "payment-sub": {"StockReserved"},
    "shipping-sub": {"PaymentCompleted"},
    "notification-sub": {
        "OrderCreated",
        "StockReservationFailed",
        "PaymentCompleted",
        "PaymentFailed",
        "ShipmentCreated",
        "OrderCancelled",
    },
    "status-sub": {
        "StockReserved",
        "StockReservationFailed",
        "PaymentCompleted",
        "PaymentFailed",
        "ShipmentCreated",
    },
}


@dataclass
class InMemoryMessage:
    message_id: str
    correlation_id: str
    subject: str
    body: str
    application_properties: dict[str, Any]
    delivery_count: int = 0
    enqueued_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    dead_letter_reason: str | None = None


class InMemoryBus:
    """In-memory Service Bus implementation conforming to Section 7.2 & 7.5."""

    def __init__(self) -> None:
        self.subscriptions: dict[str, asyncio.Queue[InMemoryMessage]] = {
            sub: asyncio.Queue() for sub in SUBSCRIPTION_FILTERS
        }
        self.dlq: dict[str, list[InMemoryMessage]] = {sub: [] for sub in SUBSCRIPTION_FILTERS}
        self.subscribers: dict[
            str, list[Callable[[InMemoryMessage], Coroutine[Any, Any, None]]]
        ] = {sub: [] for sub in SUBSCRIPTION_FILTERS}
        self._running_tasks: list[asyncio.Task] = []

    def clear_all_queues(self) -> None:
        """Clear all subscriptions and DLQs (useful for testing)."""
        for queue in self.subscriptions.values():
            while not queue.empty():
                try:
                    queue.get_nowait()
                except (asyncio.QueueEmpty, ValueError):
                    break
        for dlq_list in self.dlq.values():
            dlq_list.clear()

    async def publish(self, envelope: EventEnvelope) -> None:
        event_type = envelope.eventType
        order_id = envelope.data.get("orderId", envelope.correlationId)
        body = json.dumps(envelope.model_dump())

        for sub_name, allowed_events in SUBSCRIPTION_FILTERS.items():
            if event_type in allowed_events:
                msg = InMemoryMessage(
                    message_id=envelope.messageId,
                    correlation_id=envelope.correlationId,
                    subject=event_type,
                    body=body,
                    application_properties={"eventType": event_type, "orderId": order_id},
                )
                await self.subscriptions[sub_name].put(msg)

    async def dead_letter(
        self, sub_name: str, msg: InMemoryMessage, reason: str, _description: str = ""
    ) -> None:
        msg.dead_letter_reason = reason
        self.dlq[sub_name].append(msg)
        logger.warning(
            f"Message {msg.message_id} sent to DLQ for {sub_name}: {reason}",
            extra={"correlationId": msg.correlation_id, "messageId": msg.message_id},
        )

    def peek_dlq(self, sub_name: str, max_count: int = 10) -> list[dict[str, Any]]:
        messages = self.dlq.get(sub_name, [])[:max_count]
        result = []
        for m in messages:
            result.append(
                {
                    "subscription": sub_name,
                    "messageId": m.message_id,
                    "eventType": m.subject,
                    "orderId": m.correlation_id,
                    "reason": m.dead_letter_reason or "MaxDeliveryCountExceeded",
                    "deliveryCount": m.delivery_count,
                    "enqueuedAt": m.enqueued_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
            )
        return result

    def peek_all_dlq(self) -> list[dict[str, Any]]:
        all_dlq = []
        for sub_name in SUBSCRIPTION_FILTERS:
            all_dlq.extend(self.peek_dlq(sub_name))
        return all_dlq


# Singleton in-memory bus
in_memory_bus = InMemoryBus()


class ServiceBusManager:
    """Unified Service Bus client handling Azure Service Bus or In-Memory fallback."""

    def __init__(self) -> None:
        self.client: ServiceBusClient | None = None

    def _get_azure_client(self) -> ServiceBusClient:
        if self.client is None:
            if not settings.SERVICEBUS_CONNECTION_STRING:
                raise ValueError("SERVICEBUS_CONNECTION_STRING is not configured")
            self.client = ServiceBusClient.from_connection_string(
                settings.SERVICEBUS_CONNECTION_STRING
            )
        return self.client

    async def publish_event(self, envelope: EventEnvelope) -> None:
        """Publish an event envelope to topic 'order-events'."""
        if settings.USE_IN_MEMORY_BUS or not settings.SERVICEBUS_CONNECTION_STRING:
            await in_memory_bus.publish(envelope)
            return

        try:
            client = self._get_azure_client()
            async with client.get_topic_sender(topic_name=settings.SB_TOPIC_NAME) as sender:
                order_id = envelope.data.get("orderId", envelope.correlationId)
                msg = ServiceBusMessage(
                    body=json.dumps(envelope.model_dump()),
                    message_id=envelope.messageId,
                    correlation_id=envelope.correlationId,
                    subject=envelope.eventType,
                    content_type="application/json",
                    application_properties={
                        "eventType": envelope.eventType,
                        "orderId": order_id,
                    },
                )
                await sender.send_messages(msg)
        except Exception as exc:
            logger.error(
                f"Failed to publish event {envelope.eventType}: {exc}",
                extra={"correlationId": envelope.correlationId, "messageId": envelope.messageId},
            )
            raise MessagingUnavailableError(f"Service Bus publish failed: {exc}") from exc

    async def check_health(self) -> bool:
        """Check Service Bus connectivity."""
        if settings.USE_IN_MEMORY_BUS or not settings.SERVICEBUS_CONNECTION_STRING:
            return True
        try:
            client = self._get_azure_client()
            async with client.get_topic_sender(topic_name=settings.SB_TOPIC_NAME):
                pass
            return True
        except Exception:
            return False

    async def peek_dlq_all(self) -> list[dict[str, Any]]:
        """Peek DLQ for all subscriptions (Section 9.1 EP-17)."""
        if settings.USE_IN_MEMORY_BUS or not settings.SERVICEBUS_CONNECTION_STRING:
            return in_memory_bus.peek_all_dlq()

        results = []
        client = self._get_azure_client()
        for sub_name in SUBSCRIPTION_FILTERS:
            try:
                receiver = client.get_subscription_receiver(
                    topic_name=settings.SB_TOPIC_NAME,
                    subscription_name=sub_name,
                    sub_queue=ServiceBusSubQueue.DEAD_LETTER,
                )
                async with receiver:
                    dlq_msgs = await receiver.peek_messages(max_message_count=10)
                    for m in dlq_msgs:
                        app_props = m.application_properties or {}
                        results.append(
                            {
                                "subscription": sub_name,
                                "messageId": str(m.message_id),
                                "eventType": str(m.subject or app_props.get(b"eventType", "")),
                                "orderId": str(m.correlation_id or app_props.get(b"orderId", "")),
                                "reason": str(m.dead_letter_reason or "MaxDeliveryCountExceeded"),
                                "deliveryCount": m.delivery_count or 5,
                                "enqueuedAt": (
                                    m.enqueued_time_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
                                    if m.enqueued_time_utc
                                    else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                                ),
                            }
                        )
            except Exception as e:
                logger.error(f"Error peeking DLQ for {sub_name}: {e}")
        return results

    async def run_consumer(
        self,
        subscription_name: str,
        consumer_name: str,
        handler: Callable[[EventEnvelope], Coroutine[Any, Any, None]],
        stop_event: asyncio.Event | None = None,
    ) -> None:
        """Consume messages with peek-lock, idempotency, retry (5 max) and DLQ."""
        if settings.USE_IN_MEMORY_BUS or not settings.SERVICEBUS_CONNECTION_STRING:
            queue = in_memory_bus.subscriptions[subscription_name]
            while stop_event is None or not stop_event.is_set():
                try:
                    msg: InMemoryMessage = await asyncio.wait_for(queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue

                msg.delivery_count += 1
                set_correlation_id(msg.correlation_id)
                set_message_id(msg.message_id)

                async with AsyncSessionLocal() as db:
                    # R2: Check idempotency
                    if await is_already_processed(db, msg.message_id, consumer_name):
                        logger.info(
                            f"Message {msg.message_id} already processed by {consumer_name}. Skipping.",
                            extra={
                                "correlationId": msg.correlation_id,
                                "messageId": msg.message_id,
                            },
                        )
                        queue.task_done()
                        continue

                    # Parse envelope
                    try:
                        data_dict = json.loads(msg.body)
                        envelope = EventEnvelope(**data_dict)
                    except Exception as err:
                        # R4: Invalid payload -> send to DLQ immediately
                        await in_memory_bus.dead_letter(
                            subscription_name, msg, "InvalidPayload", str(err)
                        )
                        queue.task_done()
                        continue

                    # Execute handler
                    try:
                        await handler(envelope)
                        # Record processed message on success
                        await mark_as_processed(db, msg.message_id, consumer_name)
                        queue.task_done()
                    except Exception as err:
                        logger.error(
                            f"Error processing message {msg.message_id} in {consumer_name}: {err}",
                            extra={
                                "correlationId": msg.correlation_id,
                                "messageId": msg.message_id,
                            },
                        )
                        # R3 & R4: Retry up to 5 deliveries, then DLQ
                        if msg.delivery_count >= 5:
                            await in_memory_bus.dead_letter(
                                subscription_name, msg, "MaxDeliveryCountExceeded", str(err)
                            )
                        else:
                            # Re-queue for redelivery
                            await queue.put(msg)
                        queue.task_done()
            return

        # Real Azure Service Bus consumer
        client = self._get_azure_client()
        receiver = client.get_subscription_receiver(
            topic_name=settings.SB_TOPIC_NAME,
            subscription_name=subscription_name,
            max_message_count=settings.SB_MAX_CONCURRENT_CALLS,
        )
        async with receiver:
            while stop_event is None or not stop_event.is_set():
                messages = await receiver.receive_messages(
                    max_message_count=settings.SB_MAX_CONCURRENT_CALLS, max_wait_time=10
                )
                for msg_sb in messages:
                    msg_id = str(msg_sb.message_id)
                    corr_id = str(msg_sb.correlation_id)
                    set_correlation_id(corr_id)
                    set_message_id(msg_id)

                    async with AsyncSessionLocal() as db:
                        if await is_already_processed(db, msg_id, consumer_name):
                            await receiver.complete_message(msg_sb)
                            continue

                        try:
                            body_str = "".join([b.decode("utf-8") for b in msg_sb.body])
                            envelope = EventEnvelope(**json.loads(body_str))
                        except Exception as err:
                            await receiver.dead_letter_message(
                                msg_sb,
                                reason="InvalidPayload",
                                error_description=str(err),
                            )
                            continue

                        try:
                            await handler(envelope)
                            await mark_as_processed(db, msg_id, consumer_name)
                            await receiver.complete_message(msg_sb)
                        except Exception as err:
                            logger.error(f"Error handling message {msg_id}: {err}")
                            if msg_sb.delivery_count and msg_sb.delivery_count >= 5:
                                await receiver.dead_letter_message(
                                    msg_sb,
                                    reason="MaxDeliveryCountExceeded",
                                    error_description=str(err),
                                )
                            else:
                                await receiver.abandon_message(msg_sb)


bus_manager = ServiceBusManager()
