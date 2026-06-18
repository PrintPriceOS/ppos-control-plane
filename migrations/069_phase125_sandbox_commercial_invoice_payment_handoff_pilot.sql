-- Phase 125: Sandbox Commercial / Invoice / Payment Handoff Pilot
-- Sandbox-only commercial readiness for pilot orders: invoice preview, payment simulation,
-- settlement readiness, and financial evidence without moving real money.
-- No real payment/refund/payout execution. No external tax/accounting submission.
-- No provider live capture/charge/refund/payout. No FULL_PUBLIC. No open marketplace.
-- No mutation of source commercial records outside pilot snapshots.

CREATE TABLE IF NOT EXISTS sandbox_commercial_pilot_runs (
  sandbox_run_id VARCHAR(80) NOT NULL PRIMARY KEY,
  phase VARCHAR(40) NOT NULL DEFAULT 'PHASE_125',
  pilot_program_id VARCHAR(80) DEFAULT NULL,
  participant_id VARCHAR(80) DEFAULT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  handoff_package_id VARCHAR(80) DEFAULT NULL,
  printhouse_tenant_id VARCHAR(80) DEFAULT NULL,
  run_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  sandbox_only TINYINT(1) NOT NULL DEFAULT 1,
  pilot_only TINYINT(1) NOT NULL DEFAULT 1,
  review_only TINYINT(1) NOT NULL DEFAULT 1,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provider_live_capture_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
  production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sandbox_commercial_invoice_previews (
  invoice_preview_id VARCHAR(80) NOT NULL PRIMARY KEY,
  sandbox_run_id VARCHAR(80) NOT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  invoice_preview_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  invoice_preview_only TINYINT(1) NOT NULL DEFAULT 1,
  invoice_issued TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation TINYINT(1) NOT NULL DEFAULT 0,
  invoice_data_json JSON DEFAULT NULL,
  currency VARCHAR(10) DEFAULT NULL,
  total_amount_preview DECIMAL(12,2) DEFAULT NULL,
  line_items_json JSON DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sandbox_commercial_payment_simulations (
  payment_simulation_id VARCHAR(80) NOT NULL PRIMARY KEY,
  sandbox_run_id VARCHAR(80) NOT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  simulation_type VARCHAR(80) NOT NULL DEFAULT 'PAYMENT',
  simulation_status VARCHAR(80) NOT NULL DEFAULT 'SIMULATED',
  payment_simulation_only TINYINT(1) NOT NULL DEFAULT 1,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0,
  simulated_amount DECIMAL(12,2) DEFAULT NULL,
  simulated_currency VARCHAR(10) DEFAULT NULL,
  simulated_provider VARCHAR(120) DEFAULT NULL,
  simulation_result_json JSON DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sandbox_commercial_settlement_previews (
  settlement_preview_id VARCHAR(80) NOT NULL PRIMARY KEY,
  sandbox_run_id VARCHAR(80) NOT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  settlement_status VARCHAR(80) NOT NULL DEFAULT 'PREVIEW',
  payout_preview_only TINYINT(1) NOT NULL DEFAULT 1,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  settlement_amount_preview DECIMAL(12,2) DEFAULT NULL,
  settlement_currency VARCHAR(10) DEFAULT NULL,
  printhouse_payout_preview DECIMAL(12,2) DEFAULT NULL,
  platform_fee_preview DECIMAL(12,2) DEFAULT NULL,
  settlement_data_json JSON DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sandbox_commercial_printhouse_confirmations (
  confirmation_id VARCHAR(80) NOT NULL PRIMARY KEY,
  sandbox_run_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) DEFAULT NULL,
  printhouse_tenant_id VARCHAR(80) DEFAULT NULL,
  confirmation_status VARCHAR(80) NOT NULL DEFAULT 'PENDING',
  confirmation_type VARCHAR(80) NOT NULL DEFAULT 'COMMERCIAL_REVIEW',
  confirmation_notes TEXT DEFAULT NULL,
  confirmed_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sandbox_commercial_findings (
  finding_id VARCHAR(80) NOT NULL PRIMARY KEY,
  sandbox_run_id VARCHAR(80) NOT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  finding_type VARCHAR(80) NOT NULL DEFAULT 'OBSERVATION',
  finding_status VARCHAR(80) NOT NULL DEFAULT 'OPEN',
  blocks_commercial TINYINT(1) NOT NULL DEFAULT 0,
  severity VARCHAR(40) NOT NULL DEFAULT 'LOW',
  summary TEXT DEFAULT NULL,
  details_json JSON DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  resolved_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sandbox_commercial_audits (
  audit_id VARCHAR(80) NOT NULL PRIMARY KEY,
  sandbox_run_id VARCHAR(80) DEFAULT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  event_type VARCHAR(120) NOT NULL,
  event_actor VARCHAR(120) DEFAULT NULL,
  event_payload_json JSON DEFAULT NULL,
  safety_snapshot_json JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sandbox_commercial_evidence_packs (
  evidence_pack_id VARCHAR(80) NOT NULL PRIMARY KEY,
  sandbox_run_id VARCHAR(80) NOT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  evidence_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  evidence_schema_version VARCHAR(20) NOT NULL DEFAULT '125.0',
  evidence_hash VARCHAR(128) DEFAULT NULL,
  evidence_json JSON DEFAULT NULL,
  redaction_classification VARCHAR(80) NOT NULL DEFAULT 'INTERNAL_ONLY',
  generated_by VARCHAR(120) DEFAULT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes on sandbox_commercial_pilot_runs
CREATE INDEX idx_scpilot_runs_program_id ON sandbox_commercial_pilot_runs (pilot_program_id);
CREATE INDEX idx_scpilot_runs_participant_id ON sandbox_commercial_pilot_runs (participant_id);
CREATE INDEX idx_scpilot_runs_pilot_order ON sandbox_commercial_pilot_runs (pilot_order_id);
CREATE INDEX idx_scpilot_runs_handoff_package ON sandbox_commercial_pilot_runs (handoff_package_id);
CREATE INDEX idx_scpilot_runs_status ON sandbox_commercial_pilot_runs (run_status);
CREATE INDEX idx_scpilot_runs_created_at ON sandbox_commercial_pilot_runs (created_at);

-- Indexes on invoice_previews
CREATE INDEX idx_scpilot_invoices_run_id ON sandbox_commercial_invoice_previews (sandbox_run_id);
CREATE INDEX idx_scpilot_invoices_order_id ON sandbox_commercial_invoice_previews (pilot_order_id);
CREATE INDEX idx_scpilot_invoices_status ON sandbox_commercial_invoice_previews (invoice_preview_status);
CREATE INDEX idx_scpilot_invoices_created_at ON sandbox_commercial_invoice_previews (created_at);

-- Indexes on payment_simulations
CREATE INDEX idx_scpilot_payments_run_id ON sandbox_commercial_payment_simulations (sandbox_run_id);
CREATE INDEX idx_scpilot_payments_order_id ON sandbox_commercial_payment_simulations (pilot_order_id);
CREATE INDEX idx_scpilot_payments_type ON sandbox_commercial_payment_simulations (simulation_type);
CREATE INDEX idx_scpilot_payments_status ON sandbox_commercial_payment_simulations (simulation_status);
CREATE INDEX idx_scpilot_payments_created_at ON sandbox_commercial_payment_simulations (created_at);

-- Indexes on settlement_previews
CREATE INDEX idx_scpilot_settlements_run_id ON sandbox_commercial_settlement_previews (sandbox_run_id);
CREATE INDEX idx_scpilot_settlements_order_id ON sandbox_commercial_settlement_previews (pilot_order_id);
CREATE INDEX idx_scpilot_settlements_status ON sandbox_commercial_settlement_previews (settlement_status);
CREATE INDEX idx_scpilot_settlements_created_at ON sandbox_commercial_settlement_previews (created_at);

-- Indexes on printhouse_confirmations
CREATE INDEX idx_scpilot_confirmations_run_id ON sandbox_commercial_printhouse_confirmations (sandbox_run_id);
CREATE INDEX idx_scpilot_confirmations_participant ON sandbox_commercial_printhouse_confirmations (participant_id);
CREATE INDEX idx_scpilot_confirmations_status ON sandbox_commercial_printhouse_confirmations (confirmation_status);
CREATE INDEX idx_scpilot_confirmations_created_at ON sandbox_commercial_printhouse_confirmations (created_at);

-- Indexes on findings
CREATE INDEX idx_scpilot_findings_run_id ON sandbox_commercial_findings (sandbox_run_id);
CREATE INDEX idx_scpilot_findings_order_id ON sandbox_commercial_findings (pilot_order_id);
CREATE INDEX idx_scpilot_findings_status ON sandbox_commercial_findings (finding_status);
CREATE INDEX idx_scpilot_findings_blocks ON sandbox_commercial_findings (blocks_commercial);
CREATE INDEX idx_scpilot_findings_severity ON sandbox_commercial_findings (severity);
CREATE INDEX idx_scpilot_findings_created_at ON sandbox_commercial_findings (created_at);

-- Indexes on audits
CREATE INDEX idx_scpilot_audits_run_id ON sandbox_commercial_audits (sandbox_run_id);
CREATE INDEX idx_scpilot_audits_order_id ON sandbox_commercial_audits (pilot_order_id);
CREATE INDEX idx_scpilot_audits_event_type ON sandbox_commercial_audits (event_type);
CREATE INDEX idx_scpilot_audits_created_at ON sandbox_commercial_audits (created_at);

-- Indexes on evidence_packs
CREATE INDEX idx_scpilot_evidence_run_id ON sandbox_commercial_evidence_packs (sandbox_run_id);
CREATE INDEX idx_scpilot_evidence_order_id ON sandbox_commercial_evidence_packs (pilot_order_id);
CREATE INDEX idx_scpilot_evidence_status ON sandbox_commercial_evidence_packs (evidence_status);
CREATE INDEX idx_scpilot_evidence_generated_at ON sandbox_commercial_evidence_packs (generated_at);

-- Foreign keys
ALTER TABLE sandbox_commercial_invoice_previews
  ADD CONSTRAINT fk_scpilot_invoices_run FOREIGN KEY (sandbox_run_id)
  REFERENCES sandbox_commercial_pilot_runs (sandbox_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE sandbox_commercial_payment_simulations
  ADD CONSTRAINT fk_scpilot_payments_run FOREIGN KEY (sandbox_run_id)
  REFERENCES sandbox_commercial_pilot_runs (sandbox_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE sandbox_commercial_settlement_previews
  ADD CONSTRAINT fk_scpilot_settlements_run FOREIGN KEY (sandbox_run_id)
  REFERENCES sandbox_commercial_pilot_runs (sandbox_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE sandbox_commercial_printhouse_confirmations
  ADD CONSTRAINT fk_scpilot_confirmations_run FOREIGN KEY (sandbox_run_id)
  REFERENCES sandbox_commercial_pilot_runs (sandbox_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE sandbox_commercial_findings
  ADD CONSTRAINT fk_scpilot_findings_run FOREIGN KEY (sandbox_run_id)
  REFERENCES sandbox_commercial_pilot_runs (sandbox_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE sandbox_commercial_audits
  ADD CONSTRAINT fk_scpilot_audits_run FOREIGN KEY (sandbox_run_id)
  REFERENCES sandbox_commercial_pilot_runs (sandbox_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE sandbox_commercial_evidence_packs
  ADD CONSTRAINT fk_scpilot_evidence_run FOREIGN KEY (sandbox_run_id)
  REFERENCES sandbox_commercial_pilot_runs (sandbox_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;
