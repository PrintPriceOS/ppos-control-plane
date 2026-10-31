import {
  RuntimeActivityReview,
  RuntimeActivityReviewDecision,
  RuntimeActivityReviewFinding,
  RuntimeActivityReviewEvidence
} from '../types/controlledBetaRuntimeActivityReview';
import { authenticatedBetaFetch } from './betaApiAuthHelper';

export class ControlledBetaRuntimeActivityReviewClient {
  private baseUrl = '/api/admin/beta/runtime-reviews';

  async listReviews(): Promise<{ ok: boolean; reviews?: RuntimeActivityReview[]; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/reviews`);
  }

  async getReview(reviewId: string): Promise<{
    ok: boolean;
    review?: RuntimeActivityReview;
    decision?: RuntimeActivityReviewDecision;
    findings?: RuntimeActivityReviewFinding[];
    status?: number;
    error?: any;
  }> {
    return authenticatedBetaFetch(`${this.baseUrl}/reviews/${reviewId}`);
  }

  async createReview(data: {
    tenantId: string;
    cohortId: string;
    windowStart: string;
    windowEnd: string;
  }): Promise<{ ok: boolean; review?: RuntimeActivityReview; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/reviews`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async evaluateReview(reviewId: string): Promise<{
    ok: boolean;
    evaluationResult?: any;
    decision?: RuntimeActivityReviewDecision;
    findings?: RuntimeActivityReviewFinding[];
    status?: number;
    error?: any;
  }> {
    return authenticatedBetaFetch(`${this.baseUrl}/reviews/${reviewId}/evaluate`, {
      method: 'POST'
    });
  }

  async finalizeReview(reviewId: string): Promise<{
    ok: boolean;
    review?: RuntimeActivityReview;
    evidencePack?: RuntimeActivityReviewEvidence;
    status?: number;
    error?: any;
  }> {
    return authenticatedBetaFetch(`${this.baseUrl}/reviews/${reviewId}/finalize`, {
      method: 'POST'
    });
  }

  async supersedeReview(reviewId: string, data: { supersededByReviewId: string; reason: string }): Promise<{
    ok: boolean;
    status?: number;
    error?: any;
  }> {
    return authenticatedBetaFetch(`${this.baseUrl}/reviews/${reviewId}/supersede`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getEvidencePack(reviewId: string): Promise<{
    ok: boolean;
    evidencePack?: RuntimeActivityReviewEvidence;
    status?: number;
    error?: any;
  }> {
    return authenticatedBetaFetch(`${this.baseUrl}/reviews/${reviewId}/evidence-pack`);
  }

  async getCohortHealthSummary(cohortId: string, tenantId: string): Promise<{
    ok: boolean;
    summary?: any;
    status?: number;
    error?: any;
  }> {
    return authenticatedBetaFetch(`${this.baseUrl}/cohorts/${cohortId}/health-summary?tenantId=${tenantId}`);
  }
}

export const runtimeActivityReviewClient = new ControlledBetaRuntimeActivityReviewClient();
