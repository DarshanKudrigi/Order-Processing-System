import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { LogIn, UserPlus, Shield, User, X } from 'lucide-react';

export default function AuthModal({ isOpen, onClose }) {
  const { login, register, quickDemoLogin } = useAuth();
  const { addToast } = useToast();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        await register(name, email, password);
        addToast(`Welcome to FlowOrder, ${name}!`, 'success');
      } else {
        const u = await login(email, password);
        addToast(`Signed in as ${u.name} (${u.role})`, 'success');
      }
      onClose();
    } catch (err) {
      addToast(err.message || 'Authentication failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async (role) => {
    setLoading(true);
    try {
      const u = await quickDemoLogin(role);
      addToast(`Logged in as demo ${role}: ${u.name}`, 'success');
      onClose();
    } catch (err) {
      addToast(err.message || 'Demo login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-2">
            Order Processing Platform
          </div>
          <h2 className="text-xl font-bold">
            {isRegister ? 'Create an Account' : 'Sign in to your Account'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isRegister
              ? 'Join to place orders and track asynchronous event fulfillment.'
              : 'Sign in to access your orders and account features.'}
          </p>
        </div>

        {/* Demo Quick Switcher Box */}
        <div className="p-4 bg-indigo-50/60 border-b border-indigo-100 flex flex-col gap-2">
          <div className="text-xs font-semibold text-indigo-900 flex items-center gap-1.5">
            <span>⚡ Quick Demo Credentials:</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleDemo('CUSTOMER')}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white border border-indigo-200 hover:border-indigo-400 text-indigo-950 text-xs font-medium rounded-lg shadow-xs hover:shadow transition"
            >
              <User size={14} className="text-indigo-600" />
              <span>Customer (Asha K)</span>
            </button>
            <button
              type="button"
              onClick={() => handleDemo('ADMIN')}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white border border-indigo-200 hover:border-indigo-400 text-indigo-950 text-xs font-medium rounded-lg shadow-xs hover:shadow transition"
            >
              <Shield size={14} className="text-emerald-600" />
              <span>Admin (System Admin)</span>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-200 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : isRegister ? (
              <>
                <UserPlus size={16} />
                <span>Create Account</span>
              </>
            ) : (
              <>
                <LogIn size={16} />
                <span>Sign In</span>
              </>
            )}
          </button>

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="text-xs font-medium text-slate-600 hover:text-indigo-600 transition"
            >
              {isRegister
                ? 'Already have an account? Sign In'
                : "Don't have an account yet? Create one"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
