import axios from 'axios';
import {
  ActivationTokenStagingRecord,
  ActivationTokenStagingRule,
  StagingSignatures
} from './controlledBetaCohortInterventionExecutionPlanActivationTokenStaging';

const API_BASE = '/api/admin/beta/cohort-intervention-activation-token-staging';

export async function getTokenStagingList(): Promise<ActivationTokenStagingRecord[]> {
  const res = await axios.get(`${API_BASE}/staging`);
  return res.data;
}

export async function getTokenStagingDetails(
  activationTokenStagingId: string
): Promise<{ tokenStaging: ActivationTokenStagingRecord; rules: ActivationTokenStagingRule[] }> {
  const res = await axios.get(`${API_BASE}/staging/${activationTokenStagingId}`);
  return res.data;
}

export async function createTokenStaging(
  activationTokenFinalApvId: string
): Promise<{ tokenStaging: ActivationTokenStagingRecord }> {
  const res = await axios.post(`${API_BASE}/staging/from-final-apv/${activationTokenFinalApvId}`);
  return res.data;
}

export async function evaluateTokenStaging(
  activationTokenStagingId: string,
  signatures: StagingSignatures
): Promise<{ success: boolean; status: string; result: string; rules: ActivationTokenStagingRule[] }> {
  const res = await axios.post(`${API_BASE}/staging/${activationTokenStagingId}/evaluate`, { signatures });
  return res.data;
}

export async function recordDecision(
  activationTokenStagingId: string,
  decision: 'APPROVE' | 'REJECT',
  rationale: string
): Promise<{ status: string; result: string }> {
  const res = await axios.post(`${API_BASE}/staging/${activationTokenStagingId}/decision`, { decision, rationale });
  return res.data;
}

export async function finalizeTokenStaging(
  activationTokenStagingId: string
): Promise<ActivationTokenStagingRecord> {
  const res = await axios.post(`${API_BASE}/staging/${activationTokenStagingId}/finalize`);
  return res.data;
}
