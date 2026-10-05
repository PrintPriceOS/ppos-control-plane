import { getAuthToken, clearAuthToken } from '../lib/authStore';

export async function authenticatedBetaFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T & { ok: boolean; status?: number; error?: any }> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers as any || {})
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    let jsonBody: any = null;
    const contentType = res.headers?.get?.('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        jsonBody = await res.json();
      } catch {
        jsonBody = null;
      }
    } else {
      try {
        const text = await res.text();
        if (text) {
          try {
            jsonBody = JSON.parse(text);
          } catch {
            jsonBody = { message: text };
          }
        }
      } catch {
        jsonBody = null;
      }
    }

    // HTTP 401: Unauthorized (missing or expired session)
    if (res.status === 401) {
      clearAuthToken();
      return {
        ok: false,
        status: 401,
        ...(jsonBody && typeof jsonBody === 'object' ? jsonBody : {}),
        error: jsonBody?.error || jsonBody || { code: 'UNAUTHORIZED', message: 'Sesión ausente o expirada. Por favor, inicie sesión.' }
      } as any;
    }

    // HTTP 403: Forbidden (insufficient permissions)
    if (res.status === 403) {
      return {
        ok: false,
        status: 403,
        ...(jsonBody && typeof jsonBody === 'object' ? jsonBody : {}),
        error: jsonBody?.error || jsonBody || { code: 'FORBIDDEN', message: 'No tiene permisos suficientes para realizar esta acción.' }
      } as any;
    }

    // Other non-2xx errors (e.g. 500)
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        ...(jsonBody && typeof jsonBody === 'object' ? jsonBody : {}),
        error: jsonBody?.error || jsonBody || { code: `HTTP_${res.status}`, message: `Error en el servidor (HTTP ${res.status})` }
      } as any;
    }

    return (jsonBody ?? { ok: true, status: res.status }) as any;
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      error: { code: 'NETWORK_ERROR', message: err?.message || 'Error de conexión de red.' }
    } as any;
  }
}
