import { adminFetch } from '../lib/adminApi';
import {
  ProductionActivationGate,
  ProductionActivationGateCheck,
  ProductionActivationGateApproval,
  ProductionActivationGateFinding,
  ProductionActivationGateAuditEvent
} from '../types/financialOperationsProductionActivationReview';

const BASE_URL = '/api/admin/financial-operations/production-activation-review/reviews';

export const listGates = async (): Promise<ProductionActivationGate[]> => {
  return adminFetch<ProductionActivationGate[]>(BASE_URL);
};

export const getGate = async (id: string): Promise<ProductionActivationGate> => {
  return adminFetch<ProductionActivationGate>(`${BASE_URL}/${id}`);
};

export const createGate = async (payload: { gateName?: string; tenantId?: string; evidence?: Record<string, any> }): Promise<ProductionActivationGate> => {
  return adminFetch<ProductionActivationGate>(BASE_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
};

export const evaluateGate = async (id: string): Promise<ProductionActivationGate> => {
  return adminFetch<ProductionActivationGate>(`${BASE_URL}/${id}/evaluate`, { method: 'POST' });
};

export const goNoGo = async (id: string, action: 'approve' | 'reject' | 'revoke'): Promise<ProductionActivationGate> => {
  return adminFetch<ProductionActivationGate>(`${BASE_URL}/${id}/go-no-go`, {
    method: 'POST',
    body: JSON.stringify({ action })
  });
};

export const getChecks = async (id: string): Promise<ProductionActivationGateCheck[]> => {
  return adminFetch<ProductionActivationGateCheck[]>(`${BASE_URL}/${id}/checks`);
};

export const getFindings = async (id: string): Promise<ProductionActivationGateFinding[]> => {
  return adminFetch<ProductionActivationGateFinding[]>(`${BASE_URL}/${id}/findings`);
};

export const getEvidencePack = async (id: string): Promise<Record<string, any>> => {
  return adminFetch<Record<string, any>>(`${BASE_URL}/${id}/evidence-pack`);
};

export const getAudit = async (id: string): Promise<ProductionActivationGateAuditEvent[]> => {
  return adminFetch<ProductionActivationGateAuditEvent[]>(`${BASE_URL}/${id}/audit`);
};

export const getExportPreview = async (id: string): Promise<{ gate: ProductionActivationGate; checks: ProductionActivationGateCheck[]; approvals: ProductionActivationGateApproval[] }> => {
  return adminFetch<{ gate: ProductionActivationGate; checks: ProductionActivationGateCheck[]; approvals: ProductionActivationGateApproval[] }>(`${BASE_URL}/${id}/export-preview`);
};
