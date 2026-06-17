export type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
export type CheckCategory = 'ENVIRONMENT' | 'MIGRATIONS' | 'BACKUP' | 'SECRETS' | 'OBSERVABILITY' | 'ROLLBACK' | 'SUPPORT' | 'FEATURE_FLAGS';
export type FindingSeverity = 'BLOCKER' | 'MAJOR' | 'MINOR' | 'INFO';
export type FindingStatus = 'OPEN' | 'RESOLVED' | 'WONT_FIX';
export type ReadinessStatus = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'BLOCKED' | 'COMPLETED';

export interface ReadinessResult {
  result_id: string;
  check_id: string;
  check_category: CheckCategory;
  check_name: string;
  status: CheckStatus;
  details: string | null;
  checklist_only: true;
  created_at: string;
}

export interface ReadinessFinding {
  finding_id: string;
  check_id: string;
  severity: FindingSeverity;
  category: string;
  title: string;
  description: string | null;
  raised_by: string;
  status: FindingStatus;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  blocks_deployment: boolean;
  checklist_only: true;
  created_at: string;
}

export interface ReadinessAuditEvent {
  audit_id: string;
  check_id: string;
  event_type: string;
  actor: string;
  category: string | null;
  details_json: Record<string, unknown>;
  checklist_only: true;
  created_at: string;
}

export interface SafetyMarkers {
  checklistOnly: true;
  deploymentExecuted: false;
  productionActivationEnabled: false;
  fullPublicEnabled: false;
  liveProviderConnectivityEnabled: false;
  paymentExecutionEnabled: false;
  refundExecutionEnabled: false;
  payoutExecutionEnabled: false;
  externalSubmission: false;
  sourceMutation: false;
}

export interface CategoryResults {
  environment: ReadinessResult[];
  migrations: ReadinessResult[];
  backup: ReadinessResult[];
  secrets: ReadinessResult[];
  observability: ReadinessResult[];
  rollback: ReadinessResult[];
  support: ReadinessResult[];
}

export interface EvidencePackSummary {
  total: number;
  pass: number;
  warn: number;
  fail: number;
}

export interface EvidencePack {
  check_id: string;
  board_reference_id: string | null;
  status: ReadinessStatus;
  checklist_only: true;
  deployment_executed: false;
  categories: CategoryResults;
  summary: EvidencePackSummary;
  open_blockers: number;
  audit_events: number;
  safety: SafetyMarkers;
  phase_safety_string: string;
  generated_at: string;
}

export interface EvaluatePayload {
  check_id?: string;
  actor?: string;
  board_reference_id?: string;
  backup_timestamp?: string;
  rollback_script_documented?: boolean;
  escalation_contacts_documented?: boolean;
}

export interface RecordFindingPayload {
  check_id: string;
  severity: FindingSeverity;
  category: string;
  title: string;
  description?: string;
  raised_by: string;
}

export interface ResolveFindingPayload {
  finding_id: string;
  check_id: string;
  resolved_by: string;
  resolution_notes?: string;
}
