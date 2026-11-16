import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useToast } from './Toast';
import {
  Package,
  CheckCircle2,
  Clock,
  CreditCard,
  Truck,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Layers,
  ChevronDown,
  ChevronUp,
  MapPin,
  ExternalLink,
  Ban,
} from 'lucide-react';

const SAGA_STEPS = [
  { id: 'PENDING', label: 'Order Created', event: 'EVT-01 OrderCreated', icon: Clock },
  { id: 'STOCK_RESERVED', label: 'Stock Reserved', event: 'EVT-02 StockReserved', icon: Package },
  { id: 'PAID', label: 'Payment Completed', event: 'EVT-04 PaymentCompleted', icon: CreditCard },
  { id: 'SHIPPED', label: 'Shipped & Dispatched', event: 'EVT-06 ShipmentCreated', icon: Truck },
];

export default function OrderTracker({ orderId, onBack }) {
  const { addToast } = useToast();
  const [order, setOrder] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [pollingActive, setPollingActive] = useState(true);
  const [expandedEventId, setExpandedEventId] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const pollIntervalRef = useRef(null);

  const fetchOrderData = async (silent = false) => {
    if (!orderId) return;
    if (!silent) setLoading(true);

    try {
      const [orderRes, eventsRes] = await Promise.all([
        api.orders.get(orderId).catch(() => null),
        api.orders.getEvents(orderId).catch(() => []),
      ]);

      if (orderRes) {
        setOrder(orderRes);
      }
      if (eventsRes) {
        setEvents(Array.isArray(eventsRes) ? eventsRes : eventsRes.events || []);
      }
      setLastRefreshed(new Date());
    } catch (err) {
      if (!silent) {
        addToast(err.message || 'Could not fetch order details', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderData();

    if (pollingActive) {
      pollIntervalRef.current = setInterval(() => {
        fetchOrderData(true);
      }, 2500);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [orderId, pollingActive]);

  // Determine active step index
  const getStepIndex = (status) => {
    switch (status) {
      case 'PENDING':
        return 0;
      case 'STOCK_RESERVED':
        return 1;
      case 'PAID':
        return 2;
      case 'SHIPPED':
        return 3;
      case 'FAILED':
      case 'CANCELLED':
        return -1;
      default:
        return 0;
    }
  };

  const handleCancelOrder = async () => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    setCancelling(true);
    try {
      await api.orders.cancel(orderId, 'Cancelled by customer');
      addToast('Order cancellation initiated! Inventory held has been released.', 'success');
      fetchOrderData();
    } catch (err) {
      addToast(err.message || 'Failed to cancel order', 'error');
    } finally {
      setCancelling(false);
    }
  };

  if (loading && !order) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
        <div className="inline-block w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-slate-600">Connecting to Event Bus and loading order...</p>
      </div>
    );
  }

  const currentStepIdx = getStepIndex(order?.status);
  const isTerminal = order?.status === 'SHIPPED' || order?.status === 'FAILED' || order?.status === 'CANCELLED';
  const canCancel = order?.status === 'PENDING' || order?.status === 'STOCK_RESERVED';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 animate-fade-in">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1 mb-1 cursor-pointer"
          >
            ← Back to Orders
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Order #{order?.orderNumber || orderId}
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                order?.status === 'SHIPPED'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : order?.status === 'PAID'
                  ? 'bg-sky-100 text-sky-800 border border-sky-200'
                  : order?.status === 'STOCK_RESERVED'
                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                  : order?.status === 'FAILED'
                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                  : order?.status === 'CANCELLED'
                  ? 'bg-slate-100 text-slate-700 border border-slate-200'
                  : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}
            >
              {order?.status || 'PROCESSING'}
            </span>
          </div>
        </div>

        {/* Polling & Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPollingActive(!pollingActive)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition cursor-pointer ${
              pollingActive
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                pollingActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'
              }`}
            ></span>
            <span>Live Polling: {pollingActive ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => fetchOrderData(false)}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-slate-50 transition cursor-pointer"
            title="Refresh now"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Saga Visual Stepper Card */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Asynchronous Saga Lifecycle</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Strictly forward-only transitions coordinated via Azure Service Bus topic
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Last updated: {lastRefreshed.toLocaleTimeString()}
          </span>
        </div>

        {/* Stepper Progress */}
        {order?.status === 'FAILED' ? (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
            <XCircle className="text-rose-600 shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="text-sm font-bold text-rose-900">Order Processing Failed</h3>
              <p className="text-xs text-rose-700 mt-1">
                Reason:{' '}
                <span className="font-mono font-bold text-rose-950">
                  {order?.failureReason || 'PAYMENT_FAILED'}
                </span>
              </p>
              <p className="text-xs text-rose-600 mt-1">
                Compensation Saga Executed: Inventory worker consumed PaymentFailed (EVT-05) and
                automatically restored reserved quantities.
              </p>
            </div>
          </div>
        ) : order?.status === 'CANCELLED' ? (
          <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 flex items-start gap-3">
            <Ban className="text-slate-600 shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Order Was Cancelled</h3>
              <p className="text-xs text-slate-600 mt-1">
                Order was cancelled before fulfillment. Any reserved inventory has been released.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {SAGA_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isPassed = currentStepIdx >= idx;
              const isCurrent = currentStepIdx === idx;

              return (
                <div
                  key={step.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    isCurrent
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500'
                      : isPassed
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : 'border-slate-100 bg-slate-50/60 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        isPassed
                          ? 'bg-emerald-600 text-white'
                          : isCurrent
                          ? 'bg-indigo-600 text-white animate-pulse'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {isPassed && !isCurrent ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      Step {idx + 1}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 leading-tight">{step.label}</h4>
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">{step.event}</p>

                  {isCurrent && (
                    <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping"></span>
                      <span>Active State</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Shipment Details if SHIPPED */}
        {order?.shipment && (
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                <Truck size={20} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                  Carrier: {order.shipment.carrier || 'DemoExpress'}
                </span>
                <span className="text-xs font-mono font-bold text-emerald-950">
                  Tracking #: {order.shipment.trackingNumber}
                </span>
              </div>
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-white px-3 py-1.5 rounded-xl border border-emerald-200">
              Dispatched & En Route
            </span>
          </div>
        )}

        {/* Cancellation CTA if eligible */}
        {canCancel && (
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Need to cancel? Allowed while order is in PENDING or STOCK_RESERVED.
            </span>
            <button
              onClick={handleCancelOrder}
              disabled={cancelling}
              className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 transition cursor-pointer disabled:opacity-50"
            >
              {cancelling ? 'Cancelling...' : 'Cancel Order'}
            </button>
          </div>
        )}
      </div>

      {/* Order Details & Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Items List */}
        <div className="md:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            Purchased Items
          </h3>
          <div className="divide-y divide-slate-100">
            {order?.items?.map((item, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <h4 className="font-bold text-slate-900">{item.productName || item.productId}</h4>
                  <p className="text-slate-400 text-[11px] font-mono">
                    Qty: {item.quantity} × ₹{Number(item.unitPrice).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-slate-900">
                    ₹{(Number(item.unitPrice) * item.quantity).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-sm font-bold text-slate-900">
            <span>Total Amount</span>
            <span className="text-base text-indigo-600">
              ₹{Number(order?.totalAmount || 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Delivery & Payment Info */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 text-xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Delivery Address
            </span>
            <p className="font-bold text-slate-800">{order?.shippingAddress?.name}</p>
            <p className="text-slate-600 mt-0.5">{order?.shippingAddress?.line1}</p>
            <p className="text-slate-600">
              {order?.shippingAddress?.city}, {order?.shippingAddress?.state} -{' '}
              {order?.shippingAddress?.pincode}
            </p>
            <p className="text-slate-500 font-mono mt-1">Phone: {order?.shippingAddress?.phone}</p>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Payment Method
            </span>
            <p className="font-bold text-slate-800 flex items-center gap-1.5">
              <CreditCard size={14} className="text-indigo-600" />
              <span>{order?.paymentMethod}</span>
            </p>
            {order?.payment?.transactionRef && (
              <p className="text-[10px] font-mono text-slate-400 mt-1">
                Ref: {order.payment.transactionRef}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Event Bus Inspector Accordion */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold">Service Bus Event Timeline</h3>
              <p className="text-xs text-slate-400">
                Audited events published to `order-events` topic for this correlation ID
              </p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-mono">
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </span>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500">
            No events recorded yet. Waiting for workers to publish messages.
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((evt, idx) => {
              const isExpanded = expandedEventId === (evt.id || idx);
              return (
                <div
                  key={evt.id || idx}
                  className="rounded-xl bg-slate-800/80 border border-slate-700/60 overflow-hidden text-xs"
                >
                  <div
                    onClick={() => setExpandedEventId(isExpanded ? null : evt.id || idx)}
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-800 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 font-bold border border-indigo-800/60">
                        {evt.event_type || evt.eventType}
                      </span>
                      <span className="text-slate-400 text-[11px] font-mono hidden sm:inline">
                        {evt.created_at ? new Date(evt.created_at).toLocaleString() : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-400">
                      <span className="text-[10px] font-mono">View Payload</span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 bg-slate-950 border-t border-slate-700/60 font-mono text-[11px] text-emerald-400 overflow-x-auto">
                      <pre>{JSON.stringify(evt.payload || evt, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
