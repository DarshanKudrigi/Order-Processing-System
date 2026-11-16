from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.common.auth import require_admin
from src.common.models import Inventory, Order, User
from src.config.db import get_db
from src.config.service_bus import bus_manager

router = APIRouter(prefix="/api/admin", tags=["Admin"])


class LowStockItem(BaseModel):
    productId: str
    name: str
    available: int


class AdminStatsResponse(BaseModel):
    ordersToday: int
    byStatus: dict[str, int]
    revenueShipped: float
    lowStock: list[LowStockItem]
    stuckPending: int


class DeadLetterItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    subscription: str
    messageId: str
    eventType: str
    orderId: str
    reason: str
    deliveryCount: int
    enqueuedAt: str


@router.get("/stats", response_model=AdminStatsResponse, status_code=status.HTTP_200_OK)
async def get_admin_stats(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminStatsResponse:
    now_utc = datetime.now(timezone.utc)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)

    # 1. Orders today
    today_count_stmt = select(func.count(Order.id)).where(Order.created_at >= today_start)
    orders_today = (await db.execute(today_count_stmt)).scalar_one() or 0

    # 2. Orders by status
    status_counts_stmt = select(Order.status, func.count(Order.id)).group_by(Order.status)
    status_rows = (await db.execute(status_counts_stmt)).all()
    by_status = {
        "PENDING": 0,
        "STOCK_RESERVED": 0,
        "PAID": 0,
        "SHIPPED": 0,
        "FAILED": 0,
        "CANCELLED": 0,
    }
    for st, count in status_rows:
        by_status[st] = count

    # 3. Revenue from shipped orders
    revenue_stmt = select(func.coalesce(func.sum(Order.total_amount), 0)).where(
        Order.status == "SHIPPED"
    )
    revenue_shipped = float((await db.execute(revenue_stmt)).scalar_one() or 0.0)

    # 4. Low stock products (available < 10)
    low_stock_stmt = (
        select(Inventory)
        .options(selectinload(Inventory.product))
        .where(Inventory.quantity_available < 10)
    )
    low_stock_records = (await db.execute(low_stock_stmt)).scalars().all()
    low_stock = [
        LowStockItem(
            productId=inv.product_id,
            name=inv.product.name if inv.product else "",
            available=inv.quantity_available,
        )
        for inv in low_stock_records
    ]

    # 5. Stuck pending orders (Rule R9: PENDING for more than 5 minutes)
    five_min_ago = now_utc - timedelta(minutes=5)
    stuck_stmt = select(func.count(Order.id)).where(
        Order.status == "PENDING",
        Order.created_at < five_min_ago,
    )
    stuck_pending = (await db.execute(stuck_stmt)).scalar_one() or 0

    return AdminStatsResponse(
        ordersToday=orders_today,
        byStatus=by_status,
        revenueShipped=revenue_shipped,
        lowStock=low_stock,
        stuckPending=stuck_pending,
    )


@router.get(
    "/dead-letters",
    response_model=list[DeadLetterItem],
    status_code=status.HTTP_200_OK,
)
async def get_dead_letters(
    _admin: User = Depends(require_admin),
) -> list[DeadLetterItem]:
    dlq_messages = await bus_manager.peek_dlq_all()
    return [DeadLetterItem(**m) for m in dlq_messages]

