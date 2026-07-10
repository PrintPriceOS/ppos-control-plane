export function normalizeUiError(error: unknown): string {
  if (!error) return 'Unknown error';

  if (typeof error === 'string') return error;

  if (error instanceof Error) {
    return error.message || 'Unknown error';
  }

  if (typeof error === 'object') {
    const candidate = error as any;

    const message =
      candidate?.response?.data?.message ||
      candidate?.response?.data?.error ||
      candidate?.response?.data?.detail ||
      candidate?.data?.message ||
      candidate?.data?.error ||
      candidate?.message ||
      candidate?.error;

    if (message) {
      return typeof message === 'string' ? message : JSON.stringify(message);
    }

    try {
      return JSON.stringify(candidate);
    } catch {
      return 'Unknown object error';
    }
  }

  return String(error);
}
