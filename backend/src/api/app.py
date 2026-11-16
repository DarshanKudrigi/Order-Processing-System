import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from slowapi.errors import RateLimitExceeded

from src.api.routes.admin import router as admin_router
from src.api.routes.auth import limiter
from src.api.routes.auth import router as auth_router
from src.api.routes.health import router as health_router
from src.api.routes.inventory import router as inventory_router
from src.api.routes.orders import router as orders_router
from src.api.routes.products import router as products_router
from src.api.status_listener import run_listener
from src.common.middleware import CorrelationIdMiddleware, register_error_handlers
from src.config.db import init_db
from src.config.env import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure tables exist if database is running
    try:
        await init_db()
    except Exception as exc:
        print(f"WARNING: Could not connect to PostgreSQL on startup ({exc}).")
        print("FastAPI will start, and will connect as soon as the PostgreSQL service is active.")

    # Start status listener inside API (PRD Section 7.2 & 8.3)
    stop_event = asyncio.Event()
    task = asyncio.create_task(run_listener(stop_event=stop_event))
    yield
    stop_event.set()
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):
        pass


app = FastAPI(
    title="Loosely Coupled Order Processing System API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(_request: Request, _exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "error": {
                "code": "RATE_LIMITED",
                "message": "Too many auth requests",
            }
        },
    )


# Register Correlation ID and error handling
app.add_middleware(CorrelationIdMiddleware)
register_error_handlers(app)

# Configure CORS
origins = [origin.strip() for origin in settings.CORS_ORIGIN.split(",") if origin.strip()]
if not origins:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router)
app.include_router(products_router)
app.include_router(inventory_router)
app.include_router(orders_router)
app.include_router(admin_router)
app.include_router(health_router)


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")
