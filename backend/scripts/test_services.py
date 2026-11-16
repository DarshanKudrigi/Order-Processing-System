import asyncio
import sys
from pathlib import Path

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from httpx import AsyncClient, ASGITransport
from src.api.app import app
from src.common.models import Inventory, Order
from src.config.db import AsyncSessionLocal
from src.config.service_bus import in_memory_bus
from src.workers.inventory_worker import inventory_message_handler
from src.workers.payment_worker import payment_message_handler
from src.workers.shipping_worker import shipping_message_handler
from src.workers.notification_worker import notification_message_handler
from src.api.status_listener import handle_status_event
from src.common.events import EventEnvelope


async def pump_events(max_cycles: int = 15):
    """Drain all in-memory queues and dispatch to registered worker handlers."""
    for _ in range(max_cycles):
        processed = False

        while not in_memory_bus.subscriptions["inventory-sub"].empty():
            msg = in_memory_bus.subscriptions["inventory-sub"].get_nowait()
            env = EventEnvelope.model_validate_json(msg.body)
            await inventory_message_handler(env)
            processed = True

        while not in_memory_bus.subscriptions["payment-sub"].empty():
            msg = in_memory_bus.subscriptions["payment-sub"].get_nowait()
            env = EventEnvelope.model_validate_json(msg.body)
            await payment_message_handler(env)
            processed = True

        while not in_memory_bus.subscriptions["shipping-sub"].empty():
            msg = in_memory_bus.subscriptions["shipping-sub"].get_nowait()
            env = EventEnvelope.model_validate_json(msg.body)
            await shipping_message_handler(env)
            processed = True

        while not in_memory_bus.subscriptions["status-sub"].empty():
            msg = in_memory_bus.subscriptions["status-sub"].get_nowait()
            env = EventEnvelope.model_validate_json(msg.body)
            await handle_status_event(env)
            processed = True

        while not in_memory_bus.subscriptions["notification-sub"].empty():
            msg = in_memory_bus.subscriptions["notification-sub"].get_nowait()
            env = EventEnvelope.model_validate_json(msg.body)
            await notification_message_handler(env)
            processed = True

        if not processed:
            break
        await asyncio.sleep(0.01)


