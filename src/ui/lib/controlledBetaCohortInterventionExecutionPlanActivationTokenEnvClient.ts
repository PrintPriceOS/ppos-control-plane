import { TokenEnvRecord, TokenEnvRuleCheck, TokenEnvEvidence, TokenEnvAuditLog } from './controlledBetaCohortInterventionExecutionPlanActivationTokenEnv';

const BASE_URL = '/api/admin/beta/cohort-intervention-activation-token-env';

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

export const controlledBetaCohortInterventionExecutionPlanActivationTokenEnvClient = {
  async getTokenEnvList(): Promise<TokenEnvRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/env`);
    return res.envList || [];
  },

  async getTokenEnvDetails(activationTokenEnvId: string): Promise<{
    tokenEnv: TokenEnvRecord;
    rules: TokenEnvRuleCheck[];
    evidence: TokenEnvEvidence | null;
    auditLogs: TokenEnvAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/env/${activationTokenEnvId}`);
    return {
      tokenEnv: res.tokenEnv,
      rules: res.rules || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createTokenEnv(activationTokenAuthId: string): Promise<TokenEnvRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/env/from-token-auth/${activationTokenAuthId}`, {
      method: 'POST'
    });
    return res.tokenEnv;
  },

  async evaluateTokenEnv(activationTokenEnvId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/env/${activationTokenEnvId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(activationTokenEnvId: string, result: string, rationale: string): Promise<{ tokenEnv: TokenEnvRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/env/${activationTokenEnvId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ result, rationale })
    });
    return { tokenEnv: res.tokenEnv };
  },

  async finalizeTokenEnv(activationTokenEnvId: string): Promise<{ tokenEnv: TokenEnvRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/env/${activationTokenEnvId}/finalize`, {
      method: 'POST'
    });
    return { tokenEnv: res.tokenEnv };
  }
};
