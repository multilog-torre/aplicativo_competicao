const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';
const TOKEN_KEY = 'torre_access_token';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string; details?: unknown };
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  isFormData?: boolean;
  skipAuth?: boolean;
}

/** Disparado quando o backend responde 401 — o AuthContext escuta este evento para deslogar. */
export const AUTH_EXPIRED_EVENT = 'torre:auth-expired';

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token && !options.skipAuth) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.isFormData) {
      body = options.body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  let payload: ApiEnvelope<T>;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError('Resposta inválida do servidor.', 'INVALID_RESPONSE', res.status);
  }

  if (res.status === 401 && !options.skipAuth) {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }

  if (!payload.success) {
    throw new ApiError(
      payload.error?.message ?? 'Ocorreu um erro inesperado.',
      payload.error?.code ?? 'UNKNOWN_ERROR',
      res.status,
      payload.error?.details,
    );
  }

  return { data: payload.data as T, meta: payload.meta };
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, isFormData = false) => apiRequest<T>(path, { method: 'POST', body, isFormData }),
  patch: <T>(path: string, body?: unknown, isFormData = false) => apiRequest<T>(path, { method: 'PATCH', body, isFormData }),
  put: <T>(path: string, body?: unknown, isFormData = false) => apiRequest<T>(path, { method: 'PUT', body, isFormData }),
  delete: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'DELETE', body }),
};

export function apiFileUrl(path: string): string {
  return `${API_URL}${path}`;
}

export { API_URL };
