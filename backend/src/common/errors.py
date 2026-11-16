from typing import Any


class AppException(Exception):
    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        status_code: int = 500,
        details: list[dict[str, Any]] | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or []


class ValidationError(AppException):
    def __init__(
        self, message: str = "Invalid request", details: list[dict[str, Any]] | None = None
    ):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status_code=400,
            details=details,
        )


class UnauthorizedError(AppException):
    def __init__(self, message: str = "Missing, invalid or expired token"):
        super().__init__(
            message=message,
            code="UNAUTHORIZED",
            status_code=401,
        )


class ForbiddenError(AppException):
    def __init__(self, message: str = "Role not allowed, or order belongs to another user"):
        super().__init__(
            message=message,
            code="FORBIDDEN",
            status_code=403,
        )


class NotFoundError(AppException):
    def __init__(self, message: str = "Resource does not exist"):
        super().__init__(
            message=message,
            code="NOT_FOUND",
            status_code=404,
        )


class ConflictError(AppException):
    def __init__(self, message: str = "Resource conflict"):
        super().__init__(
            message=message,
            code="CONFLICT",
            status_code=409,
        )


class RateLimitError(AppException):
    def __init__(self, message: str = "Too many auth requests"):
        super().__init__(
            message=message,
            code="RATE_LIMITED",
            status_code=429,
        )


class MessagingUnavailableError(AppException):
    def __init__(self, message: str = "Service Bus publish failed"):
        super().__init__(
            message=message,
            code="MESSAGING_UNAVAILABLE",
            status_code=503,
        )


class InternalError(AppException):
    def __init__(self, message: str = "Unexpected error"):
        super().__init__(
            message=message,
            code="INTERNAL_ERROR",
            status_code=500,
        )
