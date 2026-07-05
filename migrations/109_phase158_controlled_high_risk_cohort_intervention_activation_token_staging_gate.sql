-- Migration: 109_phase158_controlled_high_risk_cohort_intervention_activation_token_staging_gate
-- Up

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_activation_token_staging (
  activation_token_staging_id VARCHAR(64) NOT NULL PRIMARY KEY,
  source_activation_token_final_apv_id VARCHAR(64) NOT NULL,
  source_activation_token_env_id VARCHAR(64) NOT NULL,
  source_activation_token_auth_id VARCHAR(64) NOT NULL,
  source_activation_handoff_id VARCHAR(64) NOT NULL,
  source_activation_decision_id VARCHAR(64) NOT NULL,
  source_activation_lock_id VARCHAR(64) NOT NULL,
  source_activation_auth_id VARCHAR(64) NOT NULL,
  source_activation_readiness_id VARCHAR(64) NOT NULL,
  source_plan_id VARCHAR(64) NOT NULL,
  source_dispatcher_id VARCHAR(64) NOT NULL,
  source_envelope_id VARCHAR(64) NOT NULL,
  source_auth_id VARCHAR(64) NOT NULL,
  source_readiness_id VARCHAR(64) NOT NULL,
  source_approval_id VARCHAR(64) NOT NULL,
  source_prep_id VARCHAR(64) NOT NULL,
  source_review_id VARCHAR(64) NULL,
  source_simulation_id VARCHAR(64) NULL,
  source_execution_id VARCHAR(64) NULL,
  cohort_id VARCHAR(128) NULL,
  tenant_id VARCHAR(128) NULL,
  simulation_type VARCHAR(64) NULL,
  activation_token_staging_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
  activation_token_staging_result VARCHAR(128) NULL,
  risk_level VARCHAR(32) NULL,
  confidence_level VARCHAR(32) NULL,
  projected_impact_score INT NULL,
  rollback_feasibility_score INT NULL,
  evidence_completeness_score INT NULL,
  guardrail_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  write_scope_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  canary_envelope_json JSON NULL,
  token_staging_summary_json JSON NULL,
  impact_review_json JSON NULL,
  rollback_review_json JSON NULL,
  guardrail_review_json JSON NULL,
  token_staging_rules_json JSON NULL,
  token_staging_blockers_json JSON NULL,
  non_execution_attestation_json JSON NULL,
  write_scope_attestation_json JSON NULL,
  source_activation_token_final_apv_hash VARCHAR(128) NULL,
  source_token_material_hash VARCHAR(128) NULL,
  source_freeze_package_hash VARCHAR(128) NULL,
  activation_token_staging_hash VARCHAR(128) NULL,
  token_staging_evidence_pack_hash VARCHAR(128) NULL,
  evidence_pack_hash VARCHAR(128) NULL,
  lineage_hash_chain_json JSON NULL,
  staging_signatures_json JSON NULL,
  staging_metadata_json JSON NULL,
  execution_capability_status VARCHAR(64) NOT NULL DEFAULT 'EXECUTION_NOT_ENABLED',
  activation_execution_status VARCHAR(64) NOT NULL DEFAULT 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED',
  package_freeze_status VARCHAR(64) NOT NULL DEFAULT 'FROZEN_IMMUTABLE',
  plan_executable_status VARCHAR(64) NOT NULL DEFAULT 'NOT_EXECUTABLE',
  job_creation_status VARCHAR(64) NOT NULL DEFAULT 'NO_REAL_JOB_CREATED',
  queue_dispatch_status VARCHAR(64) NOT NULL DEFAULT 'NO_QUEUE_DISPATCHED',
  runtime_mutation_status VARCHAR(64) NOT NULL DEFAULT 'ZERO_RUNTIME_MUTATION_CONFIRMED',
  approved_by VARCHAR(255) NULL,
  approved_at TIMESTAMP NULL,
  rejected_by VARCHAR(255) NULL,
  rejected_at TIMESTAMP NULL,
  finalized_by VARCHAR(255) NULL,
  finalized_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_activation_token_staging_rules (
  rule_id VARCHAR(64) NOT NULL PRIMARY KEY,
  activation_token_staging_id VARCHAR(64) NOT NULL,
  check_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_158_rules_apv
    FOREIGN KEY (activation_token_staging_id)
    REFERENCES cb_cohort_intervention_activation_token_staging(activation_token_staging_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_activation_token_staging_evidence (
  evidence_id VARCHAR(64) NOT NULL PRIMARY KEY,
  activation_token_staging_id VARCHAR(64) NOT NULL,
  evidence_schema_version VARCHAR(32) NOT NULL DEFAULT '158.0',
  evidence_pack_hash VARCHAR(128) NOT NULL,
  evidence_payload_json JSON NOT NULL,
  lineage_hash_chain_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_158_evidence_apv
    FOREIGN KEY (activation_token_staging_id)
    REFERENCES cb_cohort_intervention_activation_token_staging(activation_token_staging_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_activation_token_staging_audits (
  audit_id VARCHAR(64) NOT NULL PRIMARY KEY,
  activation_token_staging_id VARCHAR(64) NOT NULL,
  action VARCHAR(100) NOT NULL,
  actor_id VARCHAR(100) NOT NULL,
  payload_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
