import { PlanRecord, PlanRuleCheck, PlanEvidence, PlanAuditLog } from './controlledBetaCohortInterventionExecutionPlan';

const BASE_URL = '/api/admin/beta/cohort-intervention-plan';

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

export const controlledBetaCohortInterventionExecutionPlanClient = {
  async getPlanList(): Promise<PlanRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/plan`);
    return res.planList || [];
  },

  async getPlanDetails(planId: string): Promise<{
    plan: PlanRecord;
    rules: PlanRuleCheck[];
    evidence: PlanEvidence | null;
    auditLogs: PlanAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/plan/${planId}`);
    return {
      plan: res.plan,
      rules: res.rules || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createPlan(dispatcherId: string): Promise<PlanRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/plan/from-dispatcher/${dispatcherId}`, {
      method: 'POST'
    });
    return res.plan;
  },

  async evaluatePlan(planId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/plan/${planId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(planId: string, result: string, rationale: string): Promise<{ plan: PlanRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/plan/${planId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ result, rationale })
    });
    return { plan: res.plan };
  },

  async finalizePlan(planId: string): Promise<{ plan: PlanRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/plan/${planId}/finalize`, {
      method: 'POST'
    });
    return { plan: res.plan };
  }
};
