export interface HandoffRecord {
  activation_handoff_id: string;
  source_activation_decision_id: string;
  source_activation_lock_id: string;
  source_activation_auth_id: string;
  source_activation_readiness_id: string;
  source_plan_id: string;
  source_dispatcher_id: string;
  source_envelope_id: string;
  source_auth_id: string;
  source_readiness_id: string;
  source_approval_id: string;
  source_prep_id: string;
  source_review_id: string;
  source_simulation_id: string;
  source_execution_id: string;
  cohort_id: string;
  tenant_id: string;
  simulation_type: string;
  activation_handoff_status: 'DRAFT' | 'READY_FOR_EVALUATION' | 'EVALUATED' | 'READY_FOR_DECISION' | 'TOKEN_PREPARED' | 'FINALIZED' | 'BLOCKED' | 'FAILED' | 'SUPERSEDED';
  activation_handoff_result: string | null;
  risk_level: string;
  confidence_level: string;
  projected_impact_score: number | null;
  rollback_feasibility_score: number | null;
  evidence_completeness_score: number | null;
  guardrail_status: string;
  write_scope_status: string;
  canary_envelope_json: any;
  handoff_summary_json: any;
  impact_review_json: any;
  rollback_review_json: any;
  guardrail_review_json: any;
  handoff_rules_json: any;
  handoff_blockers_json: any;
  non_execution_attestation_json: any;
  write_scope_attestation_json: any;
  source_activation_decision_hash: string;
  source_freeze_package_hash: string;
  activation_handoff_hash: string | null;
  token_material_hash: string | null;
  handoff_evidence_pack_hash: string | null;
  evidence_pack_hash: string | null;
  lineage_hash_chain_json: any;
  handoff_rationale_json: any;
  execution_capability_status: string;
  activation_execution_status: string;
  package_freeze_status: string;
  plan_executable_status: string;
  job_creation_status: string;
  queue_dispatch_status: string;
  runtime_mutation_status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HandoffRuleCheck {
  rule_id: string;
  activation_handoff_id: string;
  check_type: string;
  severity: string;
  description: string;
  created_at: string;
}

export interface HandoffEvidence {
  evidence_id: string;
  activation_handoff_id: string;
  evidence_schema_version: string;
  evidence_pack_hash: string;
  evidence_payload_json: any;
  lineage_hash_chain_json: any;
  created_at: string;
}

export interface HandoffAuditLog {
  audit_event_id: string;
  activation_handoff_id: string;
  event_type: string;
  actor_id: string;
  details_json: any;
  created_at: string;
}
