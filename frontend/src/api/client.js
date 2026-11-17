// API Client for the Order Processing Backend
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Universal request wrapper with JWT token injection and JSON error parsing
 */
async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config);

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.error?.message || data?.detail || response.statusText || 'An error occurred';
      const error = new Error(errorMsg);
      error.status = response.status;
      error.code = data?.error?.code;
      error.details = data?.error?.details;
      throw error;
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      // Network unreachable
      const networkError = new Error('Backend API is not reachable. Check if server is running on port 8080.');
      networkError.isNetworkError = true;
      throw networkError;
    }
    throw err;
  }
}

export const api = {
  // Auth endpoints
  auth: {
    login: (email, password) =>
      request('/auth/login', {
        method: 'POST',
        body: { email, password },
      }),
    register: (name, email, password, role = 'CUSTOMER') =>
      request('/auth/register', {
        method: 'POST',
        body: { name, email, password, role },
      }),
    getMe: () => request('/auth/me'),
  },

  // Product endpoints
  products: {
    list: (params = {}) => {
      const query = new URLSearchParams();
      if (params.search) query.append('search', params.search);
      if (params.category && params.category !== 'All') query.append('category', params.category);
      if (params.page) query.append('page', params.page);
      if (params.limit) query.append('limit', params.limit);
      const qs = query.toString() ? `?${query.toString()}` : '';
      return request(`/products${qs}`);
    },
    get: (id) => request(`/products/${id}`),
    create: (data) =>
      request('/products', {
        method: 'POST',
        body: data,
      }),
    update: (id, data) =>
      request(`/products/${id}`, {
        method: 'PUT',
        body: data,
      }),
    delete: (id) =>
      request(`/products/${id}`, {
        method: 'DELETE',
      }),
  },

  // Inventory endpoints (Admin)
  inventory: {
    list: () => request('/inventory'),
    update: (productId, quantityAvailable) =>
      request(`/inventory/${productId}`, {
        method: 'PATCH',
        body: { quantityAvailable },
      }),
  },

  // Order endpoints
  orders: {
    create: (payload) =>
      request('/orders', {
        method: 'POST',
        body: payload,
      }),
    list: (params = {}) => {
      const query = new URLSearchParams();
      if (params.status) query.append('status', params.status);
      if (params.page) query.append('page', params.page);
      if (params.limit) query.append('limit', params.limit);
      const qs = query.toString() ? `?${query.toString()}` : '';
      return request(`/orders${qs}`);
    },
    get: (id) => request(`/orders/${id}`),
    getEvents: (id) => request(`/orders/${id}/events`),
    cancel: (id, reason = 'Customer requested cancellation') =>
      request(`/orders/${id}/cancel`, {
        method: 'POST',
        body: { reason },
      }),
  },

  // Admin endpoints
  admin: {
    getStats: () => request('/admin/stats'),
    getDeadLetters: () => request('/admin/dead-letters'),
  },

  // Health check
  health: {
    check: () => request('/health'),
  },
};
