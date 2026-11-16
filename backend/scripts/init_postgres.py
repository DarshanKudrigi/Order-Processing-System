import asyncio
import sys
from pathlib import Path
from urllib.parse import quote_plus, urlparse

# Add backend root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncpg
from src.config.env import settings


async def check():
    """Verify or create target database using settings from .env without hardcoded secrets."""
    raw_url = settings.DATABASE_URL.replace("+asyncpg", "").replace("+aiosqlite", "")
    parsed = urlparse(raw_url)
    user = parsed.username or "postgres"
    password = parsed.password or ""
    host = parsed.hostname or "localhost"
    port = parsed.port or 5432
    target_db = parsed.path.lstrip("/") or "Order_Processing"

    encoded_pw = quote_plus(password)
    admin_url = f"postgresql://{user}:{encoded_pw}@{host}:{port}/postgres"

    try:
        conn = await asyncpg.connect(admin_url, timeout=5.0)
        print("Connected to PostgreSQL server.")
        row = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", target_db
        )
        if not row:
            print(f"Creating database {target_db}...")
            await conn.execute(f'CREATE DATABASE "{target_db}"')
            print(f"Created database {target_db} successfully.")
        else:
            print(f"Database {target_db} already exists.")
        await conn.close()
        return True
    except Exception as e:
        print("Postgres connection check:", e)
        return False


if __name__ == "__main__":
    asyncio.run(check())
