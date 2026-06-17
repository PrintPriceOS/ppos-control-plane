export type BoardStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'CHANGES_REQUIRED'
  | 'READY_FOR_SIGN_OFF'
  | 'SIGNED_OFF_FOR_CONTROLLED_PRODUCTION_REVIEW'
  | 'REJECTED';

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'CHANGES_REQUIRED' | 'REJECTED';

export type Department =
  | 'OPERATIONS'
  | 'FINANCE'
  | 'TECHNICAL'
  | 'COMPLIANCE'
  | 'SECURITY'
  | 'CUSTOMER_SUPPORT'
  | 'PRINT_PARTNER_SUCCESS';

export type FindingSeverity = 'BLOCKER' | 'MAJOR' | 'MINOR' | 'INFO';
export type FindingStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'WONT_FIX';

export interface BoardSafetyMarkers {
  reviewOnly: true;
  productionActivationEnabled: false;
  fullPublicEnabled: false;
  liveProviderConnectivityEnabled: false;
  paymentExecutionEnabled: false;
  refundExecutionEnabled: false;
  payoutExecutionEnabled: false;
  externalSubmission: false;
  sourceMutation: false;
}

export interface DepartmentReview {
  review_id: string;
  board_id: string;
  department: Department;
  reviewer: string;
  status: ReviewStatus;
  notes?: string | null;
  submitted_at?: string | null;
  created_at: string;
}

export interface BoardFinding {
  finding_id: string;
  board_id: string;
  department: Department;
  severity: FindingSeverity;
  title: string;
  description?: string | null;
  status: FindingStatus;
  raised_by: string;
  resolved_by?: string | null;
  blocks_sign_off: boolean;
  raised_at: string;
  resolved_at?: string | null;
}

export interface BoardAuditEvent {
  audit_id: string;
  board_id: string;
  event_type: string;
  actor: string;
  department?: string | null;
  details_json?: Record<string, unknown>;
  created_at: string;
}

export interface ReadinessBoardSummary {
  board_id: string;
  dry_run_reference_id?: string | null;
  board_status: BoardStatus;
  departments_reviewed: Array<{ department: Department; status: ReviewStatus }>;
  findings_summary: { total: number; open: number; resolved: number; blockers: number };
  safety_invariants: Record<string, boolean>;
  safety: BoardSafetyMarkers;
  phase_safety: string;
  evidence_generated_at: string;
}

export interface BoardReadinessResult {
  board_id: string | null;
  readiness: 'READY_FOR_SIGN_OFF' | 'NOT_READY';
  blockers: string[];
  open_blockers: number;
  pending_departments: Department[];
  all_departments_approved: boolean;
  safety: BoardSafetyMarkers;
  phase_safety: string;
}

export interface CreateBoardPayload {
  dry_run_reference_id?: string;
  requested_by?: string;
}

export interface DepartmentReviewPayload {
  board_id: string;
  department: Department;
  reviewer?: string;
  status: 'APPROVED' | 'CHANGES_REQUIRED' | 'REJECTED';
  notes?: string;
}

export interface RecordFindingPayload {
  board_id: string;
  department?: Department;
  severity?: FindingSeverity;
  title: string;
  description?: string;
  raised_by?: string;
}

export interface ResolveFindingPayload {
  board_id: string;
  finding_id: string;
  resolution?: string;
  resolved_by?: string;
}
