import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def utc_iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def generate_uuid() -> str:
    return str(uuid.uuid4())


EventType = Literal[
    "OrderCreated",
    "StockReserved",
    "StockReservationFailed",
    "PaymentCompleted",
    "PaymentFailed",
    "ShipmentCreated",
    "OrderCancelled",
]


class EventEnvelope(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    messageId: str = Field(default_factory=generate_uuid)
    correlationId: str  # orderId
    eventType: EventType
    version: int = 1
    occurredAt: str = Field(default_factory=utc_iso_now)
    source: str
    data: dict[str, Any]


# Specific Event Data Payloads (Section 7.3)
class OrderCreatedItem(BaseModel):
    productId: str
    productName: str
    quantity: int
    unitPrice: float


class OrderCreatedData(BaseModel):
    orderId: str
    orderNumber: str
    userId: str
    customerEmail: str
    items: list[OrderCreatedItem]
    totalAmount: float
    currency: str = "INR"
    paymentMethod: str


class StockReservedItem(BaseModel):
    productId: str
    quantity: int


class StockReservedData(BaseModel):
    orderId: str
    items: list[StockReservedItem]


class StockReservationFailedData(BaseModel):
    orderId: str
    reason: str = "INSUFFICIENT_STOCK"
    productId: str


class PaymentCompletedData(BaseModel):
    orderId: str
    amount: float
    transactionRef: str


class PaymentFailedData(BaseModel):
    orderId: str
    reason: str = "PAYMENT_FAILED"


class ShipmentCreatedData(BaseModel):
    orderId: str
    trackingNumber: str
    carrier: str = "DemoExpress"


class OrderCancelledData(BaseModel):
    orderId: str
    reason: str = "CUSTOMER_REQUEST"


def build_event_envelope(
    event_type: EventType,
    correlation_id: str,
    source: str,
    data: dict[str, Any] | BaseModel,
) -> EventEnvelope:
    if isinstance(data, BaseModel):
        data_dict = data.model_dump()
    else:
        # Convert Decimals to float for JSON compatibility
        data_dict = {k: float(v) if isinstance(v, Decimal) else v for k, v in data.items()}

    return EventEnvelope(
        messageId=generate_uuid(),
        correlationId=correlation_id,
        eventType=event_type,
        version=1,
        occurredAt=utc_iso_now(),
        source=source,
        data=data_dict,
    )
