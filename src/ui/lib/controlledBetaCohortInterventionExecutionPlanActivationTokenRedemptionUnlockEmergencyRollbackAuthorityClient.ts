import { ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthority } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthority';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityClient {
  private static getHeaders(actorId: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-actor-id': actorId
    };
  }

  static async getUnlockEmergencyRollbackAuthorityList(actorId = 'admin'): Promise<ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthority[]> {
    const res = await fetch('/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-emergency-rollback-authority', {
      headers: this.getHeaders(actorId)
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    const data = await res.json();
    return data.tokenRedemptionUnlockEmergencyRollbackAuthorities || [];
  }

  static async getUnlockEmergencyRollbackAuthorityDetails(
    unlockEmergencyRollbackAuthorityId: string,
    actorId = 'admin'
  ): Promise<{
    tokenRedemptionUnlockEmergencyRollbackAuthority: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthority;
    rules: any[];
    auditLogs: any[];
  }> {
    const res = await fetch(`/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-emergency-rollback-authority/${unlockEmergencyRollbackAuthorityId}`, {
      headers: this.getHeaders(actorId)
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async createUnlockEmergencyRollbackAuthority(
    unlockLegalPolicyHoldId: string,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockEmergencyRollbackAuthority: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthority }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-emergency-rollback-authority/from-unlock-legal-policy-hold/${unlockLegalPolicyHoldId}`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async evaluateUnlockEmergencyRollbackAuthority(
    unlockEmergencyRollbackAuthorityId: string,
    confirmations: Record<string, boolean>,
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockEmergencyRollbackAuthority: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthority; rules: any[] }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-emergency-rollback-authority/${unlockEmergencyRollbackAuthorityId}/evaluate`,
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
    unlockEmergencyRollbackAuthorityId: string,
    payload: {
      decision: string;
      rationale: string;
      rollback_officer_id: string;
      rollback_officer_role: string;
      reason: string;
    },
    actorId = 'admin'
  ): Promise<{ tokenRedemptionUnlockEmergencyRollbackAuthority: ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthority }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-emergency-rollback-authority/${unlockEmergencyRollbackAuthorityId}/decision`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId),
        body: JSON.stringify(payload)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }

  static async finalizeUnlockEmergencyRollbackAuthority(
    unlockEmergencyRollbackAuthorityId: string,
    actorId = 'admin'
  ): Promise<{ success: boolean }> {
    const res = await fetch(
      `/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-emergency-rollback-authority/${unlockEmergencyRollbackAuthorityId}/finalize`,
      {
        method: 'POST',
        headers: this.getHeaders(actorId)
      }
    );
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    return await res.json();
  }
}