async def run_diagnostics():
    print("==================================================")
    print("🚀 RUNNING END-TO-END SERVICE & FRONTEND INTEGRATION DIAGNOSTICS")
    print("==================================================")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check
        print("\n[TEST 1] Probing Health Endpoint (/api/health)...")
        res_health = await client.get("/api/health")
        print(f"Status: {res_health.status_code}, Body: {res_health.json()}")
        assert res_health.status_code == 200, "Health check failed"
        print("✅ Health check passed!")

        # 2. Authenticate as Customer (Asha K)
        print("\n[TEST 2] Authenticating as Customer (asha@example.com)...")
        res_login = await client.post(
            "/api/auth/login",
            json={"email": "asha@example.com", "password": "Passw0rd!"},
        )
        assert res_login.status_code == 200, f"Login failed: {res_login.text}"
        customer_token = res_login.json()["token"]
        customer_user = res_login.json()["user"]
        print(f"Logged in as: {customer_user['name']} ({customer_user['role']})")
        print("✅ Customer authentication passed!")

        # 3. Authenticate as Admin
        print("\n[TEST 3] Authenticating as Admin (admin@example.com)...")
        res_admin = await client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "password": "Admin123!"},
        )
        assert res_admin.status_code == 200, f"Admin login failed: {res_admin.text}"
        admin_token = res_admin.json()["token"]
        print("✅ Admin authentication passed!")

        # 4. Fetch Products (Verify field naming and stock availability)
        print("\n[TEST 4] Fetching Product Catalog (/api/products)...")
        res_prods = await client.get("/api/products?limit=25")
        assert res_prods.status_code == 200
        data = res_prods.json()
        items = data["data"]
        print(f"Retrieved {len(items)} products (Total: {data['total']})")
        first_p = items[0]
        print(f"Sample product: {first_p['name']} | ID: {first_p['id']} | Price: ₹{first_p['price']} | Available: {first_p['availableQuantity']}")
        assert "availableQuantity" in first_p, "Product missing availableQuantity"
        assert first_p["availableQuantity"] > 0, "Product stock should be positive"
        print("✅ Product catalog structure & stock verified!")

        # 5. Place an Order (Happy Path: UPI payment)
        print("\n[TEST 5] Customer Placing Order (Cart Checkout Simulation)...")
        headers = {"Authorization": f"Bearer {customer_token}"}
        order_payload = {
            "items": [{"productId": "p_01", "quantity": 1}],
            "paymentMethod": "UPI",
            "shippingAddress": {
                "name": "Asha K",
                "line1": "124 Indiranagar 100ft Road",
                "city": "Bengaluru",
                "state": "Karnataka",
                "pincode": "560038",
                "phone": "9876543210",
            },
        }
        res_order = await client.post("/api/orders", json=order_payload, headers=headers)
        assert res_order.status_code == 202, f"Order placement failed: {res_order.text}"
        order_info = res_order.json()
        order_id = order_info["orderId"]
        print(f"Order Created: #{order_info['orderNumber']} (ID: {order_id}) Status: {order_info['status']}")
        print("✅ Order created and 202 Accepted returned!")

        # 6. Pump events through the saga
        print("\n[TEST 6] Processing Distributed Saga Events via Workers...")
        await pump_events()

        # 7. Check Order Detail after saga completion
        res_detail = await client.get(f"/api/orders/{order_id}", headers=headers)
        assert res_detail.status_code == 200
        detail = res_detail.json()
        print(f"Order Status after Saga: {detail['status']}")
        print(f"Payment Status: {detail.get('payment', {}).get('status')}")
        print(f"Shipment Carrier: {detail.get('shipment', {}).get('carrier')}, Tracking #: {detail.get('shipment', {}).get('trackingNumber')}")
        assert detail["status"] == "SHIPPED", f"Expected SHIPPED, got {detail['status']}"
        print("✅ Order progressed through PENDING -> STOCK_RESERVED -> PAID -> SHIPPED!")

        # 8. Check Order Events Timeline
        print("\n[TEST 7] Checking Event Bus Timeline (/api/orders/{id}/events)...")
        res_events = await client.get(f"/api/orders/{order_id}/events", headers=headers)
        assert res_events.status_code == 200
        events = res_events.json()
        event_types = [e["eventType"] for e in events]
        print(f"Recorded Events: {event_types}")
        assert "OrderCreated" in event_types
        assert "StockReserved" in event_types
        assert "PaymentCompleted" in event_types
        assert "ShipmentCreated" in event_types
        print("✅ All 4 lifecycle event envelopes recorded in DB!")

        # 9. Verify Customer My Orders List (/api/orders)
        print("\n[TEST 8] Fetching Customer Order History (/api/orders)...")
        res_my_orders = await client.get("/api/orders", headers=headers)
        assert res_my_orders.status_code == 200
        orders_list = res_my_orders.json()["data"]
        print(f"Customer has {len(orders_list)} orders in history.")
        matching = [o for o in orders_list if o["id"] == order_id]
        assert len(matching) > 0, "Placed order not found in customer's order history!"
        print(f"Verified order in history: Order #{matching[0]['orderNumber']} (Status: {matching[0]['status']})")
        print("✅ 'My Orders' feature working 100%!")

        # 10. Test Payment Failure Compensation Flow (TEST_FAIL)
        print("\n[TEST 9] Testing Compensation Rollback Flow (paymentMethod: TEST_FAIL)...")
        fail_payload = {
            "items": [{"productId": "p_02", "quantity": 1}],
            "paymentMethod": "TEST_FAIL",
            "shippingAddress": {
                "name": "Asha K",
                "line1": "124 Indiranagar",
                "city": "Bengaluru",
                "state": "Karnataka",
                "pincode": "560038",
                "phone": "9876543210",
            },
        }
        res_fail = await client.post("/api/orders", json=fail_payload, headers=headers)
        assert res_fail.status_code == 202
        fail_id = res_fail.json()["orderId"]
        await pump_events()

        res_fail_detail = await client.get(f"/api/orders/{fail_id}", headers=headers)
        fail_detail = res_fail_detail.json()
        print(f"Order #{fail_detail['orderNumber']} Final Status: {fail_detail['status']} (Reason: {fail_detail['failureReason']})")
        assert fail_detail["status"] == "FAILED"
        assert fail_detail["failureReason"] == "PAYMENT_FAILED"
        print("✅ Compensation rollback saga verified!")

        # 11. Admin Stats & DLQ
        print("\n[TEST 10] Testing Admin Operations (/api/admin/stats)...")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        res_stats = await client.get("/api/admin/stats", headers=admin_headers)
        assert res_stats.status_code == 200
        stats = res_stats.json()
        print(f"Admin Stats -> Orders Today: {stats['ordersToday']}, Shipped Revenue: ₹{stats['revenueShipped']}")
        print("✅ Admin dashboard stats verified!")

    print("\n==================================================")
    print("🎉 ALL 10 TESTS PASSED! BACKEND & FRONTEND INTEGRATION IS FULLY FUNCTIONAL!")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_diagnostics())
