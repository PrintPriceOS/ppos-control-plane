import { RuntimeObservationReadiness, RuntimeHealthSnapshot, RuntimeRiskScore } from '../types/controlledBetaRuntimeObservation';

export class ControlledBetaRuntimeObservationClient {
  private baseUrl = '/api/admin/beta/runtime-observation';

  async getReadiness(activationId: string): Promise<RuntimeObservationReadiness> {
    const res = await fetch(`${this.baseUrl}/readiness?activation_id=${activationId}`);
    return res.json();
  }

  async getHealthSnapshot(activationId: string): Promise<RuntimeHealthSnapshot> {
    const res = await fetch(`${this.baseUrl}/health-snapshot?activation_id=${activationId}`);
    return res.json();
  }

  async getRiskScore(activationId: string): Promise<RuntimeRiskScore> {
    const res = await fetch(`${this.baseUrl}/risk-score?activation_id=${activationId}`);
    return res.json();
  }

  async getDashboardState(activationId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/dashboard-state?activation_id=${activationId}`);
    return res.json();
  }

  async getEvidencePack(activationId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/evidence-pack?activation_id=${activationId}`);
    return res.json();
  }

  async getAuditTimeline(activationId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/audit-timeline?activation_id=${activationId}`);
    return res.json();
  }
}

export const observationClient = new ControlledBetaRuntimeObservationClient();
