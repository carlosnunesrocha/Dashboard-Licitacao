const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

const TOKENS_KEY = 'licitacoes.tokens';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export function getStoredTokens(): StoredTokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

export function setStoredTokens(tokens: StoredTokens | null) {
  if (tokens) localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(TOKENS_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let refreshPromise: Promise<StoredTokens | null> | null = null;

async function doRefresh(): Promise<StoredTokens | null> {
  const current = getStoredTokens();
  if (!current) return null;

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  });
  if (!res.ok) {
    setStoredTokens(null);
    return null;
  }
  const tokens = (await res.json()) as StoredTokens;
  setStoredTokens(tokens);
  return tokens;
}

function refreshOnce(): Promise<StoredTokens | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
}

function buildUrl(path: string, query?: Record<string, string | undefined>) {
  // A origem como base permite VITE_API_URL relativo ("/api") em produção,
  // com frontend e API no mesmo domínio atrás do Traefik.
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query } = options;
  const url = buildUrl(path, query);

  const doFetch = async () => {
    const tokens = getStoredTokens();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
    return fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();

  if (res.status === 401 && getStoredTokens()) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      res = await doFetch();
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.message ?? message;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}