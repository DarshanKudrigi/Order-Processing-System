import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useToast } from './Toast';
import InventoryTable from './InventoryTable';
import ProductManager from './ProductManager';
import SystemHealth from './SystemHealth';
import {
  TrendingUp,
  Package,
  AlertTriangle,
  Clock,
  Layers,
  Boxes,
  Activity,
  ShoppingBag,
  RefreshCw,
  Sparkles,
  ArrowRight,
  X,
  Search,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Plus,
  Ban,
  ArrowUpRight,
} from 'lucide-react';

export default function AdminDashboard({ onSelectOrder }) {
  const { addToast } = useToast();
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Drilldown Inspector State
  // Possible values: 'orders-today' | 'revenue-shipped' | 'stuck-pending' | 'low-stock' | 'status-<STATUS>' | null
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [drilldownSearch, setDrilldownSearch] = useState('');
  const [restockingId, setRestockingId] = useState(null);
  const [customRestockQty, setCustomRestockQty] = useState({});

  const fetchAllData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statsRes, ordersRes, invRes] = await Promise.all([
        api.admin.getStats().catch(() => null),
        api.orders.list({ limit: 100 }).catch(() => null),
        api.inventory.list().catch(() => []),
      ]);

      if (statsRes) setStats(statsRes);
      if (ordersRes) {
        const orderList =
          ordersRes?.data || ordersRes?.orders || (Array.isArray(ordersRes) ? ordersRes : []);
        setOrders(orderList);
      }
      if (invRes) {
        setInventory(Array.isArray(invRes) ? invRes : invRes.items || []);
      }
    } catch (err) {
      if (!silent) {
        addToast(err.message || 'Failed to fetch admin data', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData(false);

    // Auto-poll metrics every 5 seconds so live worker activity reflects in the dashboard
    const interval = setInterval(() => {
      fetchAllData(true);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const byStatus = stats?.byStatus || {
    PENDING: 0,
    STOCK_RESERVED: 0,
    PAID: 0,
    SHIPPED: 0,
    FAILED: 0,
    CANCELLED: 0,
  };

  // Calculations for drill-downs
  const nowUtc = new Date();
  const todayUtcStart = new Date(
    Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate())
  ).getTime();

  // 1. Orders Today (placed since midnight UTC)
  const todayOrders = orders.filter((o) => {
    if (!o.createdAt) return true;
    return new Date(o.createdAt).getTime() >= todayUtcStart;
  });

  // 2. Shipped Revenue orders
  const shippedOrders = orders.filter((o) => o.status === 'SHIPPED');
  const totalShippedRevenue = shippedOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const avgOrderValue =
    shippedOrders.length > 0 ? Math.round(totalShippedRevenue / shippedOrders.length) : 0;

  // 3. Stuck Pending orders (Rule R9: PENDING for more than 5 minutes)
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const stuckOrders = orders.filter((o) => {
    if (o.status !== 'PENDING') return false;
    if (!o.createdAt) return true;
    return new Date(o.createdAt).getTime() < fiveMinAgo;
  });

  // 4. Low stock inventory (< 10 units available)
  const lowStockItems = inventory.filter((item) => {
    const qty = item.quantityAvailable ?? item.quantity_available ?? 0;
    return qty < 10;
  });

  // 5. Orders by status if a status pill was clicked
  const activeStatusFilter = selectedMetric?.startsWith('status-')
    ? selectedMetric.replace('status-', '')
    : null;
  const statusFilteredOrders = activeStatusFilter
    ? orders.filter((o) => o.status === activeStatusFilter)
    : [];

  // Toggle or select metric
  const handleSelectMetric = (metricKey) => {
    if (selectedMetric === metricKey) {
      setSelectedMetric(null);
    } else {
      setSelectedMetric(metricKey);
      setDrilldownSearch('');
    }
  };

  // Quick Restock handler
  const handleQuickRestock = async (productId, currentAvailable, addQty) => {
    const newQty = (currentAvailable || 0) + Number(addQty);
    setRestockingId(productId);
    try {
      await api.inventory.update(productId, newQty);
      addToast(`Restocked product! New available stock: ${newQty}`, 'success');
      // Update local inventory array immediately
      setInventory((prev) =>
        prev.map((item) => {
          const id = item.productId || item.product_id;
          if (id === productId) {
            return { ...item, quantityAvailable: newQty, quantity_available: newQty };
          }
          return item;
        })
      );
      // Re-fetch stats and inventory in background
      await fetchAllData(true);
    } catch (err) {
      addToast(err.message || 'Failed to update stock', 'error');
    } finally {
      setRestockingId(null);
    }
  };

  // Stuck order cancellation handler
  const handleCancelStuckOrder = async (orderId, orderNumber) => {
    if (
      !window.confirm(
        `Cancel stuck order ${orderNumber || orderId}? This will emit OrderCancelled (EVT-07) and abort processing.`
      )
    ) {
      return;
    }
    try {
      await api.orders.cancel(orderId, 'Cancelled by admin (stuck pending > 5m)');
      addToast(`Order ${orderNumber || orderId} cancelled`, 'success');
      await fetchAllData(true);
    } catch (err) {
      addToast(err.message || 'Failed to cancel order', 'error');
    }
  };

  // Helper to format duration
  const getElapsedDuration = (isoString) => {
    if (!isoString) return 'Just now';
    const elapsedMs = Math.max(0, Date.now() - new Date(isoString).getTime());
    const mins = Math.floor(elapsedMs / 60000);
    const secs = Math.floor((elapsedMs % 60000) / 1000);
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      return `${hours}h ${mins % 60}m ago`;
    }
    return `${mins}m ${secs}s ago`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-100 text-purple-800">
              Admin Operations Center
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Order Processing Control Plane
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Monitor real-time event pipeline throughput, stock reservations, and subscriber health
          </p>
        </div>

        <button
          onClick={() => fetchAllData(false)}
          className="self-start sm:self-auto px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-600' : ''} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <TrendingUp size={14} />
          <span>Admin Operations</span>
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'products'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShoppingBag size={14} />
          <span>Product Catalog</span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Boxes size={14} />
          <span>Inventory Balances</span>
        </button>

        <button
          onClick={() => setActiveTab('health')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'health'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Activity size={14} />
          <span>System Health & DLQ</span>
        </button>
      </div>

      {/* OVERVIEW TAB CONTENT */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Helper notice */}
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>Click any KPI card below to inspect and manage its matching items</span>
            {selectedMetric && (
              <button
                onClick={() => setSelectedMetric(null)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
              >
                Close Inspector (Esc)
              </button>
            )}
          </div>

          {/* 4 Primary Interactive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Orders Today */}
            <div
              onClick={() => handleSelectMetric('orders-today')}
              className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                selectedMetric === 'orders-today'
                  ? 'bg-indigo-50/40 border-indigo-500 shadow-md ring-2 ring-indigo-500/30'
                  : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Orders Today</span>
                <span
                  className={`p-2 rounded-xl ${
                    selectedMetric === 'orders-today'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-50 text-indigo-600'
                  }`}
                >
                  <Package size={16} />
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">
                {stats?.ordersToday ?? todayOrders.length}
              </div>
              <span className="text-[10px] text-slate-400 font-medium block">Since midnight UTC</span>

              <div
                className={`mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold ${
                  selectedMetric === 'orders-today' ? 'text-indigo-600 font-bold' : 'text-slate-500'
                }`}
              >
                <span>{selectedMetric === 'orders-today' ? 'Viewing Orders ↓' : 'Inspect Orders'}</span>
                <ArrowRight
                  size={12}
                  className={selectedMetric === 'orders-today' ? 'rotate-90 transition-transform' : ''}
                />
              </div>
            </div>

            {/* 2. Shipped Revenue */}
            <div
              onClick={() => handleSelectMetric('revenue-shipped')}
              className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                selectedMetric === 'revenue-shipped'
                  ? 'bg-emerald-50/40 border-emerald-500 shadow-md ring-2 ring-emerald-500/30'
                  : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Shipped Revenue</span>
                <span
                  className={`p-2 rounded-xl ${
                    selectedMetric === 'revenue-shipped'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-600'
                  }`}
                >
                  <TrendingUp size={16} />
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-emerald-600">
                ₹{Number(stats?.revenueShipped ?? totalShippedRevenue).toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-slate-400 font-medium block">
                Settled & delivered orders ({shippedOrders.length})
              </span>

              <div
                className={`mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold ${
                  selectedMetric === 'revenue-shipped' ? 'text-emerald-700 font-bold' : 'text-slate-500'
                }`}
              >
                <span>
                  {selectedMetric === 'revenue-shipped' ? 'Viewing Revenue ↓' : 'Inspect Revenue'}
                </span>
                <ArrowRight
                  size={12}
                  className={
                    selectedMetric === 'revenue-shipped' ? 'rotate-90 transition-transform' : ''
                  }
                />
              </div>
            </div>

            {/* 3. Stuck Pending (Rule R9) */}
            <div
              onClick={() => handleSelectMetric('stuck-pending')}
              className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                selectedMetric === 'stuck-pending'
                  ? 'bg-amber-50/40 border-amber-500 shadow-md ring-2 ring-amber-500/30'
                  : 'bg-white border-slate-200 hover:border-amber-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Stuck Pending Orders</span>
                <span
                  className={`p-2 rounded-xl ${
                    selectedMetric === 'stuck-pending'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  <Clock size={16} />
                </span>
              </div>
              <div
                className={`mt-2 text-2xl font-black ${
                  (stats?.stuckPending ?? stuckOrders.length) > 0
                    ? 'text-amber-600'
                    : 'text-slate-900'
                }`}
              >
                {stats?.stuckPending ?? stuckOrders.length}
              </div>
              <span className="text-[10px] text-slate-400 font-medium block">
                Rule R9: Pending &gt; 5 mins
              </span>

              <div
                className={`mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold ${
                  selectedMetric === 'stuck-pending' ? 'text-amber-700 font-bold' : 'text-slate-500'
                }`}
              >
                <span>
                  {selectedMetric === 'stuck-pending' ? 'Viewing Stuck Orders ↓' : 'Inspect Stuck'}
                </span>
                <ArrowRight
                  size={12}
                  className={selectedMetric === 'stuck-pending' ? 'rotate-90 transition-transform' : ''}
                />
              </div>
            </div>

            {/* 4. Low Stock SKUs */}
            <div
              onClick={() => handleSelectMetric('low-stock')}
              className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                selectedMetric === 'low-stock'
                  ? 'bg-rose-50/40 border-rose-500 shadow-md ring-2 ring-rose-500/30'
                  : 'bg-white border-slate-200 hover:border-rose-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Low Stock SKUs</span>
                <span
                  className={`p-2 rounded-xl ${
                    selectedMetric === 'low-stock'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  <AlertTriangle size={16} />
                </span>
              </div>
              <div
                className={`mt-2 text-2xl font-black ${
                  (stats?.lowStock?.length ?? lowStockItems.length) > 0
                    ? 'text-rose-600'
                    : 'text-slate-900'
                }`}
              >
                {stats?.lowStock?.length ?? lowStockItems.length}
              </div>
              <span className="text-[10px] text-slate-400 font-medium block">
                Units available &lt; 10
              </span>

              <div
                className={`mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold ${
                  selectedMetric === 'low-stock' ? 'text-rose-700 font-bold' : 'text-slate-500'
                }`}
              >
                <span>{selectedMetric === 'low-stock' ? 'Viewing Low Stock ↓' : 'Manage SKUs'}</span>
                <ArrowRight
                  size={12}
                  className={selectedMetric === 'low-stock' ? 'rotate-90 transition-transform' : ''}
                />
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* DRILLDOWN INSPECTOR PANEL (When any KPI or Status card is clicked) */}
          {/* ========================================================================= */}
          {selectedMetric && (
            <div className="bg-white rounded-3xl border border-slate-300 shadow-lg p-6 space-y-5 animate-fade-in transition-all">
              {/* Drilldown Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                      selectedMetric === 'orders-today'
                        ? 'bg-indigo-100 text-indigo-700'
                        : selectedMetric === 'revenue-shipped'
                        ? 'bg-emerald-100 text-emerald-700'
                        : selectedMetric === 'stuck-pending'
                        ? 'bg-amber-100 text-amber-700'
                        : selectedMetric === 'low-stock'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {selectedMetric === 'orders-today' && <Package size={20} />}
                    {selectedMetric === 'revenue-shipped' && <TrendingUp size={20} />}
                    {selectedMetric === 'stuck-pending' && <Clock size={20} />}
                    {selectedMetric === 'low-stock' && <AlertTriangle size={20} />}
                    {activeStatusFilter && <Layers size={20} />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">
                        {selectedMetric === 'orders-today' && 'Orders Placed Today'}
                        {selectedMetric === 'revenue-shipped' && 'Delivered & Settled Revenue Orders'}
                        {selectedMetric === 'stuck-pending' &&
                          'Stuck Pending Orders (Rule R9 Threshold > 5 mins)'}
                        {selectedMetric === 'low-stock' && 'Low Stock Inventory Alert (< 10 Units Available)'}
                        {activeStatusFilter && `Orders in ${activeStatusFilter} Status`}
                      </h2>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                        {selectedMetric === 'orders-today' && `${todayOrders.length} orders`}
                        {selectedMetric === 'revenue-shipped' && `${shippedOrders.length} orders`}
                        {selectedMetric === 'stuck-pending' && `${stuckOrders.length} stuck`}
                        {selectedMetric === 'low-stock' &&
                          `${stats?.lowStock?.length ?? lowStockItems.length} SKUs`}
                        {activeStatusFilter && `${statusFilteredOrders.length} orders`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedMetric === 'orders-today' &&
                        'All customer transactions recorded since midnight UTC across all accounts.'}
                      {selectedMetric === 'revenue-shipped' &&
                        'Successfully fulfilled orders that have reached terminal SHIPPED status.'}
                      {selectedMetric === 'stuck-pending' &&
                        'Orders created over 5 minutes ago that did not receive inventory reservation acknowledgment.'}
                      {selectedMetric === 'low-stock' &&
                        'Products below the critical safety threshold of 10 units. Use 1-click restock to replenish.'}
                      {activeStatusFilter &&
                        `Viewing all current system orders with status ${activeStatusFilter}.`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Search inside drilldown */}
                  <div className="relative w-full sm:w-64">
                    <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={drilldownSearch}
                      onChange={(e) => setDrilldownSearch(e.target.value)}
                      placeholder="Filter items..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <button
                    onClick={() => setSelectedMetric(null)}
                    className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition cursor-pointer shrink-0"
                    title="Close Inspector"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* VIEW 1: ORDERS TODAY */}
              {/* ------------------------------------------------------------- */}
              {selectedMetric === 'orders-today' && (
                <div className="space-y-3">
                  {todayOrders.filter((o) =>
                    (o.orderNumber || o.id || '')
                      .toLowerCase()
                      .includes(drilldownSearch.toLowerCase())
                  ).length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No orders found matching your search.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                            <th className="py-2.5 px-3">Order Number</th>
                            <th className="py-2.5 px-3">Placed At</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Items</th>
                            <th className="py-2.5 px-3">Amount</th>
                            <th className="py-2.5 px-3">Payment</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {todayOrders
                            .filter((o) =>
                              (o.orderNumber || o.id || '')
                                .toLowerCase()
                                .includes(drilldownSearch.toLowerCase())
                            )
                            .map((ord) => (
                              <tr key={ord.id} className="hover:bg-slate-50/70 transition">
                                <td className="py-3 px-3 font-mono font-bold text-slate-900">
                                  {ord.orderNumber || ord.id}
                                </td>
                                <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                                  {getElapsedDuration(ord.createdAt)}
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                      ord.status === 'SHIPPED'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : ord.status === 'FAILED'
                                        ? 'bg-rose-100 text-rose-800'
                                        : ord.status === 'PAID'
                                        ? 'bg-sky-100 text-sky-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {ord.status}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-slate-600">
                                  {ord.itemCount ?? 1} {ord.itemCount === 1 ? 'item' : 'items'}
                                </td>
                                <td className="py-3 px-3 font-bold text-slate-900">
                                  ₹{Number(ord.totalAmount).toLocaleString('en-IN')}
                                </td>
                                <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                                  {ord.paymentMethod || 'UPI'}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  {onSelectOrder && (
                                    <button
                                      onClick={() => onSelectOrder(ord.id)}
                                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs transition cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <span>Track Saga</span>
                                      <ArrowRight size={12} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* VIEW 2: SHIPPED REVENUE ORDERS */}
              {/* ------------------------------------------------------------- */}
              {selectedMetric === 'revenue-shipped' && (
                <div className="space-y-4">
                  {/* Revenue Summary Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/60 text-xs">
                    <div>
                      <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block">
                        Total Settled Revenue
                      </span>
                      <span className="text-xl font-black text-emerald-950 mt-0.5 block">
                        ₹{totalShippedRevenue.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block">
                        Delivered Orders Count
                      </span>
                      <span className="text-xl font-black text-emerald-950 mt-0.5 block">
                        {shippedOrders.length} orders
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block">
                        Average Order Value (AOV)
                      </span>
                      <span className="text-xl font-black text-emerald-950 mt-0.5 block">
                        ₹{avgOrderValue.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  {/* Shipped Orders Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                          <th className="py-2.5 px-3">Order Number</th>
                          <th className="py-2.5 px-3">Fulfillment Time</th>
                          <th className="py-2.5 px-3">Total Amount</th>
                          <th className="py-2.5 px-3">Payment Method</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {shippedOrders
                          .filter((o) =>
                            (o.orderNumber || o.id || '')
                              .toLowerCase()
                              .includes(drilldownSearch.toLowerCase())
                          )
                          .map((ord) => (
                            <tr key={ord.id} className="hover:bg-slate-50/70 transition">
                              <td className="py-3 px-3 font-mono font-bold text-slate-900">
                                {ord.orderNumber || ord.id}
                              </td>
                              <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                                {getElapsedDuration(ord.createdAt)}
                              </td>
                              <td className="py-3 px-3 font-bold text-emerald-700">
                                ₹{Number(ord.totalAmount).toLocaleString('en-IN')}
                              </td>
                              <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                                {ord.paymentMethod || 'UPI'}
                              </td>
                              <td className="py-3 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800">
                                  SHIPPED
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right">
                                {onSelectOrder && (
                                  <button
                                    onClick={() => onSelectOrder(ord.id)}
                                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-lg text-xs transition cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <span>Track Saga</span>
                                    <ArrowRight size={12} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* VIEW 3: STUCK PENDING ORDERS (RULE R9) */}
              {/* ------------------------------------------------------------- */}
              {selectedMetric === 'stuck-pending' && (
                <div className="space-y-4">
                  {/* Warning Notification */}
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 flex items-start gap-3 text-xs">
                    <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="font-bold text-amber-900">
                        Rule R9 Enforcement Threshold: Pending Duration &gt; 5 Minutes
                      </h4>
                      <p className="text-amber-700 leading-relaxed">
                        These orders were placed over 5 minutes ago and remain in PENDING status.
                        This occurs if the inventory reservation worker was delayed or the Service Bus message was orphaned.
                        You can inspect the saga event timeline or cancel the order to initiate saga rollback.
                      </p>
                    </div>
                  </div>

                  {stuckOrders.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl text-xs text-slate-500">
                      <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-2" />
                      <span className="font-bold text-slate-800 block">No stuck orders detected!</span>
                      <span>All pending orders are progressing within the 5-minute threshold.</span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                            <th className="py-2.5 px-3">Order Number</th>
                            <th className="py-2.5 px-3">Pending Duration</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Amount</th>
                            <th className="py-2.5 px-3">Payment</th>
                            <th className="py-2.5 px-3 text-right">Emergency Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stuckOrders
                            .filter((o) =>
                              (o.orderNumber || o.id || '')
                                .toLowerCase()
                                .includes(drilldownSearch.toLowerCase())
                            )
                            .map((ord) => (
                              <tr key={ord.id} className="hover:bg-amber-50/30 transition">
                                <td className="py-3 px-3 font-mono font-bold text-slate-900">
                                  {ord.orderNumber || ord.id}
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                                    <Clock size={12} />
                                    <span>{getElapsedDuration(ord.createdAt)}</span>
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800">
                                    PENDING
                                  </span>
                                </td>
                                <td className="py-3 px-3 font-bold text-slate-900">
                                  ₹{Number(ord.totalAmount).toLocaleString('en-IN')}
                                </td>
                                <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                                  {ord.paymentMethod || 'UPI'}
                                </td>
                                <td className="py-3 px-3 text-right space-x-2 whitespace-nowrap">
                                  {onSelectOrder && (
                                    <button
                                      onClick={() => onSelectOrder(ord.id)}
                                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs transition cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <span>Inspect Saga</span>
                                      <ArrowRight size={12} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleCancelStuckOrder(ord.id, ord.orderNumber)}
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-xs transition cursor-pointer inline-flex items-center gap-1"
                                    title="Cancel order and trigger compensation"
                                  >
                                    <Ban size={12} />
                                    <span>Cancel</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* VIEW 4: LOW STOCK SKUS (WITH 1-CLICK RESTOCK) */}
              {/* ------------------------------------------------------------- */}
              {selectedMetric === 'low-stock' && (
                <div className="space-y-4">
                  {/* Warning banner */}
                  <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200/80 flex items-start gap-3 text-xs">
                    <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-rose-900">Critical Stock Warning Threshold (&lt; 10 Units)</h4>
                      <p className="text-rose-700 mt-0.5">
                        These SKUs have insufficient buffer stock. Use the quick 1-click restock buttons below to replenish inventory immediately without leaving the dashboard.
                      </p>
                    </div>
                  </div>

                  {lowStockItems.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl text-xs text-slate-500">
                      <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-2" />
                      <span className="font-bold text-slate-800 block">All SKUs healthy!</span>
                      <span>No products have available inventory below 10 units.</span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                            <th className="py-2.5 px-3">Product Name</th>
                            <th className="py-2.5 px-3">Product ID / SKU</th>
                            <th className="py-2.5 px-3">Available Stock</th>
                            <th className="py-2.5 px-3">Reserved</th>
                            <th className="py-2.5 px-3 text-right">Quick Restock Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {lowStockItems
                            .filter((item) => {
                              const name =
                                item.productName || item.product?.name || item.productId || '';
                              return name.toLowerCase().includes(drilldownSearch.toLowerCase());
                            })
                            .map((item) => {
                              const pId = item.productId || item.product_id;
                              const pName = item.productName || item.product?.name || pId;
                              const available =
                                item.quantityAvailable ?? item.quantity_available ?? 0;
                              const reserved =
                                item.quantityReserved ?? item.quantity_reserved ?? 0;
                              const isRestocking = restockingId === pId;

                              return (
                                <tr key={pId} className="hover:bg-rose-50/30 transition">
                                  <td className="py-3 px-3 font-bold text-slate-900">{pName}</td>
                                  <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                                    {pId}
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 font-extrabold font-mono text-xs">
                                      {available} units left
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 font-mono text-slate-500">
                                    {reserved} reserved
                                  </td>
                                  <td className="py-3 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        disabled={isRestocking}
                                        onClick={() => handleQuickRestock(pId, available, 10)}
                                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                                      >
                                        +10 Units
                                      </button>
                                      <button
                                        disabled={isRestocking}
                                        onClick={() => handleQuickRestock(pId, available, 25)}
                                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                                      >
                                        +25 Units
                                      </button>
                                      <button
                                        disabled={isRestocking}
                                        onClick={() => handleQuickRestock(pId, available, 50)}
                                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                                      >
                                        +50 Units
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* VIEW 5: ORDERS FILTERED BY STATUS (STATUS PILL CLICKED) */}
              {/* ------------------------------------------------------------- */}
              {activeStatusFilter && (
                <div className="space-y-3">
                  {statusFilteredOrders.filter((o) =>
                    (o.orderNumber || o.id || '')
                      .toLowerCase()
                      .includes(drilldownSearch.toLowerCase())
                  ).length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No orders found with status {activeStatusFilter}.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                            <th className="py-2.5 px-3">Order Number</th>
                            <th className="py-2.5 px-3">Placed At</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Amount</th>
                            <th className="py-2.5 px-3">Payment</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {statusFilteredOrders
                            .filter((o) =>
                              (o.orderNumber || o.id || '')
                                .toLowerCase()
                                .includes(drilldownSearch.toLowerCase())
                            )
                            .map((ord) => (
                              <tr key={ord.id} className="hover:bg-slate-50/70 transition">
                                <td className="py-3 px-3 font-mono font-bold text-slate-900">
                                  {ord.orderNumber || ord.id}
                                </td>
                                <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                                  {getElapsedDuration(ord.createdAt)}
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                      ord.status === 'SHIPPED'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : ord.status === 'FAILED'
                                        ? 'bg-rose-100 text-rose-800'
                                        : ord.status === 'PAID'
                                        ? 'bg-sky-100 text-sky-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {ord.status}
                                  </span>
                                </td>
                                <td className="py-3 px-3 font-bold text-slate-900">
                                  ₹{Number(ord.totalAmount).toLocaleString('en-IN')}
                                </td>
                                <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                                  {ord.paymentMethod || 'UPI'}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  {onSelectOrder && (
                                    <button
                                      onClick={() => onSelectOrder(ord.id)}
                                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs transition cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <span>Track Saga</span>
                                      <ArrowRight size={12} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Orders Status Distribution */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Orders Status Distribution</h3>
              <span className="text-[10px] text-slate-400 font-medium">
                Click any status box to filter orders
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div
                onClick={() => handleSelectMetric('status-PENDING')}
                className={`p-3 rounded-2xl border transition cursor-pointer ${
                  selectedMetric === 'status-PENDING'
                    ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400/40 shadow-xs'
                    : 'bg-amber-50 border-amber-200/80 hover:border-amber-300'
                }`}
              >
                <span className="text-amber-800 font-semibold block text-[11px]">PENDING</span>
                <span className="text-xl font-black text-amber-950 mt-1 block">
                  {byStatus.PENDING}
                </span>
                <span className="text-[10px] text-amber-700/80 mt-1 block">View items →</span>
              </div>

              <div
                onClick={() => handleSelectMetric('status-STOCK_RESERVED')}
                className={`p-3 rounded-2xl border transition cursor-pointer ${
                  selectedMetric === 'status-STOCK_RESERVED'
                    ? 'bg-indigo-100 border-indigo-400 ring-2 ring-indigo-400/40 shadow-xs'
                    : 'bg-indigo-50 border-indigo-200/80 hover:border-indigo-300'
                }`}
              >
                <span className="text-indigo-800 font-semibold block text-[11px]">
                  STOCK_RESERVED
                </span>
                <span className="text-xl font-black text-indigo-950 mt-1 block">
                  {byStatus.STOCK_RESERVED}
                </span>
                <span className="text-[10px] text-indigo-700/80 mt-1 block">View items →</span>
              </div>

              <div
                onClick={() => handleSelectMetric('status-PAID')}
                className={`p-3 rounded-2xl border transition cursor-pointer ${
                  selectedMetric === 'status-PAID'
                    ? 'bg-sky-100 border-sky-400 ring-2 ring-sky-400/40 shadow-xs'
                    : 'bg-sky-50 border-sky-200/80 hover:border-sky-300'
                }`}
              >
                <span className="text-sky-800 font-semibold block text-[11px]">PAID</span>
                <span className="text-xl font-black text-sky-950 mt-1 block">{byStatus.PAID}</span>
                <span className="text-[10px] text-sky-700/80 mt-1 block">View items →</span>
              </div>

              <div
                onClick={() => handleSelectMetric('status-SHIPPED')}
                className={`p-3 rounded-2xl border transition cursor-pointer ${
                  selectedMetric === 'status-SHIPPED'
                    ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-400/40 shadow-xs'
                    : 'bg-emerald-50 border-emerald-200/80 hover:border-emerald-300'
                }`}
              >
                <span className="text-emerald-800 font-semibold block text-[11px]">SHIPPED</span>
                <span className="text-xl font-black text-emerald-950 mt-1 block">
                  {byStatus.SHIPPED}
                </span>
                <span className="text-[10px] text-emerald-700/80 mt-1 block">View items →</span>
              </div>

              <div
                onClick={() => handleSelectMetric('status-FAILED')}
                className={`p-3 rounded-2xl border transition cursor-pointer ${
                  selectedMetric === 'status-FAILED'
                    ? 'bg-rose-100 border-rose-400 ring-2 ring-rose-400/40 shadow-xs'
                    : 'bg-rose-50 border-rose-200/80 hover:border-rose-300'
                }`}
              >
                <span className="text-rose-800 font-semibold block text-[11px]">FAILED</span>
                <span className="text-xl font-black text-rose-950 mt-1 block">
                  {byStatus.FAILED}
                </span>
                <span className="text-[10px] text-rose-700/80 mt-1 block">View items →</span>
              </div>

              <div
                onClick={() => handleSelectMetric('status-CANCELLED')}
                className={`p-3 rounded-2xl border transition cursor-pointer ${
                  selectedMetric === 'status-CANCELLED'
                    ? 'bg-slate-200 border-slate-400 ring-2 ring-slate-400/40 shadow-xs'
                    : 'bg-slate-100 border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <span className="text-slate-700 font-semibold block text-[11px]">CANCELLED</span>
                <span className="text-xl font-black text-slate-900 mt-1 block">
                  {byStatus.CANCELLED}
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">View items →</span>
              </div>
            </div>
          </div>

          {/* Low Stock Watchlist */}
          {stats?.lowStock && stats.lowStock.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-500" />
                  <h3 className="text-sm font-bold text-slate-900">Low Stock Priority Alerts</h3>
                </div>
                <button
                  onClick={() => handleSelectMetric('low-stock')}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  Manage in Drilldown Table →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {stats.lowStock.map((item) => (
                  <div
                    key={item.productId}
                    className="p-3 rounded-xl bg-amber-50/50 border border-amber-200/70 flex items-center justify-between text-xs"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900">{item.name || item.productId}</h4>
                      <p className="text-[10px] font-mono text-slate-400">{item.productId}</p>
                    </div>
                    <span className="px-2 py-1 rounded-lg bg-amber-200/80 text-amber-900 font-bold font-mono">
                      {item.available} left
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-tab Views */}
      {activeTab === 'inventory' && <InventoryTable />}
      {activeTab === 'products' && <ProductManager />}
      {activeTab === 'health' && <SystemHealth />}
    </div>
  );
}
