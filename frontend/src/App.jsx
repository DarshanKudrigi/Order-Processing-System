import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider, useToast } from './components/Toast';
import { api } from './api/client';
import { FALLBACK_PRODUCTS, CATEGORIES } from './data/fallbackData';

import Navbar from './components/Navbar';
import ProductCard from './components/ProductCard';
import ProductModal from './components/ProductModal';
import CartDrawer from './components/CartDrawer';
import OrderTracker from './components/OrderTracker';
import MyOrders from './components/MyOrders';
import AdminDashboard from './components/AdminDashboard';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';

import {
  Search,
  Filter,
  Sparkles,
  ArrowUpDown,
  ShoppingBag,
  Layers,
  CheckCircle2,
  AlertCircle,
  Truck,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

function MainLayout() {
  const { user, isAdmin, isAuthenticated } = useAuth();
  const { addToast } = useToast();

  // Active views: 'login' | 'register' | 'store' | 'orders' | 'tracker' | 'admin'
  // REQUIREMENT: At first always the login page should appear not the Dashboard, afterwards Dashboard
  const [activeView, setActiveView] = useState('login');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  // Products state
  const [products, setProducts] = useState(FALLBACK_PRODUCTS);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [backendOnline, setBackendOnline] = useState(null);

  // Search & Filter state
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('featured'); // 'featured' | 'price-low' | 'price-high' | 'name'

  // Route & Authentication Guard
  useEffect(() => {
    // 1. If not authenticated, always keep user on Login (or Register page)
    if (!isAuthenticated) {
      if (activeView !== 'login' && activeView !== 'register') {
        setActiveView('login');
      }
      return;
    }

    // 2. If authenticated and currently on auth view, redirect immediately to respective dashboard
    if (activeView === 'login' || activeView === 'register') {
      if (isAdmin) {
        setActiveView('admin');
      } else {
        setActiveView('store');
      }
      return;
    }

    // 3. If customer tries to access admin operations
    if (activeView === 'admin' && !isAdmin) {
      addToast('Administrator authorization required. Please sign in as Admin.', 'warning');
      setActiveView('store');
    }

    // 4. If an Admin tries to access the customer MyOrders page
    if (activeView === 'orders' && isAdmin) {
      addToast('Administrators do not have a customer orders page. Redirected to Admin Operations.', 'info');
      setActiveView('admin');
    }
  }, [activeView, isAdmin, isAuthenticated]);

  // Probe API on load
  const probeBackend = async () => {
    try {
      const health = await api.health.check();
      setBackendOnline(true);
      fetchProducts();
    } catch {
      setBackendOnline(false);
    }
  };

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await api.products.list({
        category: selectedCategory,
        search: searchTerm,
        limit: 50,
      });

      const rawList = res?.data || res?.items || (Array.isArray(res) ? res : []);

      if (rawList && rawList.length > 0) {
        const normalized = rawList.map((p) => ({
          ...p,
          image_url:
            p.imageUrl ||
            p.image_url ||
            'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80',
          imageUrl:
            p.imageUrl ||
            p.image_url ||
            'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80',
          quantity_available: p.availableQuantity ?? p.quantity_available ?? 0,
          availableQuantity: p.availableQuantity ?? p.quantity_available ?? 0,
        }));
        setProducts(normalized);
      }
    } catch (err) {
      // Graceful fallback to mock data if API is offline
      let filtered = FALLBACK_PRODUCTS;
      if (selectedCategory !== 'All') {
        filtered = filtered.filter((p) => p.category === selectedCategory);
      }
      if (searchTerm) {
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      setProducts(filtered);
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    probeBackend();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, searchTerm]);

  // Sorting
  const sortedProducts = [...products].sort((a, b) => {
    if (sortBy === 'price-low') return Number(a.price) - Number(b.price);
    if (sortBy === 'price-high') return Number(b.price) - Number(a.price);
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    return 0;
  });

  const handleOrderCreated = (orderRes) => {
    setSelectedOrderId(orderRes.orderId || orderRes.id);
    setActiveView('tracker');
  };

  const handleSelectOrderFromList = (orderId) => {
    setSelectedOrderId(orderId);
    setActiveView('tracker');
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col text-slate-900 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Navigation Bar */}
      <Navbar
        activeView={activeView}
        setActiveView={setActiveView}
      />

      {/* Backend API Connection status notification if not connected yet */}
      {backendOnline === false && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-900">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-amber-600 shrink-0" />
              <span>
                Backend API server on port 8080 is standby or PostgreSQL is booting. Displaying local
                high-fidelity interactive catalog.
              </span>
            </div>
            <button
              onClick={probeBackend}
              className="text-indigo-700 hover:text-indigo-900 font-semibold underline underline-offset-2 flex items-center gap-1 cursor-pointer shrink-0"
            >
              <RefreshCw size={11} />
              <span>Check Connection</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        {/* VIEW 1: DEDICATED LOGIN PAGE */}
        {activeView === 'login' && (
          <LoginPage onNavigate={(view) => setActiveView(view)} />
        )}

        {/* VIEW 2: DEDICATED REGISTRATION PAGE */}
        {activeView === 'register' && (
          <RegisterPage onNavigate={(view) => setActiveView(view)} />
        )}

        {/* VIEW 3: STOREFRONT CATALOG (CUSTOMER / ADMIN CATALOG VIEW) */}
        {activeView === 'store' && (
          <div>
            {/* Hero Section */}
            <div className="bg-white border-b border-slate-200/80">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
                <div className="max-w-3xl">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold mb-3 shadow-2xs">
                    <Sparkles size={13} className="text-indigo-600" />
                    <span>Next-Gen Event-Driven E-Commerce</span>
                  </div>

                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">
                    Engineered Peripherals & Hardware.{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-indigo-800">
                      Fulfilled in Real-Time.
                    </span>
                  </h1>

                  <p className="mt-3 text-sm sm:text-base text-slate-500 leading-relaxed max-w-2xl">
                    Every order triggers an asynchronous saga across Azure Service Bus topic
                    subscriptions: stock reservation, simulated payment authorization, and
                    instant tracking number dispatch.
                  </p>
                </div>

                {/* Search & Filters Toolbar */}
                <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100">
                  {/* Category Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                          selectedCategory === cat
                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                            : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/70'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Search and Sort */}
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                      <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search products..."
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition"
                      />
                    </div>

                    <div className="relative">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="appearance-none pl-3 pr-8 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="featured">Sort: Featured</option>
                        <option value="price-low">Price: Low to High</option>
                        <option value="price-high">Price: High to Low</option>
                        <option value="name">Name: A to Z</option>
                      </select>
                      <ArrowUpDown
                        size={12}
                        className="absolute right-2.5 top-3 text-slate-400 pointer-events-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Product Grid */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="flex items-center justify-between mb-6">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Showing {sortedProducts.length} Products
                </span>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="text-xs text-indigo-600 font-semibold hover:underline cursor-pointer"
                  >
                    Clear search filter
                  </button>
                )}
              </div>

              {loadingProducts ? (
                <div className="py-20 text-center">
                  <div className="inline-block w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-xs font-semibold text-slate-500">Updating catalog items...</p>
                </div>
              ) : sortedProducts.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
                  <ShoppingBag size={32} className="text-slate-300 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-800">No matching products found</h3>
                  <p className="text-xs text-slate-500">
                    Try adjusting your search terms or category filter.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {sortedProducts.map((prod) => (
                    <ProductCard
                      key={prod.id}
                      product={prod}
                      onSelect={(p) => setSelectedProduct(p)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 4: CUSTOMER MY ORDERS (COMPLETELY BLOCKED FOR ADMIN) */}
        {activeView === 'orders' && !isAdmin && (
          <MyOrders
            onSelectOrder={handleSelectOrderFromList}
            onGoToStore={() => setActiveView('store')}
          />
        )}

        {/* VIEW 5: LIVE ORDER SAGA TRACKER */}
        {activeView === 'tracker' && (
          <OrderTracker
            orderId={selectedOrderId}
            onBack={() => setActiveView(isAdmin ? 'admin' : 'orders')}
          />
        )}

        {/* VIEW 6: ADMIN CONTROL PLANE (PRODUCT CATALOG & OPERATIONS) */}
        {activeView === 'admin' && isAdmin && (
          <AdminDashboard onSelectOrder={handleSelectOrderFromList} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-16 py-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-900">FlowOrder</span>
            <span>•</span>
            <span>Loosely Coupled Order Processing Platform</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span>FastAPI 0.115+</span>
            <span>PostgreSQL (asyncpg)</span>
            <span>Azure Service Bus</span>
            <span>React 19</span>
            <span>TailwindCSS</span>
          </div>
        </div>
      </footer>

      {/* Modals & Slide-over Drawers */}
      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

      {/* Cart Drawer: strictly removed and unavailable for Admin */}
      {!isAdmin && <CartDrawer onOrderCreated={handleOrderCreated} />}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <MainLayout />
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
