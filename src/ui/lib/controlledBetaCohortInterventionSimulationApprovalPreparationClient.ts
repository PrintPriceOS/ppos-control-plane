import { PrepRecord, PrepFinding, PrepEvidence, PrepAuditLog } from './controlledBetaCohortInterventionSimulationApprovalPreparation';

const BASE_URL = '/api/admin/beta/cohort-intervention-approval-preparations';

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

export const controlledBetaCohortInterventionSimulationApprovalPreparationClient = {
  async getPreps(): Promise<PrepRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/preps`);
    return res.preps || [];
  },

  async getPrep(prepId: string): Promise<{
    prep: PrepRecord;
    findings: PrepFinding[];
    evidence: PrepEvidence | null;
    auditLogs: PrepAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/preps/${prepId}`);
    return {
      prep: res.prep,
      findings: res.findings || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createPrep(reviewId: string): Promise<PrepRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/preps/from-review/${reviewId}`, {
      method: 'POST'
    });
    return res.prep;
  },

  async evaluatePrep(prepId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/preps/${prepId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async finalizePrep(prepId: string): Promise<{ prep: PrepRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/preps/${prepId}/finalize`, {
      method: 'POST'
    });
    return { prep: res.prep };
  },

  async requestResimulation(prepId: string, reason: string): Promise<{ prep: PrepRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/preps/${prepId}/re-simulate`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    return { prep: res.prep };
  },

  async escalatePrep(prepId: string, reason: string): Promise<{ prep: PrepRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/preps/${prepId}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    return { prep: res.prep };
  }
};
