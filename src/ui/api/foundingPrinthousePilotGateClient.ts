import { adminFetch } from '../lib/adminApi';

const BASE = '/api/admin/production/founding-printhouse-pilot';

export async function getFoundingPrinthousePilotReadiness(params: { pilot_program_id?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.pilot_program_id) qs.set('pilot_program_id', params.pilot_program_id);
  const q = qs.toString();
  return adminFetch(`${BASE}/readiness${q ? `?${q}` : ''}`);
}

export async function createPilotProgram(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/program/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function registerFoundingPrinthouse(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/participant/register`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function approveParticipantForPilot(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/participant/approve`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function suspendParticipant(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/participant/suspend`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function linkInternalPilotOrder(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/order/link`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getOrderHandoffReadiness(params: { order_link_id: string }) {
  return adminFetch(`${BASE}/order-handoff-readiness?order_link_id=${encodeURIComponent(params.order_link_id)}`);
}

export async function submitPrinthouseReview(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/review`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordPilotFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolvePilotFinding(payload: Record<string, unknown>) {
  return adminFetch(`${BASE}/resolve-finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getFoundingPrinthousePilotAuditTimeline(params: { pilot_program_id: string; participant_id?: string }) {
  const qs = new URLSearchParams();
  qs.set('pilot_program_id', params.pilot_program_id);
  if (params.participant_id) qs.set('participant_id', params.participant_id);
  return adminFetch(`${BASE}/audit-timeline?${qs.toString()}`);
}

export async function getFoundingPrinthousePilotEvidencePack(params: { pilot_program_id: string; participant_id?: string }) {
  const qs = new URLSearchParams();
  qs.set('pilot_program_id', params.pilot_program_id);
  if (params.participant_id) qs.set('participant_id', params.participant_id);
  return adminFetch(`${BASE}/evidence-pack?${qs.toString()}`);
}
