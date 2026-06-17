import { adminFetch as adminApi } from '../lib/adminApi';
import type {
  BoardReadinessResult,
  ReadinessBoardSummary,
  CreateBoardPayload,
  DepartmentReviewPayload,
  RecordFindingPayload,
  ResolveFindingPayload,
} from '../types/preProductionOperationalReadinessBoard';

const BASE = '/api/admin/pre-production/readiness-board';

export async function getBoardReadiness(boardId?: string): Promise<BoardReadinessResult & { ok: boolean }> {
  const params = boardId ? `?board_id=${encodeURIComponent(boardId)}` : '';
  return adminApi(`${BASE}/readiness${params}`);
}

export async function createReadinessBoard(payload: CreateBoardPayload): Promise<{ ok: boolean; board_id: string; status: string; departments: unknown[] }> {
  return adminApi(`${BASE}/create`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function submitDepartmentReview(payload: DepartmentReviewPayload): Promise<{ ok: boolean; board_id: string; department: string; review_status: string }> {
  return adminApi(`${BASE}/department-review`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function recordBoardFinding(payload: RecordFindingPayload): Promise<{ ok: boolean; finding_id: string; severity: string; blocks_sign_off: boolean }> {
  return adminApi(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolveBoardFinding(payload: ResolveFindingPayload): Promise<{ ok: boolean; finding_id: string; status: string }> {
  return adminApi(`${BASE}/resolve-finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getBoardAuditTimeline(boardId: string): Promise<{ ok: boolean; board_id: string; audit_timeline: unknown[] }> {
  return adminApi(`${BASE}/audit-timeline?board_id=${encodeURIComponent(boardId)}`);
}

export async function getBoardEvidencePack(boardId: string): Promise<ReadinessBoardSummary & { ok: boolean }> {
  return adminApi(`${BASE}/evidence-pack?board_id=${encodeURIComponent(boardId)}`);
}
