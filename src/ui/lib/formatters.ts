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
