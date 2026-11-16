from decimal import Decimal

import pytest
from sqlalchemy import select

from src.common.models import Inventory, Product, User
from src.config.db import AsyncSessionLocal


@pytest.mark.asyncio
async def test_database_models_and_seed() -> None:
    async with AsyncSessionLocal() as session:
        # Check admin user
        admin = (
            await session.execute(select(User).where(User.email == "admin@example.com"))
        ).scalar_one_or_none()
        assert admin is not None
        assert admin.role == "ADMIN"

        # Check customer user
        customer = (
            await session.execute(select(User).where(User.email == "asha@example.com"))
        ).scalar_one_or_none()
        assert customer is not None
        assert customer.role == "CUSTOMER"

        # Check products
        products = (await session.execute(select(Product))).scalars().all()
        assert len(products) >= 20

        # Check specific product p_17
        p17 = (
            await session.execute(select(Product).where(Product.id == "p_17"))
        ).scalar_one_or_none()
        assert p17 is not None
        assert p17.name == "Wireless Mouse"
        assert p17.price == Decimal("799.00")

        # Check inventory for p_17
        inv17 = (
            await session.execute(select(Inventory).where(Inventory.product_id == "p_17"))
        ).scalar_one_or_none()
        assert inv17 is not None
        assert inv17.quantity_available == 42
