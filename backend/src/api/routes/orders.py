import random
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.common.auth import get_current_user
from src.common.errors import (
    ConflictError,
    ForbiddenError,
    MessagingUnavailableError,
    NotFoundError,
    ValidationError,
)
from src.common.events import (
    OrderCreatedData,
    OrderCreatedItem,
    build_event_envelope,
)
from src.common.logger import logger
from src.common.models import Order, OrderEvent, OrderItem, Product, User
from src.config.db import get_db
from src.config.service_bus import bus_manager

router = APIRouter(prefix="/api/orders", tags=["Orders"])


class OrderItemInput(BaseModel):
    productId: str
    quantity: int = Field(..., ge=1, le=10)


class ShippingAddressInput(BaseModel):
    name: str = Field(..., min_length=2)
    line1: str = Field(..., min_length=3)
    city: str = Field(..., min_length=2)
    state: str = Field(..., min_length=2)
    pincode: str = Field(..., pattern=r"^\d{6}$")
    phone: str = Field(..., pattern=r"^\d{10}$")


class CreateOrderRequest(BaseModel):
    items: list[OrderItemInput] = Field(..., min_length=1, max_length=20)
    paymentMethod: Literal["COD", "UPI", "CARD", "TEST_FAIL"]
    shippingAddress: ShippingAddressInput


class CreateOrderResponse(BaseModel):
    orderId: str
    orderNumber: str
    status: str
    totalAmount: float
    currency: str


class OrderItemDetail(BaseModel):
    productId: str
    productName: str
    unitPrice: float
    quantity: int


class PaymentDetail(BaseModel):
    status: str
    transactionRef: str | None = None


class ShipmentDetail(BaseModel):
    trackingNumber: str
    carrier: str


class OrderDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    orderNumber: str
    status: str
    failureReason: str | None = None
    totalAmount: float
    currency: str
    paymentMethod: str
    createdAt: datetime
    items: list[OrderItemDetail]
    shippingAddress: dict[str, Any]
    payment: PaymentDetail | None = None
    shipment: ShipmentDetail | None = None


class OrderListItem(BaseModel):
    id: str
    orderNumber: str
    status: str
    totalAmount: float
    currency: str
    paymentMethod: str
    failureReason: str | None = None
    createdAt: datetime
    itemCount: int


class OrderListResponse(BaseModel):
    data: list[OrderListItem]
    page: int
    limit: int
    total: int


class OrderEventItem(BaseModel):
    eventType: str
    createdAt: datetime
    source: str
    payload: dict[str, Any] | None = None


class CancelOrderResponse(BaseModel):
    orderId: str
    orderNumber: str
    status: str


