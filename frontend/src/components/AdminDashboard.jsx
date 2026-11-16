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
} from 'lucide-react';

export default function AdminDashboard() {
  const { addToast } = useToast();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getStats();
      setStats(res);
    } catch (err) {
      addToast(err.message || 'Failed to fetch admin stats', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const byStatus = stats?.byStatus || {
    PENDING: 0,
    STOCK_RESERVED: 0,
    PAID: 0,
    SHIPPED: 0,
    FAILED: 0,
    CANCELLED: 0,
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
          onClick={fetchStats}
          className="self-start sm:self-auto px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer"
        >
          <RefreshCw size={14} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <TrendingUp size={14} />
          <span>Overview & KPIs</span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Boxes size={14} />
          <span>Inventory Balances</span>
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'products'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShoppingBag size={14} />
          <span>Product Catalog</span>
        </button>

        <button
          onClick={() => setActiveTab('health')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'health'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Activity size={14} />
          <span>System Health & DLQ</span>
        </button>
      </div>

      {/* Overview Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 4 Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Orders Today */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Orders Today</span>
                <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Package size={16} />
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">
                {stats?.ordersToday ?? 0}
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Since midnight UTC</span>
            </div>

            {/* Shipped Revenue */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Shipped Revenue</span>
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <TrendingUp size={16} />
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-emerald-600">
                ₹{Number(stats?.revenueShipped ?? 0).toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Settled & delivered orders</span>
            </div>

            {/* Stuck Pending (Rule R9) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Stuck Pending Orders</span>
                <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Clock size={16} />
                </span>
              </div>
              <div
                className={`mt-2 text-2xl font-black ${
                  (stats?.stuckPending ?? 0) > 0 ? 'text-amber-600' : 'text-slate-900'
                }`}
              >
                {stats?.stuckPending ?? 0}
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Rule R9: Pending &gt; 5 mins</span>
            </div>

            {/* Low Stock Alerts */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Low Stock SKUs</span>
                <span className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <AlertTriangle size={16} />
                </span>
              </div>
              <div
                className={`mt-2 text-2xl font-black ${
                  (stats?.lowStock?.length ?? 0) > 0 ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {stats?.lowStock?.length ?? 0}
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Units available &lt; 10</span>
            </div>
          </div>

          {/* Orders Status Distribution */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Orders Status Distribution</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200/80">
                <span className="text-amber-800 font-semibold block text-[11px]">PENDING</span>
                <span className="text-xl font-black text-amber-950 mt-1 block">
                  {byStatus.PENDING}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200/80">
                <span className="text-indigo-800 font-semibold block text-[11px]">
                  STOCK_RESERVED
                </span>
                <span className="text-xl font-black text-indigo-950 mt-1 block">
                  {byStatus.STOCK_RESERVED}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200/80">
                <span className="text-sky-800 font-semibold block text-[11px]">PAID</span>
                <span className="text-xl font-black text-sky-950 mt-1 block">{byStatus.PAID}</span>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200/80">
                <span className="text-emerald-800 font-semibold block text-[11px]">SHIPPED</span>
                <span className="text-xl font-black text-emerald-950 mt-1 block">
                  {byStatus.SHIPPED}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200/80">
                <span className="text-rose-800 font-semibold block text-[11px]">FAILED</span>
                <span className="text-xl font-black text-rose-950 mt-1 block">
                  {byStatus.FAILED}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200/80">
                <span className="text-slate-700 font-semibold block text-[11px]">CANCELLED</span>
                <span className="text-xl font-black text-slate-900 mt-1 block">
                  {byStatus.CANCELLED}
                </span>
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
                  onClick={() => setActiveTab('inventory')}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Manage in Inventory Table →
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
