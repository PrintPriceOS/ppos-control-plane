-- Migration: 096_phase145_controlled_high_risk_execution_readiness_gate
-- Up

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_exec_readiness (
  readiness_id VARCHAR(64) NOT NULL PRIMARY KEY,
  source_approval_id VARCHAR(64) NOT NULL,
  source_prep_id VARCHAR(64) NOT NULL,
  source_review_id VARCHAR(64) NULL,
  source_simulation_id VARCHAR(64) NULL,
  source_execution_id VARCHAR(64) NULL,
  cohort_id VARCHAR(128) NULL,
  tenant_id VARCHAR(128) NULL,
  simulation_type VARCHAR(64) NULL,
  readiness_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
  readiness_decision VARCHAR(128) NULL,
  risk_level VARCHAR(32) NULL,
  confidence_level VARCHAR(32) NULL,
  projected_impact_score INT NULL,
  rollback_feasibility_score INT NULL,
  evidence_completeness_score INT NULL,
  guardrail_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  write_scope_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  kill_switch_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  rollback_authority_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  readiness_summary_json JSON NULL,
  impact_review_json JSON NULL,
  rollback_review_json JSON NULL,
  guardrail_review_json JSON NULL,
  readiness_checks_json JSON NULL,
  readiness_blockers_json JSON NULL,
  non_execution_attestation_json JSON NULL,
  write_scope_attestation_json JSON NULL,
  source_approval_hash VARCHAR(128) NULL,
  source_approval_evidence_pack_hash VARCHAR(128) NULL,
  readiness_result_hash VARCHAR(128) NULL,
  evidence_pack_hash VARCHAR(128) NULL,
  lineage_hash_chain_json JSON NULL,
  execution_capability_status VARCHAR(64) NOT NULL DEFAULT 'EXECUTION_NOT_ENABLED',
  execution_readiness_status VARCHAR(64) NOT NULL DEFAULT 'EXECUTION_READY_NOT_ACTIVE',
  readiness_execution_status VARCHAR(64) NOT NULL DEFAULT 'READINESS_APPROVED_NOT_EXECUTED',
  approved_by VARCHAR(255) NULL,
  approved_at TIMESTAMP NULL,
  rejected_by VARCHAR(255) NULL,
  rejected_at TIMESTAMP NULL,
  finalized_by VARCHAR(255) NULL,
  finalized_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_exec_ready_checks (
  check_id VARCHAR(64) NOT NULL PRIMARY KEY,
  readiness_id VARCHAR(64) NOT NULL,
  check_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_145_checks_readiness
    FOREIGN KEY (readiness_id)
    REFERENCES cb_cohort_intervention_exec_readiness(readiness_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_exec_ready_evidence (
  evidence_id VARCHAR(64) NOT NULL PRIMARY KEY,
  readiness_id VARCHAR(64) NOT NULL,
  evidence_schema_version VARCHAR(20) NOT NULL,
  evidence_pack_hash VARCHAR(128) NOT NULL,
  evidence_payload_json LONGTEXT NOT NULL,
  lineage_hash_chain_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_145_evidence_readiness
    FOREIGN KEY (readiness_id)
    REFERENCES cb_cohort_intervention_exec_readiness(readiness_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_exec_ready_audits (
  audit_event_id VARCHAR(64) NOT NULL PRIMARY KEY,
  readiness_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  actor_id VARCHAR(100) NOT NULL,
  details_json LONGTEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_145_audits_readiness
    FOREIGN KEY (readiness_id)
    REFERENCES cb_cohort_intervention_exec_readiness(readiness_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
