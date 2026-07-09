import { TokenRedemptionUnlockDualControlAuthorization, UnlockDualControlAuthorizationRule } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorization';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationClient {
  private baseUri = '/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-dual-control-authorization';

  private async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-actor-id': 'admin',
        ...(options?.headers || {})
      }
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP error ${res.status}`);
    }
    return data;
  }

  async getUnlockDualControlAuthorizationList(): Promise<{ success: boolean; list: TokenRedemptionUnlockDualControlAuthorization[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-dual-control-authorization`);
  }

  async getUnlockDualControlAuthorizationDetails(unlockDualControlAuthorizationId: string): Promise<{ success: boolean; tokenRedemptionUnlockDualControlAuthorization: TokenRedemptionUnlockDualControlAuthorization; rules: UnlockDualControlAuthorizationRule[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-dual-control-authorization/${unlockDualControlAuthorizationId}`);
  }

  async createUnlockDualControlAuthorization(unlockOperatorAttestationId: string): Promise<{ success: boolean; tokenRedemptionUnlockDualControlAuthorization: TokenRedemptionUnlockDualControlAuthorization }> {
    return this.fetchJson(`${this.baseUri}/unlock-dual-control-authorization/from-unlock-operator-attestation/${unlockOperatorAttestationId}`, {
      method: 'POST'
    });
  }

  async recordPrimaryAuthorizer(unlockDualControlAuthorizationId: string, authorizerId: string, role: string): Promise<{ success: boolean; tokenRedemptionUnlockDualControlAuthorization: TokenRedemptionUnlockDualControlAuthorization }> {
    return this.fetchJson(`${this.baseUri}/unlock-dual-control-authorization/${unlockDualControlAuthorizationId}/primary-authorizer`, {
      method: 'POST',
      body: JSON.stringify({ authorizerId, role })
    });
  }

  async recordSecondaryAuthorizer(unlockDualControlAuthorizationId: string, authorizerId: string, role: string): Promise<{ success: boolean; tokenRedemptionUnlockDualControlAuthorization: TokenRedemptionUnlockDualControlAuthorization }> {
    return this.fetchJson(`${this.baseUri}/unlock-dual-control-authorization/${unlockDualControlAuthorizationId}/secondary-authorizer`, {
      method: 'POST',
      body: JSON.stringify({ authorizerId, role })
    });
  }

  async evaluateUnlockDualControlAuthorization(
    unlockDualControlAuthorizationId: string,
    confirmations: {
      primary_authorizer_unlock_authorization_confirmation: boolean;
      secondary_authorizer_unlock_authorization_confirmation: boolean;
      security_officer_unlock_attestation_verified: boolean;
      compliance_officer_unlock_attestation_verified: boolean;
      operations_director_unlock_attestation_verified: boolean;
      rollback_authority_unlock_attestation_verified: boolean;
      kill_switch_verified: boolean;
      non_execution_confirmed: boolean;
      final_review_unlock_readiness_verified: boolean;
      seal_authenticity_confirmed: boolean;
      pre_execution_state_sealed_confirmed: boolean;
    }
  ): Promise<{ success: boolean; tokenRedemptionUnlockDualControlAuthorization: TokenRedemptionUnlockDualControlAuthorization; rules: UnlockDualControlAuthorizationRule[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-dual-control-authorization/${unlockDualControlAuthorizationId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ confirmations })
    });
  }

  async recordDecision(
    unlockDualControlAuthorizationId: string,
    decision: 'APPROVE_DUAL_CONTROL' | 'REJECT_DUAL_CONTROL' | 'BLOCK' | 'ESCALATE',
    rationale: string
  ): Promise<{ success: boolean; tokenRedemptionUnlockDualControlAuthorization: TokenRedemptionUnlockDualControlAuthorization }> {
    return this.fetchJson(`${this.baseUri}/unlock-dual-control-authorization/${unlockDualControlAuthorizationId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, rationale })
    });
  }

  async finalizeUnlockDualControlAuthorization(unlockDualControlAuthorizationId: string): Promise<{ success: boolean; tokenRedemptionUnlockDualControlAuthorization: TokenRedemptionUnlockDualControlAuthorization }> {
    return this.fetchJson(`${this.baseUri}/unlock-dual-control-authorization/${unlockDualControlAuthorizationId}/finalize`, {
      method: 'POST'
    });
  }
}
