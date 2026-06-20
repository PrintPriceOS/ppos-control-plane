import { OperationalReviewReadiness, OperationalReviewScore, ExpansionRecommendation, OperationalReviewEvidencePack } from '../types/controlledBetaOperationalReview';

export const evaluateOperationalReviewReadiness = async (activationId: string): Promise<OperationalReviewReadiness> => {
  const res = await fetch(`/api/admin/beta/operational-review/readiness?activationId=${activationId}`);
  if (!res.ok) throw new Error('Failed to fetch readiness');
  return res.json();
};

export const createOperationalReview = async (payload: any): Promise<any> => {
  const res = await fetch(`/api/admin/beta/operational-review/review/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to create review');
  return res.json();
};

export const ingestRuntimeObservationInputs = async (reviewId: string, activationId: string): Promise<any> => {
  const res = await fetch(`/api/admin/beta/operational-review/review/ingest-inputs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewId, activationId })
  });
  if (!res.ok) throw new Error('Failed to ingest inputs');
  return res.json();
};

export const evaluateExitCriteria = async (reviewId: string, activationId: string): Promise<any> => {
  const res = await fetch(`/api/admin/beta/operational-review/review/evaluate-exit-criteria`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewId, activationId })
  });
  if (!res.ok) throw new Error('Failed to evaluate exit criteria');
  return res.json();
};

export const getOperationalReviewScore = async (reviewId: string, activationId: string): Promise<OperationalReviewScore> => {
  const res = await fetch(`/api/admin/beta/operational-review/review/score?reviewId=${reviewId}&activationId=${activationId}`);
  if (!res.ok) throw new Error('Failed to fetch score');
  return res.json();
};

export const getExpansionRecommendation = async (reviewId: string, activationId: string): Promise<ExpansionRecommendation> => {
  const res = await fetch(`/api/admin/beta/operational-review/review/expansion-recommendation?reviewId=${reviewId}&activationId=${activationId}`);
  if (!res.ok) throw new Error('Failed to fetch expansion recommendation');
  return res.json();
};

export const createExitDecisionDraft = async (reviewId: string, activationId: string, type: string): Promise<any> => {
  const res = await fetch(`/api/admin/beta/operational-review/decision/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewId, activationId, type })
  });
  if (!res.ok) throw new Error('Failed to create draft');
  return res.json();
};

export const submitExitDecisionForApproval = async (decisionId: string): Promise<any> => {
  const res = await fetch(`/api/admin/beta/operational-review/decision/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decisionId })
  });
  if (!res.ok) throw new Error('Failed to submit decision');
  return res.json();
};

export const approveExitDecision = async (decisionId: string, approvedBy: string): Promise<any> => {
  const res = await fetch(`/api/admin/beta/operational-review/decision/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decisionId, approvedBy })
  });
  if (!res.ok) throw new Error('Failed to approve decision');
  return res.json();
};

export const buildOperationalReviewEvidencePack = async (reviewId: string, activationId: string): Promise<OperationalReviewEvidencePack> => {
  const res = await fetch(`/api/admin/beta/operational-review/evidence-pack?reviewId=${reviewId}&activationId=${activationId}`);
  if (!res.ok) throw new Error('Failed to fetch evidence pack');
  return res.json();
};
