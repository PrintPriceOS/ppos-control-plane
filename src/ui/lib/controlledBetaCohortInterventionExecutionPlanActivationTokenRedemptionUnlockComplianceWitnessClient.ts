import { TokenRedemptionUnlockComplianceWitness, Rule, Confirmations } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitness';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessClient {
  private baseUri = '/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-compliance-witness';

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

  async getUnlockComplianceWitnessList(): Promise<TokenRedemptionUnlockComplianceWitness[]> {
    return this.fetchJson(`${this.baseUri}`);
  }

  async getUnlockComplianceWitnessDetails(
    unlockComplianceWitnessId: string
  ): Promise<{ tokenRedemptionUnlockComplianceWitness: TokenRedemptionUnlockComplianceWitness; rules: Rule[] }> {
    return this.fetchJson(`${this.baseUri}/${unlockComplianceWitnessId}`);
  }

  async createUnlockComplianceWitness(
    unlockFinalHumanAuthorizationSealId: string
  ): Promise<{ tokenRedemptionUnlockComplianceWitness: TokenRedemptionUnlockComplianceWitness }> {
    return this.fetchJson(`${this.baseUri}/from-unlock-final-human-authorization-seal/${unlockFinalHumanAuthorizationSealId}`, {
      method: 'POST'
    });
  }

  async evaluateUnlockComplianceWitness(
    unlockComplianceWitnessId: string,
    confirmations: Confirmations
  ): Promise<{ tokenRedemptionUnlockComplianceWitness: TokenRedemptionUnlockComplianceWitness; rules: Rule[] }> {
    return this.fetchJson(`${this.baseUri}/${unlockComplianceWitnessId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ confirmations })
    });
  }

  async recordDecision(
    unlockComplianceWitnessId: string,
    payload: {
      compliance_witness_id?: string;
      compliance_witness_role?: string;
      compliance_witness_reason?: string;
      decision?: 'APPROVE_COMPLIANCE_WITNESS' | 'REJECT_COMPLIANCE_WITNESS' | 'BLOCK' | 'ESCALATE';
      rationale?: string;
    }
  ): Promise<{ tokenRedemptionUnlockComplianceWitness: TokenRedemptionUnlockComplianceWitness }> {
    return this.fetchJson(`${this.baseUri}/${unlockComplianceWitnessId}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async finalizeUnlockComplianceWitness(
    unlockComplianceWitnessId: string
  ): Promise<{ tokenRedemptionUnlockComplianceWitness: TokenRedemptionUnlockComplianceWitness }> {
    return this.fetchJson(`${this.baseUri}/${unlockComplianceWitnessId}/finalize`, {
      method: 'POST'
    });
  }
}

const client = new ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessClient();

export const getUnlockComplianceWitnessList = () => client.getUnlockComplianceWitnessList();
export const getUnlockComplianceWitnessDetails = (id: string) => client.getUnlockComplianceWitnessDetails(id);
export const createUnlockComplianceWitness = (id: string) => client.createUnlockComplianceWitness(id);
export const evaluateUnlockComplianceWitness = (id: string, confs: Confirmations) => client.evaluateUnlockComplianceWitness(id, confs);
export const recordDecision = (id: string, payload: any) => client.recordDecision(id, payload);
export const finalizeUnlockComplianceWitness = (id: string) => client.finalizeUnlockComplianceWitness(id);
