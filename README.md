# ⚡ Loosely Coupled Order Processing Platform

An enterprise-grade, event-driven, loosely coupled order processing and fulfillment system built with **FastAPI (Python 3.12+)**, **PostgreSQL (SQLAlchemy AsyncIO / Alembic)**, **Azure Service Bus**, and a modern, high-performance **React (JavaScript + Tailwind CSS + Vite)** frontend.

---

## 📑 Table of Contents
- [1. System Architecture](#1-system-architecture)
  - [Architecture Diagram](#architecture-diagram)
  - [Topic & Subscription Routing](#topic--subscription-routing)
  - [Distributed Saga Lifecycle](#distributed-saga-lifecycle)
- [2. Project Structure](#2-project-structure)
- [3. Prerequisites](#3-prerequisites)
- [4. Environment Configuration](#4-environment-configuration)
- [5. Quickstart & Installation](#5-quickstart--installation)
  - [Backend Setup (using uv)](#backend-setup-using-uv)
  - [Database Creation & Alembic Migrations](#database-creation--alembic-migrations)
  - [Database Seeding](#database-seeding)
  - [Frontend Setup (using pnpm)](#frontend-setup-using-pnpm)
- [6. Running the Applications](#6-running-the-applications)
  - [Running Locally](#running-locally)
  - [Running with Docker Compose](#running-with-docker-compose)
  - [Running Background Workers Individually](#running-background-workers-individually)
- [7. REST API Specification](#7-rest-api-specification)
- [8. Frontend User Experience & Features](#8-frontend-user-experience--features)
- [9. Testing & Quality Checks](#9-testing--quality-checks)
- [10. Troubleshooting & Common Issues](#10-troubleshooting--common-issues)
- [11. Demo Credentials](#11-demo-credentials)

---

## 1. System Architecture

The platform operates on an **asynchronous, publish-subscribe messaging architecture** over Azure Service Bus (with seamless local fallback via an in-memory bus). Individual micro-services never communicate directly; they strictly publish and consume events via the `order-events` topic.

### Architecture Diagram

```
                             [ Browser / React Client ]
                                         │
                                         ▼ (HTTP / REST + JWT)
                              ┌──────────────────────┐
                              │   Order API Server   │
                              │    (FastAPI: 8080)   │
                              └──────────┬───────────┘
                                         │
                         (Publishes EVT-01 OrderCreated)
                                         ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                      Azure Service Bus: Topic "order-events"                          │
 └──────┬────────────────────┬────────────────────┬─────────────────────┬─────────────────┘
        │                    │                    │                     │
  (inventory-sub)      (payment-sub)        (shipping-sub)        (notification-sub)
        │                    │                    │                     │
        ▼                    ▼                    ▼                     ▼
 ┌─────────────┐      ┌─────────────┐      ┌─────────────┐       ┌─────────────┐
 │  Inventory  │      │   Payment   │      │  Shipping   │       │Notification │
 │   Worker    │      │   Worker    │      │   Worker    │       │   Worker    │
 └──────┬──────┘      └──────┬──────┘      └──────┬──────┘       └─────────────┘
        │                    │                    │
 (StockReserved)      (PaymentCompleted)  (ShipmentCreated)
        └────────────────────┴────────────────────┴─────────────────────┐
                                                                        ▼
                                                             ┌─────────────────────┐
                                                             │   StatusListener    │
                                                             │ (Inside API Process)│
                                                             │    (status-sub)     │
                                                             └─────────────────────┘
```

### Topic & Subscription Routing

**Topic Name**: `order-events`

| Subscription | SQL Filter Expression | Consumer Service | Purpose |
|---|---|---|---|
| `inventory-sub` | `eventType IN ('OrderCreated','OrderCancelled','PaymentFailed')` | **Inventory Worker** | Verifies and reserves stock; handles compensation rollbacks |
| `payment-sub` | `eventType = 'StockReserved'` | **Payment Worker** | Processes mock payment authorization & gateway response |
| `shipping-sub` | `eventType = 'PaymentCompleted'` | **Shipping Worker** | Generates carrier tracking number and marks dispatch |
| `notification-sub` | `eventType IN ('OrderCreated','StockReservationFailed','PaymentCompleted','PaymentFailed','ShipmentCreated','OrderCancelled')` | **Notification Worker** | Dispatches customer email updates via SendGrid or logs |
| `status-sub` | `eventType IN ('StockReserved','StockReservationFailed','PaymentCompleted','PaymentFailed','ShipmentCreated')` | **Status Listener** | Enforces forward-only status updates in Order API |

### Distributed Saga Lifecycle

```
[Customer Checkout]
        │
        ▼ (POST /api/orders -> 202 Accepted)
    [PENDING]  ───(EVT-01: OrderCreated)───► [Inventory Worker]
        │                                             │
        │◄──────(EVT-02: StockReserved)───────────────┘
        ▼
 [STOCK_RESERVED] ──(EVT-02)──► [Payment Worker]
        │                              │
        │◄──(EVT-04: PaymentCompleted)─┘
        ▼
     [PAID] ────────(EVT-04)──► [Shipping Worker]
        │                              │
        │◄──(EVT-06: ShipmentCreated)──┘
        ▼
   [SHIPPED] (Terminal State - Tracking # Assigned)
```

#### Compensation & Failure Handling:
- **Out of Stock**: Inventory Worker emits `StockReservationFailed` (EVT-03) ➔ Status Listener marks order `FAILED` (`INSUFFICIENT_STOCK`).
- **Payment Gateway Failure (`TEST_FAIL`)**: Payment Worker emits `PaymentFailed` (EVT-05) ➔ Status Listener marks order `FAILED` (`PAYMENT_FAILED`) ➔ Inventory Worker consumes `PaymentFailed` and automatically **reverses reserved stock back to available inventory**.
- **Customer Cancellation**: Customer cancels order while in `PENDING` or `STOCK_RESERVED` ➔ API emits `OrderCancelled` (EVT-07) ➔ Inventory Worker automatically releases the held stock reservation.

---

## 2. Project Structure

```
Order-Processing/
├── backend/                              # Python Backend Microservices & API
│   ├── alembic/                          # Alembic schema migrations
│   │   ├── versions/                     # Versioned migration scripts
│   │   └── env.py                        # Alembic migration runtime (URL escaped)
│   ├── scripts/                          # Database utilities & Seed scripts
│   │   ├── create_db.py                  # Automated PostgreSQL DB creator
│   │   └── seed.py                       # Seeds Admin, Customer, and 21 sample products
│   ├── src/
│   │   ├── api/                          # FastAPI app, routers, and Status Listener
│   │   │   ├── routes/                   # auth, products, inventory, orders, admin, health
│   │   │   ├── app.py                    # App factory, middleware, CORS, lifespan
│   │   │   └── server.py                 # Uvicorn entry point (port 8080)
│   │   ├── common/                       # Shared models, auth, JWT, idempotency, events
│   │   ├── config/                       # Settings, asyncpg DB pool, Service Bus / In-Memory bus
│   │   └── workers/                      # Inventory, Payment, Shipping, Notification workers
│   ├── tests/                            # Unit tests and AT-01 to AT-10 acceptance tests
│   ├── .env                              # Backend configuration (DB, JWT, CORS)
│   ├── alembic.ini                       # Alembic configuration
│   ├── docker-compose.yml                # Multi-service container orchestrator
│   ├── Dockerfile                        # Backend image builder
│   └── pyproject.toml                    # Python dependencies & tools
│
├── frontend/                             # React.js SPA (JavaScript JSX + Tailwind CSS)
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js                 # Native fetch wrapper with JWT interceptor
│   │   ├── context/
│   │   │   ├── AuthContext.jsx           # JWT Auth, demo quick-login, persistence
│   │   │   └── CartContext.jsx           # Cart operations, totals, delivery calculation
│   │   ├── components/
│   │   │   ├── Navbar.jsx                # Header, search, 1-click demo switcher, cart button
│   │   │   ├── ProductCard.jsx           # Stock badge, dynamic pricing, add-to-cart
│   │   │   ├── ProductModal.jsx          # Full specifications, available vs reserved stock
│   │   │   ├── CartDrawer.jsx            # Slide-out drawer, address form, payment options
│   │   │   ├── OrderTracker.jsx          # Live saga stepper & Service Bus events inspector
│   │   │   ├── MyOrders.jsx              # Customer order history with status filters
│   │   │   ├── AdminDashboard.jsx        # Admin KPIs, revenue metrics, status distribution
│   │   │   ├── InventoryTable.jsx        # Admin real-time stock balances & restock controls
│   │   │   ├── ProductManager.jsx        # Product CRUD manager
│   │   │   ├── SystemHealth.jsx          # Live subsystem probes & DLQ message inspector
│   │   │   └── Toast.jsx                 # Animated toast notifications
│   │   ├── data/
│   │   │   └── fallbackData.js           # Offline fallback hardware catalog
│   │   ├── App.jsx                       # Main application shell & router
│   │   └── index.css                     # Tailwind CSS design system
│   ├── index.html                        # Application entry HTML
│   ├── package.json                      # Frontend dependencies & scripts
│   └── vite.config.js                    # Vite setup with Tailwind CSS plugin & proxy
│
├── .gitignore                            # Git exclusion rules
└── README.md                             # Global project documentation
```

---

## 3. Prerequisites

Ensure the following tools are installed on your machine:
- **Python 3.12+** (Recommended: [uv](https://docs.astral.sh/uv/) for 10-50x faster package management)
- **Node.js 18+** & **pnpm** (or npm)
- **PostgreSQL 15+** (Running locally on port 5432 or via Docker)
- **Docker & Docker Compose** (Optional, for containerized execution)

---

## 4. Environment Configuration

Copy the example configuration to `.env` in the `backend/` folder and configure your local credentials:

```bash
cp backend/.env.example backend/.env
```

Example configuration template (`backend/.env`):


> **Tip for Special Characters in Database Passwords**: If your database password contains characters like `@`, `#`, or `:`, URL-encode them in the database URL (for example, `@` becomes `%40`). Alembic's `env.py` automatically escapes `%` so migration runs without syntax conflicts.

---

## 5. Quickstart & Installation

### Backend Setup (using uv)

```powershell
# 1. Navigate to backend directory
cd backend

# 2. Create the Python virtual environment
uv venv .venv

# 3. Activate the virtual environment
# On Windows (PowerShell):
.venv\Scripts\activate
# On Linux / macOS:
source .venv/bin/activate

# 4. Install backend dependencies in editable mode
uv pip install -e ".[dev]"
```

### Database Creation & Alembic Migrations

If the database `Order_Processing` has not yet been created in your PostgreSQL server:

```powershell
# Automatically create the "Order_Processing" database
python scripts/create_db.py

# Apply all Alembic schema migrations
alembic upgrade head
```

### Database Seeding

Populate the database with default accounts (Customer + Admin) and 21 sample hardware products:

```powershell
python scripts/seed.py
```

### Frontend Setup (using pnpm)

Open a second terminal window:

```powershell
# 1. Navigate to frontend directory
cd frontend

# 2. Install frontend dependencies
pnpm install
```

---

## 6. Running the Applications

### Running Locally

#### 1. Start the Backend API Server
```powershell
cd backend
.venv\Scripts\activate
python -m src.api.server
```
- **Backend URL**: `http://localhost:8080`
- **Interactive Swagger Docs**: `http://localhost:8080/docs`
- **ReDoc Documentation**: `http://localhost:8080/redoc`

#### 2. Start the Frontend React App
```powershell
cd frontend
pnpm run dev
```
- **Web Application URL**: `http://localhost:5173`

---

### Running with Docker Compose

To spin up the entire distributed system (PostgreSQL 16, Order API Server, and all 4 background workers simultaneously) in Docker containers:

```powershell
cd backend
docker-compose up --build
```

To run only the PostgreSQL container in the background:
```powershell
cd backend
docker-compose up -d postgres
```

---

### Running Background Workers Individually

When running against a live Azure Service Bus namespace (`USE_IN_MEMORY_BUS=false`), launch workers in dedicated terminal windows:

```powershell
# Inventory Worker (inventory-sub)
python -m src.workers.inventory_worker

# Payment Worker (payment-sub)
python -m src.workers.payment_worker

# Shipping Worker (shipping-sub)
python -m src.workers.shipping_worker

# Notification Worker (notification-sub)
python -m src.workers.notification_worker
```

*(Note: When `USE_IN_MEMORY_BUS=true`, background workers and the status listener execute asynchronously in-process, requiring zero external cloud infrastructure.)*

---

## 7. REST API Specification

**Base URL**: `/api`  
**Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

| Endpoint | Method | Access | Description |
|---|---|---|---|
| `/api/auth/register` | `POST` | Public | Register new customer account |
| `/api/auth/login` | `POST` | Public | Authenticate user, returns JWT and user profile |
| `/api/auth/me` | `GET` | User | Retrieve current authenticated user profile |
| `/api/products` | `GET` | Public | List products (with `search`, `category`, `page`, `limit`) |
| `/api/products/:id` | `GET` | Public | Product detail with available & reserved stock |
| `/api/products` | `POST` | Admin | Create product and initial inventory row |
| `/api/products/:id` | `PUT` | Admin | Update product details |
| `/api/products/:id` | `DELETE` | Admin | Soft delete product (`is_active = false`) |
| `/api/inventory` | `GET` | Admin | List inventory balances for all products |
| `/api/inventory/:productId` | `PATCH` | Admin | Update product available stock |
| `/api/orders` | `POST` | Customer | Place order, calculates total, publishes `OrderCreated` (Returns **`202 Accepted`**) |
| `/api/orders` | `GET` | User | List my orders (Admin retrieves all orders) |
| `/api/orders/:id` | `GET` | User | Order detail with items, payment, and shipment |
| `/api/orders/:id/events` | `GET` | User | Full Service Bus event timeline for the order |
| `/api/orders/:id/cancel` | `POST` | Customer | Cancel order in `PENDING` or `STOCK_RESERVED` status |
| `/api/admin/stats` | `GET` | Admin | Dashboard metrics: orders today, shipped revenue, low stock |
| `/api/admin/dead-letters` | `GET` | Admin | Peek DLQ messages across all 5 subscriptions |
| `/api/health` | `GET` | Public | Health status of API, database, and Service Bus |

---

## 8. Frontend User Experience & Features

Built with clean, non-AI-generated human design patterns:

1. **Hardware Storefront**:
   - High-resolution product imagery with fallback placeholders.
   - Real-time stock status pills (`In Stock`, `Only X left!`, `Out of Stock`).
   - Debounced search bar, category filter pills, and price sorting.
2. **Product Specification Modal**:
   - Stock balance breakdown showing both **Available units** and **Held/Reserved units**.
   - Quantity selector bounded by inventory limits.
3. **Cart & Slide-over Checkout Drawer**:
   - Live delivery threshold calculator (*"Add ₹X more for FREE shipping"*).
   - Validated Indian shipping address form (6-digit pincode, 10-digit mobile) with **1-Click Auto-Fill Demo** button.
   - Payment method simulator (`UPI`, `CARD`, `COD`) plus **`TEST_FAIL`** (triggers payment failure saga to test inventory rollback).
4. **Live Order Tracker (Saga Inspector)**:
   - Visual status stepper: `PENDING` ➔ `STOCK_RESERVED` ➔ `PAID` ➔ `SHIPPED`.
   - Real-time auto-polling toggle with radar animation.
   - Dispatched carrier tracking badge (`DemoExpress` tracking number).
   - Order cancellation button (active only during `PENDING` and `STOCK_RESERVED`).
   - **Service Bus Event Timeline**: Expandable inspector displaying the raw event envelopes published to the `order-events` topic.
5. **Admin Operations Control Center**:
   - **Overview**: Today's orders count, total settled revenue (₹), stuck pending orders alert (>5 min), and low-stock SKUs.
   - **Inventory Balances**: Table of all SKUs with quick `+1`, `-1`, `-5`, and `+10 Restock` controls calling `PATCH /api/inventory/:productId`.
   - **Product Manager**: Create, edit, and deactivate catalog items.
   - **System Health & DLQ**: Real-time diagnostic cards for API, Database, and Service Bus, plus a Dead-Letter Queue viewer across all 5 subscriptions.
6. **1-Click Demo Switcher**:
   - Persistent top bar buttons to switch instantaneously between **Customer (Asha K)** and **Admin (System Admin)**.

---

## 9. Testing & Quality Checks

### Run Backend Automated Tests
The repository includes comprehensive unit and integration tests covering Acceptance Scenarios AT-01 to AT-10:

```powershell
cd backend
.venv\Scripts\activate

# Run pytest test suite
pytest -v
```

### Run Code Linters & Type Checks
```powershell
cd backend
ruff check .
mypy src tests scripts
```

### Run Frontend Production Build
```powershell
cd frontend
pnpm run build
```

---

## 10. Troubleshooting & Common Issues

### Issue 1: `FATAL: database "Order_Processing" does not exist`
- **Cause**: PostgreSQL is running, but the database itself has not been created yet.
- **Solution**: Run `python scripts/create_db.py` from inside the `backend` folder.

### Issue 2: `ValueError: invalid interpolation syntax in ... at position ...`
- **Cause**: Password contains special characters like `@` (URL encoded as `%40`) which confuses Alembic's `configparser`.
- **Solution**: Already resolved in `backend/alembic/env.py` by escaping `%` to `%%` and passing the engine directly.

### Issue 3: Port Already in Use (`EADDRINUSE: 8080` or `5173`)
- **Backend**: Update `PORT=8081` in `backend/.env` and update the proxy in `frontend/vite.config.js`.
- **Frontend**: Vite automatically selects the next available port (e.g., `5174`).

---

## 11. Demo Credentials

The database seed script sets up two pre-configured accounts:

| Role | Email | Password | Access Level |
|---|---|---|---|
| **Customer** | `asha@example.com` | `Passw0rd!` | Place orders, track events, view order history, cancel orders |
| **Admin** | `admin@example.com` | `Admin123!` | View all orders, modify stock, manage products, view DLQ & metrics |

*(Both accounts can be logged into instantly using the **Quick Demo Credentials** buttons in the frontend navigation bar or login modal).*
