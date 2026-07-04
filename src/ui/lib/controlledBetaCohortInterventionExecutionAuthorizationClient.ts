import { AuthRecord, AuthRuleCheck, AuthEvidence, AuthAuditLog } from './controlledBetaCohortInterventionExecutionAuthorization';

const BASE_URL = '/api/admin/beta/cohort-intervention-auth';

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

export const controlledBetaCohortInterventionExecutionAuthorizationClient = {
  async getAuthList(): Promise<AuthRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/auth`);
    return res.authList || [];
  },

  async getAuthDetails(authId: string): Promise<{
    auth: AuthRecord;
    rules: AuthRuleCheck[];
    evidence: AuthEvidence | null;
    auditLogs: AuthAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/auth/${authId}`);
    return {
      auth: res.auth,
      rules: res.rules || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createAuth(readinessId: string): Promise<AuthRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/auth/from-readiness/${readinessId}`, {
      method: 'POST'
    });
    return res.auth;
  },

  async evaluateAuth(authId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/auth/${authId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(authId: string, decision: string, rationale: string): Promise<{ auth: AuthRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/auth/${authId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, rationale })
    });
    return { auth: res.auth };
  },

  async finalizeAuth(authId: string): Promise<{ auth: AuthRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/auth/${authId}/finalize`, {
      method: 'POST'
    });
    return { auth: res.auth };
  }
};
