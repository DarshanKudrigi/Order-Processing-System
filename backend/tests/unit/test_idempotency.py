import uuid

import pytest

from src.common.idempotency import is_already_processed, mark_as_processed
from src.config.db import AsyncSessionLocal


@pytest.mark.asyncio
async def test_idempotency_workflow():
    msg_id = str(uuid.uuid4())
    consumer = "test-consumer"

    async with AsyncSessionLocal() as db:
        # 1. Initially not processed
        already = await is_already_processed(db, msg_id, consumer)
        assert already is False

        # 2. Mark as processed
        await mark_as_processed(db, msg_id, consumer)

        # 3. Check now processed
        already_after = await is_already_processed(db, msg_id, consumer)
        assert already_after is True

        # 4. Another consumer with same message_id is NOT marked processed yet
        other_consumer_already = await is_already_processed(db, msg_id, "other-consumer")
        assert other_consumer_already is False
