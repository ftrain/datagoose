const API_BASE = '/api';

export interface User {
  id: number;
  email: string;
  username: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface AuthError {
  error: { message: string; code?: string };
}

// Store access token in memory (not localStorage for security)
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export async function register(email: string, username: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, username, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || 'Registration failed');
  }

  setAccessToken(data.accessToken);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || 'Login failed');
  }

  setAccessToken(data.accessToken);
  return data;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });

  setAccessToken(null);
}

export async function refreshToken(): Promise<AuthResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      setAccessToken(null);
      return null;
    }

    const data = await res.json();
    setAccessToken(data.accessToken);
    return data;
  } catch {
    setAccessToken(null);
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const token = getAccessToken();
  if (!token) {
    // Try to refresh
    const refreshed = await refreshToken();
    if (!refreshed) return null;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
      credentials: 'include',
    });

    if (!res.ok) {
      if (res.status === 401) {
        // Try refresh once
        const refreshed = await refreshToken();
        if (refreshed) {
          return refreshed.user;
        }
      }
      return null;
    }

    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || 'Failed to send reset email');
  }

  return data;
}

export async function resetPassword(token: string, password: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || 'Failed to reset password');
  }

  return data;
}

// Helper for authenticated API calls
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // If unauthorized, try to refresh token and retry once
  if (res.status === 401) {
    const data = await res.json();
    if (data.error?.code === 'TOKEN_EXPIRED') {
      const refreshed = await refreshToken();
      if (refreshed) {
        headers.set('Authorization', `Bearer ${getAccessToken()}`);
        res = await fetch(url, {
          ...options,
          headers,
          credentials: 'include',
        });
      }
    }
  }

  return res;
}
