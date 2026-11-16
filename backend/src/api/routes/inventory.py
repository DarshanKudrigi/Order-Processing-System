from datetime import datetime

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.common.auth import require_admin
from src.common.errors import NotFoundError
from src.common.models import Inventory, User
from src.config.db import get_db

router = APIRouter(prefix="/api/inventory", tags=["Inventory"])


class InventoryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    productId: str
    productName: str
    quantityAvailable: int
    quantityReserved: int
    updatedAt: datetime | None = None


class UpdateInventoryRequest(BaseModel):
    quantityAvailable: int = Field(..., ge=0)


@router.get("", response_model=list[InventoryItemResponse], status_code=status.HTTP_200_OK)
async def list_inventory(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[InventoryItemResponse]:
    stmt = select(Inventory).options(selectinload(Inventory.product)).order_by(Inventory.product_id)
    inventories = (await db.execute(stmt)).scalars().all()

    return [
        InventoryItemResponse(
            productId=inv.product_id,
            productName=inv.product.name if inv.product else "",
            quantityAvailable=inv.quantity_available,
            quantityReserved=inv.quantity_reserved,
            updatedAt=inv.updated_at,
        )
        for inv in inventories
    ]


@router.patch(
    "/{product_id}",
    response_model=InventoryItemResponse,
    status_code=status.HTTP_200_OK,
)
async def update_inventory(
    product_id: str,
    payload: UpdateInventoryRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> InventoryItemResponse:
    stmt = (
        select(Inventory)
        .options(selectinload(Inventory.product))
        .where(Inventory.product_id == product_id)
    )
    inv = (await db.execute(stmt)).scalar_one_or_none()
    if not inv:
        raise NotFoundError(f"Inventory record for product {product_id} not found")

    inv.quantity_available = payload.quantityAvailable
    await db.commit()
    await db.refresh(inv)

    return InventoryItemResponse(
        productId=inv.product_id,
        productName=inv.product.name if inv.product else "",
        quantityAvailable=inv.quantity_available,
        quantityReserved=inv.quantity_reserved,
        updatedAt=inv.updated_at,
    )

