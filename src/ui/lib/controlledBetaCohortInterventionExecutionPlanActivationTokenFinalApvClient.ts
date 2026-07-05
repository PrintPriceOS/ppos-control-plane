import {
  CohortInterventionExecutionPlanActivationTokenFinalApv,
  ActivationTokenFinalApvDetails
} from './controlledBetaCohortInterventionExecutionPlanActivationTokenFinalApv';

export async function getTokenFinalApvList(): Promise<CohortInterventionExecutionPlanActivationTokenFinalApv[]> {
  const res = await fetch('/api/admin/beta/cohort-intervention-activation-token-final-apv/apv');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to list final approvals');
  return json.data;
}

export async function getTokenFinalApvDetails(activationTokenFinalApvId: string): Promise<ActivationTokenFinalApvDetails> {
  const res = await fetch(`/api/admin/beta/cohort-intervention-activation-token-final-apv/apv/${activationTokenFinalApvId}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to fetch details');
  return json.data;
}

export async function createTokenFinalApv(activationTokenEnvId: string): Promise<CohortInterventionExecutionPlanActivationTokenFinalApv> {
  const res = await fetch(`/api/admin/beta/cohort-intervention-activation-token-final-apv/apv/from-token-env/${activationTokenEnvId}`, {
    method: 'POST'
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to create draft');
  return json.data;
}

export async function evaluateTokenFinalApv(activationTokenFinalApvId: string, overrides: any = {}): Promise<any> {
  const res = await fetch(`/api/admin/beta/cohort-intervention-activation-token-final-apv/apv/${activationTokenFinalApvId}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to evaluate');
  return json.evaluation;
}

export async function recordDecision(activationTokenFinalApvId: string, result: string, rationale: string): Promise<CohortInterventionExecutionPlanActivationTokenFinalApv> {
  const res = await fetch(`/api/admin/beta/cohort-intervention-activation-token-final-apv/apv/${activationTokenFinalApvId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ result, rationale })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to record decision');
  return json.data;
}

export async function finalizeTokenFinalApv(activationTokenFinalApvId: string): Promise<CohortInterventionExecutionPlanActivationTokenFinalApv> {
  const res = await fetch(`/api/admin/beta/cohort-intervention-activation-token-final-apv/apv/${activationTokenFinalApvId}/finalize`, {
    method: 'POST'
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to finalize');
  return json.data;
}
