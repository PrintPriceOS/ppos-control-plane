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
