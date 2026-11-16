from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from src.config.db import check_db_health
from src.config.service_bus import bus_manager

router = APIRouter(prefix="/api/health", tags=["Health"])


class HealthResponse(BaseModel):
    status: str
    api: str
    database: str
    serviceBus: str


@router.get("", response_model=HealthResponse)
async def get_health(response: Response) -> HealthResponse:
    db_healthy = await check_db_health()
    sb_healthy = await bus_manager.check_health()

    api_status = "connected"
    db_status = "connected" if db_healthy else "disconnected"
    sb_status = "connected" if sb_healthy else "disconnected"

    if db_healthy and sb_healthy:
        overall_status = "healthy"
        response.status_code = status.HTTP_200_OK
    else:
        overall_status = "degraded"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return HealthResponse(
        status=overall_status,
        api=api_status,
        database=db_status,
        serviceBus=sb_status,
    )

