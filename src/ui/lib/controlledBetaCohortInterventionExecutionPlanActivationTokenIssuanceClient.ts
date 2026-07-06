// Phase 160 — Activation Token Issuance Gate — API Client

import { ActivationTokenIssuanceRecord, ActivationTokenIssuanceRule, IssuanceSignatures } from './controlledBetaCohortInterventionExecutionPlanActivationTokenIssuance';

const API_BASE = '/api/admin/beta/cohort-intervention-activation-token-issuance';

export async function getTokenIssuanceList(): Promise<ActivationTokenIssuanceRecord[]> {
  const res = await fetch(`${API_BASE}/issuance`);
  if (!res.ok) throw new Error(`Failed to fetch issuance list: ${res.statusText}`);
  return res.json();
}

export async function getTokenIssuanceDetails(activationTokenIssuanceId: string): Promise<{ tokenIssuance: ActivationTokenIssuanceRecord; rules: ActivationTokenIssuanceRule[] }> {
  const res = await fetch(`${API_BASE}/issuance/${activationTokenIssuanceId}`);
  if (!res.ok) throw new Error(`Failed to fetch issuance details: ${res.statusText}`);
  return res.json();
}

export async function createTokenIssuance(activationTokenPreflightId: string): Promise<{ tokenIssuance: ActivationTokenIssuanceRecord }> {
  const res = await fetch(`${API_BASE}/issuance/from-preflight/${activationTokenPreflightId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' }
  });
  if (!res.ok) throw new Error(`Failed to create issuance draft: ${res.statusText}`);
  return res.json();
}

export async function evaluateTokenIssuance(
  activationTokenIssuanceId: string,
  signatures: IssuanceSignatures
): Promise<{ success: boolean; blockers: string[] }> {
  const res = await fetch(`${API_BASE}/issuance/${activationTokenIssuanceId}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' },
    body: JSON.stringify({ signatures })
  });
  if (!res.ok) throw new Error(`Failed to evaluate issuance: ${res.statusText}`);
  return res.json();
}

export async function recordDecision(
  activationTokenIssuanceId: string,
  decision: 'APPROVE' | 'REJECT',
  rationale: string
): Promise<{ status: string; result: string }> {
  const res = await fetch(`${API_BASE}/issuance/${activationTokenIssuanceId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' },
    body: JSON.stringify({ decision, rationale })
  });
  if (!res.ok) throw new Error(`Failed to record decision: ${res.statusText}`);
  return res.json();
}

export async function finalizeTokenIssuance(activationTokenIssuanceId: string): Promise<ActivationTokenIssuanceRecord> {
  const res = await fetch(`${API_BASE}/issuance/${activationTokenIssuanceId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' }
  });
  if (!res.ok) throw new Error(`Failed to finalize issuance: ${res.statusText}`);
  return res.json();
}
