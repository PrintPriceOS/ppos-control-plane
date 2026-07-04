-- Migration: 092_phase144_governed_high_risk_cohort_intervention_approval_gate
-- Up

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_approvals (
  approval_id VARCHAR(50) PRIMARY KEY,
  source_prep_id VARCHAR(50) NOT NULL,
  source_review_id VARCHAR(50) NOT NULL,
  source_simulation_id VARCHAR(50) NOT NULL,
  source_execution_id VARCHAR(50) NOT NULL,
  cohort_id VARCHAR(50) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  simulation_type VARCHAR(100) NOT NULL,
  approval_status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  approval_decision VARCHAR(100) DEFAULT NULL,
  risk_level VARCHAR(50) NOT NULL DEFAULT 'LOW',
  confidence_level VARCHAR(50) NOT NULL DEFAULT 'HIGH',
  projected_impact_score DECIMAL(5,2) DEFAULT NULL,
  rollback_feasibility_score DECIMAL(5,2) DEFAULT NULL,
  evidence_completeness_score DECIMAL(5,2) DEFAULT NULL,
  guardrail_status VARCHAR(50) NOT NULL DEFAULT 'PASS',
  write_scope_status VARCHAR(50) NOT NULL DEFAULT 'PASS',
  approved_by VARCHAR(100) DEFAULT NULL,
  finalized_by VARCHAR(100) DEFAULT NULL,
  approval_summary_json TEXT DEFAULT NULL,
  impact_review_json TEXT DEFAULT NULL,
  rollback_review_json TEXT DEFAULT NULL,
  guardrail_review_json TEXT DEFAULT NULL,
  write_scope_attestation_json TEXT DEFAULT NULL,
  approval_readiness_json TEXT DEFAULT NULL,
  approval_blockers_json TEXT DEFAULT NULL,
  non_execution_attestation_json TEXT DEFAULT NULL,
  source_prep_hash VARCHAR(64) NOT NULL,
  source_prep_evidence_pack_hash VARCHAR(64) NOT NULL,
  approval_result_hash VARCHAR(64) DEFAULT NULL,
  evidence_pack_hash VARCHAR(64) DEFAULT NULL,
  execution_capability_status VARCHAR(50) NOT NULL DEFAULT 'EXECUTION_NOT_ENABLED',
  approval_execution_status VARCHAR(50) NOT NULL DEFAULT 'NOT_APPROVED_NOT_EXECUTED',
  future_execution_eligibility_status VARCHAR(50) NOT NULL DEFAULT 'NOT_ELIGIBLE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  finalized_at TIMESTAMP NULL DEFAULT NULL,
  superseded_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_approval_findings (
  finding_id VARCHAR(50) PRIMARY KEY,
  approval_id VARCHAR(50) NOT NULL,
  finding_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (approval_id) REFERENCES controlled_beta_cohort_intervention_approvals(approval_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_approval_evidence (
  evidence_id VARCHAR(50) PRIMARY KEY,
  approval_id VARCHAR(50) NOT NULL,
  evidence_schema_version VARCHAR(20) NOT NULL,
  evidence_pack_hash VARCHAR(64) NOT NULL,
  evidence_payload_json LONGTEXT NOT NULL,
  lineage_hash_chain_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (approval_id) REFERENCES controlled_beta_cohort_intervention_approvals(approval_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS controlled_beta_cohort_intervention_approval_audits (
  audit_event_id VARCHAR(50) PRIMARY KEY,
  approval_id VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  actor_id VARCHAR(100) NOT NULL,
  details_json LONGTEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (approval_id) REFERENCES controlled_beta_cohort_intervention_approvals(approval_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
