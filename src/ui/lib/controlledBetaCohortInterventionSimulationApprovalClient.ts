import { ApprovalRecord, ApprovalFinding, ApprovalEvidence, ApprovalAuditLog } from './controlledBetaCohortInterventionSimulationApproval';

const BASE_URL = '/api/admin/beta/cohort-intervention-approvals';

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

export const controlledBetaCohortInterventionSimulationApprovalClient = {
  async getApprovals(): Promise<ApprovalRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/approvals`);
    return res.approvals || [];
  },

  async getApproval(approvalId: string): Promise<{
    approval: ApprovalRecord;
    findings: ApprovalFinding[];
    evidence: ApprovalEvidence | null;
    auditLogs: ApprovalAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/approvals/${approvalId}`);
    return {
      approval: res.approval,
      findings: res.findings || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createApproval(prepId: string): Promise<ApprovalRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/approvals/from-preparation/${prepId}`, {
      method: 'POST'
    });
    return res.approval;
  },

  async evaluateApproval(approvalId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/approvals/${approvalId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(approvalId: string, decision: string, rationale: string): Promise<{ approval: ApprovalRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/approvals/${approvalId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, rationale })
    });
    return { approval: res.approval };
  },

  async finalizeApproval(approvalId: string): Promise<{ approval: ApprovalRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/approvals/${approvalId}/finalize`, {
      method: 'POST'
    });
    return { approval: res.approval };
  }
};
