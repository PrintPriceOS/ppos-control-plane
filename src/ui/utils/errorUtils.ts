export function normalizeUiError(error: unknown, fallbackMessage = 'Ha ocurrido un error inesperado'): string {
  if (error === null || error === undefined) {
    return fallbackMessage;
  }

  // 1. Error already a string
  if (typeof error === 'string') {
    const trimmed = error.trim();
    if (!trimmed) return fallbackMessage;
    // Check if it's a JSON string representing an error object
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return normalizeUiError(parsed, fallbackMessage);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  // 2. Error instance
  if (error instanceof Error) {
    return error.message?.trim() || fallbackMessage;
  }

  // 3. Object representation
  if (typeof error === 'object') {
    const obj = error as any;

    // A. Nested error object: e.g. { error: { code: '...', message: '...' } }
    if (obj.error && typeof obj.error === 'object') {
      const nested = obj.error;
      const nestedMsg =
        (typeof nested.message === 'string' && nested.message.trim()) ||
        (typeof nested.detail === 'string' && nested.detail.trim()) ||
        (typeof nested.description === 'string' && nested.description.trim()) ||
        (typeof nested.error === 'string' && nested.error.trim()) ||
        (typeof nested.code === 'string' && nested.code.trim());
      if (nestedMsg) return nestedMsg;
    }

    // B. Direct message or string fields on top level
    const candidateMsg =
      (typeof obj.message === 'string' && obj.message.trim()) ||
      (typeof obj.error === 'string' && obj.error.trim()) ||
      (typeof obj.detail === 'string' && obj.detail.trim()) ||
      (typeof obj.description === 'string' && obj.description.trim()) ||
      (typeof obj.response?.data?.message === 'string' && obj.response.data.message.trim()) ||
      (typeof obj.response?.data?.error === 'string' && obj.response.data.error.trim()) ||
      (typeof obj.data?.message === 'string' && obj.data.message.trim()) ||
      (typeof obj.data?.error === 'string' && obj.data.error.trim()) ||
      (typeof obj.code === 'string' && obj.code.trim());

    if (candidateMsg) return candidateMsg;

    // Safe fallback: never stringify full body or render objects to user
    return fallbackMessage;
  }

  return fallbackMessage;
}
