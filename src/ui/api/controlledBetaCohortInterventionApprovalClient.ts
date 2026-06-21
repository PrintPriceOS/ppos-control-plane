import {
  CohortInterventionApproval,
  CohortInterventionApprovalStep,
  CohortInterventionApprovalEvidence
} from '../types/controlledBetaCohortInterventionApproval';

export class ControlledBetaCohortInterventionApprovalClient {
  private baseUrl = '/api/admin/beta/cohort-intervention-approvals';

  async listApprovals(): Promise<{ ok: boolean; approvals: CohortInterventionApproval[] }> {
    const res = await fetch(`${this.baseUrl}/approvals`);
    return res.json();
  }

  async getApproval(approvalId: string): Promise<{
    ok: boolean;
    approval: CohortInterventionApproval;
    steps: CohortInterventionApprovalStep[];
  }> {
    const res = await fetch(`${this.baseUrl}/approvals/${approvalId}`);
    return res.json();
  }

  async createApprovalFromPreparation(preparationId: string): Promise<{
    ok: boolean;
    approval: CohortInterventionApproval;
    steps: CohortInterventionApprovalStep[];
  }> {
    const res = await fetch(`${this.baseUrl}/approvals/from-preparation/${preparationId}`, {
      method: 'POST'
    });
    return res.json();
  }

  async signStep(approvalId: string, role: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/approvals/${approvalId}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });
    return res.json();
  }

  async recordDecision(approvalId: string, decision: string, rationale: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/approvals/${approvalId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, rationale })
    });
    return res.json();
  }

  async finalizeApproval(approvalId: string): Promise<{
    ok: boolean;
    approval: CohortInterventionApproval;
    evidence: CohortInterventionApprovalEvidence;
  }> {
    const res = await fetch(`${this.baseUrl}/approvals/${approvalId}/finalize`, {
      method: 'POST'
    });
    return res.json();
  }

  async rejectApproval(approvalId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/approvals/${approvalId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async requestChanges(approvalId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/approvals/${approvalId}/request-changes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async returnToPreparation(approvalId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/approvals/${approvalId}/return-to-preparation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async escalateApproval(approvalId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/approvals/${approvalId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async supersedeApproval(approvalId: string, supersededByApprovalId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/approvals/${approvalId}/supersede`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supersededByApprovalId, reason })
    });
    return res.json();
  }

  async getEvidencePack(approvalId: string): Promise<{ ok: boolean; evidencePack: CohortInterventionApprovalEvidence }> {
    const res = await fetch(`${this.baseUrl}/approvals/${approvalId}/evidence-pack`);
    return res.json();
  }
}

export const cohortInterventionApprovalClient = new ControlledBetaCohortInterventionApprovalClient();
