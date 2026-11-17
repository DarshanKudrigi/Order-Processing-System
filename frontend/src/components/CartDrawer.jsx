import { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { api } from '../api/client';
import {
  X,
  Trash2,
  ArrowRight,
  ShieldAlert,
  CreditCard,
  QrCode,
  Truck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

export default function CartDrawer({ onOrderCreated }) {
  const {
    items,
    isCartOpen,
    setIsCartOpen,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    shippingFee,
    grandTotal,
  } = useCart();
  const { isAuthenticated, user, quickDemoLogin } = useAuth();
  const { addToast } = useToast();

  const [checkoutStep, setCheckoutStep] = useState(false);
  const [loading, setLoading] = useState(false);

  // Checkout address & payment
  const [shippingAddress, setShippingAddress] = useState({
    name: 'Asha K',
    line1: '124 Indiranagar 100ft Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    phone: '9876543210',
  });

  const [paymentMethod, setPaymentMethod] = useState('UPI');

  if (!isCartOpen) return null;

  const handleFillDemoAddress = () => {
    setShippingAddress({
      name: user?.name || 'Demo User',
      line1: '42 Tech Enclave, Outer Ring Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560103',
      phone: '9876543210',
    });
    addToast('Demo shipping address auto-filled', 'info');
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();

    if (items.length === 0) {
      addToast('Your cart is empty', 'error');
      return;
    }

    if (!isAuthenticated) {
      try {
        const demoUser = await quickDemoLogin('CUSTOMER');
        addToast(`Signed in as ${demoUser?.name || 'Demo User'} to complete checkout`, 'info');
      } catch (authErr) {
        addToast('Please sign in before placing an order', 'warning');
        return;
      }
    }

    // Validation matching backend Pydantic schema
    if (!/^\d{6}$/.test(shippingAddress.pincode)) {
      addToast('Pincode must be exactly 6 digits', 'error');
      return;
    }
    if (!/^\d{10}$/.test(shippingAddress.phone)) {
      addToast('Phone number must be exactly 10 digits', 'error');
      return;
    }

    setLoading(true);

    try {
      const orderPayload = {
        items: items.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
        paymentMethod: paymentMethod,
        shippingAddress: {
          name: shippingAddress.name.trim(),
          line1: shippingAddress.line1.trim(),
          city: shippingAddress.city.trim(),
          state: shippingAddress.state.trim(),
          pincode: shippingAddress.pincode.trim(),
          phone: shippingAddress.phone.trim(),
        },
      };

      const res = await api.orders.create(orderPayload);
      addToast(`Order ${res.orderNumber || res.orderId} accepted! Event Saga started.`, 'success');
      clearCart();
      setIsCartOpen(false);
      setCheckoutStep(false);

      if (onOrderCreated) {
        onOrderCreated(res);
      }
    } catch (err) {
      // If backend network error or database error, show helpful message
      addToast(err.message || 'Failed to place order', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formattedSubtotal = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(subtotal);

  const formattedShipping = shippingFee === 0 ? 'FREE' : `₹${shippingFee}`;

  const formattedTotal = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(grandTotal);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-xs flex justify-end animate-fade-in">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between border-l border-slate-200 animate-slide-left">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              {checkoutStep ? 'Shipping & Payment Checkout' : 'Shopping Cart'}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <button
            onClick={() => {
              setIsCartOpen(false);
              setCheckoutStep(false);
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!checkoutStep ? (
            /* Items List View */
            items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 mb-3">
                  <Truck size={32} />
                </div>
                <p className="text-sm font-semibold text-slate-700">Your cart is empty</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                  Browse our catalog and add items to place an order.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl border border-slate-200/80 bg-white hover:border-slate-300 transition flex items-center gap-3.5 shadow-2xs"
                  >
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-16 h-16 rounded-xl object-cover bg-slate-100 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {item.name}
                      </h4>
                      <p className="text-xs font-semibold text-indigo-600 mt-0.5">
                        ₹{item.price.toLocaleString('en-IN')}
                      </p>

                      <div className="flex items-center justify-between mt-2">
                        {/* Quantity picker */}
                        <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-6 h-6 flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-white rounded-l-lg transition"
                          >
                            -
                          </button>
                          <span className="w-7 text-center text-xs font-bold text-slate-900">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-6 h-6 flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-white rounded-r-lg transition"
                          >
                            +
                          </button>
                        </div>

                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-slate-400 hover:text-rose-500 p-1 transition cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Checkout Form View */
            <form id="checkout-form" onSubmit={handlePlaceOrder} className="space-y-5">
              {/* Demo auto-fill helper */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  1. Delivery Details
                </span>
                <button
                  type="button"
                  onClick={handleFillDemoAddress}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles size={13} />
                  <span>Auto-fill Demo</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="col-span-2">
                  <label className="block text-slate-600 font-semibold mb-1">Recipient Name</label>
                  <input
                    type="text"
                    required
                    value={shippingAddress.name}
                    onChange={(e) =>
                      setShippingAddress({ ...shippingAddress, name: e.target.value })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-slate-600 font-semibold mb-1">Street Address</label>
                  <input
                    type="text"
                    required
                    value={shippingAddress.line1}
                    onChange={(e) =>
                      setShippingAddress({ ...shippingAddress, line1: e.target.value })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={shippingAddress.city}
                    onChange={(e) =>
                      setShippingAddress({ ...shippingAddress, city: e.target.value })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">State</label>
                  <input
                    type="text"
                    required
                    value={shippingAddress.state}
                    onChange={(e) =>
                      setShippingAddress({ ...shippingAddress, state: e.target.value })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Pincode (6-digit)</label>
                  <input
                    type="text"
                    required
                    pattern="^\d{6}$"
                    maxLength={6}
                    value={shippingAddress.pincode}
                    onChange={(e) =>
                      setShippingAddress({ ...shippingAddress, pincode: e.target.value })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Phone (10-digit)</label>
                  <input
                    type="tel"
                    required
                    pattern="^\d{10}$"
                    maxLength={10}
                    value={shippingAddress.phone}
                    onChange={(e) =>
                      setShippingAddress({ ...shippingAddress, phone: e.target.value })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="pt-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2.5">
                  2. Select Payment Simulation
                </span>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label
                    onClick={() => setPaymentMethod('UPI')}
                    className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                      paymentMethod === 'UPI'
                        ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900 font-bold'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <QrCode size={16} className="text-indigo-600" />
                    <span>UPI (Instant)</span>
                  </label>

                  <label
                    onClick={() => setPaymentMethod('CARD')}
                    className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                      paymentMethod === 'CARD'
                        ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900 font-bold'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <CreditCard size={16} className="text-indigo-600" />
                    <span>Credit / Debit Card</span>
                  </label>

                  <label
                    onClick={() => setPaymentMethod('COD')}
                    className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                      paymentMethod === 'COD'
                        ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900 font-bold'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Truck size={16} className="text-slate-600" />
                    <span>Cash on Delivery</span>
                  </label>

                  {/* Failure Flow Simulation */}
                  <label
                    onClick={() => setPaymentMethod('TEST_FAIL')}
                    className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition col-span-2 ${
                      paymentMethod === 'TEST_FAIL'
                        ? 'border-rose-500 bg-rose-50 text-rose-950 font-bold ring-1 ring-rose-400'
                        : 'border-rose-200 bg-rose-50/30 text-rose-800'
                    }`}
                  >
                    <ShieldAlert size={18} className="text-rose-600 shrink-0" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold">Simulate Payment Failure (TEST_FAIL)</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-200 text-rose-800 font-extrabold">
                          Saga Test
                        </span>
                      </div>
                      <p className="text-[10px] text-rose-600/90 font-normal mt-0.5">
                        Triggers PaymentFailed (EVT-05) and reverses inventory reservation!
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Drawer Footer with Calculations */}
        {items.length > 0 && (
          <div className="p-5 border-t border-slate-200 bg-slate-50/90 space-y-3">
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-800">{formattedSubtotal}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery</span>
                <span className="font-semibold text-emerald-600">{formattedShipping}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total Amount</span>
                <span className="text-base text-indigo-600">{formattedTotal}</span>
              </div>
            </div>

            {!checkoutStep ? (
              <button
                type="button"
                onClick={() => setCheckoutStep(true)}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-indigo-200 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCheckoutStep(false)}
                  className="px-4 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-white transition cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={loading}
                  className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-indigo-200 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Confirm & Place Order (202 Accepted)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
