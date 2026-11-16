# Order Processing System

A production-grade, loosely coupled, event-driven order processing system featuring a **Python (FastAPI + SQLAlchemy + Azure Service Bus)** backend and a **React (JavaScript + Tailwind CSS + Vite)** frontend.

---

## Project Structure

```
Order-Processing/
├── backend/                  # FastAPI & Azure Service Bus Backend
│   ├── .venv/                # Python virtual environment (managed with uv)
│   ├── .env                  # Backend environment configuration
│   ├── src/                  # API routes, models, config, and background workers
│   ├── alembic/              # Database migration scripts
│   ├── scripts/              # Seed data and database utilities
│   └── tests/                # Automated pytest suite (AT-01 to AT-10)
│
└── frontend/                 # React.js + Tailwind CSS Frontend
    ├── src/
    │   ├── api/client.js     # Universal REST API client with JWT interceptor
    │   ├── context/          # Auth and Cart state providers
    │   ├── components/       # Storefront, Tracker, Cart Drawer, Admin Ops
    │   └── data/             # High-fidelity fallback catalog
    ├── vite.config.js        # Vite config with backend proxy and Tailwind CSS
    └── package.json
```

---

## Getting Started

### 1. Backend Setup & Run

The backend uses a virtual environment created with `uv`:

```bash
cd backend

# Activate the virtual environment
# On Windows:
.venv\Scripts\activate

# Run database migrations (once PostgreSQL is running)
alembic upgrade head

# Seed initial admin, customer, and sample products
python scripts/seed.py

# Start the Order API Server (port 8080)
python -m src.api.server
```

> **Interactive Swagger API Docs**: `http://localhost:8080/docs`

---

### 2. Frontend Setup & Run

The frontend is built using **pure React.js (JSX)** with **Tailwind CSS**:

```bash
cd frontend

# Install packages
pnpm install

# Start the Vite development server (port 5173)
pnpm run dev
```

> **Frontend Application URL**: `http://localhost:5173`

---

## Key Features

1. **Event-Driven Saga Stepper**:
   - Live visual status pipeline: `PENDING` ➔ `STOCK_RESERVED` ➔ `PAID` ➔ `SHIPPED`.
   - Real-time auto-polling toggle with live pulse indicator.
   - Expandable **Service Bus Event Timeline** displaying actual `order-events` envelopes (`OrderCreated`, `StockReserved`, `PaymentCompleted`, `ShipmentCreated`).

2. **Distributed Compensation Simulation**:
   - Checkout allows selecting **"Simulate Payment Failure (TEST_FAIL)"** to demonstrate automatic inventory reversal saga.
   - Cancellation is enabled during `PENDING` and `STOCK_RESERVED` stages.

3. **Admin Operations Control Center**:
   - KPIs: Today's Orders, Shipped Revenue, Stuck Pending Orders (>5 min), Low Stock SKUs.
   - Real-time Inventory Balances with quick +/- restock controls.
   - Product Catalog CRUD management.
   - System Diagnostics & Dead-Letter Queue (DLQ) inspector across all 5 subscriptions.

4. **1-Click Demo Accounts**:
   - **Customer**: `asha@example.com` / `Passw0rd!`
   - **Admin**: `admin@example.com` / `Admin123!`
