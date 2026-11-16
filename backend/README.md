# Backend: Loosely Coupled Order Processing System

A production-grade, loosely coupled, event-driven order processing backend built with **Python 3.12+**, **FastAPI**, **SQLAlchemy/Alembic (PostgreSQL)**, **Pydantic**, and **Azure Service Bus**.

---

## 1. Architecture Overview

Services communicate exclusively by publishing and consuming events from the `order-events` Azure Service Bus topic.

```
[Browser / Client]
       │
       ▼ (REST API)
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
1. **Order API**: Customer places order -> validated, saved as `PENDING`, publishes `OrderCreated` (EVT-01) -> returns `202 Accepted`.
2. **Inventory Worker**: Listens on `inventory-sub` -> checks and reserves stock in one database transaction -> publishes `StockReserved` (EVT-02).
3. **Payment Worker**: Listens on `payment-sub` -> simulates gateway payment -> creates `Payment` row -> publishes `PaymentCompleted` (EVT-04).
4. **Shipping Worker**: Listens on `shipping-sub` -> creates `Shipment` with tracking number via `DemoExpress`, releases reserved inventory -> publishes `ShipmentCreated` (EVT-06).
5. **Status Listener**: Inside Order API, listens on `status-sub` -> enforces forward-only status transitions (`PENDING` -> `STOCK_RESERVED` -> `PAID` -> `SHIPPED`) and records all timeline events in `order_events`.
6. **Notification Worker**: Listens on `notification-sub` -> generates branded notification and sends via SendGrid or logs with graceful fallback without ever blocking order progress.

### Compensation & Failure Flows
- **Out of stock**: Inventory Worker publishes `StockReservationFailed` (EVT-03) -> Status Listener sets order status to `FAILED` (`INSUFFICIENT_STOCK`).
- **Payment failure (`TEST_FAIL`)**: Payment Worker publishes `PaymentFailed` (EVT-05) -> Status Listener sets order to `FAILED` (`PAYMENT_FAILED`) -> Inventory Worker consumes `PaymentFailed` and reverses reserved stock back to available stock.
- **Order Cancellation**: Customer calls `/api/orders/:id/cancel` while in `PENDING` or `STOCK_RESERVED` -> API marks order `CANCELLED`, publishes `OrderCancelled` (EVT-07) -> Inventory Worker releases held reservation.

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
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

### 3. Database Creation & Migrations
```powershell
# Create database if it does not exist
python scripts/create_db.py

# Run Alembic migrations
alembic upgrade head

# Seed initial admin, customer, and 21 sample products
python scripts/seed.py
```

### 4. Running the Order API Server
```powershell
python -m src.api.server
```
The API is available at `http://localhost:8080`.  
Interactive Swagger docs: `http://localhost:8080/docs`.

### 5. Running Background Workers Individually
When `USE_IN_MEMORY_BUS=false`:
```powershell
python -m src.workers.inventory_worker
python -m src.workers.payment_worker
python -m src.workers.shipping_worker
python -m src.workers.notification_worker
```

---

## 4. Running with Docker Compose

To run PostgreSQL, Order API, and all 4 background workers simultaneously:
```powershell
docker-compose up --build
```

---

## 5. Running Tests and Quality Checks

```powershell
# Format and linting
ruff check .
mypy src tests scripts

# Run full test suite (unit + acceptance integration tests AT-01 to AT-10)
pytest -v
```
