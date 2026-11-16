import uuid
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from src.common.errors import AppException
from src.common.logger import logger, set_correlation_id, set_message_id


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        set_correlation_id(correlation_id)
        set_message_id(None)

        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        return response


def format_validation_error(exc: RequestValidationError) -> list[dict[str, Any]]:
    details = []
    for err in exc.errors():
        loc = err.get("loc", ())
        # Remove 'body' prefix if present for cleaner field naming
        parts = [str(p) for p in loc if p != "body"]
        field_str = ""
        for i, part in enumerate(parts):
            if part.isdigit():
                field_str += f"[{part}]"
            elif i == 0:
                field_str = part
            else:
                field_str += f".{part}"

        details.append(
            {
                "field": field_str or "request",
                "message": err.get("msg", "Invalid value"),
            }
        )
    return details


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
        error_body: dict[str, Any] = {
            "code": exc.code,
            "message": exc.message,
        }
        if exc.details:
            error_body["details"] = exc.details

        return JSONResponse(
            status_code=exc.status_code,
            content={"error": error_body},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        details = format_validation_error(exc)
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid request",
                    "details": details,
                }
            },
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        code_map = {
            400: "VALIDATION_ERROR",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            409: "CONFLICT",
            429: "RATE_LIMITED",
            500: "INTERNAL_ERROR",
            503: "MESSAGING_UNAVAILABLE",
        }
        code = code_map.get(exc.status_code, "ERROR")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": code,
                    "message": exc.detail if isinstance(exc.detail, str) else "Error occurred",
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Unexpected error",
                }
            },
        )
