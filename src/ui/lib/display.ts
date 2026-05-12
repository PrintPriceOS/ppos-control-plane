export function toDisplayText(value: unknown, fallback = 'UNAVAILABLE'): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (value instanceof Error) return value.message || fallback;

  if (typeof value === 'object') {
    const v = value as any;
    if (typeof v.message === 'string') return v.message;
    if (typeof v.reason === 'string') return v.reason;
    if (typeof v.error === 'string') return v.error;
    if (typeof v.status === 'string') return v.status;
    if (typeof v.source_status === 'string') return v.source_status;
    try { return JSON.stringify(value); } catch { return fallback; }
  }

  return fallback;
}

export function safeArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
