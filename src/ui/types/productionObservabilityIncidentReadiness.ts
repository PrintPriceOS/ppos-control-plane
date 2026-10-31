export type IncidentCategory =
  | 'API_DOWN'
  | 'DB_CONNECTION_FAILURE'
  | 'REDIS_CONNECTION_FAILURE'
  | 'PAYMENT_PROVIDER_FAILURE_SIMULATED'
  | 'PREFLIGHT_SERVICE_DEGRADED'
  | 'QUEUE_BACKLOG'
  | 'HIGH_ERROR_RATE'
  | 'SECURITY_ALERT'
  | 'DATA_EXPORT_BLOCKED'
  | 'ROLLBACK_REQUIRED';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SafetyMarkers {
  simulationOnly: true;
  realAlertDispatched: false;
  productionMutationEnabled: false;
  externalSubmission: false;
  paymentExecutionEnabled: false;
  refundExecutionEnabled: false;
  payoutExecutionEnabled: false;
  fullPublicEnabled: false;
  liveProviderConnectivityEnabled: false;
  sourceMutation: false;
}

export interface ObservabilityCheck {
  check_id: string;
  run_id: string;
  check_name: string;
  check_category: string;
  status: 'PASS' | 'FAIL' | 'PENDING';
  simulated_only: boolean;
  result_json: Record<string, unknown> | null;
}

export interface ObservabilityReadinessResult {
  run_id: string;
  observability_status: 'OBSERVABILITY_READY' | 'OBSERVABILITY_BLOCKED';
  checks: ObservabilityCheck[];
  incident_categories: IncidentCategory[];
  safety: SafetyMarkers;
  simulationOnly: true;
  reviewOnly: true;
}

export interface SimulateIncidentPayload {
  run_id?: string;
  incident_category: IncidentCategory;
  severity?: IncidentSeverity;
  actor?: string;
}

export interface SimulateAlertPayload {
  run_id?: string;
  alert_type?: string;
  sink?: string;
  actor?: string;
}

export interface RecordFindingPayload {
  run_id?: string;
  category?: string;
  description: string;
  severity?: IncidentSeverity;
  actor?: string;
}

export interface ResolveFindingPayload {
  run_id?: string;
  finding_id: string;
  resolution: string;
  actor?: string;
}

export interface IncidentSimulationResult {
  simulation_id: string;
  run_id: string;
  incident_category: IncidentCategory;
  severity: IncidentSeverity;
  status: 'SIMULATED';
  alert_dispatch_simulated: boolean;
  real_alert_dispatched: false;
  runbook_reference: string;
  simulation_result: Record<string, unknown>;
  safety: SafetyMarkers;
  simulationOnly: true;
}

export interface IncidentReadinessEvidencePack {
  run_id: string;
  phase: 118;
  phase_name: string;
  generated_at: string;
  observability_checks: { total: number; passed: number; failed: number };
  incident_categories_covered: IncidentCategory[];
  simulations_run: number;
  findings: { total: number; open: number; resolved: number };
  audit_events: number;
  safety_invariants: Record<string, boolean>;
  safety: SafetyMarkers;
  status: 'EVIDENCE_PACK_COMPLETE' | 'EVIDENCE_PACK_WITH_OPEN_FINDINGS';
  simulationOnly: true;
  reviewOnly: true;
}
