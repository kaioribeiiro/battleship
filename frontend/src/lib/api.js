const API_URL = import.meta.env?.VITE_API_URL ?? '';
const BASE = `${API_URL}/api`;
const TOKEN_KEY = 'bn.token';

let token = null;
let unauthorizedHandler = null;

try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  token = null;
}

export const apiUrl = () => API_URL;
export const getToken = () => token;

export function setToken(next) {
  token = next;
  try {
    if (next) localStorage.setItem(TOKEN_KEY, next);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* fallback */
  }
}

export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Erro ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error || null;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { message: 'Servidor indisponível. Verifique a conexão.' });
  }

  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 && auth && token && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(response.status, payload);
  }
  return payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  postPublic: (path, body) => request(path, { method: 'POST', body, auth: false }),
};

export const authApi = {
  register: (username, password) => api.postPublic('/auth/register', { username, password }),
  login: (username, password) => api.postPublic('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const gamesApi = {
  vsBot: (difficulty = 'hard') => api.post('/games/vs-bot', { difficulty }),
  list: (query = '') => api.get(`/games${query}`),
  state: (gameId) => api.get(`/games/${gameId}`),
};

export const usersApi = {
  byId: (id) => api.get(`/users/${id}`),
  scoreboard: (limit = 10) => api.get(`/scoreboard?limit=${limit}`),
};
