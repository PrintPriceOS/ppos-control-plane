import { TokenRedemptionUnlockFinalHumanAuthorizationSeal, Rule, Confirmations } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSeal';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealClient {
  private baseUri = '/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-final-human-authorization-seal';

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

  async getUnlockFinalHumanAuthorizationSealList(): Promise<TokenRedemptionUnlockFinalHumanAuthorizationSeal[]> {
    return this.fetchJson(`${this.baseUri}`);
  }

  async getUnlockFinalHumanAuthorizationSealDetails(
    unlockFinalHumanAuthorizationSealId: string
  ): Promise<{ tokenRedemptionUnlockFinalHumanAuthorizationSeal: TokenRedemptionUnlockFinalHumanAuthorizationSeal; rules: Rule[] }> {
    return this.fetchJson(`${this.baseUri}/${unlockFinalHumanAuthorizationSealId}`);
  }

  async createUnlockFinalHumanAuthorizationSeal(
    unlockDualControlAuthorizationId: string
  ): Promise<{ tokenRedemptionUnlockFinalHumanAuthorizationSeal: TokenRedemptionUnlockFinalHumanAuthorizationSeal }> {
    return this.fetchJson(`${this.baseUri}/from-unlock-dual-control-authorization/${unlockDualControlAuthorizationId}`, {
      method: 'POST'
    });
  }

  async evaluateUnlockFinalHumanAuthorizationSeal(
    unlockFinalHumanAuthorizationSealId: string,
    confirmations: Confirmations
  ): Promise<{ tokenRedemptionUnlockFinalHumanAuthorizationSeal: TokenRedemptionUnlockFinalHumanAuthorizationSeal; rules: Rule[] }> {
    return this.fetchJson(`${this.baseUri}/${unlockFinalHumanAuthorizationSealId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ confirmations })
    });
  }

  async recordDecision(
    unlockFinalHumanAuthorizationSealId: string,
    payload: {
      final_human_authorizer_id?: string;
      final_human_authorizer_role?: string;
      final_human_authorization_seal_reason?: string;
      decision?: 'APPROVE_FINAL_SEAL' | 'REJECT_FINAL_SEAL' | 'BLOCK' | 'ESCALATE';
      rationale?: string;
    }
  ): Promise<{ tokenRedemptionUnlockFinalHumanAuthorizationSeal: TokenRedemptionUnlockFinalHumanAuthorizationSeal }> {
    return this.fetchJson(`${this.baseUri}/${unlockFinalHumanAuthorizationSealId}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async finalizeUnlockFinalHumanAuthorizationSeal(
    unlockFinalHumanAuthorizationSealId: string
  ): Promise<{ tokenRedemptionUnlockFinalHumanAuthorizationSeal: TokenRedemptionUnlockFinalHumanAuthorizationSeal }> {
    return this.fetchJson(`${this.baseUri}/${unlockFinalHumanAuthorizationSealId}/finalize`, {
      method: 'POST'
    });
  }
}

// Export functions to match original imports in UI page
const client = new ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealClient();

export const getUnlockFinalHumanAuthorizationSealList = () => client.getUnlockFinalHumanAuthorizationSealList();
export const getUnlockFinalHumanAuthorizationSealDetails = (id: string) => client.getUnlockFinalHumanAuthorizationSealDetails(id);
export const createUnlockFinalHumanAuthorizationSeal = (id: string) => client.createUnlockFinalHumanAuthorizationSeal(id);
export const evaluateUnlockFinalHumanAuthorizationSeal = (id: string, confs: Confirmations) => client.evaluateUnlockFinalHumanAuthorizationSeal(id, confs);
export const recordDecision = (id: string, payload: any) => client.recordDecision(id, payload);
export const finalizeUnlockFinalHumanAuthorizationSeal = (id: string) => client.finalizeUnlockFinalHumanAuthorizationSeal(id);
