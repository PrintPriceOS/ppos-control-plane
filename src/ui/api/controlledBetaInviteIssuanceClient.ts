import { InviteIssuanceGate, InviteIssuanceBatch, InviteIssuanceRecipient, InviteRecord, InviteIssuanceReadiness } from '../types/controlledBetaInviteIssuance';
import { authenticatedBetaFetch } from './betaApiAuthHelper';

export class ControlledBetaInviteIssuanceClient {
  private baseUrl = '/api/admin/beta/invite-issuance';

  async getReadiness(gateId: string): Promise<InviteIssuanceReadiness> {
    return authenticatedBetaFetch(`${this.baseUrl}/readiness/${gateId}`);
  }

  async createGate(data: any): Promise<{ ok: boolean; gate?: InviteIssuanceGate; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async bindPreparation(gateId: string, preparationId: string, evidencePackId: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/bind-preparation`, {
      method: 'POST',
      body: JSON.stringify({ preparationId, evidencePackId })
    });
  }

  async createBatch(gateId: string, data: any): Promise<{ ok: boolean; batch?: InviteIssuanceBatch; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/batches`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async addRecipient(batchId: string, data: any): Promise<{ ok: boolean; recipient?: InviteIssuanceRecipient; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/batches/${batchId}/recipients`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async validateBatch(batchId: string): Promise<{ ok: boolean; reason?: string; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/batches/${batchId}/validate`, {
      method: 'POST'
    });
  }

  async runGuardrails(gateId: string): Promise<{ ok: boolean; checks?: any[]; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/guardrails`, {
      method: 'POST'
    });
  }

  async submitForApproval(gateId: string): Promise<{ ok: boolean; status?: string; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/submit`, {
      method: 'POST'
    });
  }

  async approve(gateId: string): Promise<{ ok: boolean; status?: string; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/approve`, {
      method: 'POST'
    });
  }

  async reject(gateId: string, reason: string): Promise<{ ok: boolean; status?: string; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async block(gateId: string, reason: string): Promise<{ ok: boolean; status?: string; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/block`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async issueBatch(batchId: string): Promise<{ ok: boolean; invites?: InviteRecord[]; error?: any; status?: number }> {
    return authenticatedBetaFetch(`${this.baseUrl}/batches/${batchId}/issue`, {
      method: 'POST'
    });
  }

  async revokeInvite(inviteRecordId: string, reason: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/invites/${inviteRecordId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async revokeBatch(batchId: string, reason: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/batches/${batchId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async getEvidencePack(gateId: string): Promise<{ ok: boolean; evidencePack?: any; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/evidence-pack`);
  }

  async getAuditTimeline(gateId: string): Promise<{ ok: boolean; timeline?: any[]; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/audit-timeline`);
  }

  async getDashboard(): Promise<{ ok: boolean; dashboard?: any; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/dashboard`);
  }
}

export const inviteIssuanceClient = new ControlledBetaInviteIssuanceClient();
