import contextvars
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

# Context variables for traceability (Rule R8)
correlation_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "correlation_id", default=None
)
message_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "message_id", default=None
)


def set_correlation_id(correlation_id: str | None) -> None:
    correlation_id_ctx.set(correlation_id)


def get_correlation_id() -> str | None:
    return correlation_id_ctx.get()


def set_message_id(message_id: str | None) -> None:
    message_id_ctx.set(message_id)


def get_message_id() -> str | None:
    return message_id_ctx.get()


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "correlationId": getattr(record, "correlationId", get_correlation_id()),
            "messageId": getattr(record, "messageId", get_message_id()),
        }

        if hasattr(record, "extra") and isinstance(record.extra, dict):  # type: ignore[attr-defined]
            log_entry.update(record.extra)  # type: ignore[attr-defined]

        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry)


def setup_logger(name: str = "order-system") -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    logger.propagate = False

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)

    return logger


logger = setup_logger()

