import { logger } from '../logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  responseType?: 'json' | 'blob';
}

export async function fetchApi<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { body, params, responseType = 'json', headers: customHeaders, ...restOptions } = options;

  let url = `${API_BASE_URL}${endpoint}`;

  if (params)
  {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined)
      {
        searchParams.append(key, String(value));
      }
    });
    const paramString = searchParams.toString();
    if (paramString)
    {
      url += `?${paramString}`;
    }
  }

  const isFormData = body instanceof FormData;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  if (!isFormData && body !== undefined)
  {
    headers['Content-Type'] = 'application/json';
  }

  const config: RequestInit = {
    ...restOptions,
    headers,
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  };

  logger.debug(`${config.method?.toUpperCase() || 'GET'} ${endpoint}`);

  try
  {
    const response = await fetch(url, config);

    if (!response.ok)
    {
      let errorMessage = `HTTP ${response.status}`;
      let errorData: unknown;

      try
      {
        errorData = await response.json();
        errorMessage = (errorData as { detail?: string })?.detail || errorMessage;
      } catch
      {
        try
        {
          errorMessage = await response.text() || errorMessage;
        } catch
        {
          // Keep default message
        }
      }

      logger.error('Response error:', {
        url: endpoint,
        method: config.method || 'GET',
        status: response.status,
        data: errorData,
        message: errorMessage,
      });

      throw new ApiError(response.status, errorMessage, errorData);
    }

    logger.debug(`${response.status} ${config.method?.toUpperCase() || 'GET'} ${endpoint}`);

    if (responseType === 'blob')
    {
      return response.blob() as Promise<T>;
    }

    if (response.status === 204 || response.headers.get('content-length') === '0')
    {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  } catch (error)
  {
    if (error instanceof ApiError)
    {
      throw error;
    }

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
