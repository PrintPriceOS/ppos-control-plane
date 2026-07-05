// Phase 159 — Activation Token Issuance Preflight Gate — API Client

import { ActivationTokenPreflightRecord, ActivationTokenPreflightRule, PreflightSignatures } from './controlledBetaCohortInterventionExecutionPlanActivationTokenPreflight';

const API_BASE = '/api/admin/beta/cohort-intervention-activation-token-preflight';

export async function getTokenPreflightList(): Promise<ActivationTokenPreflightRecord[]> {
  const res = await fetch(`${API_BASE}/preflight`);
  if (!res.ok) throw new Error(`Failed to fetch preflight list: ${res.statusText}`);
  return res.json();
}

export async function getTokenPreflightDetails(activationTokenPreflightId: string): Promise<{ tokenPreflight: ActivationTokenPreflightRecord; rules: ActivationTokenPreflightRule[] }> {
  const res = await fetch(`${API_BASE}/preflight/${activationTokenPreflightId}`);
  if (!res.ok) throw new Error(`Failed to fetch preflight details: ${res.statusText}`);
  return res.json();
}

export async function createTokenPreflight(activationTokenStagingId: string): Promise<{ tokenPreflight: ActivationTokenPreflightRecord }> {
  const res = await fetch(`${API_BASE}/preflight/from-staging/${activationTokenStagingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' }
  });
  if (!res.ok) throw new Error(`Failed to create preflight draft: ${res.statusText}`);
  return res.json();
}

export async function evaluateTokenPreflight(
  activationTokenPreflightId: string,
  signatures: PreflightSignatures
): Promise<{ success: boolean; blockers: string[] }> {
  const res = await fetch(`${API_BASE}/preflight/${activationTokenPreflightId}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' },
    body: JSON.stringify({ signatures })
  });
  if (!res.ok) throw new Error(`Failed to evaluate preflight: ${res.statusText}`);
  return res.json();
}

export async function recordDecision(
  activationTokenPreflightId: string,
  decision: 'APPROVE' | 'REJECT',
  rationale: string
): Promise<{ status: string; result: string }> {
  const res = await fetch(`${API_BASE}/preflight/${activationTokenPreflightId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' },
    body: JSON.stringify({ decision, rationale })
  });
  if (!res.ok) throw new Error(`Failed to record decision: ${res.statusText}`);
  return res.json();
}

export async function finalizeTokenPreflight(activationTokenPreflightId: string): Promise<ActivationTokenPreflightRecord> {
  const res = await fetch(`${API_BASE}/preflight/${activationTokenPreflightId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' }
  });
  if (!res.ok) throw new Error(`Failed to finalize preflight: ${res.statusText}`);
  return res.json();
}
