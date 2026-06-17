export type ReleaseCandidateStatus =
  | 'DRAFT'
  | 'AGGREGATING'
  | 'READY_FOR_REVIEW'
  | 'CHANGES_REQUIRED'
  | 'VALIDATED'
  | 'REJECTED';

export type FindingSeverity = 'BLOCKER' | 'MAJOR' | 'MINOR' | 'INFO';
export type FindingStatus = 'OPEN' | 'RESOLVED' | 'WONT_FIX';
export type CheckStatus = 'PENDING' | 'PASS' | 'FAIL' | 'BLOCKED';

export interface ReleaseCandidate {
  id: string;
  candidate_ref: string;
  title: string;
  status: ReleaseCandidateStatus;
  phase_113_status: string;
  phase_114_status: string;
  phase_115_status: string;
  phase_116_status: string;
  phase_117_status: string;
  phase_118_status: string;
  phase_119_status: string;
  review_only: boolean;
  production_activation_enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReleaseCandidateCheck {
  check_name: string;
  check_category: string;
  status: CheckStatus;
  detail?: string;
  evaluated_at?: string;
}

export interface ReleaseCandidateFinding {
  id: string;
  candidate_id: string;
  severity: FindingSeverity;
  category: string;
  description: string;
  remediation?: string;
  status: FindingStatus;
  created_by: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
}

export interface PhaseEvidence {
  phase: string;
  label: string;
  status: string;
  evidence?: string;
}

export interface SafetyInvariants {
  PRODUCTION_DEPLOYMENT: string;
  PRODUCTION_ACTIVATION: string;
  FULL_PUBLIC: string;
  LIVE_PROVIDER_CONNECTIVITY: string;
  PAYMENT_EXECUTION: string;
  REFUND_EXECUTION: string;
  PAYOUT_EXECUTION: string;
  EXTERNAL_SUBMISSIONS: string;
  SOURCE_RECORD_MUTATION: string;
}

export interface FinalEvidencePack {
  candidate_ref: string;
  candidate_status: string;
  phase_validation_summary: PhaseEvidence[];
  required_checks: ReleaseCandidateCheck[];
  open_findings: ReleaseCandidateFinding[];
  resolved_findings: ReleaseCandidateFinding[];
  safety_invariants: SafetyInvariants;
  generated_at: string;
}

export interface CreateReleaseCandidatePayload {
  candidate_ref?: string;
  created_by?: string;
  notes?: string;
}

export interface RecordFindingPayload {
  candidate_id?: string;
  severity: FindingSeverity;
  category: string;
  description: string;
  remediation?: string;
}

export interface ResolveFindingPayload {
  finding_id: string;
  candidate_id?: string;
  resolved_by?: string;
  resolution_notes?: string;
}
