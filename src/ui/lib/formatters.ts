/**
 * Safe string slicing helper to prevent crashes on undefined/null values.
 * Returns a fallback character if the value is not a string or is empty.
 */
export const short = (value: unknown, length = 8) =>
  typeof value === 'string' && value.length > 0
    ? value.slice(0, length)
    : '—';

/**
 * Ensures a value is an array, returning an empty array if not.
 */
export const safeArray = <T>(value: unknown): T[] => Array.isArray(value) ? value : [];

/**
 * Safe display text formatting helper to prevent direct rendering of objects
 * which triggers React Error #31. Extracts common message/reason strings or outputs JSON.
 */
export function toDisplayText(value: unknown, fallback = 'UNAVAILABLE'): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const anyValue = value as any;
    if (typeof anyValue.message === 'string') return anyValue.message;
    if (typeof anyValue.reason === 'string') return anyValue.reason;
    if (typeof anyValue.error === 'string') return anyValue.error;
    if (typeof anyValue.status === 'string') return anyValue.status;
    try { return JSON.stringify(value); } catch { return fallback; }
  }
  return fallback;
}

/**
 * Safe text helper to ensure string output with fallback.
 */
export const safeText = (value: unknown, fallback = '—'): string =>
  value === null || value === undefined || value === '' ? fallback : String(value);

/**
 * Safe slug generator to prevent crashes on non-string values.
 */
export const safeSlug = (value: unknown, fallback = 'unknown'): string =>
  safeText(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Safe date formatter to prevent 'INVALID DATE' display.
 */
export const safeDate = (value: unknown, fallback = '—'): string => {
  if (!value) return fallback;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleString();
};

/**
 * Safe time-only formatter.
 */
export const safeTime = (value: unknown, fallback = '—'): string => {
  if (!value) return fallback;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleTimeString();
};
