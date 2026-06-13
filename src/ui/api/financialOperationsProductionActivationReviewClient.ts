import {
  ProductionActivationGate,
  ProductionActivationGateCheck,
  ProductionActivationGateApproval,
  ProductionActivationGateFinding,
  ProductionActivationGateAuditEvent
} from '../types/financialOperationsProductionActivationReview';

const BASE_URL = '/api/admin/financial-operations/production-activation-review/reviews';

export const listGates = async (): Promise<ProductionActivationGate[]> => {
  const res = await fetch(BASE_URL);
  if (!res.ok) throw new Error(await res.text() || 'Failed to fetch gates');
  return res.json();
};

export const getGate = async (id: string): Promise<ProductionActivationGate> => {
  const res = await fetch(`${BASE_URL}/${id}`);
  if (!res.ok) throw new Error(await res.text() || 'Failed to fetch gate');
  return res.json();
};

export const createGate = async (payload: { gateName?: string; tenantId?: string; evidence?: Record<string, any> }): Promise<ProductionActivationGate> => {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(await res.text() || 'Failed to create gate');
  return res.json();
};

export const evaluateGate = async (id: string): Promise<ProductionActivationGate> => {
  const res = await fetch(`${BASE_URL}/${id}/evaluate`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text() || 'Failed to evaluate gate');
  return res.json();
};

export const goNoGo = async (id: string, action: 'approve' | 'reject' | 'revoke'): Promise<ProductionActivationGate> => {
  const res = await fetch(`${BASE_URL}/${id}/go-no-go`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
  if (!res.ok) throw new Error(await res.text() || 'Failed to cast go-no-go decision');
  return res.json();
};

export const getChecks = async (id: string): Promise<ProductionActivationGateCheck[]> => {
  const res = await fetch(`${BASE_URL}/${id}/checks`);
  if (!res.ok) throw new Error(await res.text() || 'Failed to fetch gate checks');
  return res.json();
};

export const getFindings = async (id: string): Promise<ProductionActivationGateFinding[]> => {
  const res = await fetch(`${BASE_URL}/${id}/findings`);
  if (!res.ok) throw new Error(await res.text() || 'Failed to fetch gate findings');
  return res.json();
};

export const getEvidencePack = async (id: string): Promise<Record<string, any>> => {
  const res = await fetch(`${BASE_URL}/${id}/evidence-pack`);
  if (!res.ok) throw new Error(await res.text() || 'Failed to fetch evidence pack');
  return res.json();
};

export const getAudit = async (id: string): Promise<ProductionActivationGateAuditEvent[]> => {
  const res = await fetch(`${BASE_URL}/${id}/audit`);
  if (!res.ok) throw new Error(await res.text() || 'Failed to fetch audit events');
  return res.json();
};

export const getExportPreview = async (id: string): Promise<{ gate: ProductionActivationGate; checks: ProductionActivationGateCheck[]; approvals: ProductionActivationGateApproval[] }> => {
  const res = await fetch(`${BASE_URL}/${id}/export-preview`);
  if (!res.ok) throw new Error(await res.text() || 'Failed to fetch export preview');
  return res.json();
};
