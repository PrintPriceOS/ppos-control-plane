import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSeal } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSeal';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealClient {
  private static getHeaders(actorId: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-actor-id': actorId
    };
  }

  static async getUnlockFinalNonExecutionEvidenceSealList(actorId = 'admin'): Promise<ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSeal[]> {
    const res = await fetch('/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-final-non-execution-evidence-seal', {
      headers: this.getHeaders(actorId)
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    const data = await res.json();
    return data.tokenRedemptionUnlockFinalNonExecutionEvidenceSeals || [];
  }

  static async getUnlockFinalNonExecutionEvidenceSealDetails(
    unlockFinalNonExecutionEvidenceSealId: string,
    actorId = 'admin'
  ): Promise<{
    tokenRedemptionUnlockFinalNonExecutionEvidenceSeal: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSeal;
    rules: any[];
    auditLogs: any[];
  }> {
    const res = await fetch(`/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-final-non-execution-evidence-seal/${unlockFinalNonExecutionEvidenceSealId}`, {
      headers: this.getHeaders(actorId)
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async createUnlockFinalNonExecutionEvidenceSeal(
    unlockKillSwitchDryRunId: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockFinalNonExecutionEvidenceSeal: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSeal }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-final-non-execution-evidence-seal/from-unlock-kill-switch-dry-run/${unlockKillSwitchDryRunId}`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async evaluateUnlockFinalNonExecutionEvidenceSeal(
    unlockFinalNonExecutionEvidenceSealId: string,
    confirmations: Record<string, boolean>,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockFinalNonExecutionEvidenceSeal: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSeal; rules: any[] }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-final-non-execution-evidence-seal/${unlockFinalNonExecutionEvidenceSealId}/evaluate`,
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
    unlockFinalNonExecutionEvidenceSealId: string,
    decision: 'APPROVE_FINAL_NON_EXECUTION_EVIDENCE_SEAL' | 'REJECT_FINAL_NON_EXECUTION_EVIDENCE_SEAL',
    rationale: string,
    evidence_seal_officer_id: string,
    evidence_seal_officer_role: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockFinalNonExecutionEvidenceSeal: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSeal }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-final-non-execution-evidence-seal/${unlockFinalNonExecutionEvidenceSealId}/decision`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId),
        body: JSON.stringify({
          decision,
          rationale,
          evidence_seal_officer_id,
          evidence_seal_officer_role,
          reason: rationale
        })
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async finalizeUnlockFinalNonExecutionEvidenceSeal(
    unlockFinalNonExecutionEvidenceSealId: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockFinalNonExecutionEvidenceSeal: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSeal }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-final-non-execution-evidence-seal/${unlockFinalNonExecutionEvidenceSealId}/finalize`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }
}
