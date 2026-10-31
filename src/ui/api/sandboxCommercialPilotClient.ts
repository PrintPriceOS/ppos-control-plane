import { adminFetch } from '../lib/adminApi';

const BASE = '/api/admin/production/sandbox-commercial-pilot';

export async function getSandboxCommercialReadiness(params: { sandbox_run_id?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.sandbox_run_id) qs.set('sandbox_run_id', params.sandbox_run_id);
  const q = qs.toString();
  return adminFetch(`${BASE}/readiness${q ? `?${q}` : ''}`);
}

export async function createSandboxCommercialRun(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function buildInvoicePreview(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/invoice-preview`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function simulatePaymentIntent(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/simulate-payment`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function simulateRefundScenario(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/simulate-refund`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function simulatePayoutScenario(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/simulate-payout`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function buildSettlementPreview(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/settlement-preview`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function submitPrinthouseCommercialConfirmation(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/printhouse-confirmation`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordCommercialFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolveCommercialFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/resolve-finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getCommercialAuditTimeline(params: { sandbox_run_id: string }) {
  const qs = new URLSearchParams();
  qs.set('sandbox_run_id', params.sandbox_run_id);
  return adminFetch(`${BASE}/audit-timeline?${qs.toString()}`);
}

export async function getCommercialEvidencePack(params: { sandbox_run_id: string }) {
  const qs = new URLSearchParams();
  qs.set('sandbox_run_id', params.sandbox_run_id);
  return adminFetch(`${BASE}/evidence-pack?${qs.toString()}`);
}
