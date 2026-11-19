# Backend: Loosely Coupled Order Processing System

A production-grade, loosely coupled, event-driven order processing backend built with **Python 3.12+**, **FastAPI**, **SQLAlchemy/Alembic (PostgreSQL)**, **Pydantic**, and **Azure Service Bus**.

---

## 1. Architecture Overview

Services communicate exclusively by publishing and consuming events from the `order-events` Azure Service Bus topic (with seamless local in-memory fallback for offline/development environments).

```
[Browser / Client]
       │
       ▼ (REST API + JWT)
 ┌────────────┐               ┌─────────────────────────────────────────────────────────┐
 │ Order API  ├──────────────►│        Azure Service Bus: Topic "order-events"          │
 └─────┬──────┘ (OrderCreated)└──────┬────────────┬─────────────┬─────────────┬─────────┘
       │                             │            │             │             │
       │ (status-sub)    (inventory-sub) (payment-sub) (shipping-sub) (notification-sub)
       ▼                             ▼            ▼             ▼             ▼
┌──────────────┐              ┌───────────┐┌───────────┐┌───────────┐┌──────────────┐
│StatusListener│              │ Inventory ││  Payment  ││ Shipping  ││ Notification │
│(inside API)  │              │  Worker   ││  Worker   ││  Worker   ││    Worker    │
└──────────────┘              └───────────┘└───────────┘└───────────┘└──────────────┘
```

### Event Flow (Happy Path)
1. **Order API**: Customer places order ➔ validated, saved as `PENDING`, publishes `OrderCreated` (EVT-01) ➔ returns `202 Accepted`.
2. **Inventory Worker**: Listens on `inventory-sub` ➔ checks and reserves stock in an atomic database transaction ➔ publishes `StockReserved` (EVT-02).
3. **Payment Worker**: Listens on `payment-sub` ➔ processes mock payment gateway transaction ➔ creates `Payment` record ➔ publishes `PaymentCompleted` (EVT-04).
4. **Shipping Worker**: Listens on `shipping-sub` ➔ creates `Shipment` with tracking number via `DemoExpress`, settles inventory ➔ publishes `ShipmentCreated` (EVT-06).
5. **Status Listener**: Inside Order API process, listens on `status-sub` ➔ enforces forward-only status transitions (`PENDING` ➔ `STOCK_RESERVED` ➔ `PAID` ➔ `SHIPPED`) and records all timeline events.
6. **Notification Worker**: Listens on `notification-sub` ➔ formats branded notifications via SendGrid or logs with graceful fallback without blocking order processing.

### Compensation & Failure Flows
- **Out of stock**: Inventory Worker publishes `StockReservationFailed` (EVT-03) ➔ Status Listener marks order `FAILED` (`INSUFFICIENT_STOCK`).
- **Payment failure (`TEST_FAIL`)**: Payment Worker publishes `PaymentFailed` (EVT-05) ➔ Status Listener marks order `FAILED` (`PAYMENT_FAILED`) ➔ Inventory Worker consumes `PaymentFailed` and reverses reserved stock back to available stock.
- **Order Cancellation**: Customer calls `/api/orders/:id/cancel` while in `PENDING` or `STOCK_RESERVED` ➔ API marks order `CANCELLED`, publishes `OrderCancelled` (EVT-07) ➔ Inventory Worker automatically releases the held stock reservation.

---

## 2. Topic & Subscription Routing

**Topic Name**: `order-events`

| Subscription | SQL Filter Expression | Consumer |
|---|---|---|
| `inventory-sub` | `eventType IN ('OrderCreated','OrderCancelled','PaymentFailed')` | Inventory Worker |
| `payment-sub` | `eventType = 'StockReserved'` | Payment Worker |
| `shipping-sub` | `eventType = 'PaymentCompleted'` | Shipping Worker |
| `notification-sub` | `eventType IN ('OrderCreated','StockReservationFailed','PaymentCompleted','PaymentFailed','ShipmentCreated','OrderCancelled')` | Notification Worker |
| `status-sub` | `eventType IN ('StockReserved','StockReservationFailed','PaymentCompleted','PaymentFailed','ShipmentCreated')` | Status Listener (inside API) |

