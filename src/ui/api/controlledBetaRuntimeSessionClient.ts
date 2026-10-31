import { RuntimeSessionGate, RuntimeSession, RuntimeSessionLimits, RuntimeSessionReadiness } from '../types/controlledBetaRuntimeSession';

export class ControlledBetaRuntimeSessionClient {
  private baseUrl = '/api/admin/beta/runtime-sessions';

  async getReadiness(gateId: string): Promise<RuntimeSessionReadiness> {
    const res = await fetch(`${this.baseUrl}/readiness/${gateId}`);
    return res.json();
  }

  async createGate(data: any): Promise<{ ok: boolean; gate: RuntimeSessionGate }> {
    const res = await fetch(`${this.baseUrl}/gates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async bindAcceptance(gateId: string, acceptanceGateId: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/bind-acceptance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acceptanceGateId })
    });
    return res.json();
  }

  async setSessionLimits(gateId: string, data: { participantId: string; max_sessions: number; max_concurrent_sessions: number; session_ttl_minutes: number; daily_action_limit: number; feature_scope_json?: any }): Promise<{ ok: boolean; sessionLimits?: RuntimeSessionLimits }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/session-limits`, {
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

  async createSession(gateId: string): Promise<{ ok: boolean; session?: RuntimeSession; error?: string }> {
    const res = await fetch(`${this.baseUrl}/gates/${gateId}/sessions`, {
      method: 'POST'
    });
    return res.json();
  }

  async evaluateFeatureAccess(sessionId: string, data: { featureKey: string; contextScope?: any }): Promise<{ ok: boolean; access_status: string; access_reason: string }> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/feature-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async sendHeartbeat(sessionId: string, metadata?: any): Promise<{ ok: boolean; heartbeat?: any }> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata })
    });
    return res.json();
  }

  async sendEvent(sessionId: string, data: { eventType: string; status: string; featureKey?: string; details?: any }): Promise<{ ok: boolean; event?: any }> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async closeSession(sessionId: string, reason?: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async revokeSession(sessionId: string, reason?: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async revokeParticipantSessions(participantId: string, reason?: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/participants/${participantId}/revoke-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async expireSessions(): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/expire`, {
      method: 'POST'
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

export const runtimeSessionClient = new ControlledBetaRuntimeSessionClient();
