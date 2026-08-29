import { logger } from '../logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;

  constructor(status: number, message: string, data?: unknown, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = code;
  }
}

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  responseType?: 'json' | 'blob';
}

// Token getter — set by AuthContext so client can inject Bearer tokens
let tokenGetter: (() => string | null) | null = null;

export function setTokenGetter(getter: () => string | null) {
  tokenGetter = getter;
}

/** Returns auth headers for raw fetch() calls that can't use the api client. */
export function getAuthHeaders(): Record<string, string> {
  const token = tokenGetter?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface ExtractedError {
  message: string;
  code?: string;
  data?: unknown;
}

async function extractError(response: Response): Promise<ExtractedError> {
  try {
    const data = (await response.clone().json()) as {
      message?: string;
      detail?: string;
      code?: string;
    };
    const message = data?.message || data?.detail || `HTTP ${response.status}`;
    return { message, code: data?.code, data };
  } catch {
    try {
      const text = await response.text();
      return { message: text || `HTTP ${response.status}` };
    } catch {
      return { message: `HTTP ${response.status}` };
    }
  }
}

type RefreshResult =
  | { outcome: 'success'; token: string }
  // The refresh endpoint definitively rejected the cookie — the session is dead.
  | { outcome: 'auth_failed' }
  // Network error or 5xx — the backend hiccuped; the session may still be valid.
  | { outcome: 'transient' };

// Concurrent 401s share the same in-flight refresh instead of each failing fast.
let refreshInFlight: Promise<RefreshResult> | null = null;

function attemptSilentRefresh(): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async (): Promise<RefreshResult> => {
    try {
      const baseUrl = API_BASE_URL.replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        return data.access_token
          ? { outcome: 'success', token: data.access_token }
          : { outcome: 'auth_failed' };
      }
      // Only a definitive rejection kills the session; 5xx/429 are backend trouble.
      return res.status === 401 || res.status === 403
        ? { outcome: 'auth_failed' }
        : { outcome: 'transient' };
    } catch {
      return { outcome: 'transient' };
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Endpoints that should never trigger silent-refresh / login-redirect on 401.
// These are the auth endpoints themselves — bootstrap refresh MUST be allowed to
// fail quietly so unauthenticated visitors can reach /login without a redirect loop.
const AUTH_BOOTSTRAP_PATHS = ['/auth/refresh', '/auth/me', '/auth/logout', '/auth/google', '/auth/admin/login'];

function isAuthBootstrapPath(endpoint: string): boolean {
  return AUTH_BOOTSTRAP_PATHS.some((p) => endpoint === p || endpoint.startsWith(`${p}?`));
}

export async function fetchApi<T>(
  endpoint: string,
  options: FetchOptions = {},
  _isRetry = false
): Promise<T> {
  const { body, params, responseType = 'json', headers: customHeaders, credentials, ...restOptions } = options;

  const baseUrl = API_BASE_URL.replace(/\/$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let url = `${baseUrl}${cleanEndpoint}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    const paramString = searchParams.toString();
    if (paramString) url += `?${paramString}`;
  }

  const isFormData = body instanceof FormData;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  if (!isFormData && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // Inject Bearer token if available
  const token = tokenGetter?.();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...restOptions,
    headers,
    // Always include credentials so the httpOnly refresh cookie rides along on
    // login, refresh, and logout. Harmless for other endpoints.
    credentials: credentials ?? 'include',
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  };

  logger.debug(`${config.method?.toUpperCase() || 'GET'} ${endpoint}`);

  try {
    const response = await fetch(url, config);

    if (response.status === 401 && !_isRetry) {
      // Never try to rescue the auth endpoints themselves — they're the ones
      // we'd call to rescue. Propagate the 401 and let AuthContext decide.
      if (isAuthBootstrapPath(cleanEndpoint)) {
        const err = await extractError(response);
        throw new ApiError(401, err.message, err.data, err.code);
      }

      // Attempt silent refresh once
      const refresh = await attemptSilentRefresh();
      if (refresh.outcome === 'success') {
        const captured = refresh.token;
        setTokenGetter(() => captured);
        return fetchApi<T>(endpoint, options, true);
      }

      if (refresh.outcome === 'transient') {
        // Backend hiccup, not a dead session — retry the original request once
        // with a short backoff instead of tearing down auth state.
        await sleep(1000);
        return fetchApi<T>(endpoint, options, true);
      }

      // Refresh definitively rejected — let AuthContext handle the redirect
      throw new ApiError(401, 'Session expired', undefined, 'SESSION_EXPIRED');
    }

    if (!response.ok) {
      const err = await extractError(response);
      logger.error('Response error:', { url: endpoint, status: response.status });
      throw new ApiError(response.status, err.message, err.data, err.code);
    }

    logger.debug(`${response.status} ${config.method?.toUpperCase() || 'GET'} ${endpoint}`);

    if (responseType === 'blob') return response.blob() as Promise<T>;
    if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T;
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error)?.name === 'AbortError') throw error;
    logger.error('Network error:', error);
    throw new ApiError(0, 'Network error: Could not reach server');
  }
}

export const api = {
  get: <T>(endpoint: string, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchApi<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchApi<T>(endpoint, { ...options, method: 'POST', body }),

  put: <T>(endpoint: string, body?: unknown, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchApi<T>(endpoint, { ...options, method: 'PUT', body }),

  patch: <T>(endpoint: string, body?: unknown, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchApi<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T>(endpoint: string, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchApi<T>(endpoint, { ...options, method: 'DELETE' }),
};

export default api;