---

## 3. Local Setup & Quickstart

### Prerequisites
- Python 3.12+ (managed with `uv`)
- PostgreSQL 15+ running on port 5432 (or via Docker)

### 1. Installation
```powershell
# In backend directory
uv venv .venv

# Activate virtual environment
# On Windows:
.venv\Scripts\activate
# On Linux / macOS:
source .venv/bin/activate

# Install dependencies in editable mode
uv pip install -e ".[dev]"
```

### 2. Configuration
Copy `.env.example` to `.env` and fill in your local database credentials:
```bash
cp .env.example .env
```

#### Safe `.env` Template:
```env
ENVIRONMENT=development
PORT=8080

# PostgreSQL Configuration (Replace with your local credentials)
DATABASE_URL=postgresql+asyncpg://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:5432/<DB_NAME>
SYNC_DATABASE_URL=postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:5432/<DB_NAME>

# JWT Authentication
JWT_SECRET=<YOUR_RANDOM_SECRET_KEY_MINIMUM_32_CHARACTERS>
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:5173

# Azure Service Bus (Local in-process fallback active when true)
USE_IN_MEMORY_BUS=true
SERVICEBUS_CONNECTION_STRING=
SB_TOPIC_NAME=order-events
SB_MAX_CONCURRENT_CALLS=5

# Optional SendGrid Configuration
SENDGRID_API_KEY=
MAIL_FROM=orders@example.com
```

### 3. Database Creation & Migrations
```powershell
# Create database if it does not exist
python scripts/create_db.py

# Run Alembic migrations
alembic upgrade head

# Seed initial admin, demo customer, and 21 sample products
python scripts/seed.py
```

### 4. Running the Order API Server
```powershell
python -m src.api.server
```
- API Base URL: `http://localhost:8080`
- Interactive Swagger Docs: `http://localhost:8080/docs`
- Health Probe: `http://localhost:8080/api/health`

### 5. Azure Service Bus Setup & Running Workers

When using Azure Service Bus (`USE_IN_MEMORY_BUS=false`):

#### A. Provision / Verify Topics & Subscriptions
Run the automated script to ensure topic `order-events` and the 5 filtered subscriptions are created on Azure:
```powershell
python scripts/setup_azure_servicebus.py
```

#### B. Run All Workers in One Terminal (Recommended)
```powershell
python scripts/run_all_workers.py
```

#### C. Run Workers in Dedicated Individual Terminals
```powershell
# Terminal 1 - Inventory Worker (inventory-sub)
python -m src.workers.inventory_worker

# Terminal 2 - Payment Worker (payment-sub)
python -m src.workers.payment_worker

# Terminal 3 - Shipping Worker (shipping-sub)
python -m src.workers.shipping_worker

# Terminal 4 - Notification Worker (notification-sub)
python -m src.workers.notification_worker
```
*(Note: `status-sub` is handled in-process by the Order API server automatically via `src.api.status_listener`).*

---

## 4. Role-Based Authorization (RBAC)

The backend strictly enforces role-based authorization using FastAPI dependencies:

| Role | Permissions |
|---|---|
| `ADMIN` | Access `/api/admin/*` (stats, DLQ peek), modify inventory via `PATCH /api/inventory/:id`, create/update/delete products via `/api/products`, view all system orders |
| `CUSTOMER` | Place orders via `POST /api/orders`, retrieve personal orders and event timelines, cancel personal orders |

---

## 5. Running with Docker Compose

To run PostgreSQL, Order API, and all 4 background workers simultaneously:
```powershell
docker-compose up --build
```

---

## 6. Running Tests & Quality Checks

```powershell
# Format and linting
ruff check .
mypy src tests scripts

# Run full pytest test suite (unit + acceptance integration tests AT-01 to AT-10)
pytest -v

# Run end-to-end diagnostic verification script
python scripts/test_services.py
```
