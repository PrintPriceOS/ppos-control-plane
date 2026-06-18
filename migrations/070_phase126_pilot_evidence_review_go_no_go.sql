-- Phase 126: Pilot Evidence Review & Go/No-Go for Limited Beta
-- Aggregates evidence from Phases 122.1–125 and produces a formal Go/No-Go decision.
-- This phase does NOT enable limited beta automatically.
-- No real payment/refund/payout execution. No external tax/accounting/provider submission.
-- No FULL_PUBLIC. No open marketplace. Decision/evidence only.

CREATE TABLE IF NOT EXISTS pilot_evidence_review_boards (
  review_board_id VARCHAR(80) NOT NULL PRIMARY KEY,
  phase VARCHAR(40) NOT NULL DEFAULT 'PHASE_126',
  board_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  board_name VARCHAR(200) DEFAULT NULL,
  board_description TEXT DEFAULT NULL,
  review_scope_json JSON DEFAULT NULL,
  pilot_only TINYINT(1) NOT NULL DEFAULT 1,
  review_only TINYINT(1) NOT NULL DEFAULT 1,
  decision_only TINYINT(1) NOT NULL DEFAULT 1,
  beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
  production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pilot_evidence_review_checks (
  review_check_id VARCHAR(80) NOT NULL PRIMARY KEY,
  review_board_id VARCHAR(80) NOT NULL,
  check_key VARCHAR(120) NOT NULL,
  check_label VARCHAR(200) NOT NULL,
  check_status VARCHAR(80) NOT NULL DEFAULT 'PENDING',
  check_evidence_json JSON DEFAULT NULL,
  check_notes TEXT DEFAULT NULL,
  phase_reference VARCHAR(40) DEFAULT NULL,
  verified_at TIMESTAMP NULL DEFAULT NULL,
  verified_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pilot_evidence_review_findings (
  finding_id VARCHAR(80) NOT NULL PRIMARY KEY,
  review_board_id VARCHAR(80) NOT NULL,
  finding_type VARCHAR(80) NOT NULL DEFAULT 'OBSERVATION',
  finding_status VARCHAR(80) NOT NULL DEFAULT 'OPEN',
  blocks_go_decision TINYINT(1) NOT NULL DEFAULT 0,
  severity VARCHAR(40) NOT NULL DEFAULT 'LOW',
  summary TEXT DEFAULT NULL,
  details_json JSON DEFAULT NULL,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  resolved_by VARCHAR(120) DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pilot_evidence_go_no_go_decisions (
  decision_id VARCHAR(80) NOT NULL PRIMARY KEY,
  review_board_id VARCHAR(80) NOT NULL,
  decision_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  decision_outcome VARCHAR(80) DEFAULT NULL,
  decision_rationale TEXT DEFAULT NULL,
  readiness_snapshot_json JSON DEFAULT NULL,
  unresolved_blockers_count INT NOT NULL DEFAULT 0,
  total_checks_count INT NOT NULL DEFAULT 0,
  passed_checks_count INT NOT NULL DEFAULT 0,
  failed_checks_count INT NOT NULL DEFAULT 0,
  beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
  production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  decided_by VARCHAR(120) DEFAULT NULL,
  decided_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pilot_evidence_review_audits (
  audit_id VARCHAR(80) NOT NULL PRIMARY KEY,
  review_board_id VARCHAR(80) NOT NULL,
  decision_id VARCHAR(80) DEFAULT NULL,
  event_type VARCHAR(120) NOT NULL,
  event_detail_json JSON DEFAULT NULL,
  safety_snapshot_json JSON DEFAULT NULL,
  actor VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pilot_evidence_review_packs (
  evidence_pack_id VARCHAR(80) NOT NULL PRIMARY KEY,
  review_board_id VARCHAR(80) NOT NULL,
  decision_id VARCHAR(80) DEFAULT NULL,
  evidence_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  evidence_data_json JSON DEFAULT NULL,
  evidence_hash VARCHAR(128) DEFAULT NULL,
  evidence_schema_version VARCHAR(20) NOT NULL DEFAULT '126.0',
  redaction_classification VARCHAR(40) NOT NULL DEFAULT 'INTERNAL_ONLY',
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by VARCHAR(120) DEFAULT NULL
);

-- Indexes: pilot_evidence_review_boards
CREATE INDEX idx_perb_status ON pilot_evidence_review_boards (board_status);
CREATE INDEX idx_perb_phase ON pilot_evidence_review_boards (phase);
CREATE INDEX idx_perb_created_at ON pilot_evidence_review_boards (created_at);

-- Indexes: pilot_evidence_review_checks
CREATE INDEX idx_perc_board_id ON pilot_evidence_review_checks (review_board_id);
CREATE INDEX idx_perc_check_key ON pilot_evidence_review_checks (check_key);
CREATE INDEX idx_perc_check_status ON pilot_evidence_review_checks (check_status);
CREATE INDEX idx_perc_phase_ref ON pilot_evidence_review_checks (phase_reference);
CREATE INDEX idx_perc_created_at ON pilot_evidence_review_checks (created_at);

-- Indexes: pilot_evidence_review_findings
CREATE INDEX idx_perf_board_id ON pilot_evidence_review_findings (review_board_id);
CREATE INDEX idx_perf_finding_status ON pilot_evidence_review_findings (finding_status);
CREATE INDEX idx_perf_blocks_go ON pilot_evidence_review_findings (blocks_go_decision);
CREATE INDEX idx_perf_severity ON pilot_evidence_review_findings (severity);
CREATE INDEX idx_perf_created_at ON pilot_evidence_review_findings (created_at);

-- Indexes: pilot_evidence_go_no_go_decisions
CREATE INDEX idx_pegng_board_id ON pilot_evidence_go_no_go_decisions (review_board_id);
CREATE INDEX idx_pegng_decision_status ON pilot_evidence_go_no_go_decisions (decision_status);
CREATE INDEX idx_pegng_outcome ON pilot_evidence_go_no_go_decisions (decision_outcome);
CREATE INDEX idx_pegng_created_at ON pilot_evidence_go_no_go_decisions (created_at);

-- Indexes: pilot_evidence_review_audits
CREATE INDEX idx_pera_board_id ON pilot_evidence_review_audits (review_board_id);
CREATE INDEX idx_pera_decision_id ON pilot_evidence_review_audits (decision_id);
CREATE INDEX idx_pera_event_type ON pilot_evidence_review_audits (event_type);
CREATE INDEX idx_pera_created_at ON pilot_evidence_review_audits (created_at);

-- Indexes: pilot_evidence_review_packs
CREATE INDEX idx_perp_board_id ON pilot_evidence_review_packs (review_board_id);
CREATE INDEX idx_perp_decision_id ON pilot_evidence_review_packs (decision_id);
CREATE INDEX idx_perp_evidence_status ON pilot_evidence_review_packs (evidence_status);
CREATE INDEX idx_perp_generated_at ON pilot_evidence_review_packs (generated_at);
