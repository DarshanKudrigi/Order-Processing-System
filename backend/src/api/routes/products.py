from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.common.auth import require_admin
from src.common.errors import NotFoundError
from src.common.models import Inventory, Product, User
from src.config.db import get_db

router = APIRouter(prefix="/api/products", tags=["Products"])


class ProductListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    price: float
    category: str
    imageUrl: str | None = None
    availableQuantity: int


class ProductListResponse(BaseModel):
    data: list[ProductListItem]
    page: int
    limit: int
    total: int


class ProductDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    price: float
    category: str
    imageUrl: str | None = None
    isActive: bool
    availableQuantity: int
    createdAt: datetime | None = None


class CreateProductRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    price: Decimal = Field(..., gt=0)
    category: str = Field(..., min_length=1, max_length=100)
    imageUrl: str | None = None
    availableQuantity: int = Field(default=0, ge=0)


class UpdateProductRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=255)
    description: str | None = None
    price: Decimal | None = Field(None, gt=0)
    category: str | None = Field(None, min_length=1, max_length=100)
    imageUrl: str | None = None
    isActive: bool | None = None


@router.get("", response_model=ProductListResponse, status_code=status.HTTP_200_OK)
async def list_products(
    search: str | None = Query(None),
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> ProductListResponse:
    # Public query: only active products
    conditions: list[Any] = [Product.is_active.is_(True)]

    if search:
        search_filter = f"%{search.strip()}%"
        conditions.append(
            Product.name.ilike(search_filter) | Product.description.ilike(search_filter)
        )

    if category:
        conditions.append(Product.category.ilike(category.strip()))

    # Count total
    count_stmt = select(func.count(Product.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    # Query items with inventory
    offset = (page - 1) * limit
    stmt = (
        select(Product)
        .options(selectinload(Product.inventory))
        .where(*conditions)
        .order_by(Product.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    products = (await db.execute(stmt)).scalars().all()

    data = [
        ProductListItem(
            id=p.id,
            name=p.name,
            description=p.description,
            price=float(p.price),
            category=p.category,
            imageUrl=p.image_url,
            availableQuantity=p.inventory.quantity_available if p.inventory else 0,
        )
        for p in products
    ]

    return ProductListResponse(data=data, page=page, limit=limit, total=total)


@router.get("/{product_id}", response_model=ProductDetailResponse, status_code=status.HTTP_200_OK)
async def get_product(
    product_id: str,
    db: AsyncSession = Depends(get_db),
) -> ProductDetailResponse:
    stmt = select(Product).options(selectinload(Product.inventory)).where(Product.id == product_id)
    product = (await db.execute(stmt)).scalar_one_or_none()
    if not product:
        raise NotFoundError(f"Product {product_id} not found")

    return ProductDetailResponse(
        id=product.id,
        name=product.name,
        description=product.description,
        price=float(product.price),
        category=product.category,
        imageUrl=product.image_url,
        isActive=product.is_active,
        availableQuantity=product.inventory.quantity_available if product.inventory else 0,
        createdAt=product.created_at,
    )


@router.post(
    "",
    response_model=ProductDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_product(
    payload: CreateProductRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ProductDetailResponse:
    new_product = Product(
        name=payload.name,
        description=payload.description,
        price=payload.price,
        category=payload.category,
        image_url=payload.imageUrl,
        is_active=True,
    )
    db.add(new_product)
    await db.flush()

    new_inventory = Inventory(
        product_id=new_product.id,
        quantity_available=payload.availableQuantity,
        quantity_reserved=0,
    )
    db.add(new_inventory)
    await db.commit()
    await db.refresh(new_product)
    await db.refresh(new_inventory)

    return ProductDetailResponse(
        id=new_product.id,
        name=new_product.name,
        description=new_product.description,
        price=float(new_product.price),
        category=new_product.category,
        imageUrl=new_product.image_url,
        isActive=new_product.is_active,
        availableQuantity=new_inventory.quantity_available,
        createdAt=new_product.created_at,
    )


@router.put(
    "/{product_id}",
    response_model=ProductDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def update_product(
    product_id: str,
    payload: UpdateProductRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ProductDetailResponse:
    stmt = select(Product).options(selectinload(Product.inventory)).where(Product.id == product_id)
    product = (await db.execute(stmt)).scalar_one_or_none()
    if not product:
        raise NotFoundError(f"Product {product_id} not found")

    if payload.name is not None:
        product.name = payload.name
    if payload.description is not None:
        product.description = payload.description
    if payload.price is not None:
        product.price = payload.price
    if payload.category is not None:
        product.category = payload.category
    if payload.imageUrl is not None:
        product.image_url = payload.imageUrl
    if payload.isActive is not None:
        product.is_active = payload.isActive

    await db.commit()
    await db.refresh(product)

    return ProductDetailResponse(
        id=product.id,
        name=product.name,
        description=product.description,
        price=float(product.price),
        category=product.category,
        imageUrl=product.image_url,
        isActive=product.is_active,
        availableQuantity=product.inventory.quantity_available if product.inventory else 0,
        createdAt=product.created_at,
    )


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_product(
    product_id: str,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Response:
    stmt = select(Product).where(Product.id == product_id)
    product = (await db.execute(stmt)).scalar_one_or_none()
    if not product:
        raise NotFoundError(f"Product {product_id} not found")

    # Soft delete (FR-12, EP-08)
    product.is_active = False
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
