import { TokenRedemptionUnlockRiskOfficerCountersign, RuleResult, AuditLog } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersign';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignClient {
  private static getHeaders(actorId: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-actor-id': actorId
    };
  }

  static async getUnlockRiskOfficerCountersignList(actorId = 'admin'): Promise<TokenRedemptionUnlockRiskOfficerCountersign[]> {
    const res = await fetch('/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-risk-officer-countersign', {
      headers: this.getHeaders(actorId)
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    const data = await res.json();
    return data.tokenRedemptionUnlockRiskOfficerCountersigns || [];
  }

  static async getUnlockRiskOfficerCountersignDetails(
    unlockRiskOfficerCountersignId: string,
    actorId = 'admin'
  ): Promise<{
    tokenRedemptionUnlockRiskOfficerCountersign: TokenRedemptionUnlockRiskOfficerCountersign;
    rules: RuleResult[];
    auditLogs: AuditLog[];
  }> {
    const res = await fetch(`/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-risk-officer-countersign/${unlockRiskOfficerCountersignId}`, {
      headers: this.getHeaders(actorId)
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async createUnlockRiskOfficerCountersign(
    unlockComplianceWitnessId: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockRiskOfficerCountersign: TokenRedemptionUnlockRiskOfficerCountersign }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-risk-officer-countersign/from-unlock-compliance-witness/${unlockComplianceWitnessId}`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async evaluateUnlockRiskOfficerCountersign(
    unlockRiskOfficerCountersignId: string,
    confirmations: Record<string, boolean>,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockRiskOfficerCountersign: TokenRedemptionUnlockRiskOfficerCountersign; rules: RuleResult[] }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-risk-officer-countersign/${unlockRiskOfficerCountersignId}/evaluate`,
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
    unlockRiskOfficerCountersignId: string,
    payload: {
      decision: string;
      rationale: string;
      risk_officer_id: string;
      risk_officer_role: string;
      reason: string;
    },
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockRiskOfficerCountersign: TokenRedemptionUnlockRiskOfficerCountersign }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-risk-officer-countersign/${unlockRiskOfficerCountersignId}/decision`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId),
        body: JSON.stringify(payload)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async finalizeUnlockRiskOfficerCountersign(
    unlockRiskOfficerCountersignId: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockRiskOfficerCountersign: TokenRedemptionUnlockRiskOfficerCountersign }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-risk-officer-countersign/${unlockRiskOfficerCountersignId}/finalize`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }
}
