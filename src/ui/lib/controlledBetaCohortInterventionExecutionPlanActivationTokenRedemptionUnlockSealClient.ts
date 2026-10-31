import { TokenRedemptionUnlockSeal, UnlockSealRule } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockSeal';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealClient {
  private baseUri = '/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-seal';

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

  async getUnlockSealList(): Promise<{ success: boolean; list: TokenRedemptionUnlockSeal[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-seal`);
  }

  async getUnlockSealDetails(unlockSealId: string): Promise<{ success: boolean; tokenRedemptionUnlockSeal: TokenRedemptionUnlockSeal; rules: UnlockSealRule[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-seal/${unlockSealId}`);
  }

  async createUnlockSeal(unlockFinalReviewId: string): Promise<{ success: boolean; tokenRedemptionUnlockSeal: TokenRedemptionUnlockSeal }> {
    return this.fetchJson(`${this.baseUri}/unlock-seal/from-unlock-final-review/${unlockFinalReviewId}`, {
      method: 'POST'
    });
  }

  async evaluateUnlockSeal(
    unlockSealId: string,
    confirmations: {
      security_officer_confirmation: boolean;
      compliance_officer_confirmation: boolean;
      operations_director_confirmation: boolean;
      rollback_authority_confirmation: boolean;
      kill_switch_confirmation: boolean;
      non_execution_confirmation: boolean;
      final_review_unlock_readiness_confirmation: boolean;
      seal_authenticity_confirmation: boolean;
    }
  ): Promise<{ success: boolean; tokenRedemptionUnlockSeal: TokenRedemptionUnlockSeal; rules: UnlockSealRule[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-seal/${unlockSealId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ confirmations })
    });
  }

  async recordDecision(
    unlockSealId: string,
    decision: 'APPROVE_SEAL' | 'REJECT_SEAL' | 'BLOCK' | 'ESCALATE',
    rationale: string
  ): Promise<{ success: boolean; tokenRedemptionUnlockSeal: TokenRedemptionUnlockSeal }> {
    return this.fetchJson(`${this.baseUri}/unlock-seal/${unlockSealId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, rationale })
    });
  }

  async finalizeUnlockSeal(unlockSealId: string): Promise<{ success: boolean; tokenRedemptionUnlockSeal: TokenRedemptionUnlockSeal }> {
    return this.fetchJson(`${this.baseUri}/unlock-seal/${unlockSealId}/finalize`, {
      method: 'POST'
    });
  }
}
