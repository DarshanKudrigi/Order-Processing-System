import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import {
  Layers,
  ShieldCheck,
  User,
  ArrowRight,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShoppingBag,
  Sparkles,
  ArrowLeft,
  KeyRound,
} from 'lucide-react';

export default function LoginPage({ onNavigate }) {
  const { login } = useAuth();
  const { addToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Handle standard login submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email and password');
      return;
    }

    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      addToast(`Signed in successfully as ${user.name}`, 'success');

      // Role-based redirection
      if (user.role === 'ADMIN') {
        onNavigate('admin');
      } else {
        onNavigate('store');
      }
    } catch (err) {
      const msg = err.message || 'Invalid email or password';
      setErrorMessage(msg);
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Quick 1-click login helper for pre-registered accounts
  const handleQuickLogin = async (preEmail, prePassword, expectedRole) => {
    setEmail(preEmail);
    setPassword(prePassword);
    setErrorMessage('');
    setSubmitting(true);

    try {
      const user = await login(preEmail, prePassword);
      addToast(`Welcome back, ${user.name}! (${user.role})`, 'success');

      if (user.role === 'ADMIN' || expectedRole === 'ADMIN') {
        onNavigate('admin');
      } else {
        onNavigate('store');
      }
    } catch (err) {
      const msg = err.message || 'Failed to sign in with pre-registered account';
      setErrorMessage(msg);
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 animate-fade-in">
      <div className="w-full max-w-xl space-y-8">
        {/* Brand & Title Header */}
        <div className="text-center space-y-2">
          <div
            onClick={() => onNavigate('store')}
            className="inline-flex items-center gap-2.5 cursor-pointer group mb-2"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white flex items-center justify-center shadow-lg shadow-indigo-200 group-hover:scale-105 transition-transform">
              <Layers size={26} />
            </div>
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Sign In to FlowOrder
          </h1>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Access your role-based dashboard for real-time asynchronous order processing and catalog management
          </p>
        </div>

        {/* Pre-Registered Demo Accounts Section */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Pre-Registered Test Accounts
              </h2>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">1-Click Auto Login</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* 1. Admin Account Card */}
            <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200/80 hover:border-purple-300 hover:shadow-sm transition text-left flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-200 text-purple-900">
                    Admin
                  </span>
                  <ShieldCheck size={16} className="text-purple-600" />
                </div>
                <div className="mt-2 text-xs font-bold text-slate-900">System Admin</div>
                <div className="text-[11px] font-mono text-slate-600 mt-0.5">admin@example.com</div>
                <div className="text-[10px] font-mono text-slate-400">Pass: Admin123!</div>
                <p className="text-[11px] text-purple-800/80 mt-1.5 leading-snug">
                  Full access to Product Catalog and Admin Operations.
                </p>
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleQuickLogin('admin@example.com', 'Admin123!', 'ADMIN')}
                className="w-full py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>Sign In as Admin</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {/* 2. Demo User Account Card */}
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 hover:border-emerald-300 hover:shadow-sm transition text-left flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-200 text-emerald-900">
                    Demo User
                  </span>
                  <User size={16} className="text-emerald-600" />
                </div>
                <div className="mt-2 text-xs font-bold text-slate-900">Demo User (Customer)</div>
                <div className="text-[11px] font-mono text-slate-600 mt-0.5">demo@example.com</div>
                <div className="text-[10px] font-mono text-slate-400">Pass: Demo123!</div>
                <p className="text-[11px] text-emerald-800/80 mt-1.5 leading-snug">
                  Browse products, place orders, cart, and track saga events.
                </p>
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleQuickLogin('demo@example.com', 'Demo123!', 'CUSTOMER')}
                className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>Sign In as Demo User</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Standard Credentials Sign In Form */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <KeyRound size={16} className="text-slate-400" />
            <h2 className="text-sm font-bold text-slate-900">Or Sign In with Credentials</h2>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Email Address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">Password</label>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-3 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-100 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* Link to Register */}
          <div className="pt-4 border-t border-slate-100 text-center text-xs">
            <span className="text-slate-500">
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => onNavigate('register')}
                className="font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
              >
                Create an Account Here →
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
