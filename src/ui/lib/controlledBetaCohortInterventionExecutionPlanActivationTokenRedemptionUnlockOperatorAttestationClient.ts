import { TokenRedemptionUnlockOperatorAttestation, UnlockOperatorAttestationRule } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestation';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationClient {
  private baseUri = '/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-operator-attestation';

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

  async getUnlockOperatorAttestationList(): Promise<{ success: boolean; list: TokenRedemptionUnlockOperatorAttestation[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-operator-attestation`);
  }

  async getUnlockOperatorAttestationDetails(unlockOperatorAttestationId: string): Promise<{ success: boolean; tokenRedemptionUnlockOperatorAttestation: TokenRedemptionUnlockOperatorAttestation; rules: UnlockOperatorAttestationRule[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-operator-attestation/${unlockOperatorAttestationId}`);
  }

  async createUnlockOperatorAttestation(unlockPreExecutionFreezeId: string): Promise<{ success: boolean; tokenRedemptionUnlockOperatorAttestation: TokenRedemptionUnlockOperatorAttestation }> {
    return this.fetchJson(`${this.baseUri}/unlock-operator-attestation/from-unlock-pre-execution-freeze/${unlockPreExecutionFreezeId}`, {
      method: 'POST'
    });
  }

  async evaluateUnlockOperatorAttestation(
    unlockOperatorAttestationId: string,
    confirmations: {
      security_officer_unlock_attestation_confirmation: boolean;
      compliance_officer_unlock_attestation_confirmation: boolean;
      operations_director_unlock_attestation_confirmation: boolean;
      rollback_authority_unlock_attestation_confirmation: boolean;
      kill_switch_verified: boolean;
      non_execution_confirmed: boolean;
      final_review_unlock_readiness_verified: boolean;
      seal_authenticity_confirmed: boolean;
      pre_execution_state_sealed_confirmed: boolean;
      operator_attestation_confirmed: boolean;
    }
  ): Promise<{ success: boolean; tokenRedemptionUnlockOperatorAttestation: TokenRedemptionUnlockOperatorAttestation; rules: UnlockOperatorAttestationRule[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-operator-attestation/${unlockOperatorAttestationId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ confirmations })
    });
  }

  async recordDecision(
    unlockOperatorAttestationId: string,
    decision: 'APPROVE_ATTESTATION' | 'REJECT_ATTESTATION' | 'BLOCK' | 'ESCALATE',
    rationale: string
  ): Promise<{ success: boolean; tokenRedemptionUnlockOperatorAttestation: TokenRedemptionUnlockOperatorAttestation }> {
    return this.fetchJson(`${this.baseUri}/unlock-operator-attestation/${unlockOperatorAttestationId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, rationale })
    });
  }

  async finalizeUnlockOperatorAttestation(unlockOperatorAttestationId: string): Promise<{ success: boolean; tokenRedemptionUnlockOperatorAttestation: TokenRedemptionUnlockOperatorAttestation }> {
    return this.fetchJson(`${this.baseUri}/unlock-operator-attestation/${unlockOperatorAttestationId}/finalize`, {
      method: 'POST'
    });
  }
}
