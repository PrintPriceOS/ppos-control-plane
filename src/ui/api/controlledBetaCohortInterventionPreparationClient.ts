import {
  CohortInterventionPreparation,
  CohortInterventionPreparationItem,
  CohortInterventionPreparationEvidence
} from '../types/controlledBetaCohortInterventionPreparation';

export class ControlledBetaCohortInterventionPreparationClient {
  private baseUrl = '/api/admin/beta/cohort-interventions';

  async listPreparations(): Promise<{ ok: boolean; preparations: CohortInterventionPreparation[] }> {
    const res = await fetch(`${this.baseUrl}/preparations`);
    return res.json();
  }

  async getPreparation(preparationId: string): Promise<{
    ok: boolean;
    preparation: CohortInterventionPreparation;
    items: CohortInterventionPreparationItem[];
  }> {
    const res = await fetch(`${this.baseUrl}/preparations/${preparationId}`);
    return res.json();
  }

  async createPreparationFromReview(reviewId: string): Promise<{
    ok: boolean;
    preparation: CohortInterventionPreparation;
    items: CohortInterventionPreparationItem[];
    inputReviewHash: string;
  }> {
    const res = await fetch(`${this.baseUrl}/preparations/from-review/${reviewId}`, {
      method: 'POST'
    });
    return res.json();
  }

  async updateItemStatus(preparationId: string, itemId: string, itemStatus: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/preparations/${preparationId}/items/${itemId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemStatus })
    });
    return res.json();
  }

  async approveRole(preparationId: string, role: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/preparations/${preparationId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });
    return res.json();
  }

  async finalizePreparation(preparationId: string): Promise<{
    ok: boolean;
    preparation: CohortInterventionPreparation;
    evidence: CohortInterventionPreparationEvidence;
  }> {
    const res = await fetch(`${this.baseUrl}/preparations/${preparationId}/finalize`, {
      method: 'POST'
    });
    return res.json();
  }

  async rejectPreparation(preparationId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/preparations/${preparationId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async supersedePreparation(preparationId: string, supersededByPreparationId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/preparations/${preparationId}/supersede`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supersededByPreparationId, reason })
    });
    return res.json();
  }

  async getEvidencePack(preparationId: string): Promise<{ ok: boolean; evidencePack: CohortInterventionPreparationEvidence }> {
    const res = await fetch(`${this.baseUrl}/preparations/${preparationId}/evidence-pack`);
    return res.json();
  }
}

export const cohortInterventionPreparationClient = new ControlledBetaCohortInterventionPreparationClient();
