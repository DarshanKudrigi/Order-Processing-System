import asyncio
import signal
import sys
from pathlib import Path

# Ensure backend root is on Python path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from src.common.logger import logger
from src.config.env import settings
from src.workers.inventory_worker import run_worker as run_inventory_worker
from src.workers.notification_worker import run_worker as run_notification_worker
from src.workers.payment_worker import run_worker as run_payment_worker
from src.workers.shipping_worker import run_worker as run_shipping_worker


async def main():
    bus_type = "Azure Service Bus (Live Cloud)" if not settings.USE_IN_MEMORY_BUS else "In-Memory Bus (Local Fallback)"
    print("==================================================================")
    print("🚀 Starting All Distributed Order Workers")
    print("==================================================================")
    print(f"Bus Mode: {bus_type}")
    print(f"Topic:    {settings.SB_TOPIC_NAME}")
    print("Active Worker Microservices:")
    print("  📦 1. Inventory Worker     -> listens on [inventory-sub]")
    print("  💳 2. Payment Worker       -> listens on [payment-sub]")
    print("  🚚 3. Shipping Worker      -> listens on [shipping-sub]")
    print("  📬 4. Notification Worker  -> listens on [notification-sub]")
    print("==================================================================")
    print("Press Ctrl+C to stop all workers gracefully.\n")

    stop_event = asyncio.Event()

    tasks = [
        asyncio.create_task(run_inventory_worker(stop_event=stop_event)),
        asyncio.create_task(run_payment_worker(stop_event=stop_event)),
        asyncio.create_task(run_shipping_worker(stop_event=stop_event)),
        asyncio.create_task(run_notification_worker(stop_event=stop_event)),
    ]

    try:
        await asyncio.gather(*tasks)
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    except Exception as exc:
        logger.error(f"Worker runtime error: {exc}")
    finally:
        stop_event.set()
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        print("\n✅ All workers stopped cleanly.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutdown complete.")
