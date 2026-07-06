// Phase 163 — Activation Token Redemption Envelope Gate — API Client

import { ActivationTokenRedemptionEnvelopeRecord, ActivationTokenRedemptionEnvelopeRule, RedemptionEnvelopeSignatures } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionEnvelope';

const API_BASE = '/api/admin/beta/cohort-intervention-activation-token-redemption-envelope';

export async function getTokenRedemptionEnvelopeList(): Promise<ActivationTokenRedemptionEnvelopeRecord[]> {
  const res = await fetch(`${API_BASE}/envelope`);
  if (!res.ok) throw new Error(`Failed to fetch envelope list: ${res.statusText}`);
  return res.json();
}

export async function getTokenRedemptionEnvelopeDetails(activationTokenRedemptionEnvelopeId: string): Promise<{ tokenRedemptionEnvelope: ActivationTokenRedemptionEnvelopeRecord; rules: ActivationTokenRedemptionEnvelopeRule[] }> {
  const res = await fetch(`${API_BASE}/envelope/${activationTokenRedemptionEnvelopeId}`);
  if (!res.ok) throw new Error(`Failed to fetch envelope details: ${res.statusText}`);
  return res.json();
}

export async function createTokenRedemptionEnvelope(activationTokenRedemptionAuthId: string): Promise<{ tokenRedemptionEnvelope: ActivationTokenRedemptionEnvelopeRecord }> {
  const res = await fetch(`${API_BASE}/envelope/from-auth/${activationTokenRedemptionAuthId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' }
  });
  if (!res.ok) throw new Error(`Failed to create envelope draft: ${res.statusText}`);
  return res.json();
}

export async function evaluateTokenRedemptionEnvelope(
  activationTokenRedemptionEnvelopeId: string,
  signatures: RedemptionEnvelopeSignatures
): Promise<{ success: boolean; blockers: string[] }> {
  const res = await fetch(`${API_BASE}/envelope/${activationTokenRedemptionEnvelopeId}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' },
    body: JSON.stringify({ signatures })
  });
  if (!res.ok) throw new Error(`Failed to evaluate envelope: ${res.statusText}`);
  return res.json();
}

export async function recordDecision(
  activationTokenRedemptionEnvelopeId: string,
  decision: 'APPROVE' | 'REJECT',
  rationale: string
): Promise<{ status: string; result: string }> {
  const res = await fetch(`${API_BASE}/envelope/${activationTokenRedemptionEnvelopeId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' },
    body: JSON.stringify({ decision, rationale })
  });
  if (!res.ok) throw new Error(`Failed to record decision: ${res.statusText}`);
  return res.json();
}

export async function finalizeTokenRedemptionEnvelope(activationTokenRedemptionEnvelopeId: string): Promise<ActivationTokenRedemptionEnvelopeRecord> {
  const res = await fetch(`${API_BASE}/envelope/${activationTokenRedemptionEnvelopeId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' }
  });
  if (!res.ok) throw new Error(`Failed to finalize envelope: ${res.statusText}`);
  return res.json();
}
