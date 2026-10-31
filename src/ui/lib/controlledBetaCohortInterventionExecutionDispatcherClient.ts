import { DispatcherRecord, DispatcherRuleCheck, DispatcherEvidence, DispatcherAuditLog } from './controlledBetaCohortInterventionExecutionDispatcher';

const BASE_URL = '/api/admin/beta/cohort-intervention-dispatcher';

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

export const controlledBetaCohortInterventionExecutionDispatcherClient = {
  async getDispatcherList(): Promise<DispatcherRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/dispatcher`);
    return res.dispatcherList || [];
  },

  async getDispatcherDetails(dispatcherId: string): Promise<{
    dispatcher: DispatcherRecord;
    rules: DispatcherRuleCheck[];
    evidence: DispatcherEvidence | null;
    auditLogs: DispatcherAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/dispatcher/${dispatcherId}`);
    return {
      dispatcher: res.dispatcher,
      rules: res.rules || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createDispatcher(envelopeId: string): Promise<DispatcherRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/dispatcher/from-envelope/${envelopeId}`, {
      method: 'POST'
    });
    return res.dispatcher;
  },

  async evaluateDispatcher(dispatcherId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/dispatcher/${dispatcherId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(dispatcherId: string, result: string, rationale: string): Promise<{ dispatcher: DispatcherRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/dispatcher/${dispatcherId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ result, rationale })
    });
    return { dispatcher: res.dispatcher };
  },

  async finalizeDispatcher(dispatcherId: string): Promise<{ dispatcher: DispatcherRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/dispatcher/${dispatcherId}/finalize`, {
      method: 'POST'
    });
    return { dispatcher: res.dispatcher };
  }
};
