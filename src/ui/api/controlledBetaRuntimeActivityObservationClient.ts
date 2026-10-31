import {
  RuntimeActivityObservationGate,
  RuntimeActivityEvent,
  RuntimeActivityBlockedAttempt,
  RuntimeActivityAnomalySignal,
  RuntimeActivityHealthSignal,
  ParticipantUsageSummary,
  CohortUsageSummary
} from '../types/controlledBetaRuntimeActivityObservation';

export class ControlledBetaRuntimeActivityObservationClient {
  private baseUrl = '/api/admin/beta/runtime-activity';

  async getReadiness(observationGateId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/readiness/${observationGateId}`);
    return res.json();
  }

  async createGate(data: any): Promise<{ ok: boolean; gate: RuntimeActivityObservationGate }> {
    const res = await fetch(`${this.baseUrl}/gates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async ingestEvent(observationGateId: string, data: any): Promise<{ ok: boolean; event: RuntimeActivityEvent }> {
    const res = await fetch(`${this.baseUrl}/gates/${observationGateId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async recordBlockedAttempt(observationGateId: string, data: any): Promise<{ ok: boolean; blockedAttempt: RuntimeActivityBlockedAttempt }> {
    const res = await fetch(`${this.baseUrl}/gates/${observationGateId}/blocked-attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async recordAnomalySignal(observationGateId: string, data: any): Promise<{ ok: boolean; anomalySignal: RuntimeActivityAnomalySignal }> {
    const res = await fetch(`${this.baseUrl}/gates/${observationGateId}/anomaly-signals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async recordHealthSignal(observationGateId: string, data: any): Promise<{ ok: boolean; healthSignal: RuntimeActivityHealthSignal }> {
    const res = await fetch(`${this.baseUrl}/gates/${observationGateId}/health-signals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async runGuardrails(observationGateId: string): Promise<{ ok: boolean; checks: any[] }> {
    const res = await fetch(`${this.baseUrl}/gates/${observationGateId}/guardrails`, {
      method: 'POST'
    });
    return res.json();
  }

  async createFinding(observationGateId: string, data: any): Promise<{ ok: boolean; finding: any }> {
    const res = await fetch(`${this.baseUrl}/gates/${observationGateId}/findings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async resolveFinding(observationGateId: string, findingId: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/gates/${observationGateId}/findings/${findingId}/resolve`, {
      method: 'POST'
    });
    return res.json();
  }

  async getParticipantSummary(observationGateId: string, participantId: string): Promise<{ ok: boolean; participantSummary: ParticipantUsageSummary }> {
    const res = await fetch(`${this.baseUrl}/gates/${observationGateId}/participant-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId })
    });
    return res.json();
  }

  async getCohortSummary(cohortId: string, tenantId: string): Promise<{ ok: boolean; cohortSummary: CohortUsageSummary }> {
    const res = await fetch(`${this.baseUrl}/cohorts/${cohortId}/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId })
    });
    return res.json();
  }

  async getEvidencePack(observationGateId: string): Promise<{ ok: boolean; evidencePack: any }> {
    const res = await fetch(`${this.baseUrl}/gates/${observationGateId}/evidence-pack`);
    return res.json();
  }

  async getAuditTimeline(observationGateId: string): Promise<{ ok: boolean; timeline: any[] }> {
    const res = await fetch(`${this.baseUrl}/gates/${observationGateId}/audit-timeline`);
    return res.json();
  }

  async getDashboard(): Promise<{ ok: boolean; dashboard: any }> {
    const res = await fetch(`${this.baseUrl}/dashboard`);
    return res.json();
  }
}

export const runtimeActivityObservationClient = new ControlledBetaRuntimeActivityObservationClient();
