// Phase 162 — Activation Token Redemption Authorization Gate — API Client

import { ActivationTokenRedemptionAuthRecord, ActivationTokenRedemptionAuthRule, RedemptionAuthSignatures } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionAuthorization';

const API_BASE = '/api/admin/beta/cohort-intervention-activation-token-redemption-authorization';

export async function getTokenRedemptionAuthList(): Promise<ActivationTokenRedemptionAuthRecord[]> {
  const res = await fetch(`${API_BASE}/authorization`);
  if (!res.ok) throw new Error(`Failed to fetch auth list: ${res.statusText}`);
  return res.json();
}

export async function getTokenRedemptionAuthDetails(activationTokenRedemptionAuthId: string): Promise<{ tokenRedemptionAuth: ActivationTokenRedemptionAuthRecord; rules: ActivationTokenRedemptionAuthRule[] }> {
  const res = await fetch(`${API_BASE}/authorization/${activationTokenRedemptionAuthId}`);
  if (!res.ok) throw new Error(`Failed to fetch auth details: ${res.statusText}`);
  return res.json();
}

export async function createTokenRedemptionAuth(activationTokenRedemptionReadinessId: string): Promise<{ tokenRedemptionAuth: ActivationTokenRedemptionAuthRecord }> {
  const res = await fetch(`${API_BASE}/authorization/from-readiness/${activationTokenRedemptionReadinessId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' }
  });
  if (!res.ok) throw new Error(`Failed to create auth draft: ${res.statusText}`);
  return res.json();
}

export async function evaluateTokenRedemptionAuth(
  activationTokenRedemptionAuthId: string,
  signatures: RedemptionAuthSignatures
): Promise<{ success: boolean; blockers: string[] }> {
  const res = await fetch(`${API_BASE}/authorization/${activationTokenRedemptionAuthId}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' },
    body: JSON.stringify({ signatures })
  });
  if (!res.ok) throw new Error(`Failed to evaluate auth: ${res.statusText}`);
  return res.json();
}

export async function recordDecision(
  activationTokenRedemptionAuthId: string,
  decision: 'APPROVE' | 'REJECT',
  rationale: string
): Promise<{ status: string; result: string }> {
  const res = await fetch(`${API_BASE}/authorization/${activationTokenRedemptionAuthId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' },
    body: JSON.stringify({ decision, rationale })
  });
  if (!res.ok) throw new Error(`Failed to record decision: ${res.statusText}`);
  return res.json();
}

export async function finalizeTokenRedemptionAuth(activationTokenRedemptionAuthId: string): Promise<ActivationTokenRedemptionAuthRecord> {
  const res = await fetch(`${API_BASE}/authorization/${activationTokenRedemptionAuthId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' }
  });
  if (!res.ok) throw new Error(`Failed to finalize auth: ${res.statusText}`);
  return res.json();
}