def generate_order_number() -> str:
    now_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    rand_seq = random.randint(10000, 99999)
    return f"ORD-{now_str}-{rand_seq}"


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=CreateOrderResponse,
)
async def create_order(
    payload: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CreateOrderResponse:
    # Validate products exist and are active
    product_ids = [item.productId for item in payload.items]
    stmt = select(Product).where(Product.id.in_(product_ids))
    products = {p.id: p for p in (await db.execute(stmt)).scalars().all()}

    missing_or_inactive = []
    for item in payload.items:
        p = products.get(item.productId)
        if not p or not p.is_active:
            missing_or_inactive.append(item.productId)

    if missing_or_inactive:
        raise ValidationError(
            message="Invalid request",
            details=[
                {
                    "field": "items",
                    "message": f"Product {pid} does not exist or is inactive",
                }
                for pid in missing_or_inactive
            ],
        )

    # Calculate total and prepare order items
    total_amount = Decimal("0.00")
    order_items_to_create = []
    event_items = []

    for item in payload.items:
        p = products[item.productId]
        item_total = p.price * item.quantity
        total_amount += item_total
        order_items_to_create.append(
            OrderItem(
                product_id=p.id,
                product_name=p.name,
                unit_price=p.price,
                quantity=item.quantity,
            )
        )
        event_items.append(
            OrderCreatedItem(
                productId=p.id,
                productName=p.name,
                quantity=item.quantity,
                unitPrice=float(p.price),
            )
        )

    order_id = str(uuid.uuid4())
    order_number = generate_order_number()

    new_order = Order(
        id=order_id,
        order_number=order_number,
        user_id=current_user.id,
        status="PENDING",
        total_amount=total_amount,
        currency="INR",
        payment_method=payload.paymentMethod,
        shipping_address=payload.shippingAddress.model_dump(),
        failure_reason=None,
    )
    for oi in order_items_to_create:
        oi.order_id = order_id
        new_order.items.append(oi)

    db.add(new_order)
    await db.flush()

    # Create EVT-01 event envelope
    event_data = OrderCreatedData(
        orderId=order_id,
        orderNumber=order_number,
        userId=current_user.id,
        customerEmail=current_user.email,
        items=event_items,
        totalAmount=float(total_amount),
        currency="INR",
        paymentMethod=payload.paymentMethod,
    )
    envelope = build_event_envelope(
        event_type="OrderCreated",
        correlation_id=order_id,
        source="order-api",
        data=event_data,
    )

    # Insert timeline event for EVT-01
    timeline_event = OrderEvent(
        order_id=order_id,
        event_type="OrderCreated",
        message_id=envelope.messageId,
        payload=envelope.data,
        source="order-api",
    )
    db.add(timeline_event)
    await db.commit()

    # Rule R9: Publish OrderCreated event to Service Bus
    try:
        await bus_manager.publish_event(envelope)
    except Exception as exc:
        logger.error(f"Failed to publish OrderCreated for order {order_id}: {exc}")
        new_order.status = "FAILED"
        new_order.failure_reason = "MESSAGING_UNAVAILABLE"
        await db.commit()
        raise MessagingUnavailableError("Service Bus publish failed") from exc

    return CreateOrderResponse(
        orderId=order_id,
        orderNumber=order_number,
        status="PENDING",
        totalAmount=float(total_amount),
        currency="INR",
    )


@router.get("", response_model=OrderListResponse, status_code=status.HTTP_200_OK)
async def list_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    order_status: str | None = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderListResponse:
    conditions: list[Any] = []

    # If customer, only see own orders
    if current_user.role != "ADMIN":
        conditions.append(Order.user_id == current_user.id)

    if order_status:
        conditions.append(Order.status == order_status.upper())

    count_stmt = select(func.count(Order.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    offset = (page - 1) * limit
    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(*conditions)
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    orders = (await db.execute(stmt)).scalars().all()

    data = [
        OrderListItem(
            id=o.id,
            orderNumber=o.order_number,
            status=o.status,
            totalAmount=float(o.total_amount),
            currency=o.currency,
            paymentMethod=o.payment_method,
            failureReason=o.failure_reason,
            createdAt=o.created_at,
            itemCount=len(o.items),
        )
        for o in orders
    ]

    return OrderListResponse(data=data, page=page, limit=limit, total=total)


@router.get("/{order_id}", response_model=OrderDetailResponse, status_code=status.HTTP_200_OK)
async def get_order_detail(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderDetailResponse:
    stmt = (
        select(Order)
        .options(
            selectinload(Order.items),
            selectinload(Order.payment),
            selectinload(Order.shipment),
        )
        .where(Order.id == order_id)
    )
    order = (await db.execute(stmt)).scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")

    # Access control: customers can only view their own orders
    if current_user.role != "ADMIN" and order.user_id != current_user.id:
        raise ForbiddenError("Role not allowed, or order belongs to another user")

    payment_info = None
    if order.payment:
        payment_info = PaymentDetail(
            status=order.payment.status,
            transactionRef=order.payment.transaction_ref,
        )

    shipment_info = None
    if order.shipment:
        shipment_info = ShipmentDetail(
            trackingNumber=order.shipment.tracking_number,
            carrier=order.shipment.carrier,
        )

    items_info = [
        OrderItemDetail(
            productId=i.product_id,
            productName=i.product_name,
            unitPrice=float(i.unit_price),
            quantity=i.quantity,
        )
        for i in order.items
    ]

    return OrderDetailResponse(
        id=order.id,
        orderNumber=order.order_number,
        status=order.status,
        failureReason=order.failure_reason,
        totalAmount=float(order.total_amount),
        currency=order.currency,
        paymentMethod=order.payment_method,
        createdAt=order.created_at,
        items=items_info,
        shippingAddress=order.shipping_address,
        payment=payment_info,
        shipment=shipment_info,
    )


@router.get(
    "/{order_id}/events",
    response_model=list[OrderEventItem],
    status_code=status.HTTP_200_OK,
)
async def get_order_events(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OrderEventItem]:
    stmt = select(Order).where(Order.id == order_id)
    order = (await db.execute(stmt)).scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")

    if current_user.role != "ADMIN" and order.user_id != current_user.id:
        raise ForbiddenError("Role not allowed, or order belongs to another user")

    event_stmt = (
        select(OrderEvent)
        .where(OrderEvent.order_id == order_id)
        .order_by(OrderEvent.created_at.asc())
    )
    events = (await db.execute(event_stmt)).scalars().all()

    return [
        OrderEventItem(
            eventType=e.event_type,
            createdAt=e.created_at,
            source=e.source,
            payload=e.payload,
        )
        for e in events
    ]


@router.post(
    "/{order_id}/cancel",
    response_model=CancelOrderResponse,
    status_code=status.HTTP_200_OK,
)
async def cancel_order(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CancelOrderResponse:
    stmt = select(Order).where(Order.id == order_id)
    order = (await db.execute(stmt)).scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")

    if current_user.role != "ADMIN" and order.user_id != current_user.id:
        raise ForbiddenError("Role not allowed, or order belongs to another user")

    # FR-11: Cancel an order only in PENDING or STOCK_RESERVED
    if order.status not in ("PENDING", "STOCK_RESERVED"):
        raise ConflictError("Order cannot be cancelled in current status")

    order.status = "CANCELLED"
    order.failure_reason = "CUSTOMER_REQUEST"
    order.updated_at = datetime.now(timezone.utc)

    # Build and publish OrderCancelled (EVT-07)
    envelope = build_event_envelope(
        event_type="OrderCancelled",
        correlation_id=order.id,
        source="order-api",
        data={"orderId": order.id, "reason": "CUSTOMER_REQUEST"},
    )

    timeline_event = OrderEvent(
        order_id=order.id,
        event_type="OrderCancelled",
        message_id=envelope.messageId,
        payload=envelope.data,
        source="order-api",
    )
    db.add(timeline_event)
    await db.commit()

    await bus_manager.publish_event(envelope)

    return CancelOrderResponse(
        orderId=order.id,
        orderNumber=order.order_number,
        status="CANCELLED",
    )
