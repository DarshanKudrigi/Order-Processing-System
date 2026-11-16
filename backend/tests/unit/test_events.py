import pytest

from src.common.events import (
    OrderCreatedData,
    OrderCreatedItem,
    PaymentCompletedData,
    PaymentFailedData,
    ShipmentCreatedData,
    StockReservationFailedData,
    StockReservedData,
    StockReservedItem,
    build_event_envelope,
)
from src.config.service_bus import in_memory_bus


@pytest.mark.asyncio
async def test_build_all_seven_event_envelopes():
    corr_id = "test-order-uuid-123"

    # 1. OrderCreated (EVT-01)
    evt1 = build_event_envelope(
        "OrderCreated",
        corr_id,
        "order-api",
        OrderCreatedData(
            orderId=corr_id,
            orderNumber="ORD-20261116-00001",
            userId="u_1029",
            customerEmail="asha@example.com",
            items=[
                OrderCreatedItem(
                    productId="p_17",
                    productName="Wireless Mouse",
                    quantity=2,
                    unitPrice=799.00,
                )
            ],
            totalAmount=1598.00,
            currency="INR",
            paymentMethod="UPI",
        ),
    )
    assert evt1.eventType == "OrderCreated"
    assert evt1.correlationId == corr_id
    assert evt1.version == 1
    assert evt1.data["totalAmount"] == 1598.00

    # 2. StockReserved (EVT-02)
    evt2 = build_event_envelope(
        "StockReserved",
        corr_id,
        "inventory-worker",
        StockReservedData(
            orderId=corr_id,
            items=[StockReservedItem(productId="p_17", quantity=2)],
        ),
    )
    assert evt2.eventType == "StockReserved"

    # 3. StockReservationFailed (EVT-03)
    evt3 = build_event_envelope(
        "StockReservationFailed",
        corr_id,
        "inventory-worker",
        StockReservationFailedData(
            orderId=corr_id,
            reason="INSUFFICIENT_STOCK",
            productId="p_17",
        ),
    )
    assert evt3.eventType == "StockReservationFailed"
    assert evt3.data["reason"] == "INSUFFICIENT_STOCK"

    # 4. PaymentCompleted (EVT-04)
    evt4 = build_event_envelope(
        "PaymentCompleted",
        corr_id,
        "payment-worker",
        PaymentCompletedData(
            orderId=corr_id,
            amount=1598.00,
            transactionRef="TXN-12345",
        ),
    )
    assert evt4.eventType == "PaymentCompleted"

    # 5. PaymentFailed (EVT-05)
    evt5 = build_event_envelope(
        "PaymentFailed",
        corr_id,
        "payment-worker",
        PaymentFailedData(
            orderId=corr_id,
            reason="PAYMENT_FAILED",
        ),
    )
    assert evt5.eventType == "PaymentFailed"

    # 6. ShipmentCreated (EVT-06)
    evt6 = build_event_envelope(
        "ShipmentCreated",
        corr_id,
        "shipping-worker",
        ShipmentCreatedData(
            orderId=corr_id,
            trackingNumber="SHP-20261116-001",
            carrier="DemoExpress",
        ),
    )
    assert evt6.eventType == "ShipmentCreated"

    # 7. OrderCancelled (EVT-07)
    evt7 = build_event_envelope(
        "OrderCancelled",
        corr_id,
        "order-api",
        {"orderId": corr_id, "reason": "CUSTOMER_REQUEST"},
    )
    assert evt7.eventType == "OrderCancelled"


@pytest.mark.asyncio
async def test_subscription_filters():
    corr_id = "test-order-routing"
    # Publish OrderCreated -> Should go to inventory-sub and notification-sub ONLY
    evt = build_event_envelope(
        "OrderCreated",
        corr_id,
        "order-api",
        {"orderId": corr_id, "amount": 100.0},
    )
    await in_memory_bus.publish(evt)

    # Check that inventory-sub and notification-sub received it
    assert not in_memory_bus.subscriptions["inventory-sub"].empty()
    assert not in_memory_bus.subscriptions["notification-sub"].empty()

    # Check payment-sub and shipping-sub did NOT receive it
    assert in_memory_bus.subscriptions["payment-sub"].empty()
    assert in_memory_bus.subscriptions["shipping-sub"].empty()

    # Clear queues
    await in_memory_bus.subscriptions["inventory-sub"].get()
    await in_memory_bus.subscriptions["notification-sub"].get()

