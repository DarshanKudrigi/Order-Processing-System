import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useToast } from './Toast';
import {
  Activity,
  Database,
  Radio,
  Server,
  AlertOctagon,
  RefreshCw,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';

export default function SystemHealth() {
  const { addToast } = useToast();
  const [health, setHealth] = useState(null);
  const [deadLetters, setDeadLetters] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHealthAndDLQ = async () => {
    setLoading(true);
    try {
      const [healthRes, dlqRes] = await Promise.all([
        api.health.check().catch((err) => ({
          status: 'UNHEALTHY',
          database: false,
          serviceBus: false,
          error: err.message,
        })),
        api.admin.getDeadLetters().catch(() => []),
      ]);

      setHealth(healthRes);
      setDeadLetters(Array.isArray(dlqRes) ? dlqRes : dlqRes.messages || []);
    } catch (err) {
      addToast(err.message || 'Failed to inspect health and DLQ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthAndDLQ();
  }, []);

  const isDbHealthy = health?.database === true || health?.components?.database?.status === 'UP';
  const isBusHealthy =
    health?.serviceBus === true ||
    health?.useInMemoryBus === true ||
    health?.components?.serviceBus?.status === 'UP';
  const isApiHealthy = health?.status === 'HEALTHY' || health?.status === 'UP' || !!health;

  return (
    <div className="space-y-6">
      {/* Subsystem Health Status Cards */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Subsystem Diagnostics</h2>
          <p className="text-xs text-slate-500">Live health of API runtime, DB pool, and Event Bus</p>
        </div>

        <button
          onClick={fetchHealthAndDLQ}
          className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw size={13} />
          <span>Probe Health</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* FastApi Runtime */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-start justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
              <Server size={20} />
            </div>
            <h4 className="text-sm font-bold text-slate-900">Order API Server</h4>
            <p className="text-xs text-slate-500 mt-0.5">FastAPI & Uvicorn Runtime</p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
              isApiHealthy ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}
          >
            {isApiHealthy ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            <span>{isApiHealthy ? 'Online (8080)' : 'Unreachable'}</span>
          </span>
        </div>

        {/* PostgreSQL Database */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-start justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-3">
              <Database size={20} />
            </div>
            <h4 className="text-sm font-bold text-slate-900">PostgreSQL Database</h4>
            <p className="text-xs text-slate-500 mt-0.5">AsyncPG Connection Pool</p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
              isDbHealthy ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {isDbHealthy ? <CheckCircle2 size={12} /> : <AlertOctagon size={12} />}
            <span>{isDbHealthy ? 'Connected' : 'Offline / Starting'}</span>
          </span>
        </div>

        {/* Service Bus */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-start justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
              <Radio size={20} />
            </div>
            <h4 className="text-sm font-bold text-slate-900">Event Messaging Bus</h4>
            <p className="text-xs text-slate-500 mt-0.5">Azure Service Bus / In-Memory</p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
              isBusHealthy ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}
          >
            {isBusHealthy ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            <span>{isBusHealthy ? 'Active (Ready)' : 'Disconnected'}</span>
          </span>
        </div>
      </div>

      {/* Dead-Letter Queue (DLQ) Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertOctagon size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Dead-Letter Queue (DLQ) Inspector</h3>
              <p className="text-xs text-slate-500">
                Poison payloads or messages exceeding max 5 delivery attempts across all subscriptions
              </p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              deadLetters.length === 0
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-rose-100 text-rose-800'
            }`}
          >
            {deadLetters.length} DLQ Messages
          </span>
        </div>

        {deadLetters.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <CheckCircle2 size={32} className="text-emerald-500 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">All 5 Subscriptions are Clean</p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              No failed messages in inventory-sub, payment-sub, shipping-sub, notification-sub, or
              status-sub.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-3">Subscription</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Reason</th>
                  <th className="py-2.5 px-3">Retries</th>
                  <th className="py-2.5 px-3">Enqueued At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {deadLetters.map((dlq, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-indigo-700">{dlq.subscription}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{dlq.eventType}</td>
                    <td className="py-2.5 px-3 text-slate-600">{dlq.orderId}</td>
                    <td className="py-2.5 px-3 text-rose-600 max-w-[200px] truncate">
                      {dlq.reason}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-800">{dlq.deliveryCount}</td>
                    <td className="py-2.5 px-3 text-slate-400">{dlq.enqueuedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
