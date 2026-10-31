import { adminFetch } from '../lib/adminApi';
import {
  ProductionActivationGate,
  GateCheck,
  GateApproval,
  AuditTimelineEvent,
  RedactedExportPreview,
  SafetyMarkers
} from '../types/financialOperationsProductionActivation';

const BASE_URL = '/api/admin/financials/activation';

export interface GateResponse {
  ok: boolean;
  gate: ProductionActivationGate;
  checks: GateCheck[];
  approvals: GateApproval[];
  safety: SafetyMarkers;
}

export interface ApproveResponse {
  ok: boolean;
  approval: GateApproval;
  safety: SafetyMarkers;
}

export interface ReviewResponse {
  ok: boolean;
  result: any;
  safety: SafetyMarkers;
}

export interface AuditTimelineResponse {
  ok: boolean;
  timeline: AuditTimelineEvent[];
  safety: SafetyMarkers;
}

export interface RedactedPreviewResponse {
  ok: boolean;
  preview: RedactedExportPreview;
  safety: SafetyMarkers;
}

export const getActivationGate = async (): Promise<GateResponse> => {
  return adminFetch<GateResponse>(`${BASE_URL}/gate`);
};

export const submitApproval = async (payload: {
  role: string;
  approverRef?: string;
  notes?: string;
  reject?: boolean;
}): Promise<ApproveResponse> => {
  return adminFetch<ApproveResponse>(`${BASE_URL}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
};

export const submitReviewAction = async (payload: {
  action: 'APPROVE_GATE' | 'REJECT_GATE' | 'REVOKE_GATE' | 'RESOLVE_FINDING' | 'DISMISS_WARNING' | 'ADD_NOTE' | 'REQUEST_EVIDENCE';
  note?: string;
  noteType?: string;
  findingCode?: string;
  warningText?: string;
}): Promise<ReviewResponse> => {
  return adminFetch<ReviewResponse>(`${BASE_URL}/review`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
};

export const getAuditTimeline = async (): Promise<AuditTimelineResponse> => {
  return adminFetch<AuditTimelineResponse>(`${BASE_URL}/audit-timeline`);
};

export const getRedactedExportPreview = async (): Promise<RedactedPreviewResponse> => {
  return adminFetch<RedactedPreviewResponse>(`${BASE_URL}/preview-redacted`);
};
