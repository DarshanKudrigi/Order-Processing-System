import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  // Validate session on mount
  useEffect(() => {
    async function verify() {
      const savedToken = localStorage.getItem('token');
      if (!savedToken) {
        setLoading(false);
        return;
      }
      try {
        const profile = await api.auth.getMe();
        setUser(profile);
        localStorage.setItem('user', JSON.stringify(profile));
      } catch (err) {
        // If token expired or unauthorized, reset
        if (err.status === 401) {
          logout();
        }
      } finally {
        setLoading(false);
      }
    }
    verify();
  }, []);

  const login = async (email, password) => {
    const res = await api.auth.login(email, password);
    const jwtToken = res.token;
    const userData = res.user;

    setToken(jwtToken);
    setUser(userData);
    localStorage.setItem('token', jwtToken);
    localStorage.setItem('user', JSON.stringify(userData));
    return userData;
  };

  const register = async (name, email, password) => {
    const res = await api.auth.register(name, email, password);
    const jwtToken = res.token;
    const userData = res.user;

    setToken(jwtToken);
    setUser(userData);
    localStorage.setItem('token', jwtToken);
    localStorage.setItem('user', JSON.stringify(userData));
    return userData;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // Demo 1-click login helper
  const quickDemoLogin = async (role = 'CUSTOMER') => {
    if (role === 'ADMIN') {
      return await login('admin@example.com', 'Admin123!');
    }
    return await login('asha@example.com', 'Passw0rd!');
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
    isAdmin: user?.role === 'ADMIN',
    login,
    register,
    logout,
    quickDemoLogin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
