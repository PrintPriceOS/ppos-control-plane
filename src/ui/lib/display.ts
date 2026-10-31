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
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const v = value as any;
    if (Array.isArray(v.data)) return v.data;
    if (Array.isArray(v.events)) return v.events;
    if (Array.isArray(v.audit)) return v.audit;
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.dispatches)) return v.dispatches;
    if (Array.isArray(v.blocks)) return v.blocks;
    if (Array.isArray(v.anomalies)) return v.anomalies;
    if (Array.isArray(v.notifications)) return v.notifications;
    if (Array.isArray(v.capacity)) return v.capacity;
    if (Array.isArray(v.snapshots)) return v.snapshots;
    if (Array.isArray(v.forecasts)) return v.forecasts;
    if (Array.isArray(v.runs)) return v.runs;
    if (Array.isArray(v.projections)) return v.projections;
    if (Array.isArray(v.machines)) return v.machines;
    if (Array.isArray(v.history)) return v.history;
    if (Array.isArray(v.cycles)) return v.cycles;
    if (Array.isArray(v.resilience)) return v.resilience;
    if (Array.isArray(v.nodes)) return v.nodes;
  }
  return [];
}

export function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
