// Phase 164 — Activation Token Redemption Final Approval Gate — API Client

import { ActivationTokenRedemptionFinalApprovalRecord, ActivationTokenRedemptionFinalApprovalRule, RedemptionFinalApprovalSignatures } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionFinalApproval';

const API_BASE = '/api/admin/beta/cohort-intervention-activation-token-redemption-final-approval';

export async function getTokenRedemptionFinalApprovalList(): Promise<ActivationTokenRedemptionFinalApprovalRecord[]> {
  const res = await fetch(`${API_BASE}/approval`);
  if (!res.ok) throw new Error(`Failed to fetch final approval list: ${res.statusText}`);
  return res.json();
}

export async function getTokenRedemptionFinalApprovalDetails(activationTokenRedemptionFinalApvId: string): Promise<{ tokenRedemptionFinalApproval: ActivationTokenRedemptionFinalApprovalRecord; rules: ActivationTokenRedemptionFinalApprovalRule[] }> {
  const res = await fetch(`${API_BASE}/approval/${activationTokenRedemptionFinalApvId}`);
  if (!res.ok) throw new Error(`Failed to fetch final approval details: ${res.statusText}`);
  return res.json();
}

export async function createTokenRedemptionFinalApproval(activationTokenRedemptionEnvId: string): Promise<{ tokenRedemptionFinalApproval: ActivationTokenRedemptionFinalApprovalRecord }> {
  const res = await fetch(`${API_BASE}/approval/from-env/${activationTokenRedemptionEnvId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' }
  });
  if (!res.ok) throw new Error(`Failed to create final approval draft: ${res.statusText}`);
  return res.json();
}

export async function evaluateTokenRedemptionFinalApproval(
  activationTokenRedemptionFinalApvId: string,
  signatures: RedemptionFinalApprovalSignatures
): Promise<{ success: boolean; blockers: string[] }> {
  const res = await fetch(`${API_BASE}/approval/${activationTokenRedemptionFinalApvId}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' },
    body: JSON.stringify({ signatures })
  });
  if (!res.ok) throw new Error(`Failed to evaluate final approval: ${res.statusText}`);
  return res.json();
}

export async function recordDecision(
  activationTokenRedemptionFinalApvId: string,
  decision: 'APPROVE' | 'REJECT',
  rationale: string
): Promise<{ status: string; result: string }> {
  const res = await fetch(`${API_BASE}/approval/${activationTokenRedemptionFinalApvId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' },
    body: JSON.stringify({ decision, rationale })
  });
  if (!res.ok) throw new Error(`Failed to record decision: ${res.statusText}`);
  return res.json();
}

export async function finalizeTokenRedemptionFinalApproval(activationTokenRedemptionFinalApvId: string): Promise<ActivationTokenRedemptionFinalApprovalRecord> {
  const res = await fetch(`${API_BASE}/approval/${activationTokenRedemptionFinalApvId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-id': 'admin' }
  });
  if (!res.ok) throw new Error(`Failed to finalize final approval: ${res.statusText}`);
  return res.json();
}
