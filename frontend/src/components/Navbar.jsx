import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import {
  ShoppingBag,
  Package,
  ShieldCheck,
  User,
  LogOut,
  Layers,
  ChevronDown,
} from 'lucide-react';

export default function Navbar({ activeView, setActiveView }) {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { totalItemsCount, setIsCartOpen } = useCart();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isAuthPage = activeView === 'login' || activeView === 'register';

  const handleSignOut = () => {
    logout();
    setUserMenuOpen(false);
    setActiveView('login');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div
          onClick={() => setActiveView(isAuthenticated ? (isAdmin ? 'admin' : 'store') : 'login')}
          className="flex items-center gap-2.5 cursor-pointer select-none"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white flex items-center justify-center shadow-md shadow-indigo-100">
            <Layers size={22} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg tracking-tight text-slate-900">FlowOrder</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100">
                FastAPI + React
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Asynchronous Saga Engine</p>
          </div>
        </div>

        {/* Center Navigation Links - only accessible when logged in and not on login/register */}
        {isAuthenticated && !isAuthPage && (
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            <button
              onClick={() => setActiveView('store')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeView === 'store'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Product Catalog
            </button>

            {/* CRITICAL: Completely remove MyOrders for Admin users */}
            {!isAdmin && (
              <button
                onClick={() => setActiveView('orders')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeView === 'orders'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Package size={14} />
                <span>My Orders</span>
              </button>
            )}

            {/* Admin Operations link for Admin users only */}
            {isAdmin && (
              <button
                onClick={() => setActiveView('admin')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeView === 'admin'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-purple-900 bg-purple-100/70 hover:bg-purple-100'
                }`}
              >
                <ShieldCheck size={14} />
                <span>Admin Operations</span>
              </button>
            )}
          </nav>
        )}

        {/* Right Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Cart Button: ONLY visible for logged-in customers (NOT on login page, NOT for Admin) */}
          {isAuthenticated && !isAdmin && !isAuthPage && (
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 transition cursor-pointer border border-slate-200"
              title="Open Cart"
            >
              <ShoppingBag size={18} />
              <span className="text-xs font-semibold hidden sm:inline">Cart</span>
              {totalItemsCount > 0 && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold animate-pulse-slow">
                  {totalItemsCount}
                </span>
              )}
            </button>
          )}

          {/* User Account Menu - only visible when authenticated */}
          {isAuthenticated && !isAuthPage && (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition cursor-pointer"
              >
                <div
                  className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center ${
                    isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'
                  }`}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[110px]">
                    {user.name}
                  </div>
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">
                    {user.role}
                  </div>
                </div>
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900">{user.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                    <span
                      className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isAdmin
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {user.role} ACCOUNT
                    </span>
                  </div>

                  <div className="py-1">
                    {/* CRITICAL: If Admin, show Product Catalog & Admin Operations; NO MyOrders! */}
                    {isAdmin ? (
                      <>
                        <button
                          onClick={() => {
                            setActiveView('admin');
                            setUserMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 flex items-center gap-2 cursor-pointer"
                        >
                          <ShieldCheck size={14} />
                          <span>Admin Operations</span>
                        </button>
                        <button
                          onClick={() => {
                            setActiveView('store');
                            setUserMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                        >
                          <ShoppingBag size={14} />
                          <span>Product Catalog</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setActiveView('orders');
                            setUserMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                        >
                          <Package size={14} />
                          <span>My Orders & Timeline</span>
                        </button>
                        <button
                          onClick={() => {
                            setActiveView('store');
                            setUserMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                        >
                          <ShoppingBag size={14} />
                          <span>Browse Catalog</span>
                        </button>
                      </>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-1">
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut size={14} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile nav links - only visible when authenticated and not on auth pages */}
      {isAuthenticated && !isAuthPage && (
        <div className="md:hidden flex items-center justify-around border-t border-slate-200/80 bg-slate-50 px-2 py-1.5">
          <button
            onClick={() => setActiveView('store')}
            className={`px-3 py-1 text-xs font-medium rounded-lg ${
              activeView === 'store' ? 'text-indigo-600 font-bold bg-white shadow-xs' : 'text-slate-600'
            }`}
          >
            Catalog
          </button>

          {/* Completely remove My Orders for Admin on mobile */}
          {!isAdmin ? (
            <button
              onClick={() => setActiveView('orders')}
              className={`px-3 py-1 text-xs font-medium rounded-lg ${
                activeView === 'orders'
                  ? 'text-indigo-600 font-bold bg-white shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              My Orders
            </button>
          ) : (
            <button
              onClick={() => setActiveView('admin')}
              className={`px-3 py-1 text-xs font-medium rounded-lg ${
                activeView === 'admin'
                  ? 'text-purple-600 font-bold bg-white shadow-xs'
                  : 'text-purple-900'
              }`}
            >
              Admin Ops
            </button>
          )}
        </div>
      )}
    </header>
  );
}
