import {
  RuntimeActivityReview,
  RuntimeActivityReviewDecision,
  RuntimeActivityReviewFinding,
  RuntimeActivityReviewEvidence
} from '../types/controlledBetaRuntimeActivityReview';

export class ControlledBetaRuntimeActivityReviewClient {
  private baseUrl = '/api/admin/beta/runtime-reviews';

  async listReviews(): Promise<{ ok: boolean; reviews: RuntimeActivityReview[] }> {
    const res = await fetch(`${this.baseUrl}/reviews`);
    return res.json();
  }

  async getReview(reviewId: string): Promise<{
    ok: boolean;
    review: RuntimeActivityReview;
    decision?: RuntimeActivityReviewDecision;
    findings: RuntimeActivityReviewFinding[];
  }> {
    const res = await fetch(`${this.baseUrl}/reviews/${reviewId}`);
    return res.json();
  }

  async createReview(data: {
    tenantId: string;
    cohortId: string;
    windowStart: string;
    windowEnd: string;
  }): Promise<{ ok: boolean; review: RuntimeActivityReview }> {
    const res = await fetch(`${this.baseUrl}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async evaluateReview(reviewId: string): Promise<{
    ok: boolean;
    evaluationResult: any;
    decision: RuntimeActivityReviewDecision;
    findings: RuntimeActivityReviewFinding[];
  }> {
    const res = await fetch(`${this.baseUrl}/reviews/${reviewId}/evaluate`, {
      method: 'POST'
    });
    return res.json();
  }

  async finalizeReview(reviewId: string): Promise<{ ok: boolean; review: RuntimeActivityReview; evidencePack: RuntimeActivityReviewEvidence }> {
    const res = await fetch(`${this.baseUrl}/reviews/${reviewId}/finalize`, {
      method: 'POST'
    });
    return res.json();
  }

  async supersedeReview(reviewId: string, data: { supersededByReviewId: string; reason: string }): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/reviews/${reviewId}/supersede`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async getEvidencePack(reviewId: string): Promise<{ ok: boolean; evidencePack: RuntimeActivityReviewEvidence }> {
    const res = await fetch(`${this.baseUrl}/reviews/${reviewId}/evidence-pack`);
    return res.json();
  }

  async getCohortHealthSummary(cohortId: string, tenantId: string): Promise<{ ok: boolean; summary: any }> {
    const res = await fetch(`${this.baseUrl}/cohorts/${cohortId}/health-summary?tenantId=${tenantId}`);
    return res.json();
  }
}

export const runtimeActivityReviewClient = new ControlledBetaRuntimeActivityReviewClient();
