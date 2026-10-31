// Phase 161 — Activation Token Redemption Readiness Gate — API Client

import { ActivationTokenRedemptionReadinessRecord, ActivationTokenRedemptionReadinessRule, RedemptionReadinessSignatures } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionReadiness';

const API_BASE = '/api/admin/beta/cohort-intervention-activation-token-redemption-readiness';

export async function getTokenRedemptionReadinessList(): Promise<ActivationTokenRedemptionReadinessRecord[]> {
  const res = await fetch(`${API_BASE}/readiness`);
  if (!res.ok) throw new Error(`Failed to fetch readiness list: ${res.statusText}`);
  return res.json();
}

export async function getTokenRedemptionReadinessDetails(activationTokenRedemptionReadinessId: string): Promise<{ tokenRedemptionReadiness: ActivationTokenRedemptionReadinessRecord; rules: ActivationTokenRedemptionReadinessRule[] }> {
  const res = await fetch(`${API_BASE}/readiness/${activationTokenRedemptionReadinessId}`);
  if (!res.ok) throw new Error(`Failed to fetch readiness details: ${res.statusText}`);
  return res.json();
}

export async function createTokenRedemptionReadiness(activationTokenIssuanceId: string): Promise<{ tokenRedemptionReadiness: ActivationTokenRedemptionReadinessRecord }> {
  const res = await fetch(`${API_BASE}/readiness/from-issuance/${activationTokenIssuanceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' }
  });
  if (!res.ok) throw new Error(`Failed to create readiness draft: ${res.statusText}`);
  return res.json();
}

export async function evaluateTokenRedemptionReadiness(
  activationTokenRedemptionReadinessId: string,
  signatures: RedemptionReadinessSignatures
): Promise<{ success: boolean; blockers: string[] }> {
  const res = await fetch(`${API_BASE}/readiness/${activationTokenRedemptionReadinessId}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' },
    body: JSON.stringify({ signatures })
  });
  if (!res.ok) throw new Error(`Failed to evaluate readiness: ${res.statusText}`);
  return res.json();
}

export async function recordDecision(
  activationTokenRedemptionReadinessId: string,
  decision: 'APPROVE' | 'REJECT',
  rationale: string
): Promise<{ status: string; result: string }> {
  const res = await fetch(`${API_BASE}/readiness/${activationTokenRedemptionReadinessId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' },
    body: JSON.stringify({ decision, rationale })
  });
  if (!res.ok) throw new Error(`Failed to record decision: ${res.statusText}`);
  return res.json();
}

export async function finalizeTokenRedemptionReadiness(activationTokenRedemptionReadinessId: string): Promise<ActivationTokenRedemptionReadinessRecord> {
  const res = await fetch(`${API_BASE}/readiness/${activationTokenRedemptionReadinessId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' }
  });
  if (!res.ok) throw new Error(`Failed to finalize readiness: ${res.statusText}`);
  return res.json();
}
