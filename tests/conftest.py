import pytest

from src.api.routes.auth import limiter
from src.config.env import settings
from src.config.service_bus import in_memory_bus

# Disable rate limiting during automated test suite
settings.ENVIRONMENT = "test"
limiter.enabled = False


@pytest.fixture(autouse=True)
def clean_bus():
    in_memory_bus.clear_all_queues()
    yield
    in_memory_bus.clear_all_queues()
