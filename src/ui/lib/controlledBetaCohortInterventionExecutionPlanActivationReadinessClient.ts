import { ReadinessRecord, ReadinessRuleCheck, ReadinessEvidence, ReadinessAuditLog } from './controlledBetaCohortInterventionExecutionPlanActivationReadiness';

const BASE_URL = '/api/admin/beta/cohort-intervention-activation-readiness';

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

export const controlledBetaCohortInterventionExecutionPlanActivationReadinessClient = {
  async getReadinessList(): Promise<ReadinessRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/readiness`);
    return res.readinessList || [];
  },

  async getReadinessDetails(activationRdId: string): Promise<{
    readiness: ReadinessRecord;
    rules: ReadinessRuleCheck[];
    evidence: ReadinessEvidence | null;
    auditLogs: ReadinessAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/readiness/${activationRdId}`);
    return {
      readiness: res.readiness,
      rules: res.rules || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createReadiness(planId: string): Promise<ReadinessRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/readiness/from-plan/${planId}`, {
      method: 'POST'
    });
    return res.readiness;
  },

  async evaluateReadiness(activationRdId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/readiness/${activationRdId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(activationRdId: string, result: string, rationale: string): Promise<{ readiness: ReadinessRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/readiness/${activationRdId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ result, rationale })
    });
    return { readiness: res.readiness };
  },

  async finalizeReadiness(activationRdId: string): Promise<{ readiness: ReadinessRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/readiness/${activationRdId}/finalize`, {
      method: 'POST'
    });
    return { readiness: res.readiness };
  }
};
