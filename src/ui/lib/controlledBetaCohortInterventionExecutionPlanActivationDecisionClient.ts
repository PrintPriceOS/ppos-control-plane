import { DecisionRecord, DecisionRuleCheck, DecisionEvidence, DecisionAuditLog } from './controlledBetaCohortInterventionExecutionPlanActivationDecision';

const BASE_URL = '/api/admin/beta/cohort-intervention-activation-decision';

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

export const controlledBetaCohortInterventionExecutionPlanActivationDecisionClient = {
  async getDecisionList(): Promise<DecisionRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/decision`);
    return res.decisionList || [];
  },

  async getDecisionDetails(activationDecisionId: string): Promise<{
    decision: DecisionRecord;
    rules: DecisionRuleCheck[];
    evidence: DecisionEvidence | null;
    auditLogs: DecisionAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/decision/${activationDecisionId}`);
    return {
      decision: res.decision,
      rules: res.rules || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createDecision(activationLockId: string): Promise<DecisionRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/decision/from-lock/${activationLockId}`, {
      method: 'POST'
    });
    return res.decision;
  },

  async evaluateDecision(activationDecisionId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/decision/${activationDecisionId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(activationDecisionId: string, result: string, rationale: string): Promise<{ decision: DecisionRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/decision/${activationDecisionId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ result, rationale })
    });
    return { decision: res.decision };
  },

  async finalizeDecision(activationDecisionId: string): Promise<{ decision: DecisionRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/decision/${activationDecisionId}/finalize`, {
      method: 'POST'
    });
    return { decision: res.decision };
  }
};
