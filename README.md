# ⚡ Loosely Coupled Order Processing Platform

An enterprise-grade, event-driven, loosely coupled order processing and fulfillment system built with **FastAPI (Python 3.12+)**, **PostgreSQL (SQLAlchemy AsyncIO / Alembic)**, **Azure Service Bus**, and a modern, high-performance **React (JavaScript JSX + Tailwind CSS + Vite)** frontend.

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
- [7. Authentication & Role-Based Access Control (RBAC)](#7-authentication--role-based-access-control-rbac)
  - [Login Page as Initial View](#login-page-as-initial-view)
  - [Pre-Registered Accounts](#pre-registered-accounts)
  - [Role-Based Redirection & Dashboards](#role-based-redirection--dashboards)
  - [Admin Experience Rules](#admin-experience-rules)
- [8. REST API Specification](#8-rest-api-specification)
- [9. Frontend Features & User Experience](#9-frontend-features--user-experience)
- [10. Testing & Quality Checks](#10-testing--quality-checks)
- [11. Troubleshooting & Common Issues](#11-troubleshooting--common-issues)

---

## 1. System Architecture

The platform operates on an **asynchronous, publish-subscribe messaging architecture** over Azure Service Bus (with seamless local fallback via an in-process in-memory bus). Microservices never communicate through direct synchronous RPC; they strictly publish and consume events via the `order-events` topic.

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
│   │   ├── seed.py                       # Seeds Admin, Customer, and 21 sample products
│   │   └── test_services.py              # Diagnostic integration test suite
│   ├── src/
│   │   ├── api/                          # FastAPI app, routers, and Status Listener
│   │   │   ├── routes/                   # auth, products, inventory, orders, admin, health
│   │   │   ├── app.py                    # App factory, middleware, CORS, lifespan
│   │   │   └── server.py                 # Uvicorn entry point (port 8080)
│   │   ├── common/                       # Shared models, auth, JWT, idempotency, events
│   │   ├── config/                       # Settings, asyncpg DB pool, Service Bus / In-Memory bus
│   │   └── workers/                      # Inventory, Payment, Shipping, Notification workers
│   ├── tests/                            # Unit tests and AT-01 to AT-10 acceptance tests
│   ├── .env.example                      # Template environment variables (no secrets)
│   ├── alembic.ini                       # Alembic configuration
│   ├── docker-compose.yml                # Multi-service container orchestrator
│   ├── Dockerfile                        # Backend image builder
│   └── pyproject.toml                    # Python dependencies & tools
│
├── frontend/                             # React.js SPA (JavaScript JSX + Tailwind CSS)
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js                 # Universal fetch wrapper with JWT interceptor
│   │   ├── context/
│   │   │   ├── AuthContext.jsx           # JWT Auth, demo quick-login, persistence
│   │   │   └── CartContext.jsx           # Cart operations, totals, delivery calculation
│   │   ├── components/
│   │   │   ├── LoginPage.jsx             # Dedicated Login page with 1-click test accounts
│   │   │   ├── RegisterPage.jsx          # Dedicated Registration page with role selector
│   │   │   ├── Navbar.jsx                # Clean header with role-based navigation links
│   │   │   ├── ProductCard.jsx           # Stock badge, dynamic pricing, role-aware actions
│   │   │   ├── ProductModal.jsx          # Full specifications, available vs reserved stock
│   │   │   ├── CartDrawer.jsx            # Customer-only slide-out drawer & checkout
│   │   │   ├── OrderTracker.jsx          # Live saga stepper & Service Bus events inspector
│   │   │   ├── MyOrders.jsx              # Customer order history with live polling
│   │   │   ├── AdminDashboard.jsx        # Admin Operations & Product Catalog control plane
│   │   │   ├── InventoryTable.jsx        # Admin stock balances & restock controls
│   │   │   ├── ProductManager.jsx        # Admin Product CRUD manager
│   │   │   ├── SystemHealth.jsx          # Live subsystem probes & DLQ message inspector
│   │   │   └── Toast.jsx                 # Animated toast notifications
│   │   ├── data/
│   │   │   └── fallbackData.js           # Offline fallback hardware catalog
│   │   ├── App.jsx                       # Main application shell, route guards & router
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
- **Python 3.12+** (Recommended: [uv](https://docs.astral.sh/uv/) for fast package management)
- **Node.js 18+** & **pnpm** (or npm)
- **PostgreSQL 15+** (Running locally on port 5432 or via Docker)
- **Docker & Docker Compose** (Optional, for containerized execution)

---

## 4. Environment Configuration

Copy the example configuration file to `.env` in the `backend/` folder:

```bash
cp backend/.env.example backend/.env
```

### Safe Configuration Template (`backend/.env`):

```env
ENVIRONMENT=development
PORT=8080

# Database Settings (Replace placeholders with your local PostgreSQL credentials)
DATABASE_URL=postgresql+asyncpg://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:5432/<DB_NAME>
SYNC_DATABASE_URL=postgresql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:5432/<DB_NAME>

# Security
JWT_SECRET=<YOUR_RANDOM_SECRET_KEY_MINIMUM_32_CHARACTERS>
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:5173

# Messaging (Local in-process bus by default; set to false for cloud Service Bus)
USE_IN_MEMORY_BUS=true
SERVICEBUS_CONNECTION_STRING=
SB_TOPIC_NAME=order-events
SB_MAX_CONCURRENT_CALLS=5

# Notifications (Optional)
SENDGRID_API_KEY=
MAIL_FROM=orders@example.com
```

> **Tip for Special Characters in Passwords**: If your database password contains characters like `@`, `#`, or `:`, URL-encode them in the database URL (for example, `@` becomes `%40`). Alembic's `backend/alembic/env.py` is pre-configured to escape `%` to `%%` so migrations run without syntax conflicts.

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

```powershell
# Automatically create the PostgreSQL database
python scripts/create_db.py

# Apply all Alembic schema migrations
alembic upgrade head
```

### Database Seeding

Populate the database with default accounts (Admin and Customer) and 21 sample hardware products:

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
- **Backend API**: `http://localhost:8080`
- **Interactive Swagger Docs**: `http://localhost:8080/docs`
- **Health Probe**: `http://localhost:8080/api/health`

#### 2. Start the Frontend React App
```powershell
cd frontend
pnpm run dev
```
- **Web Application URL**: `http://localhost:5173`

---

### Running with Docker Compose

To spin up the entire distributed system (PostgreSQL 16, Order API Server, and all background workers) in Docker:

```powershell
cd backend
docker-compose up --build
```

To run only the PostgreSQL container:
```powershell
cd backend
docker-compose up -d postgres
```

---

### Running Background Workers Individually

When running against a live Azure Service Bus namespace (`USE_IN_MEMORY_BUS=false`), launch workers in dedicated terminals:

```powershell
python -m src.workers.inventory_worker
python -m src.workers.payment_worker
python -m src.workers.shipping_worker
python -m src.workers.notification_worker
```

*(Note: When `USE_IN_MEMORY_BUS=true`, background workers execute asynchronously in-process alongside the API server, requiring zero external cloud setup).*

---

## 7. Authentication & Role-Based Access Control (RBAC)

The application implements strict role-based access control across both the frontend and backend.

### Login Page as Initial View
- **Default Entry Point**: When opening the application or when unauthenticated, the **Login Page** appears first. Unauthenticated users are barred from viewing dashboards or catalog operations until they sign in.
- **Dedicated Pages**: Full standalone **Login** (`LoginPage.jsx`) and **Registration** (`RegisterPage.jsx`) views replace modal popups.

### Pre-Registered Accounts
The Login page provides 1-click quick sign-in cards for the pre-seeded accounts:

| Role | Email | Password | Access Level |
|---|---|---|---|
| **Admin** | `admin@example.com` | `Admin123!` | Product Catalog management, Admin Operations, KPIs, Inventory Balances, DLQ |
| **Demo User** | `demo@example.com` | `Demo123!` | Storefront browsing, Cart, Checkout, Live Saga Tracking, My Orders |

*(Alternative customer account `asha@example.com` / `Passw0rd!` is also available).*

### Role-Based Redirection & Dashboards
- **Admin Login**: Automatically redirects directly to the **Admin Dashboard** (`activeView = 'admin'`).
- **Customer / Demo User Login**: Automatically redirects to the **Storefront Catalog** (`activeView = 'store'`).
- **Sign Out**: Clears session tokens from `localStorage` and returns the user to the **Login Page** (`'login'`).

### Admin Experience Rules
- **Admin Dashboard Contents**:
  1. **Product Catalog**: Full product manager allowing Admins to search, add new products, edit price/category/stock, and deactivate items.
  2. **Admin Operations**: Real-time KPI control center (Orders Today, Shipped Revenue, Stuck Pending with Rule R9 alert, Low Stock SKUs with 1-click Quick Restock, Inventory Balances, System Health & DLQ).
- **Interactive KPI Item Drill-down**: Clicking any KPI card opens a dedicated inspector table with search, order tracking, and emergency actions.
- **`MyOrders` Completely Removed**: The Admin dashboard, desktop navbar, mobile navbar, and user dropdown menu completely exclude `MyOrders`.
- **`Cart` Completely Removed from Admin**: The Cart icon, drawer, and Add-to-Cart purchase buttons are completely removed when logged in as Admin; Admins view product specifications in inspect mode.
- **Route Guards**:
  - Non-admins attempting to access `'admin'` are blocked and redirected with an authorization warning.
  - Admins attempting to access `'orders'` are redirected to `'admin'`.

---

## 8. REST API Specification

**Base URL**: `/api`  
**Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

| Endpoint | Method | Access | Description |
|---|---|---|---|
| `/api/auth/register` | `POST` | Public | Register new customer or admin account |
| `/api/auth/login` | `POST` | Public | Authenticate user, returns JWT and user profile |
| `/api/auth/me` | `GET` | User | Retrieve current authenticated user profile |
| `/api/products` | `GET` | Public | List products (with `search`, `category`, `page`, `limit`) |
| `/api/products/:id` | `GET` | Public | Product detail with available & reserved stock |
| `/api/products` | `POST` | Admin | Create product and initial inventory record |
| `/api/products/:id` | `PUT` | Admin | Update product details |
| `/api/products/:id` | `DELETE` | Admin | Deactivate product (`is_active = false`) |
| `/api/inventory` | `GET` | Admin | List inventory balances for all products |
| `/api/inventory/:productId` | `PATCH` | Admin | Update product available stock |
| `/api/orders` | `POST` | Customer | Place order, calculates total, publishes `OrderCreated` (Returns **`202 Accepted`**) |
| `/api/orders` | `GET` | User | List orders (Admin retrieves all system orders; Customer retrieves own) |
| `/api/orders/:id` | `GET` | User | Order detail with items, payment, and shipment |
| `/api/orders/:id/events` | `GET` | User | Full Service Bus event timeline for the order |
| `/api/orders/:id/cancel` | `POST` | User | Cancel order in `PENDING` or `STOCK_RESERVED` status |
| `/api/admin/stats` | `GET` | Admin | Dashboard metrics: orders today, shipped revenue, low stock |
| `/api/admin/dead-letters` | `GET` | Admin | Peek DLQ messages across all 5 subscriptions |
| `/api/health` | `GET` | Public | Health status of API, database, and Service Bus |

---

## 9. Frontend Features & User Experience

Built with clean, accessible React 19 JSX and Tailwind CSS:

1. **Gatekeeper Authentication Experience**:
   - Initial application view defaults to the **Login Page**.
   - 1-click test account sign-in for Admin and Demo User.
   - Dedicated Registration page with client-side form validation.
2. **Customer Storefront**:
   - High-resolution hardware catalog with responsive grid.
   - Real-time stock status badges (`In Stock`, `Only X left!`, `Out of Stock`).
   - Debounced search, category filter pills, and price sorting.
3. **Cart & Slide-Over Checkout**:
   - Live delivery threshold calculator (*"Add ₹X more for FREE shipping"*).
   - Validated shipping address form with 1-click demo auto-fill.
   - Payment method simulator (`UPI`, `CARD`, `COD`) plus **`TEST_FAIL`** (triggers payment failure saga to verify inventory rollback).
4. **Live Order Tracker (Saga Inspector)**:
   - Visual status stepper: `PENDING` ➔ `STOCK_RESERVED` ➔ `PAID` ➔ `SHIPPED`.
   - Real-time auto-polling toggle with radar pulse animation.
   - Dispatched carrier tracking badge (`DemoExpress` tracking number).
   - Expandable Service Bus Event Timeline displaying the raw event envelopes.
5. **My Orders History (Customer Only)**:
   - Complete order history with dynamic count badges for each status tab (`All Orders`, `In Progress`, `Dispatched`, `Failed / Cancelled`).
   - Auto-polling every 4 seconds and `window.focus` listener for instant status progression updates.
6. **Admin Operations Control Center**:
   - **Interactive KPI Cards**: Orders Today, Shipped Revenue, Stuck Pending, Low Stock SKUs. Clicking any card opens a real-time item drilldown table.
   - **Quick Restock**: 1-click stock replenishment buttons (`+10`, `+25`, `+50`) on low-stock items.
   - **Product Manager**: Create, update, and deactivate catalog hardware.
   - **Inventory Balances**: Full table of SKUs showing available vs reserved stock.
   - **System Health & DLQ**: Real-time diagnostic probes and Dead-Letter Queue inspector.

---

## 10. Testing & Quality Checks

### Run Backend Automated Tests
The repository includes comprehensive unit and integration tests covering Acceptance Scenarios AT-01 to AT-10:

```powershell
cd backend
.venv\Scripts\activate

# Run full pytest test suite
pytest -v
```

### Run Diagnostic Verification Script
To verify all 10 end-to-end integration flows (health, auth, order creation, saga progression to `SHIPPED`, event timeline, My Orders retrieval, compensation rollback with `TEST_FAIL`, admin stats):

```powershell
cd backend
python scripts/test_services.py
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

## 11. Troubleshooting & Common Issues

### Issue 1: `FATAL: database "Order_Processing" does not exist`
- **Cause**: PostgreSQL server is running, but the target database catalog has not been created yet.
- **Solution**: Run `python scripts/create_db.py` from the `backend/` directory to create it automatically.

### Issue 2: `ValueError: invalid interpolation syntax in ... at position ...`
- **Cause**: Password contains special characters like `@` (URL encoded as `%40`) which confuses Alembic's `configparser`.
- **Solution**: Already resolved in `backend/alembic/env.py` by escaping `%` to `%%` and passing the engine directly.

### Issue 3: Port Collision (`EADDRINUSE: 8080` or `5173`)
- **Backend**: Terminate the lingering process using `Stop-Process -Id <PID> -Force` on Windows or set a different `PORT` in `backend/.env`.
- **Frontend**: Vite automatically falls back to the next available port (e.g. `5174`).
