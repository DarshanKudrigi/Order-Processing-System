from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.common.models import ProcessedMessage


async def is_already_processed(db: AsyncSession, message_id: str, consumer: str) -> bool:
    """Check if message has already been processed by consumer."""
    stmt = select(ProcessedMessage).where(
        ProcessedMessage.message_id == message_id,
        ProcessedMessage.consumer == consumer,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def mark_as_processed(db: AsyncSession, message_id: str, consumer: str) -> None:
    """Mark a message as successfully processed by consumer."""
    processed = ProcessedMessage(
        message_id=message_id,
        consumer=consumer,
        processed_at=datetime.now(timezone.utc),
    )
    db.add(processed)
    await db.commit()

