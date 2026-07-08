import { TokenRedemptionUnlockFinalReview, UnlockFinalReviewRule } from './controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReview';

export class ControlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewClient {
  private baseUri = '/api/admin/beta/cohort-intervention/activation-token-redemption-unlock-final-review';

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

  async getUnlockFinalReviewList(): Promise<{ success: boolean; list: TokenRedemptionUnlockFinalReview[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-final-review`);
  }

  async getUnlockFinalReviewDetails(unlockFinalReviewId: string): Promise<{ success: boolean; tokenRedemptionUnlockFinalReview: TokenRedemptionUnlockFinalReview; rules: UnlockFinalReviewRule[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-final-review/${unlockFinalReviewId}`);
  }

  async createUnlockFinalReview(unlockApprovalId: string): Promise<{ success: boolean; tokenRedemptionUnlockFinalReview: TokenRedemptionUnlockFinalReview }> {
    return this.fetchJson(`${this.baseUri}/unlock-final-review/from-unlock-approval/${unlockApprovalId}`, {
      method: 'POST'
    });
  }

  async evaluateUnlockFinalReview(
    unlockFinalReviewId: string,
    confirmations: {
      security_officer_confirmation: boolean;
      compliance_officer_confirmation: boolean;
      operations_director_confirmation: boolean;
      rollback_authority_confirmation: boolean;
      kill_switch_confirmation: boolean;
      non_execution_confirmation: boolean;
      final_review_no_unlock_confirmation: boolean;
    }
  ): Promise<{ success: boolean; tokenRedemptionUnlockFinalReview: TokenRedemptionUnlockFinalReview; rules: UnlockFinalReviewRule[] }> {
    return this.fetchJson(`${this.baseUri}/unlock-final-review/${unlockFinalReviewId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ confirmations })
    });
  }

  async recordDecision(
    unlockFinalReviewId: string,
    decision: 'APPROVE_FINAL_REVIEW' | 'REJECT_FINAL_REVIEW' | 'BLOCK' | 'ESCALATE',
    rationale: string
  ): Promise<{ success: boolean; tokenRedemptionUnlockFinalReview: TokenRedemptionUnlockFinalReview }> {
    return this.fetchJson(`${this.baseUri}/unlock-final-review/${unlockFinalReviewId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, rationale })
    });
  }

  async finalizeUnlockFinalReview(unlockFinalReviewId: string): Promise<{ success: boolean; tokenRedemptionUnlockFinalReview: TokenRedemptionUnlockFinalReview }> {
    return this.fetchJson(`${this.baseUri}/unlock-final-review/${unlockFinalReviewId}/finalize`, {
      method: 'POST'
    });
  }
}
