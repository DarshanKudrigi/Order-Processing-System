import { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useToast } from './Toast';
import { X, ShoppingBag, Check, ShieldCheck, Box } from 'lucide-react';

export default function ProductModal({ product, onClose }) {
  const { addItem } = useCart();
  const { addToast } = useToast();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  if (!product) return null;

  const maxStock = product.quantity_available ?? 0;
  const isOutOfStock = maxStock <= 0;

  const handleAdd = () => {
    if (isOutOfStock) return;
    addItem(product, qty);
    setAdded(true);
    addToast(`Added ${qty} × ${product.name} to cart`, 'success');
    setTimeout(() => {
      setAdded(false);
      onClose();
    }, 800);
  };

  const formattedPrice = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(product.price);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/90 text-slate-500 hover:text-slate-900 shadow-sm border border-slate-200 transition"
        >
          <X size={18} />
        </button>

        {/* Product Media */}
        <div className="w-full md:w-1/2 bg-slate-100 relative min-h-[260px] md:min-h-full">
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-4 left-4">
            <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-900/80 backdrop-blur-md text-white shadow-sm">
              {product.category}
            </span>
          </div>
        </div>

        {/* Product Info */}
        <div className="w-full md:w-1/2 p-6 flex flex-col justify-between overflow-y-auto">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-1">
              <span>SKU:</span>
              <span className="font-semibold text-slate-600">{product.id}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 leading-snug">
              {product.name}
            </h2>
            <div className="mt-3 text-2xl font-black text-slate-900 tracking-tight">
              {formattedPrice}
            </div>

            <p className="mt-4 text-xs sm:text-sm text-slate-600 leading-relaxed">
              {product.description}
            </p>

            {/* Inventory Specs Box */}
            <div className="mt-5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Box size={14} className="text-indigo-600" />
                <span>Inventory & Saga Reservation:</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-slate-400 block text-[10px]">Available</span>
                  <span className="font-bold text-slate-800 text-sm">{maxStock} units</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-slate-400 block text-[10px]">Held / Reserved</span>
                  <span className="font-bold text-indigo-600 text-sm">
                    {product.quantity_reserved ?? 0} units
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-3">
            {/* Quantity control */}
            <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
                disabled={qty <= 1 || isOutOfStock}
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-slate-600 hover:bg-white transition disabled:opacity-30 cursor-pointer"
              >
                -
              </button>
              <span className="w-10 text-center text-xs font-bold text-slate-900">{qty}</span>
              <button
                type="button"
                onClick={() => setQty(Math.min(maxStock, qty + 1))}
                disabled={qty >= maxStock || isOutOfStock}
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-slate-600 hover:bg-white transition disabled:opacity-30 cursor-pointer"
              >
                +
              </button>
            </div>

            <button
              onClick={handleAdd}
              disabled={isOutOfStock}
              className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${
                isOutOfStock
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  : added
                  ? 'bg-emerald-600 text-white shadow-emerald-200'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100'
              }`}
            >
              {added ? (
                <>
                  <Check size={16} />
                  <span>Added to Cart!</span>
                </>
              ) : (
                <>
                  <ShoppingBag size={16} />
                  <span>{isOutOfStock ? 'Out of Stock' : `Add ${qty} to Cart`}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
