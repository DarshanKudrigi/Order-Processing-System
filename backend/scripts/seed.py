import asyncio
import sys
from decimal import Decimal
from pathlib import Path

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bcrypt
from sqlalchemy import select

from src.common.models import Inventory, Product, User
from src.config.db import AsyncSessionLocal, init_db


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


PRODUCTS = [
    {
        "id": "p_01",
        "name": "Mechanical Keyboard",
        "description": "RGB mechanical keyboard with blue switches",
        "price": Decimal("2499.00"),
        "category": "Peripherals",
        "image_url": "https://images.unsplash.com/photo-1587829741301-dc798b83add3",
        "stock": 50,
    },
    {
        "id": "p_02",
        "name": "Gaming Headset",
        "description": "7.1 surround sound noise-cancelling headset",
        "price": Decimal("1899.00"),
        "category": "Audio",
        "image_url": "https://images.unsplash.com/photo-1546435770-a3e426bf472b",
        "stock": 35,
    },
    {
        "id": "p_03",
        "name": "27-inch 4K Monitor",
        "description": "IPS panel with HDR support and 144Hz refresh rate",
        "price": Decimal("24999.00"),
        "category": "Displays",
        "image_url": "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf",
        "stock": 15,
    },
    {
        "id": "p_04",
        "name": "Ergonomic Office Chair",
        "description": "High-back mesh chair with adjustable lumbar support",
        "price": Decimal("8499.00"),
        "category": "Furniture",
        "image_url": "https://images.unsplash.com/photo-1580481077195-c32247b952a2",
        "stock": 20,
    },
    {
        "id": "p_05",
        "name": "Standing Desk Converter",
        "description": "Height adjustable dual-monitor riser",
        "price": Decimal("6299.00"),
        "category": "Furniture",
        "image_url": "https://images.unsplash.com/photo-1595515106969-1ce29566ff1c",
        "stock": 12,
    },
    {
        "id": "p_06",
        "name": "1080p Web Camera",
        "description": "Full HD webcam with dual stereo microphones",
        "price": Decimal("1499.00"),
        "category": "Peripherals",
        "image_url": "https://images.unsplash.com/photo-1588508065123-287b28e013da",
        "stock": 40,
    },
    {
        "id": "p_07",
        "name": "USB Condenser Microphone",
        "description": "Cardioid studio microphone for podcasting and streaming",
        "price": Decimal("3299.00"),
        "category": "Audio",
        "image_url": "https://images.unsplash.com/photo-1590658268037-6bf12165a8df",
        "stock": 25,
    },
    {
        "id": "p_08",
        "name": "Laptop Stand Aluminium",
        "description": "Foldable ventilated ergonomic laptop elevator",
        "price": Decimal("999.00"),
        "category": "Accessories",
        "image_url": "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46",
        "stock": 60,
    },
    {
        "id": "p_09",
        "name": "Wireless Charging Pad",
        "description": "15W fast wireless charger for Qi-enabled devices",
        "price": Decimal("899.00"),
        "category": "Accessories",
        "image_url": "https://images.unsplash.com/photo-1586953208448-b95a79798f07",
        "stock": 45,
    },
    {
        "id": "p_10",
        "name": "External NVMe SSD 1TB",
        "description": "High-speed portable SSD up to 1050 MB/s",
        "price": Decimal("7499.00"),
        "category": "Storage",
        "image_url": "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b",
        "stock": 30,
    },
    {
        "id": "p_11",
        "name": "Bluetooth Speaker 20W",
        "description": "Waterproof portable speaker with 12h playtime",
        "price": Decimal("2199.00"),
        "category": "Audio",
        "image_url": "https://images.unsplash.com/photo-1545454675-3531b543be5d",
        "stock": 22,
    },
    {
        "id": "p_12",
        "name": "Desk Mat Large 900x400mm",
        "description": "Non-slip waterproof leather desk pad",
        "price": Decimal("649.00"),
        "category": "Accessories",
        "image_url": "https://images.unsplash.com/photo-1616400619175-5beda3a17896",
        "stock": 80,
    },
    {
        "id": "p_13",
        "name": "Smart LED Desk Lamp",
        "description": "Dimmable eye-care lamp with touch control and timer",
        "price": Decimal("1799.00"),
        "category": "Lighting",
        "image_url": "https://images.unsplash.com/photo-1534353436294-0dbd4bdac845",
        "stock": 18,
    },
    {
        "id": "p_14",
        "name": "Cable Management Box",
        "description": "Flame retardant wire organizer box with bamboo lid",
        "price": Decimal("599.00"),
        "category": "Accessories",
        "image_url": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c",
        "stock": 50,
    },
    {
        "id": "p_15",
        "name": "Wi-Fi 6 Mesh Router",
        "description": "Dual band AX3000 whole-home mesh system",
        "price": Decimal("5999.00"),
        "category": "Networking",
        "image_url": "https://images.unsplash.com/photo-1544197150-b99a580bb7a8",
        "stock": 14,
    },
    {
        "id": "p_16",
        "name": "Graphic Drawing Tablet",
        "description": "10x6 inch tablet with 8192 levels battery-free stylus",
        "price": Decimal("4299.00"),
        "category": "Peripherals",
        "image_url": "https://images.unsplash.com/photo-1563245372-f21724e3856d",
        "stock": 16,
    },
    {
        # Matches Section 9.3 example exactly
        "id": "p_17",
        "name": "Wireless Mouse",
        "description": "2.4 GHz optical mouse with ergonomic grip",
        "price": Decimal("799.00"),
        "category": "Accessories",
        "image_url": "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46",
        "stock": 42,
    },
    {
        "id": "p_18",
        "name": "Noise Cancelling Earbuds",
        "description": "True wireless ANC earbuds with charging case",
        "price": Decimal("3999.00"),
        "category": "Audio",
        "image_url": "https://images.unsplash.com/photo-1590658268037-6bf12165a8df",
        "stock": 28,
    },
    {
        "id": "p_19",
        "name": "Screenbar Monitor Light",
        "description": "Auto-dimming e-reading LED monitor hanging light",
        "price": Decimal("2999.00"),
        "category": "Lighting",
        "image_url": "https://images.unsplash.com/photo-1507473885765-e6ed057f782c",
        "stock": 15,
    },
    {
        # Matches Section 9.3 / Section 17 example: low stock of 3
        "id": "p_20",
        "name": "USB-C to HDMI Adapter",
        "description": "4K@60Hz aluminum Type-C adapter",
        "price": Decimal("849.00"),
        "category": "Accessories",
        "image_url": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c",
        "stock": 20,
    },
    {
        "id": "p_21",
        "name": "USB-C Hub",
        "description": "7-in-1 multi-port adapter with 100W PD and 4K HDMI",
        "price": Decimal("1299.00"),
        "category": "Accessories",
        "image_url": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c",
        "stock": 3,
    },
]


