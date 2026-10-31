import { TokenRedemptionUnlockPreExecutionFreeze, UnlockPreExecutionFreezeRule } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreeze';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeClient {
  private baseUri = '/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-pre-execution-freeze';

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

  async getUnlockPreExecutionFreezeList(): Promise<{ success: boolean; list: TokenRedemptionUnlockPreExecutionFreeze[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-pre-execution-freeze`);
  }

  async getUnlockPreExecutionFreezeDetails(unlockPreExecutionFreezeId: string): Promise<{ success: boolean; tokenRedemptionUnlockPreExecutionFreeze: TokenRedemptionUnlockPreExecutionFreeze; rules: UnlockPreExecutionFreezeRule[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-pre-execution-freeze/${unlockPreExecutionFreezeId}`);
  }

  async createUnlockPreExecutionFreeze(unlockSealId: string): Promise<{ success: boolean; tokenRedemptionUnlockPreExecutionFreeze: TokenRedemptionUnlockPreExecutionFreeze }> {
    return this.fetchJson(`${this.baseUri}/unlock-pre-execution-freeze/from-unlock-seal/${unlockSealId}`, {
      method: 'POST'
    });
  }

  async evaluateUnlockPreExecutionFreeze(
    unlockPreExecutionFreezeId: string,
    confirmations: {
      security_officer_unlock_freeze_confirmation: boolean;
      compliance_officer_unlock_freeze_confirmation: boolean;
      operations_director_unlock_freeze_confirmation: boolean;
      rollback_authority_unlock_freeze_confirmation: boolean;
      kill_switch_verified: boolean;
      non_execution_confirmed: boolean;
      final_review_unlock_readiness_verified: boolean;
      seal_authenticity_confirmed: boolean;
      pre_execution_state_sealed_confirmed: boolean;
    }
  ): Promise<{ success: boolean; tokenRedemptionUnlockPreExecutionFreeze: TokenRedemptionUnlockPreExecutionFreeze; rules: UnlockPreExecutionFreezeRule[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-pre-execution-freeze/${unlockPreExecutionFreezeId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ confirmations })
    });
  }

  async recordDecision(
    unlockPreExecutionFreezeId: string,
    decision: 'APPROVE_FREEZE' | 'REJECT_FREEZE' | 'BLOCK' | 'ESCALATE',
    rationale: string
  ): Promise<{ success: boolean; tokenRedemptionUnlockPreExecutionFreeze: TokenRedemptionUnlockPreExecutionFreeze }> {
    return this.fetchJson(`${this.baseUri}/unlock-pre-execution-freeze/${unlockPreExecutionFreezeId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, rationale })
    });
  }

  async finalizeUnlockPreExecutionFreeze(unlockPreExecutionFreezeId: string): Promise<{ success: boolean; tokenRedemptionUnlockPreExecutionFreeze: TokenRedemptionUnlockPreExecutionFreeze }> {
    return this.fetchJson(`${this.baseUri}/unlock-pre-execution-freeze/${unlockPreExecutionFreezeId}/finalize`, {
      method: 'POST'
    });
  }
}
