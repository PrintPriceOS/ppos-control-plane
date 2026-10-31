// Phase 166 — API Client for Activation Token Redemption Unlock Eligibility Gate

import { ActivationTokenRedemptionUnlockEligibilityRecord, ActivationTokenRedemptionUnlockEligibilityRule, UnlockEligibilitySignatures } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibility';

const BASE = '/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-eligibility';

export async function getUnlockEligibilityList(): Promise<ActivationTokenRedemptionUnlockEligibilityRecord[]> {
  const res = await fetch(BASE, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getUnlockEligibilityDetails(unlockEligibilityId: string): Promise<ActivationTokenRedemptionUnlockEligibilityRecord> {
  const res = await fetch(`${BASE}/${unlockEligibilityId}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createUnlockEligibility(redemptionLockId: string): Promise<{ tokenRedemptionUnlockEligibility: ActivationTokenRedemptionUnlockEligibilityRecord }> {
  const res = await fetch(`${BASE}/from-redemption-lock/${redemptionLockId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function evaluateUnlockEligibility(
  unlockEligibilityId: string,
  signatures: UnlockEligibilitySignatures
): Promise<{ tokenRedemptionUnlockEligibility: ActivationTokenRedemptionUnlockEligibilityRecord }> {
  const res = await fetch(`${BASE}/${unlockEligibilityId}/evaluate`, {
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
  unlockEligibilityId: string,
  decision: 'APPROVE' | 'REJECT',
  rationale: string
): Promise<ActivationTokenRedemptionUnlockEligibilityRecord> {
  const res = await fetch(`${BASE}/${unlockEligibilityId}/decision`, {
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

export async function finalizeUnlockEligibility(unlockEligibilityId: string): Promise<{ tokenRedemptionUnlockEligibility: ActivationTokenRedemptionUnlockEligibilityRecord }> {
  const res = await fetch(`${BASE}/${unlockEligibilityId}/finalize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