async def seed() -> None:
    await init_db()
    async with AsyncSessionLocal() as session:
        # 1. Seed Admin
        stmt = select(User).where(User.email == "admin@example.com")
        admin = (await session.execute(stmt)).scalar_one_or_none()
        if not admin:
            admin = User(
                id="u_admin_01",
                name="System Admin",
                email="admin@example.com",
                password_hash=hash_password("Admin123!"),
                role="ADMIN",
            )
            session.add(admin)

        # 2. Seed Customer (matches Section 9.3 Asha K)
        stmt = select(User).where(User.email == "asha@example.com")
        customer = (await session.execute(stmt)).scalar_one_or_none()
        if not customer:
            customer = User(
                id="u_1029",
                name="Asha K",
                email="asha@example.com",
                password_hash=hash_password("Passw0rd!"),
                role="CUSTOMER",
            )
            session.add(customer)

        # 3. Seed Products and Inventory
        for item in PRODUCTS:
            stmt = select(Product).where(Product.id == item["id"])
            prod = (await session.execute(stmt)).scalar_one_or_none()
            if not prod:
                prod = Product(
                    id=item["id"],
                    name=item["name"],
                    description=item["description"],
                    price=item["price"],
                    category=item["category"],
                    image_url=item["image_url"],
                    is_active=True,
                )
                session.add(prod)
                inv = Inventory(
                    product_id=item["id"],
                    quantity_available=item["stock"],
                    quantity_reserved=0,
                )
                session.add(inv)

        await session.commit()
        print("Database seeded successfully with admin, customer, and products!")


if __name__ == "__main__":
    asyncio.run(seed())
