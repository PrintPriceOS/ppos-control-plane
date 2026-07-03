import { ReviewRecord, ReviewFinding, ReviewDecision, ReviewEvidence, ReviewAuditLog } from './controlledBetaCohortInterventionSimulationReview';

const BASE_URL = '/api/admin/beta/cohort-intervention-simulation-reviews';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const controlledBetaCohortInterventionSimulationReviewClient = {
  async getReviews(): Promise<ReviewRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/reviews`);
    return res.reviews || [];
  },

  async getReview(reviewId: string): Promise<{
    review: ReviewRecord;
    findings: ReviewFinding[];
    decision: ReviewDecision | null;
    evidence: ReviewEvidence | null;
    auditLogs: ReviewAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/reviews/${reviewId}`);
    return {
      review: res.review,
      findings: res.findings || [],
      decision: res.decision || null,
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createReview(simulationId: string): Promise<ReviewRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/reviews/from-simulation/${simulationId}`, {
      method: 'POST'
    });
    return res.review;
  },

  async evaluateReview(reviewId: string, overrides?: any): Promise<{ review: ReviewRecord; findings: ReviewFinding[] }> {
    const res = await fetchWithAuth(`${BASE_URL}/reviews/${reviewId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return {
      review: res.review,
      findings: res.findings || []
    };
  },

  async recordDecision(reviewId: string, decision: string, rationale: string): Promise<{ review: ReviewRecord; decision: ReviewDecision }> {
    const res = await fetchWithAuth(`${BASE_URL}/reviews/${reviewId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, rationale })
    });
    return {
      review: res.review,
      decision: res.decision
    };
  },

  async finalizeReview(reviewId: string): Promise<{ review: ReviewRecord }> {
    return await fetchWithAuth(`${BASE_URL}/reviews/${reviewId}/finalize`, {
      method: 'POST'
    });
  },

  async requestResimulation(reviewId: string, reason: string): Promise<{ review: ReviewRecord }> {
    return await fetchWithAuth(`${BASE_URL}/reviews/${reviewId}/request-resimulation`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  async escalateReview(reviewId: string, reason: string): Promise<{ review: ReviewRecord }> {
    return await fetchWithAuth(`${BASE_URL}/reviews/${reviewId}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  async blockReview(reviewId: string, reason: string): Promise<{ review: ReviewRecord }> {
    return await fetchWithAuth(`${BASE_URL}/reviews/${reviewId}/block`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  async rejectReview(reviewId: string, reason: string): Promise<{ review: ReviewRecord }> {
    return await fetchWithAuth(`${BASE_URL}/reviews/${reviewId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  async supersedeReview(reviewId: string, reason: string): Promise<{ review: ReviewRecord }> {
    return await fetchWithAuth(`${BASE_URL}/reviews/${reviewId}/supersede`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  async getEvidence(reviewId: string): Promise<ReviewEvidence | null> {
    const res = await fetchWithAuth(`${BASE_URL}/reviews/${reviewId}/evidence-pack`);
    return res.evidence || null;
  },

  async getReviewSummary(simulationId: string): Promise<ReviewRecord | null> {
    const res = await fetchWithAuth(`${BASE_URL}/simulations/${simulationId}/review-summary`);
    return res.review || null;
  },

  async getCohortReviewHistory(cohortId: string): Promise<ReviewRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/cohorts/${cohortId}/high-risk-simulation-review-history`);
    return res.history || [];
  }
};
