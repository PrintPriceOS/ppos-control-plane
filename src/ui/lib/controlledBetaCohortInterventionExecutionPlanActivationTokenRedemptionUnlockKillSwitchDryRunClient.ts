import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRun } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRun';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunClient {
  private static getHeaders(actorId: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-actor-id': actorId
    };
  }

  static async getUnlockKillSwitchDryRunList(actorId = 'admin'): Promise<ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRun[]> {
    const res = await fetch('/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-kill-switch-dry-run', {
      headers: this.getHeaders(actorId)
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    const data = await res.json();
    return data.tokenRedemptionUnlockKillSwitchDryRuns || [];
  }

  static async getUnlockKillSwitchDryRunDetails(
    unlockKillSwitchDryRunId: string,
    actorId = 'admin'
  ): Promise<{
    tokenRedemptionUnlockKillSwitchDryRun: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRun;
    rules: any[];
    auditLogs: any[];
  }> {
    const res = await fetch(`/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-kill-switch-dry-run/${unlockKillSwitchDryRunId}`, {
      headers: this.getHeaders(actorId)
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async createUnlockKillSwitchDryRun(
    unlockEmergencyRollbackAuthorityId: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockKillSwitchDryRun: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRun }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-kill-switch-dry-run/from-unlock-emergency-rollback-authority/${unlockEmergencyRollbackAuthorityId}`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async evaluateUnlockKillSwitchDryRun(
    unlockKillSwitchDryRunId: string,
    confirmations: Record<string, boolean>,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockKillSwitchDryRun: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRun; rules: any[] }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-kill-switch-dry-run/${unlockKillSwitchDryRunId}/evaluate`,
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
    unlockKillSwitchDryRunId: string,
    decision: 'APPROVE_KILL_SWITCH_DRY_RUN' | 'REJECT_KILL_SWITCH_DRY_RUN',
    rationale: string,
    kill_switch_verification_officer_id: string,
    kill_switch_verification_officer_role: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockKillSwitchDryRun: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRun }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-kill-switch-dry-run/${unlockKillSwitchDryRunId}/decision`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId),
        body: JSON.stringify({
          decision,
          rationale,
          kill_switch_verification_officer_id,
          kill_switch_verification_officer_role,
          reason: rationale
        })
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async finalizeUnlockKillSwitchDryRun(
    unlockKillSwitchDryRunId: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockKillSwitchDryRun: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRun }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-kill-switch-dry-run/${unlockKillSwitchDryRunId}/finalize`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }
}
