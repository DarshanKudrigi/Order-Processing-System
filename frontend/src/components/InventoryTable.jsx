import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useToast } from './Toast';
import {
  Boxes,
  AlertCircle,
  Plus,
  Minus,
  RefreshCw,
  Search,
  Check,
} from 'lucide-react';

export default function InventoryTable() {
  const { addToast } = useToast();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await api.inventory.list();
      setInventory(Array.isArray(res) ? res : res.items || []);
    } catch (err) {
      addToast(err.message || 'Failed to fetch inventory stock', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleUpdateStock = async (productId, currentAvailable, delta) => {
    const newQty = Math.max(0, currentAvailable + delta);
    setUpdatingId(productId);
    try {
      await api.inventory.update(productId, newQty);
      setInventory((prev) =>
        prev.map((item) =>
          item.product_id === productId || item.productId === productId
            ? { ...item, quantity_available: newQty, quantityAvailable: newQty }
            : item
        )
      );
      addToast(`Updated stock to ${newQty}`, 'success');
    } catch (err) {
      addToast(err.message || 'Failed to update stock', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = inventory.filter((item) => {
    const name = item.product?.name || item.productName || item.product_id || item.productId || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter product inventory..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={fetchInventory}
          className="self-end sm:self-auto px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw size={13} />
          <span>Refresh Stock</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Available Units</th>
                <th className="py-3 px-4">Saga Reserved</th>
                <th className="py-3 px-4">Total Inventory</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Quick Restock / Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <span className="inline-block w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2"></span>
                    <p>Loading inventory balances...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No products found matching search.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const pId = item.product_id || item.productId;
                  const name = item.product?.name || item.productName || pId;
                  const available = item.quantity_available ?? item.quantityAvailable ?? 0;
                  const reserved = item.quantity_reserved ?? item.quantityReserved ?? 0;
                  const total = available + reserved;
                  const isLow = available < 10;
                  const isOut = available <= 0;
                  const isUpdating = updatingId === pId;

                  return (
                    <tr key={pId} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{pId}</div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {available}
                      </td>

                      <td className="py-3 px-4 font-mono font-semibold text-indigo-600">
                        {reserved}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-700">
                        {total}
                      </td>

                      <td className="py-3 px-4">
                        {isOut ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                            <AlertCircle size={10} />
                            <span>Low Stock (&lt;10)</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Healthy
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 border border-slate-200 rounded-xl bg-slate-50 p-1">
                          <button
                            onClick={() => handleUpdateStock(pId, available, -5)}
                            disabled={isUpdating || available <= 0}
                            className="px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg text-xs font-bold transition disabled:opacity-30 cursor-pointer"
                            title="Decrease 5"
                          >
                            -5
                          </button>
                          <button
                            onClick={() => handleUpdateStock(pId, available, -1)}
                            disabled={isUpdating || available <= 0}
                            className="w-6 h-6 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg text-xs font-bold transition disabled:opacity-30 cursor-pointer"
                            title="Decrease 1"
                          >
                            -
                          </button>
                          <button
                            onClick={() => handleUpdateStock(pId, available, 1)}
                            disabled={isUpdating}
                            className="w-6 h-6 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg text-xs font-bold transition cursor-pointer"
                            title="Increase 1"
                          >
                            +
                          </button>
                          <button
                            onClick={() => handleUpdateStock(pId, available, 10)}
                            disabled={isUpdating}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                            title="Quick Restock +10"
                          >
                            +10
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
