import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import {
  Package,
  Search,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';

export default function MyOrders({ onSelectOrder, onGoToStore }) {
  const { isAuthenticated, user } = useAuth();
  const { addToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const fetchOrders = async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.orders.list();
      setOrders(Array.isArray(res) ? res : res.orders || []);
    } catch (err) {
      addToast(err.message || 'Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [isAuthenticated]);

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      (o.orderNumber && o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (o.id && o.id.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterStatus === 'ACTIVE') {
      return ['PENDING', 'STOCK_RESERVED', 'PAID'].includes(o.status);
    }
    if (filterStatus === 'SHIPPED') {
      return o.status === 'SHIPPED';
    }
    if (filterStatus === 'FAILED') {
      return ['FAILED', 'CANCELLED'].includes(o.status);
    }
    return true;
  });

  const totalSpent = orders
    .filter((o) => o.status !== 'FAILED' && o.status !== 'CANCELLED')
    .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

  const activeCount = orders.filter((o) =>
    ['PENDING', 'STOCK_RESERVED', 'PAID'].includes(o.status)
  ).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Order History</h1>
          <p className="text-xs text-slate-500 mt-1">
            Track asynchronous lifecycle events, payments, and shipments in real-time
          </p>
        </div>

        <button
          onClick={fetchOrders}
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-400 block mb-1">Total Orders</span>
          <span className="text-2xl font-extrabold text-slate-900">{orders.length}</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-400 block mb-1">Active / In Progress</span>
          <span className="text-2xl font-extrabold text-indigo-600">{activeCount}</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-400 block mb-1">Total Fulfilled Spent</span>
          <span className="text-2xl font-extrabold text-emerald-600">
            ₹{totalSpent.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'ALL', label: 'All Orders' },
            { id: 'ACTIVE', label: 'In Progress' },
            { id: 'SHIPPED', label: 'Dispatched' },
            { id: 'FAILED', label: 'Failed / Cancelled' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                filterStatus === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search order #..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="text-center py-16 space-y-3">
          <div className="inline-block w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-semibold text-slate-500">Retrieving your orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
            <Package size={32} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">No orders found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              You haven't placed any orders matching this filter yet.
            </p>
          </div>
          <button
            onClick={onGoToStore}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ShoppingBag size={14} />
            <span>Explore Product Catalog</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((ord) => {
            const isShipped = ord.status === 'SHIPPED';
            const isFailed = ord.status === 'FAILED' || ord.status === 'CANCELLED';
            const isPending = !isShipped && !isFailed;

            return (
              <div
                key={ord.id}
                onClick={() => onSelectOrder(ord.id)}
                className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      isShipped
                        ? 'bg-emerald-100 text-emerald-700'
                        : isFailed
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    <Package size={22} />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        {ord.orderNumber || ord.id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                          isShipped
                            ? 'bg-emerald-100 text-emerald-800'
                            : isFailed
                            ? 'bg-rose-100 text-rose-800'
                            : ord.status === 'PAID'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                      <span>{ord.createdAt ? new Date(ord.createdAt).toLocaleDateString() : 'Recent'}</span>
                      <span>•</span>
                      <span>{ord.items?.length || 1} {(ord.items?.length || 1) === 1 ? 'item' : 'items'}</span>
                      <span>•</span>
                      <span className="font-mono">{ord.paymentMethod || 'UPI'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-5 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                  <div className="sm:text-right">
                    <span className="text-[10px] text-slate-400 block font-medium">Order Total</span>
                    <span className="text-base font-extrabold text-slate-900">
                      ₹{Number(ord.totalAmount).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                    <span>Track Saga</span>
                    <ArrowRight size={14} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
