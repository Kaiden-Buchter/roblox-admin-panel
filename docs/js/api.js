const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE ? window.APP_CONFIG.API_BASE.replace(/\/$/, '') : '');

async function api(path, options = {}) {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (response.status === 401 && !window.location.pathname.endsWith('/login.html')) {
    window.location.href = 'login.html';
    throw new Error(payload.error || 'Unauthorized');
  }

  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'Request failed');
  }

  return payload;
}
