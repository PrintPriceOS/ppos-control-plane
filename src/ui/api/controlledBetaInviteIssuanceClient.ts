import { InviteIssuanceGate, InviteIssuanceBatch, InviteIssuanceRecipient, InviteRecord, InviteIssuanceReadiness } from '../types/controlledBetaInviteIssuance';

export class ControlledBetaInviteIssuanceClient {
  private baseUrl = '/api/admin/beta/invite-issuance';

  async getReadiness(gateId: string): Promise<InviteIssuanceReadiness> {
    const res = await fetch(`${this.baseUrl}/readiness/${gateId}`);
    return res.json();
  }

  async createGate(data: any): Promise<{ ok: boolean; gate: InviteIssuanceGate }> {
    const res = await fetch(`${this.baseUrl}/gates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async bindPreparation(gateId: string, preparationId: string, evidencePackId: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/bind-preparation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preparationId, evidencePackId })
    });
    return res.json();
  }

  async createBatch(gateId: string, data: any): Promise<{ ok: boolean; batch: InviteIssuanceBatch }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async addRecipient(batchId: string, data: any): Promise<{ ok: boolean; recipient: InviteIssuanceRecipient }> {
    const res = await fetch(`${this.baseUrl}/batches/${batchId}/recipients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async validateBatch(batchId: string): Promise<{ ok: boolean; reason?: string }> {
    const res = await fetch(`${this.baseUrl}/batches/${batchId}/validate`, {
      method: 'POST'
    });
    return res.json();
  }

  async runGuardrails(gateId: string): Promise<{ ok: boolean; checks: any[] }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/guardrails`, {
      method: 'POST'
    });
    return res.json();
  }

  async submitForApproval(gateId: string): Promise<{ ok: boolean; status: string }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/submit`, {
      method: 'POST'
    });
    return res.json();
  }

  async approve(gateId: string): Promise<{ ok: boolean; status: string }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/approve`, {
      method: 'POST'
    });
    return res.json();
  }

  async reject(gateId: string, reason: string): Promise<{ ok: boolean; status: string }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async block(gateId: string, reason: string): Promise<{ ok: boolean; status: string }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async issueBatch(batchId: string): Promise<{ ok: boolean; invites?: InviteRecord[]; error?: string }> {
    const res = await fetch(`${this.baseUrl}/batches/${batchId}/issue`, {
      method: 'POST'
    });
    return res.json();
  }

  async revokeInvite(inviteRecordId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/invites/${inviteRecordId}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async revokeBatch(batchId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/batches/${batchId}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async getEvidencePack(gateId: string): Promise<{ ok: boolean; evidencePack: any }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/evidence-pack`);
    return res.json();
  }

  async getAuditTimeline(gateId: string): Promise<{ ok: boolean; timeline: any[] }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/audit-timeline`);
    return res.json();
  }

  async getDashboard(): Promise<{ ok: boolean; dashboard: any }> {
    const res = await fetch(`${this.baseUrl}/dashboard`);
    return res.json();
  }
}

export const inviteIssuanceClient = new ControlledBetaInviteIssuanceClient();
