import { useState } from 'react';
import { useCart } from '../context/CartContext';
import { ShoppingBag, Check, AlertCircle } from 'lucide-react';

export default function ProductCard({ product, onSelect }) {
  const { items, addItem } = useCart();
  const [imgError, setImgError] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const cartItem = items.find((i) => i.id === product.id);
  const inCartQty = cartItem ? cartItem.quantity : 0;
  const stock = product.quantity_available ?? product.availableQuantity ?? 0;
  const isOutOfStock = stock <= 0;
  const isLowStock = !isOutOfStock && stock <= 10;

  const handleAddToCart = (e) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    addItem(product, 1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  };

  const formattedPrice = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(product.price);

  const imgSrc =
    imgError || (!product.image_url && !product.imageUrl)
      ? 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80'
      : product.image_url || product.imageUrl;

  return (
    <div
      onClick={() => onSelect(product)}
      className="group bg-white rounded-2xl border border-slate-200/90 hover:border-indigo-300 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden cursor-pointer"
    >
      {/* Product Image Container */}
      <div className="relative aspect-4/3 w-full bg-slate-100 overflow-hidden">
        <img
          src={imgSrc}
          alt={product.name}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Category tag */}
        <div className="absolute top-3 left-3">
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-wide bg-white/95 backdrop-blur-md text-slate-700 shadow-xs">
            {product.category}
          </span>
        </div>

        {/* Stock status chip */}
        <div className="absolute top-3 right-3">
          {isOutOfStock ? (
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500 text-white shadow-xs">
              Out of Stock
            </span>
          ) : isLowStock ? (
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500 text-white shadow-xs flex items-center gap-1">
              <AlertCircle size={11} />
              <span>Only {stock} left</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-900/80 backdrop-blur-md text-emerald-300">
              {stock} in stock
            </span>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug line-clamp-1 group-hover:text-indigo-600 transition">
            {product.name}
          </h3>
          <p className="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            <span className="text-xs text-slate-400 block font-medium">Price</span>
            <span className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
              {formattedPrice}
            </span>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              isOutOfStock
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : justAdded
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                : inCartQty > 0
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100'
            }`}
          >
            {justAdded ? (
              <>
                <Check size={14} />
                <span>Added!</span>
              </>
            ) : inCartQty > 0 ? (
              <>
                <ShoppingBag size={14} />
                <span>In Cart ({inCartQty})</span>
              </>
            ) : (
              <>
                <ShoppingBag size={14} />
                <span>Add</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
