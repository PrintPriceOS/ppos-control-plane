import { HandoffRecord, HandoffRuleCheck, HandoffEvidence, HandoffAuditLog } from './controlledBetaCohortInterventionExecutionPlanActivationHandoff';

const BASE_URL = '/api/admin/beta/cohort-intervention-activation-handoff';

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

export const controlledBetaCohortInterventionExecutionPlanActivationHandoffClient = {
  async getHandoffList(): Promise<HandoffRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/handoff`);
    return res.handoffList || [];
  },

  async getHandoffDetails(activationHandoffId: string): Promise<{
    handoff: HandoffRecord;
    rules: HandoffRuleCheck[];
    evidence: HandoffEvidence | null;
    auditLogs: HandoffAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/handoff/${activationHandoffId}`);
    return {
      handoff: res.handoff,
      rules: res.rules || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createHandoff(activationDecisionId: string): Promise<HandoffRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/handoff/from-decision/${activationDecisionId}`, {
      method: 'POST'
    });
    return res.handoff;
  },

  async evaluateHandoff(activationHandoffId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/handoff/${activationHandoffId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(activationHandoffId: string, result: string, rationale: string): Promise<{ handoff: HandoffRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/handoff/${activationHandoffId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ result, rationale })
    });
    return { handoff: res.handoff };
  },

  async finalizeHandoff(activationHandoffId: string): Promise<{ handoff: HandoffRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/handoff/${activationHandoffId}/finalize`, {
      method: 'POST'
    });
    return { handoff: res.handoff };
  }
};
