import { InviteAcceptanceGate, InviteAcceptanceClaim, OnboardingParticipant, TermsAcceptance, SessionLimits, AccessPolicy, InviteAcceptanceReadiness } from '../types/controlledBetaInviteAcceptance';

export class ControlledBetaInviteAcceptanceClient {
  private baseUrl = '/api/admin/beta/invite-acceptance';

  async getReadiness(gateId: string): Promise<InviteAcceptanceReadiness> {
    const res = await fetch(`${this.baseUrl}/readiness/${gateId}`);
    return res.json();
  }

  async createGate(data: any): Promise<{ ok: boolean; gate: InviteAcceptanceGate }> {
    const res = await fetch(`${this.baseUrl}/gates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async claimInvite(gateId: string, data: { code: string; token: string; claimAttemptHash?: string; ip?: string; userAgent?: string }): Promise<{ ok: boolean; claim?: InviteAcceptanceClaim; error?: string }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async bindIdentity(gateId: string, data: { externalRef: string; email: string; label: string }): Promise<{ ok: boolean; participant?: OnboardingParticipant }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/bind-identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async acceptTerms(gateId: string, data: { participantId: string; termsVersion: string; termsHash: string; acceptedBy?: string; method?: string }): Promise<{ ok: boolean; termsAcceptance?: TermsAcceptance }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/terms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async setSessionLimits(gateId: string, data: { participantId: string; max_sessions: number; max_concurrent_sessions: number; session_ttl_minutes: number; daily_action_limit: number; feature_scope_json?: any }): Promise<{ ok: boolean; sessionLimits?: SessionLimits }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/session-limits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async setAccessPolicy(gateId: string, data: { participantId: string; policy_status: string; allowed_features_json: string[]; denied_features_json: string[]; runtime_scope_json?: any }): Promise<{ ok: boolean; accessPolicy?: AccessPolicy }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/access-policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
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

  async grantRuntimeAccess(gateId: string): Promise<{ ok: boolean; runtime_access_granted?: boolean; error?: string }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/grant-runtime-access`, {
      method: 'POST'
    });
    return res.json();
  }

  async revoke(gateId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/revoke`, {
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

export const inviteAcceptanceClient = new ControlledBetaInviteAcceptanceClient();
