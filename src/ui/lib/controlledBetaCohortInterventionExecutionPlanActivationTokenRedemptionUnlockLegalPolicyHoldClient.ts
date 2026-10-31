import { TokenRedemptionUnlockLegalPolicyHold, RuleResult, AuditLog } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHold';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldClient {
  private static getHeaders(actorId: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-actor-id': actorId
    };
  }

  static async getUnlockLegalPolicyHoldList(actorId = 'admin'): Promise<TokenRedemptionUnlockLegalPolicyHold[]> {
    const res = await fetch('/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-legal-policy-hold', {
      headers: this.getHeaders(actorId)
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    const data = await res.json();
    return data.tokenRedemptionUnlockLegalPolicyHolds || [];
  }

  static async getUnlockLegalPolicyHoldDetails(
    unlockLegalPolicyHoldId: string,
    actorId = 'admin'
  ): Promise<{
    tokenRedemptionUnlockLegalPolicyHold: TokenRedemptionUnlockLegalPolicyHold;
    rules: RuleResult[];
    auditLogs: AuditLog[];
  }> {
    const res = await fetch(`/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-legal-policy-hold/${unlockLegalPolicyHoldId}`, {
      headers: this.getHeaders(actorId)
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async createUnlockLegalPolicyHold(
    unlockRiskOfficerCountersignId: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockLegalPolicyHold: TokenRedemptionUnlockLegalPolicyHold }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-legal-policy-hold/from-unlock-risk-officer-countersign/${unlockRiskOfficerCountersignId}`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async evaluateUnlockLegalPolicyHold(
    unlockLegalPolicyHoldId: string,
    confirmations: Record<string, boolean>,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockLegalPolicyHold: TokenRedemptionUnlockLegalPolicyHold; rules: RuleResult[] }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-legal-policy-hold/${unlockLegalPolicyHoldId}/evaluate`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId),
        body: JSON.stringify({ confirmations })
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async recordDecision(
    unlockLegalPolicyHoldId: string,
    payload: {
      decision: string;
      rationale: string;
      legal_policy_officer_id: string;
      legal_policy_officer_role: string;
      reason: string;
    },
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockLegalPolicyHold: TokenRedemptionUnlockLegalPolicyHold }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-legal-policy-hold/${unlockLegalPolicyHoldId}/decision`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId),
        body: JSON.stringify(payload)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async finalizeUnlockLegalPolicyHold(
    unlockLegalPolicyHoldId: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockLegalPolicyHold: TokenRedemptionUnlockLegalPolicyHold }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-legal-policy-hold/${unlockLegalPolicyHoldId}/finalize`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }
}
