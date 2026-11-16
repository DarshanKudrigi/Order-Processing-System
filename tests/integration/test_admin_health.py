import pytest
from fastapi.testclient import TestClient

from src.api.app import app
from src.config.service_bus import InMemoryMessage, in_memory_bus

client = TestClient(app)


@pytest.fixture
def tokens():
    res_admin = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "Admin123!"},
    )
    res_cust = client.post(
        "/api/auth/login",
        json={"email": "asha@example.com", "password": "Passw0rd!"},
    )
    return {
        "admin": res_admin.json()["token"],
        "customer": res_cust.json()["token"],
    }


def test_admin_stats(tokens):
    # Customer gets 403
    cust_res = client.get(
        "/api/admin/stats",
        headers={"Authorization": f"Bearer {tokens['customer']}"},
    )
    assert cust_res.status_code == 403

    # Admin gets 200 with stats
    admin_res = client.get(
        "/api/admin/stats",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
    )
    assert admin_res.status_code == 200
    stats = admin_res.json()
    assert "ordersToday" in stats
    assert "byStatus" in stats
    assert "revenueShipped" in stats
    assert "lowStock" in stats
    assert "stuckPending" in stats
    # p_21 was seeded with stock 3 (< 10), so it should be in lowStock
    assert any(item["productId"] == "p_21" for item in stats["lowStock"])


@pytest.mark.asyncio
async def test_admin_dead_letters(tokens):
    # Customer gets 403
    cust_res = client.get(
        "/api/admin/dead-letters",
        headers={"Authorization": f"Bearer {tokens['customer']}"},
    )
    assert cust_res.status_code == 403

    # Add a poison / failed message to DLQ
    msg = InMemoryMessage(
        message_id="msg-poison-001",
        correlation_id="order-poison-001",
        subject="StockReserved",
        body="{}",
        application_properties={"eventType": "StockReserved", "orderId": "order-poison-001"},
        delivery_count=5,
    )
    await in_memory_bus.dead_letter("payment-sub", msg, "MaxDeliveryCountExceeded")

    # Admin gets 200 with DLQ messages
    admin_res = client.get(
        "/api/admin/dead-letters",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
    )
    assert admin_res.status_code == 200
    dlq_list = admin_res.json()
    assert len(dlq_list) >= 1
    assert any(
        d["messageId"] == "msg-poison-001" and d["subscription"] == "payment-sub" for d in dlq_list
    )


def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    health = res.json()
    assert health["status"] == "healthy"
    assert health["api"] == "connected"
    assert health["database"] == "connected"
    assert health["serviceBus"] == "connected"
