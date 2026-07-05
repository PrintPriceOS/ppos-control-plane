import { TokenAuthRecord, TokenAuthRuleCheck, TokenAuthEvidence, TokenAuthAuditLog } from './controlledBetaCohortInterventionExecutionPlanActivationTokenAuth';

const BASE_URL = '/api/admin/beta/cohort-intervention-activation-token-auth';

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

export const controlledBetaCohortInterventionExecutionPlanActivationTokenAuthClient = {
  async getTokenAuthList(): Promise<TokenAuthRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/auth`);
    return res.authList || [];
  },

  async getTokenAuthDetails(activationTokenAuthId: string): Promise<{
    tokenAuth: TokenAuthRecord;
    rules: TokenAuthRuleCheck[];
    evidence: TokenAuthEvidence | null;
    auditLogs: TokenAuthAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/auth/${activationTokenAuthId}`);
    return {
      tokenAuth: res.tokenAuth,
      rules: res.rules || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createTokenAuth(activationHandoffId: string): Promise<TokenAuthRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/auth/from-handoff/${activationHandoffId}`, {
      method: 'POST'
    });
    return res.tokenAuth;
  },

  async evaluateTokenAuth(activationTokenAuthId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/auth/${activationTokenAuthId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(activationTokenAuthId: string, result: string, rationale: string): Promise<{ tokenAuth: TokenAuthRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/auth/${activationTokenAuthId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ result, rationale })
    });
    return { tokenAuth: res.tokenAuth };
  },

  async finalizeTokenAuth(activationTokenAuthId: string): Promise<{ tokenAuth: TokenAuthRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/auth/${activationTokenAuthId}/finalize`, {
      method: 'POST'
    });
    return { tokenAuth: res.tokenAuth };
  }
};
