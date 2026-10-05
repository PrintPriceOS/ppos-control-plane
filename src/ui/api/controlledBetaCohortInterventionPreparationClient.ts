import {
  CohortInterventionPreparation,
  CohortInterventionPreparationItem,
  CohortInterventionPreparationEvidence
} from '../types/controlledBetaCohortInterventionPreparation';
import { authenticatedBetaFetch } from './betaApiAuthHelper';

export class ControlledBetaCohortInterventionPreparationClient {
  private baseUrl = '/api/admin/beta/cohort-interventions';

  async listPreparations(): Promise<{ ok: boolean; preparations?: CohortInterventionPreparation[]; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/preparations`);
  }

  async getPreparation(preparationId: string): Promise<{
    ok: boolean;
    preparation?: CohortInterventionPreparation;
    items?: CohortInterventionPreparationItem[];
    status?: number;
    error?: any;
  }> {
    return authenticatedBetaFetch(`${this.baseUrl}/preparations/${preparationId}`);
  }

  async createPreparationFromReview(reviewId: string): Promise<{
    ok: boolean;
    preparation?: CohortInterventionPreparation;
    items?: CohortInterventionPreparationItem[];
    inputReviewHash?: string;
    status?: number;
    error?: any;
  }> {
    return authenticatedBetaFetch(`${this.baseUrl}/preparations/from-review/${reviewId}`, {
      method: 'POST'
    });
  }

  async updateItemStatus(preparationId: string, itemId: string, itemStatus: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/preparations/${preparationId}/items/${itemId}`, {
      method: 'POST',
      body: JSON.stringify({ itemStatus })
    });
  }

  async approveRole(preparationId: string, role: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/preparations/${preparationId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ role })
    });
  }

  async finalizePreparation(preparationId: string): Promise<{
    ok: boolean;
    preparation?: CohortInterventionPreparation;
    evidence?: CohortInterventionPreparationEvidence;
    status?: number;
    error?: any;
  }> {
    return authenticatedBetaFetch(`${this.baseUrl}/preparations/${preparationId}/finalize`, {
      method: 'POST'
    });
  }

  async rejectPreparation(preparationId: string, reason: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/preparations/${preparationId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async supersedePreparation(preparationId: string, supersededByPreparationId: string, reason: string): Promise<{ ok: boolean; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/preparations/${preparationId}/supersede`, {
      method: 'POST',
      body: JSON.stringify({ supersededByPreparationId, reason })
    });
  }

  async getEvidencePack(preparationId: string): Promise<{ ok: boolean; evidencePack?: CohortInterventionPreparationEvidence; status?: number; error?: any }> {
    return authenticatedBetaFetch(`${this.baseUrl}/preparations/${preparationId}/evidence-pack`);
  }
}

export const cohortInterventionPreparationClient = new ControlledBetaCohortInterventionPreparationClient();
