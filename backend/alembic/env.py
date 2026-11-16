from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

import src.common.models  # noqa: F401
from alembic import context
from src.config.db import Base
from src.config.env import settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

sync_url = settings.SYNC_DATABASE_URL
if not sync_url:
    sync_url = settings.DATABASE_URL.replace("+asyncpg", "").replace("+aiosqlite", "")

# Escape % for configparser interpolation (e.g. %40 in passwords)
config.set_main_option("sqlalchemy.url", sync_url.replace("%", "%%"))


def run_migrations_offline() -> None:
    context.configure(
        url=sync_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    from sqlalchemy import create_engine
    connectable = create_engine(sync_url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
