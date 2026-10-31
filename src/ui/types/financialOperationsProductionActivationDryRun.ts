export interface DryRunSafetyMarkers {
  dryRunOnly: boolean;
  reviewOnly: boolean;
  externalSubmission: boolean;
  sourceMutation: boolean;
  fullPublicEnabled: boolean;
  liveProviderConnectivityEnabled: boolean;
  paymentExecutionEnabled: boolean;
  refundExecutionEnabled: boolean;
  payoutExecutionEnabled: boolean;
}

export interface DryRunSafetyInvariants {
  full_public_enabled: boolean;
  live_provider_connectivity_enabled: boolean;
  payment_execution_enabled: boolean;
  refund_execution_enabled: boolean;
  payout_execution_enabled: boolean;
  external_submission_enabled: boolean;
  source_mutation_enabled: boolean;
}

export interface ProductionActivationDryRun {
  dry_run_id: string;
  gate_reference_id: string;
  requested_by: string;
  dry_run_status: string;
  dry_run_name: string;
  dry_run_only: boolean;
  external_submission_enabled: boolean;
  source_mutation_enabled: boolean;
  full_public_enabled: boolean;
  live_provider_connectivity_enabled: boolean;
  payment_execution_enabled: boolean;
  refund_execution_enabled: boolean;
  payout_execution_enabled: boolean;
  simulated_activation_steps_json: SimulatedStep[];
  checklist_snapshot_json: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SimulatedStep {
  step_order?: number;
  step_name?: string;
  step?: string;
  step_status?: string;
  status?: string;
  dry_run_only: boolean;
  simulated_at?: string;
}

export interface DryRunStep {
  step_id: string;
  dry_run_id: string;
  step_name: string;
  step_order: number;
  step_status: string;
  dry_run_only: boolean;
  created_at: string;
}

export interface DryRunAuditEvent {
  audit_id: string;
  dry_run_id: string;
  event_type: string;
  detail_json: Record<string, any>;
  safety_markers: DryRunSafetyMarkers;
  created_at: string;
}

export interface RollbackSimulation {
  rollback_id: string;
  dry_run_id: string;
  rollback_simulated_only: boolean;
  rollback_reason: string;
  simulated_steps_json: SimulatedStep[];
  created_at: string;
}

export interface DryRunReadinessResult {
  status: 'READY_FOR_DRY_RUN' | 'BLOCKED';
  gate_reference_id: string | null;
  gate_valid: boolean;
  safety_invariants: DryRunSafetyInvariants;
  safety_message: string;
}

export interface DryRunEvidencePack {
  dry_run_id: string;
  gate_reference_id: string | null;
  dry_run_status: string;
  checklist_snapshot: Record<string, any>;
  safety_invariants: DryRunSafetyInvariants;
  simulated_activation_steps: SimulatedStep[];
  simulated_rollback_steps: SimulatedStep[];
  audit_summary: { event_type: string; created_at: string }[];
  safety_message: string;
  generated_at: string;
}
