// Phase 165 — API Client for Activation Token Redemption Lock / Pre-Redemption Freeze Gate

import { ActivationTokenRedemptionLockRecord, ActivationTokenRedemptionLockRule, RedemptionLockSignatures } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionLock';

const BASE = '/api/admin/beta/cohort-intervention-activation-token-redemption-lock';

export async function getTokenRedemptionLockList(): Promise<ActivationTokenRedemptionLockRecord[]> {
  const res = await fetch(BASE, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTokenRedemptionLockDetails(activationTokenRedemptionLockId: string): Promise<{ tokenRedemptionLock: ActivationTokenRedemptionLockRecord; rules: ActivationTokenRedemptionLockRule[] }> {
  const res = await fetch(`${BASE}/${activationTokenRedemptionLockId}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createTokenRedemptionLock(activationTokenRedemptionFinalApvId: string): Promise<{ tokenRedemptionLock: ActivationTokenRedemptionLockRecord }> {
  const res = await fetch(`${BASE}/from-final-approval/${activationTokenRedemptionFinalApvId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function evaluateTokenRedemptionLock(
  activationTokenRedemptionLockId: string,
  signatures: RedemptionLockSignatures
): Promise<ActivationTokenRedemptionLockRecord> {
  const res = await fetch(`${BASE}/${activationTokenRedemptionLockId}/evaluate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(signatures)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function recordDecision(
  activationTokenRedemptionLockId: string,
  decision: 'APPROVE' | 'REJECT',
  rationale: string
): Promise<ActivationTokenRedemptionLockRecord> {
  const res = await fetch(`${BASE}/${activationTokenRedemptionLockId}/decision`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ decision, rationale })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function finalizeTokenRedemptionLock(activationTokenRedemptionLockId: string): Promise<ActivationTokenRedemptionLockRecord> {
  const res = await fetch(`${BASE}/${activationTokenRedemptionLockId}/finalize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
