import sys
from pathlib import Path

# Ensure backend root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, text
from src.config.env import settings

def create_db():
    sync_url = settings.SYNC_DATABASE_URL
    if not sync_url:
        sync_url = settings.DATABASE_URL.replace("+asyncpg", "").replace("+aiosqlite", "")

    # Replace target db with 'postgres' to connect to default database
    import re
    default_url = re.sub(r'/[^/]+$', '/postgres', sync_url)

    print(f"Connecting to {default_url.split('@')[-1]}...")
    engine = create_engine(default_url, isolation_level="AUTOCOMMIT")

    try:
        with engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = 'Order_Processing'")
            ).scalar()

            if not exists:
                print('Creating database "Order_Processing"...')
                conn.execute(text('CREATE DATABASE "Order_Processing"'))
                print('Database "Order_Processing" created successfully!')
            else:
                print('Database "Order_Processing" already exists.')
        return True
    except Exception as e:
        print("Error creating database:", e)
        return False

if __name__ == "__main__":
    create_db()
