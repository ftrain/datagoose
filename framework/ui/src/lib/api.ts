/**
 * Generic API Client Factory
 *
 * Creates typed API clients for React applications.
 */

export interface ApiClientConfig {
  /** Base URL for API requests */
  baseUrl: string;
  /** Default headers to include in all requests */
  defaultHeaders?: Record<string, string>;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Handle API response
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Create an API client
 */
export function createApiClient(config: ApiClientConfig) {
  const { baseUrl, defaultHeaders = {}, timeout = 30000 } = config;

  async function request<T>(
    method: string,
    path: string,
    options: RequestOptions & { body?: unknown } = {}
  ): Promise<T> {
    const { headers = {}, signal, body } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...defaultHeaders,
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: signal || controller.signal,
      });

      return handleResponse<T>(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    get: <T>(path: string, options?: RequestOptions) =>
      request<T>('GET', path, options),

    post: <T>(path: string, body: unknown, options?: RequestOptions) =>
      request<T>('POST', path, { ...options, body }),

    put: <T>(path: string, body: unknown, options?: RequestOptions) =>
      request<T>('PUT', path, { ...options, body }),

    patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
      request<T>('PATCH', path, { ...options, body }),

    delete: <T>(path: string, options?: RequestOptions) =>
      request<T>('DELETE', path, options),
  };
}

/**
 * Build query string from params object
 */
export function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}
