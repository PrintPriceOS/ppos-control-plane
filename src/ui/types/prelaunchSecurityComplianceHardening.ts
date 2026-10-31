export type SecurityScanStatus = 'PASS' | 'FAIL' | 'WARNING' | 'PENDING';

export type SecurityCheckCategory =
  | 'ENV_EXPOSURE'
  | 'ADMIN_ROUTE_PROTECTION'
  | 'SECRET_LEAKAGE'
  | 'REDACTION'
  | 'ROLE_BOUNDARY'
  | 'COMPLIANCE_GUARDRAIL';

export type FindingCategory =
  | 'SECRET_EXPOSURE'
  | 'ROUTE_UNPROTECTED'
  | 'REDACTION_MISSING'
  | 'ROLE_VIOLATION'
  | 'COMPLIANCE_BREACH';

export type FindingSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FindingStatus = 'OPEN' | 'RESOLVED' | 'WONT_FIX';

export interface SecuritySafetyMarkers {
  reviewOnly: true;
  externalSubmission: false;
  sourceMutation: false;
  productionActivationEnabled: false;
  paymentExecutionEnabled: false;
  refundExecutionEnabled: false;
  payoutExecutionEnabled: false;
  fullPublicEnabled: false;
  liveProviderConnectivityEnabled: false;
}

export interface SecurityFinding {
  pattern?: string;
  files?: string[];
  severity: FindingSeverity;
}

export interface SecurityScanResult {
  check_id: string;
  check_name: string;
  category: SecurityCheckCategory;
  status: SecurityScanStatus;
  findings: SecurityFinding[];
  summary: string;
  safetyMarkers: SecuritySafetyMarkers;
  reviewOnly: true;
}

export interface ComplianceGuardrailResult {
  result_id: string;
  guardrail_name: string;
  category: string;
  status: 'ENFORCED' | 'VIOLATED' | 'WARNING';
  detail: string;
}

export interface SecurityEvidencePack {
  phase: string;
  overall_status: SecurityScanStatus;
  scans: {
    env_exposure: SecurityScanResult;
    admin_route_protection: SecurityScanResult;
    secret_leakage: SecurityScanResult;
    redaction_coverage: SecurityScanResult;
    role_boundary_readiness: SecurityScanResult;
    compliance_guardrails: Record<string, unknown>;
  };
  summary: {
    passed: number;
    failed: number;
    warnings: number;
    total: number;
  };
  safety_invariants: Record<string, string>;
  built_at: string;
  reviewOnly: true;
}

export interface RecordFindingPayload {
  check_id?: string;
  category: FindingCategory;
  severity?: FindingSeverity;
  description: string;
  remediation?: string;
  created_by?: string;
}

export interface ResolveFindingPayload {
  finding_id: string;
  resolved_by?: string;
}
