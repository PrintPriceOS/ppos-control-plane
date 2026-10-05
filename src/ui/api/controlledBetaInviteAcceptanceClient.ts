import { InviteAcceptanceGate, InviteAcceptanceClaim, OnboardingParticipant, TermsAcceptance, SessionLimits, AccessPolicy, InviteAcceptanceReadiness } from '../types/controlledBetaInviteAcceptance';
import { authenticatedBetaFetch } from './betaApiAuthHelper';

export class ControlledBetaInviteAcceptanceClient {
  private baseUrl = '/api/admin/beta/invite-acceptance';

  async getReadiness(gateId: string): Promise<InviteAcceptanceReadiness> {
    return authenticatedBetaFetch(`${this.baseUrl}/readiness/${gateId}`);
  }

  async createGate(data: any): Promise<{ ok: boolean; gate?: InviteAcceptanceGate; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async claimInvite(gateId: string, data: { code: string; token: string; claimAttemptHash?: string; ip?: string; userAgent?: string }): Promise<{ ok: boolean; claim?: InviteAcceptanceClaim; error?: any; status?: number }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/claim`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async bindIdentity(gateId: string, data: { externalRef: string; email: string; label: string }): Promise<{ ok: boolean; participant?: OnboardingParticipant; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/bind-identity`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async acceptTerms(gateId: string, data: { participantId: string; termsVersion: string; termsHash: string; acceptedBy?: string; method?: string }): Promise<{ ok: boolean; termsAcceptance?: TermsAcceptance; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/terms`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async setSessionLimits(gateId: string, data: { participantId: string; max_sessions: number; max_concurrent_sessions: number; session_ttl_minutes: number; daily_action_limit: number; feature_scope_json?: any }): Promise<{ ok: boolean; sessionLimits?: SessionLimits; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/session-limits`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async setAccessPolicy(gateId: string, data: { participantId: string; policy_status: string; allowed_features_json: string[]; denied_features_json: string[]; runtime_scope_json?: any }): Promise<{ ok: boolean; accessPolicy?: AccessPolicy; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/access-policy`, {
      method: 'POST',
      body: JSON.stringify(data)
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

  async block(gateId: string, reasons: string[] | string): Promise<{ ok: boolean; status?: string; error?: any }> {
    const reasonList = Array.isArray(reasons) ? reasons : [reasons];
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/block`, {
      method: 'POST',
      body: JSON.stringify({ reasons: reasonList })
    });
  }

  async grantRuntimeAccess(gateId: string): Promise<{ ok: boolean; runtime_access_granted?: boolean; error?: any; status?: number }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/grant-runtime-access`, {
      method: 'POST'
    });
  }

  async revoke(gateId: string, reason: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/gates/${gateId}/revoke`, {
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

export const inviteAcceptanceClient = new ControlledBetaInviteAcceptanceClient();
