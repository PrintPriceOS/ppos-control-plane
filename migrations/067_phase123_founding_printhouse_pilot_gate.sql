-- Phase 123: Founding Printhouse Pilot Gate
-- Controlled external pilot layer for founding printhouses.
-- No FULL_PUBLIC, no open marketplace, no real payment/refund/payout execution,
-- no external tax/accounting/provider submission, no source mutation outside pilot scope.

CREATE TABLE IF NOT EXISTS founding_printhouse_pilot_programs (
  pilot_program_id VARCHAR(80) NOT NULL PRIMARY KEY,
  phase VARCHAR(40) NOT NULL DEFAULT 'PHASE_123',
  tenant_id VARCHAR(80) NOT NULL,
  program_name VARCHAR(200) NOT NULL,
  program_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  program_scope_json JSON DEFAULT NULL,
  allowed_order_types_json JSON DEFAULT NULL,
  pilot_only TINYINT(1) NOT NULL DEFAULT 1,
  founding_printhouse_only TINYINT(1) NOT NULL DEFAULT 1,
  review_only TINYINT(1) NOT NULL DEFAULT 1,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
  live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation_outside_pilot_scope TINYINT(1) NOT NULL DEFAULT 0,
  production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  production_handoff_allowed TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS founding_printhouse_pilot_participants (
  participant_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pilot_program_id VARCHAR(80) NOT NULL,
  printhouse_tenant_id VARCHAR(80) NOT NULL,
  printhouse_name VARCHAR(200) NOT NULL,
  participant_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  pilot_scope_json JSON DEFAULT NULL,
  allowed_order_types_json JSON DEFAULT NULL,
  allowed_file_access_level VARCHAR(80) DEFAULT 'NONE',
  production_handoff_allowed TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_allowed TINYINT(1) NOT NULL DEFAULT 0,
  provider_submission_allowed TINYINT(1) NOT NULL DEFAULT 0,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
  review_only TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS founding_printhouse_pilot_order_links (
  order_link_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pilot_program_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) NOT NULL,
  pilot_run_id VARCHAR(80) DEFAULT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  printhouse_tenant_id VARCHAR(80) NOT NULL,
  link_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  order_handoff_readiness VARCHAR(80) NOT NULL DEFAULT 'NOT_EVALUATED',
  review_only TINYINT(1) NOT NULL DEFAULT 1,
  production_handoff_allowed TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS founding_printhouse_pilot_reviews (
  review_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pilot_program_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) NOT NULL,
  order_link_id VARCHAR(80) DEFAULT NULL,
  reviewer VARCHAR(120) DEFAULT NULL,
  review_status VARCHAR(80) NOT NULL DEFAULT 'PENDING',
  review_notes TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS founding_printhouse_pilot_findings (
  finding_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pilot_program_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) DEFAULT NULL,
  order_link_id VARCHAR(80) DEFAULT NULL,
  finding_type VARCHAR(80) NOT NULL DEFAULT 'OBSERVATION',
  finding_status VARCHAR(80) NOT NULL DEFAULT 'OPEN',
  blocks_handoff TINYINT(1) NOT NULL DEFAULT 0,
  severity VARCHAR(40) NOT NULL DEFAULT 'LOW',
  summary TEXT DEFAULT NULL,
  details_json JSON DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  resolved_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS founding_printhouse_pilot_audits (
  audit_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pilot_program_id VARCHAR(80) DEFAULT NULL,
  participant_id VARCHAR(80) DEFAULT NULL,
  order_link_id VARCHAR(80) DEFAULT NULL,
  event_type VARCHAR(120) NOT NULL,
  event_actor VARCHAR(120) DEFAULT NULL,
  event_payload_json JSON DEFAULT NULL,
  safety_snapshot_json JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS founding_printhouse_pilot_evidence_packs (
  evidence_pack_id VARCHAR(80) NOT NULL PRIMARY KEY,
  pilot_program_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) DEFAULT NULL,
  order_link_id VARCHAR(80) DEFAULT NULL,
  evidence_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  evidence_schema_version VARCHAR(20) NOT NULL DEFAULT '123.0',
  evidence_hash VARCHAR(128) DEFAULT NULL,
  evidence_json JSON DEFAULT NULL,
  redaction_classification VARCHAR(80) NOT NULL DEFAULT 'INTERNAL_ONLY',
  generated_by VARCHAR(120) DEFAULT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes on pilot_programs
CREATE INDEX idx_fppg_programs_tenant_id ON founding_printhouse_pilot_programs (tenant_id);
CREATE INDEX idx_fppg_programs_status ON founding_printhouse_pilot_programs (program_status);
CREATE INDEX idx_fppg_programs_created_at ON founding_printhouse_pilot_programs (created_at);

-- Indexes on participants
CREATE INDEX idx_fppg_participants_program_id ON founding_printhouse_pilot_participants (pilot_program_id);
CREATE INDEX idx_fppg_participants_printhouse_tenant ON founding_printhouse_pilot_participants (printhouse_tenant_id);
CREATE INDEX idx_fppg_participants_status ON founding_printhouse_pilot_participants (participant_status);
CREATE INDEX idx_fppg_participants_created_at ON founding_printhouse_pilot_participants (created_at);

-- Indexes on order_links
CREATE INDEX idx_fppg_order_links_program_id ON founding_printhouse_pilot_order_links (pilot_program_id);
CREATE INDEX idx_fppg_order_links_participant_id ON founding_printhouse_pilot_order_links (participant_id);
CREATE INDEX idx_fppg_order_links_printhouse_tenant ON founding_printhouse_pilot_order_links (printhouse_tenant_id);
CREATE INDEX idx_fppg_order_links_status ON founding_printhouse_pilot_order_links (link_status);
CREATE INDEX idx_fppg_order_links_created_at ON founding_printhouse_pilot_order_links (created_at);

-- Indexes on reviews
CREATE INDEX idx_fppg_reviews_program_id ON founding_printhouse_pilot_reviews (pilot_program_id);
CREATE INDEX idx_fppg_reviews_participant_id ON founding_printhouse_pilot_reviews (participant_id);
CREATE INDEX idx_fppg_reviews_status ON founding_printhouse_pilot_reviews (review_status);
CREATE INDEX idx_fppg_reviews_created_at ON founding_printhouse_pilot_reviews (created_at);

-- Indexes on findings
CREATE INDEX idx_fppg_findings_program_id ON founding_printhouse_pilot_findings (pilot_program_id);
CREATE INDEX idx_fppg_findings_participant_id ON founding_printhouse_pilot_findings (participant_id);
CREATE INDEX idx_fppg_findings_status ON founding_printhouse_pilot_findings (finding_status);
CREATE INDEX idx_fppg_findings_blocks_handoff ON founding_printhouse_pilot_findings (blocks_handoff);
CREATE INDEX idx_fppg_findings_severity ON founding_printhouse_pilot_findings (severity);
CREATE INDEX idx_fppg_findings_created_at ON founding_printhouse_pilot_findings (created_at);

-- Indexes on audits
CREATE INDEX idx_fppg_audits_program_id ON founding_printhouse_pilot_audits (pilot_program_id);
CREATE INDEX idx_fppg_audits_participant_id ON founding_printhouse_pilot_audits (participant_id);
CREATE INDEX idx_fppg_audits_order_link_id ON founding_printhouse_pilot_audits (order_link_id);
CREATE INDEX idx_fppg_audits_event_type ON founding_printhouse_pilot_audits (event_type);
CREATE INDEX idx_fppg_audits_created_at ON founding_printhouse_pilot_audits (created_at);

-- Indexes on evidence_packs
CREATE INDEX idx_fppg_evidence_program_id ON founding_printhouse_pilot_evidence_packs (pilot_program_id);
CREATE INDEX idx_fppg_evidence_participant_id ON founding_printhouse_pilot_evidence_packs (participant_id);
CREATE INDEX idx_fppg_evidence_status ON founding_printhouse_pilot_evidence_packs (evidence_status);
CREATE INDEX idx_fppg_evidence_generated_at ON founding_printhouse_pilot_evidence_packs (generated_at);

-- Foreign keys
ALTER TABLE founding_printhouse_pilot_participants
  ADD CONSTRAINT fk_fppg_participants_program FOREIGN KEY (pilot_program_id)
  REFERENCES founding_printhouse_pilot_programs (pilot_program_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE founding_printhouse_pilot_order_links
  ADD CONSTRAINT fk_fppg_order_links_program FOREIGN KEY (pilot_program_id)
  REFERENCES founding_printhouse_pilot_programs (pilot_program_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE founding_printhouse_pilot_order_links
  ADD CONSTRAINT fk_fppg_order_links_participant FOREIGN KEY (participant_id)
  REFERENCES founding_printhouse_pilot_participants (participant_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE founding_printhouse_pilot_reviews
  ADD CONSTRAINT fk_fppg_reviews_program FOREIGN KEY (pilot_program_id)
  REFERENCES founding_printhouse_pilot_programs (pilot_program_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE founding_printhouse_pilot_reviews
  ADD CONSTRAINT fk_fppg_reviews_participant FOREIGN KEY (participant_id)
  REFERENCES founding_printhouse_pilot_participants (participant_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE founding_printhouse_pilot_findings
  ADD CONSTRAINT fk_fppg_findings_program FOREIGN KEY (pilot_program_id)
  REFERENCES founding_printhouse_pilot_programs (pilot_program_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE founding_printhouse_pilot_audits
  ADD CONSTRAINT fk_fppg_audits_program FOREIGN KEY (pilot_program_id)
  REFERENCES founding_printhouse_pilot_programs (pilot_program_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE founding_printhouse_pilot_evidence_packs
  ADD CONSTRAINT fk_fppg_evidence_program FOREIGN KEY (pilot_program_id)
  REFERENCES founding_printhouse_pilot_programs (pilot_program_id) ON DELETE RESTRICT ON UPDATE CASCADE;
