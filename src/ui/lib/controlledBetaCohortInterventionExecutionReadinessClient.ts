import { ReadinessRecord, ReadinessCheck, ReadinessEvidence, ReadinessAuditLog } from './controlledBetaCohortInterventionExecutionReadiness';

const BASE_URL = '/api/admin/beta/cohort-intervention-readiness';

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

export const controlledBetaCohortInterventionExecutionReadinessClient = {
  async getReadinessList(): Promise<ReadinessRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/readiness`);
    return res.readinessList || [];
  },

  async getReadinessDetails(readinessId: string): Promise<{
    readiness: ReadinessRecord;
    checks: ReadinessCheck[];
    evidence: ReadinessEvidence | null;
    auditLogs: ReadinessAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/readiness/${readinessId}`);
    return {
      readiness: res.readiness,
      checks: res.checks || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createReadiness(approvalId: string): Promise<ReadinessRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/readiness/from-approval/${approvalId}`, {
      method: 'POST'
    });
    return res.readiness;
  },

  async evaluateReadiness(readinessId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/readiness/${readinessId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(readinessId: string, decision: string, rationale: string): Promise<{ readiness: ReadinessRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/readiness/${readinessId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, rationale })
    });
    return { readiness: res.readiness };
  },

  async finalizeReadiness(readinessId: string): Promise<{ readiness: ReadinessRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/readiness/${readinessId}/finalize`, {
      method: 'POST'
    });
    return { readiness: res.readiness };
  }
};
