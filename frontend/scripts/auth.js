function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch (e) {
    return null;
  }
}

function logout() {
  localStorage.clear();
  window.location.href = 'index.html';
}

function handleUnauthorized() {
  localStorage.clear();
  window.location.href = 'index.html';
}

/**
 * Standardized lightweight API fetch helper.
 * Standardizes Bearer token authorization, JSON headers, 401 redirection, and error parsing.
 * 
 * @param {string} endpoint - Relative path (e.g. '/api/progress/stats') or absolute URL
 * @param {object} options - Standard fetch options
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 */
async function apiFetch(endpoint, options = {}) {
  const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
  const token = getToken();

  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body,
  });

  const isAuthEndpoint = typeof endpoint === 'string' && (
    endpoint.includes('/api/auth/login') ||
    endpoint.includes('/api/auth/google') ||
    endpoint.includes('/api/auth/register')
  );

  if (response.status === 401 && !isAuthEndpoint && options.redirectOnUnauthorized !== false) {
    handleUnauthorized();
    return { ok: false, status: 401, data: { success: false, message: 'Unauthorized' } };
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = {};
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}
