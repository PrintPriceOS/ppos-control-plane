import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosure } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosure';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureClient {
  private static getHeaders(actorId: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-actor-id': actorId
    };
  }

  static async getUnlockGovernanceReadinessClosureList(actorId = 'admin'): Promise<ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosure[]> {
    const res = await fetch('/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-governance-readiness-closure', {
      headers: this.getHeaders(actorId)
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    const data = await res.json();
    return data.tokenRedemptionUnlockGovernanceReadinessClosures || [];
  }

  static async getUnlockGovernanceReadinessClosureDetails(
    unlockGovernanceReadinessClosureId: string,
    actorId = 'admin'
  ): Promise<{
    tokenRedemptionUnlockGovernanceReadinessClosure: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosure;
    rules: any[];
    auditLogs: any[];
  }> {
    const res = await fetch(`/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-governance-readiness-closure/${unlockGovernanceReadinessClosureId}`, {
      headers: this.getHeaders(actorId)
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async createUnlockGovernanceReadinessClosure(
    unlockFinalNonExecutionEvidenceSealId: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockGovernanceReadinessClosure: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosure }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-governance-readiness-closure/from-unlock-final-non-execution-evidence-seal/${unlockFinalNonExecutionEvidenceSealId}`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async evaluateUnlockGovernanceReadinessClosure(
    unlockGovernanceReadinessClosureId: string,
    confirmations: Record<string, boolean>,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockGovernanceReadinessClosure: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosure; rules: any[] }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-governance-readiness-closure/${unlockGovernanceReadinessClosureId}/evaluate`,
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
    unlockGovernanceReadinessClosureId: string,
    decision: 'APPROVE_GOVERNANCE_READINESS_CLOSURE' | 'REJECT_GOVERNANCE_READINESS_CLOSURE',
    rationale: string,
    governance_closure_officer_id: string,
    governance_closure_officer_role: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockGovernanceReadinessClosure: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosure }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-governance-readiness-closure/${unlockGovernanceReadinessClosureId}/decision`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId),
        body: JSON.stringify({
          decision,
          rationale,
          governance_closure_officer_id,
          governance_closure_officer_role,
          reason: rationale
        })
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async finalizeUnlockGovernanceReadinessClosure(
    unlockGovernanceReadinessClosureId: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockGovernanceReadinessClosure: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosure }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-governance-readiness-closure/${unlockGovernanceReadinessClosureId}/finalize`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }
}
