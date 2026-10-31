import { LockRecord, LockRuleCheck, LockEvidence, LockAuditLog } from './controlledBetaCohortInterventionExecutionPlanActivationLock';

const BASE_URL = '/api/admin/beta/cohort-intervention-activation-lock';

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

export const controlledBetaCohortInterventionExecutionPlanActivationLockClient = {
  async getLockList(): Promise<LockRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/lock`);
    return res.lockList || [];
  },

  async getLockDetails(activationLockId: string): Promise<{
    lock: LockRecord;
    rules: LockRuleCheck[];
    evidence: LockEvidence | null;
    auditLogs: LockAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/lock/${activationLockId}`);
    return {
      lock: res.lock,
      rules: res.rules || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createLock(activationAuthId: string): Promise<LockRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/lock/from-authorization/${activationAuthId}`, {
      method: 'POST'
    });
    return res.lock;
  },

  async evaluateLock(activationLockId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/lock/${activationLockId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(activationLockId: string, result: string, rationale: string): Promise<{ lock: LockRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/lock/${activationLockId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ result, rationale })
    });
    return { lock: res.lock };
  },

  async finalizeLock(activationLockId: string): Promise<{ lock: LockRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/lock/${activationLockId}/finalize`, {
      method: 'POST'
    });
    return { lock: res.lock };
  }
};
