import {
  CohortInterventionApproval,
  CohortInterventionApprovalStep,
  CohortInterventionApprovalEvidence
} from '../types/controlledBetaCohortInterventionApproval';
import { authenticatedBetaFetch } from './betaApiAuthHelper';

export class ControlledBetaCohortInterventionApprovalClient {
  private baseUrl = '/api/admin/beta/cohort-intervention-approvals';

  async listApprovals(): Promise<{ ok: boolean; approvals?: CohortInterventionApproval[]; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/approvals`);
  }

  async getApproval(approvalId: string): Promise<{
    ok: boolean;
    approval?: CohortInterventionApproval;
    steps?: CohortInterventionApprovalStep[];
    status?: number;
    error?: any;
  }> {
    return authenticatedBetaFetch(`${this.baseUrl}/approvals/${approvalId}`);
  }

  async createApprovalFromPreparation(preparationId: string): Promise<{
    ok: boolean;
    approval?: CohortInterventionApproval;
    steps?: CohortInterventionApprovalStep[];
    status?: number;
    error?: any;
  }> {
    return authenticatedBetaFetch(`${this.baseUrl}/approvals/from-preparation/${preparationId}`, {
      method: 'POST'
    });
  }

  async signStep(approvalId: string, role: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/approvals/${approvalId}/step`, {
      method: 'POST',
      body: JSON.stringify({ role })
    });
  }

  async recordDecision(approvalId: string, decision: string, rationale: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/approvals/${approvalId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, rationale })
    });
  }

  async finalizeApproval(approvalId: string): Promise<{
    ok: boolean;
    approval?: CohortInterventionApproval;
    evidence?: CohortInterventionApprovalEvidence;
    status?: number;
    error?: any;
  }> {
    return authenticatedBetaFetch(`${this.baseUrl}/approvals/${approvalId}/finalize`, {
      method: 'POST'
    });
  }

  async rejectApproval(approvalId: string, reason: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/approvals/${approvalId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async requestChanges(approvalId: string, reason: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/approvals/${approvalId}/request-changes`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async returnToPreparation(approvalId: string, reason: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/approvals/${approvalId}/return-to-preparation`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async escalateApproval(approvalId: string, reason: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/approvals/${approvalId}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async supersedeApproval(approvalId: string, supersededByApprovalId: string, reason: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/approvals/${approvalId}/supersede`, {
      method: 'POST',
      body: JSON.stringify({ supersededByApprovalId, reason })
    });
  }

  async getEvidencePack(approvalId: string): Promise<{ ok: boolean; evidencePack?: CohortInterventionApprovalEvidence; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/approvals/${approvalId}/evidence-pack`);
  }
}

export const cohortInterventionApprovalClient = new ControlledBetaCohortInterventionApprovalClient();
