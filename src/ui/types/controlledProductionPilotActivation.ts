export interface PilotSafetyMarkers {
  controlledPilotOnly: boolean;
  fullPublicEnabled: boolean;
  openMarketplaceEnabled: boolean;
  unrestrictedLiveProviderConnectivityEnabled: boolean;
  paymentExecutionEnabled: boolean;
  refundExecutionEnabled: boolean;
  payoutExecutionEnabled: boolean;
  externalSubmission: boolean;
  sourceMutation: boolean;
  rollbackAvailable: boolean;
}

export interface PilotRun {
  pilot_run_id: string;
  pilot_run_name: string;
  pilot_run_status: string;
  created_by: string;
  phase120_validated: boolean;
  phase120_1_validated: boolean;
  latest_build_evidence: string | null;
  latest_migrations_applied: boolean;
  db_backup_timestamp: string | null;
  security_compliance_pass: boolean;
  incident_readiness_pass: boolean;
  rollback_drill_pass: boolean;
  controlled_pilot_only: boolean;
  full_public_enabled: boolean;
  open_marketplace_enabled: boolean;
  unrestricted_live_provider_connectivity_enabled: boolean;
  payment_execution_enabled: boolean;
  refund_execution_enabled: boolean;
  payout_execution_enabled: boolean;
  external_submission: boolean;
  source_mutation: boolean;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PilotTenant {
  id: string;
  pilot_run_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_status: string;
  registered_by: string;
  activated_at: string | null;
  suspended_at: string | null;
  completed_at: string | null;
  suspension_reason: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PilotCheck {
  check_name: string;
  check_status: string;
}

export interface PilotFinding {
  id: string;
  pilot_run_id: string;
  tenant_id: string | null;
  finding_type: string;
  finding_status: string;
  description: string;
  resolution: string | null;
  created_by: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PilotRollbackPoint {
  id: string;
  pilot_run_id: string;
  tenant_id: string | null;
  rollback_point_name: string;
  rollback_status: string;
  snapshot_json: Record<string, unknown>;
  simulation_result_json: Record<string, unknown> | null;
  created_by: string;
  simulated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PilotAuditEntry {
  audit_id: string;
  pilot_run_id: string;
  tenant_id: string | null;
  event_type: string;
  actor: string;
  detail_json: Record<string, unknown>;
  safety_markers: PilotSafetyMarkers;
  created_at: string;
}

export interface PilotReadinessResult {
  pilot_run_id: string;
  readiness_status: 'READY_FOR_TENANT_ACTIVATION' | 'BLOCKED';
  checks: PilotCheck[];
  safety: PilotSafetyMarkers;
  safety_message: string;
}

export interface PilotEvidencePack {
  pilot_run_id: string;
  pilot_run: PilotRun;
  tenants: PilotTenant[];
  checks: PilotCheck[];
  findings: PilotFinding[];
  open_findings: PilotFinding[];
  resolved_findings: PilotFinding[];
  rollback_points: PilotRollbackPoint[];
  audit_count: number;
  generated_at: string;
  safety: PilotSafetyMarkers;
  safety_message: string;
}

export interface PilotAuditTimeline {
  pilot_run_id: string;
  timeline: PilotAuditEntry[];
  count: number;
  safety: PilotSafetyMarkers;
  safety_message: string;
}
