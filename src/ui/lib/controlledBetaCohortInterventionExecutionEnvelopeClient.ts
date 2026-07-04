import { EnvelopeRecord, EnvelopeRuleCheck, EnvelopeEvidence, EnvelopeAuditLog } from './controlledBetaCohortInterventionExecutionEnvelope';

const BASE_URL = '/api/admin/beta/cohort-intervention-envelope';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const controlledBetaCohortInterventionExecutionEnvelopeClient = {
  async getEnvelopeList(): Promise<EnvelopeRecord[]> {
    const res = await fetchWithAuth(`${BASE_URL}/envelope`);
    return res.envelopeList || [];
  },

  async getEnvelopeDetails(envelopeId: string): Promise<{
    envelope: EnvelopeRecord;
    rules: EnvelopeRuleCheck[];
    evidence: EnvelopeEvidence | null;
    auditLogs: EnvelopeAuditLog[];
  }> {
    const res = await fetchWithAuth(`${BASE_URL}/envelope/${envelopeId}`);
    return {
      envelope: res.envelope,
      rules: res.rules || [],
      evidence: res.evidence || null,
      auditLogs: res.auditLogs || []
    };
  },

  async createEnvelope(authId: string): Promise<EnvelopeRecord> {
    const res = await fetchWithAuth(`${BASE_URL}/envelope/from-auth/${authId}`, {
      method: 'POST'
    });
    return res.envelope;
  },

  async evaluateEnvelope(envelopeId: string, overrides?: any): Promise<{ success: boolean }> {
    const res = await fetchWithAuth(`${BASE_URL}/envelope/${envelopeId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    return res;
  },

  async recordDecision(envelopeId: string, result: string, rationale: string): Promise<{ envelope: EnvelopeRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/envelope/${envelopeId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ result, rationale })
    });
    return { envelope: res.envelope };
  },

  async finalizeEnvelope(envelopeId: string): Promise<{ envelope: EnvelopeRecord }> {
    const res = await fetchWithAuth(`${BASE_URL}/envelope/${envelopeId}/finalize`, {
      method: 'POST'
    });
    return { envelope: res.envelope };
  }
};
