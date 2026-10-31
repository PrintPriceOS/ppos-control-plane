import { TokenRedemptionUnlockApproval, UnlockApprovalRule } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockApproval';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalClient {
  private baseUri = '/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-approval';

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

  async getUnlockApprovalList(): Promise<{ success: boolean; list: TokenRedemptionUnlockApproval[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-approval`);
  }

  async getUnlockApprovalDetails(unlockApprovalId: string): Promise<{ success: boolean; tokenRedemptionUnlockApproval: TokenRedemptionUnlockApproval; rules: UnlockApprovalRule[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-approval/${unlockApprovalId}`);
  }

  async createUnlockApproval(unlockEligibilityId: string): Promise<{ success: boolean; tokenRedemptionUnlockApproval: TokenRedemptionUnlockApproval }> {
    return this.fetchJson(`${this.baseUri}/unlock-approval/from-unlock-eligibility/${unlockEligibilityId}`, {
      method: 'POST'
    });
  }

  async evaluateUnlockApproval(unlockApprovalId: string, confirmations: { security_officer_confirmed: boolean; compliance_officer_confirmed: boolean }): Promise<{ success: boolean; tokenRedemptionUnlockApproval: TokenRedemptionUnlockApproval; rules: UnlockApprovalRule[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-approval/${unlockApprovalId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ confirmations })
    });
  }

  async recordDecision(unlockApprovalId: string, decision: 'APPROVE' | 'DENY' | 'BLOCK' | 'ESCALATE', rationale: string): Promise<{ success: boolean; tokenRedemptionUnlockApproval: TokenRedemptionUnlockApproval }> {
    return this.fetchJson(`${this.baseUri}/unlock-approval/${unlockApprovalId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, rationale })
    });
  }

  async finalizeUnlockApproval(unlockApprovalId: string): Promise<{ success: boolean; tokenRedemptionUnlockApproval: TokenRedemptionUnlockApproval }> {
    return this.fetchJson(`${this.baseUri}/unlock-approval/${unlockApprovalId}/finalize`, {
      method: 'POST'
    });
  }
}
