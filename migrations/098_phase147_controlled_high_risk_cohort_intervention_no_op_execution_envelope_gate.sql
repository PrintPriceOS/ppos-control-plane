-- Migration: 098_phase147_controlled_high_risk_cohort_intervention_no_op_execution_envelope_gate
-- Up

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_no_op_envelope (
  envelope_id VARCHAR(64) NOT NULL PRIMARY KEY,
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
  envelope_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
  envelope_result VARCHAR(128) NULL,
  risk_level VARCHAR(32) NULL,
  confidence_level VARCHAR(32) NULL,
  projected_impact_score INT NULL,
  rollback_feasibility_score INT NULL,
  evidence_completeness_score INT NULL,
  guardrail_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  write_scope_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  canary_envelope_json JSON NULL,
  envelope_summary_json JSON NULL,
  impact_review_json JSON NULL,
  rollback_review_json JSON NULL,
  guardrail_review_json JSON NULL,
  envelope_rules_json JSON NULL,
  envelope_blockers_json JSON NULL,
  non_execution_attestation_json JSON NULL,
  write_scope_attestation_json JSON NULL,
  source_auth_hash VARCHAR(128) NULL,
  source_auth_evidence_pack_hash VARCHAR(128) NULL,
  envelope_result_hash VARCHAR(128) NULL,
  evidence_pack_hash VARCHAR(128) NULL,
  lineage_hash_chain_json JSON NULL,
  execution_capability_status VARCHAR(64) NOT NULL DEFAULT 'EXECUTION_NOT_ENABLED',
  envelope_execution_status VARCHAR(64) NOT NULL DEFAULT 'NO_OP_ENVELOPE_ACTIVE_NOT_MUTATING',
  no_op_execution_result VARCHAR(64) NOT NULL DEFAULT 'NO_OP_EXECUTED_NOT_MUTATED',
  runtime_mutation_status VARCHAR(64) NOT NULL DEFAULT 'ZERO_RUNTIME_MUTATION_CONFIRMED',
  job_dispatch_status VARCHAR(64) NOT NULL DEFAULT 'NO_JOB_DISPATCHED',
  approved_by VARCHAR(255) NULL,
  approved_at TIMESTAMP NULL,
  rejected_by VARCHAR(255) NULL,
  rejected_at TIMESTAMP NULL,
  finalized_by VARCHAR(255) NULL,
  finalized_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_envelope_rules (
  rule_id VARCHAR(64) NOT NULL PRIMARY KEY,
  envelope_id VARCHAR(64) NOT NULL,
  check_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_147_rules_envelope
    FOREIGN KEY (envelope_id)
    REFERENCES cb_cohort_intervention_no_op_envelope(envelope_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_envelope_evidence (
  evidence_id VARCHAR(64) NOT NULL PRIMARY KEY,
  envelope_id VARCHAR(64) NOT NULL,
  evidence_schema_version VARCHAR(20) NOT NULL,
  evidence_pack_hash VARCHAR(128) NOT NULL,
  evidence_payload_json LONGTEXT NOT NULL,
  lineage_hash_chain_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_147_evidence_envelope
    FOREIGN KEY (envelope_id)
    REFERENCES cb_cohort_intervention_no_op_envelope(envelope_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_envelope_audits (
  audit_event_id VARCHAR(64) NOT NULL PRIMARY KEY,
  envelope_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  actor_id VARCHAR(100) NOT NULL,
  details_json LONGTEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_147_audits_envelope
    FOREIGN KEY (envelope_id)
    REFERENCES cb_cohort_intervention_no_op_envelope(envelope_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
