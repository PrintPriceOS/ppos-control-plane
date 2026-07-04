import { AuthorizationRecord, AuthorizationRuleCheck, AuthorizationEvidence, AuthorizationAuditLog } from './controlledBetaCohortInterventionExecutionPlanActivationAuthorization';

const BASE_URL = '/api/admin/beta/cohort-intervention-activation-authorization';

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

export const controlledBetaCohortInterventionExecutionPlanActivationAuthorizationClient = {
  async getAuthorizationList(): Promise<AuthorizationRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/authorization`);
    return res.authorizationList || [];
  },

  async getAuthorizationDetails(activationAuthId: string): Promise<{
    authorization: AuthorizationRecord;
    rules: AuthorizationRuleCheck[];
    evidence: AuthorizationEvidence | null;
    auditLogs: AuthorizationAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/authorization/${activationAuthId}`);
    return {
      authorization: res.authorization,
      rules: res.rules || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createAuthorization(activationRdId: string): Promise<AuthorizationRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/authorization/from-readiness/${activationRdId}`, {
      method: 'POST'
    });
    return res.authorization;
  },

  async evaluateAuthorization(activationAuthId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/authorization/${activationAuthId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(activationAuthId: string, result: string, rationale: string): Promise<{ authorization: AuthorizationRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/authorization/${activationAuthId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ result, rationale })
    });
    return { authorization: res.authorization };
  },

  async finalizeAuthorization(activationAuthId: string): Promise<{ authorization: AuthorizationRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/authorization/${activationAuthId}/finalize`, {
      method: 'POST'
    });
    return { authorization: res.authorization };
  }
};
