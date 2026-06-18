-- Phase 124: Controlled Printhouse Handoff / File Package Pilot
-- Governed handoff package workflow for approved founding printhouse pilot participants.
-- No FULL_PUBLIC, no open marketplace, no automatic production dispatch,
-- no unrestricted file access, no real payment/refund/payout execution,
-- no external tax/accounting/provider submission, no source mutation outside pilot scope.

CREATE TABLE IF NOT EXISTS controlled_printhouse_handoff_packages (
  handoff_package_id VARCHAR(80) NOT NULL PRIMARY KEY,
  phase VARCHAR(40) NOT NULL DEFAULT 'PHASE_124',
  pilot_program_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) NOT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  order_link_id VARCHAR(80) DEFAULT NULL,
  printhouse_tenant_id VARCHAR(80) NOT NULL,
  package_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  file_access_scope VARCHAR(200) DEFAULT 'NONE',
  file_access_expires_at TIMESTAMP NULL DEFAULT NULL,
  file_download_audit_required TINYINT(1) NOT NULL DEFAULT 1,
  pilot_only TINYINT(1) NOT NULL DEFAULT 1,
  founding_printhouse_only TINYINT(1) NOT NULL DEFAULT 1,
  review_only TINYINT(1) NOT NULL DEFAULT 1,
  production_dispatch_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provider_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
  unrestricted_file_access TINYINT(1) NOT NULL DEFAULT 0,
  permanent_public_url TINYINT(1) NOT NULL DEFAULT 0,
  external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation_outside_pilot_scope TINYINT(1) NOT NULL DEFAULT 0,
  production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS controlled_printhouse_handoff_package_files (
  package_file_id VARCHAR(80) NOT NULL PRIMARY KEY,
  handoff_package_id VARCHAR(80) NOT NULL,
  file_name VARCHAR(400) DEFAULT NULL,
  file_type VARCHAR(120) DEFAULT NULL,
  file_size_bytes BIGINT DEFAULT NULL,
  file_scope VARCHAR(200) DEFAULT 'REDACTED_PREVIEW',
  file_metadata_json JSON DEFAULT NULL,
  preflight_status VARCHAR(80) DEFAULT 'UNKNOWN',
  production_constraints_json JSON DEFAULT NULL,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS controlled_printhouse_handoff_reviews (
  review_id VARCHAR(80) NOT NULL PRIMARY KEY,
  handoff_package_id VARCHAR(80) NOT NULL,
  pilot_program_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) NOT NULL,
  reviewer VARCHAR(120) DEFAULT NULL,
  review_status VARCHAR(80) NOT NULL DEFAULT 'PENDING',
  review_notes TEXT DEFAULT NULL,
  review_type VARCHAR(80) NOT NULL DEFAULT 'HANDOFF_REVIEW',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS controlled_printhouse_handoff_access_grants (
  access_grant_id VARCHAR(80) NOT NULL PRIMARY KEY,
  handoff_package_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) NOT NULL,
  printhouse_tenant_id VARCHAR(80) NOT NULL,
  pilot_order_id VARCHAR(80) DEFAULT NULL,
  grant_status VARCHAR(80) NOT NULL DEFAULT 'ACTIVE',
  access_scope VARCHAR(200) NOT NULL DEFAULT 'REDACTED_PREVIEW',
  expires_at TIMESTAMP NULL DEFAULT NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  revoked_by VARCHAR(120) DEFAULT NULL,
  download_audit_required TINYINT(1) NOT NULL DEFAULT 1,
  unrestricted_file_access TINYINT(1) NOT NULL DEFAULT 0,
  permanent_public_url TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(120) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS controlled_printhouse_handoff_findings (
  finding_id VARCHAR(80) NOT NULL PRIMARY KEY,
  handoff_package_id VARCHAR(80) NOT NULL,
  pilot_program_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) DEFAULT NULL,
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

CREATE TABLE IF NOT EXISTS controlled_printhouse_handoff_audits (
  audit_id VARCHAR(80) NOT NULL PRIMARY KEY,
  handoff_package_id VARCHAR(80) DEFAULT NULL,
  pilot_program_id VARCHAR(80) DEFAULT NULL,
  participant_id VARCHAR(80) DEFAULT NULL,
  access_grant_id VARCHAR(80) DEFAULT NULL,
  event_type VARCHAR(120) NOT NULL,
  event_actor VARCHAR(120) DEFAULT NULL,
  event_payload_json JSON DEFAULT NULL,
  safety_snapshot_json JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS controlled_printhouse_handoff_evidence_packs (
  evidence_pack_id VARCHAR(80) NOT NULL PRIMARY KEY,
  handoff_package_id VARCHAR(80) NOT NULL,
  pilot_program_id VARCHAR(80) NOT NULL,
  participant_id VARCHAR(80) DEFAULT NULL,
  evidence_status VARCHAR(80) NOT NULL DEFAULT 'DRAFT',
  evidence_schema_version VARCHAR(20) NOT NULL DEFAULT '124.0',
  evidence_hash VARCHAR(128) DEFAULT NULL,
  evidence_json JSON DEFAULT NULL,
  redaction_classification VARCHAR(80) NOT NULL DEFAULT 'INTERNAL_ONLY',
  generated_by VARCHAR(120) DEFAULT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes on handoff_packages
CREATE INDEX idx_cphp_packages_program_id ON controlled_printhouse_handoff_packages (pilot_program_id);
CREATE INDEX idx_cphp_packages_participant_id ON controlled_printhouse_handoff_packages (participant_id);
CREATE INDEX idx_cphp_packages_printhouse_tenant ON controlled_printhouse_handoff_packages (printhouse_tenant_id);
CREATE INDEX idx_cphp_packages_status ON controlled_printhouse_handoff_packages (package_status);
CREATE INDEX idx_cphp_packages_order_link_id ON controlled_printhouse_handoff_packages (order_link_id);
CREATE INDEX idx_cphp_packages_created_at ON controlled_printhouse_handoff_packages (created_at);

-- Indexes on package_files
CREATE INDEX idx_cphp_files_package_id ON controlled_printhouse_handoff_package_files (handoff_package_id);
CREATE INDEX idx_cphp_files_created_at ON controlled_printhouse_handoff_package_files (created_at);

-- Indexes on reviews
CREATE INDEX idx_cphp_reviews_package_id ON controlled_printhouse_handoff_reviews (handoff_package_id);
CREATE INDEX idx_cphp_reviews_program_id ON controlled_printhouse_handoff_reviews (pilot_program_id);
CREATE INDEX idx_cphp_reviews_participant_id ON controlled_printhouse_handoff_reviews (participant_id);
CREATE INDEX idx_cphp_reviews_status ON controlled_printhouse_handoff_reviews (review_status);
CREATE INDEX idx_cphp_reviews_created_at ON controlled_printhouse_handoff_reviews (created_at);

-- Indexes on access_grants
CREATE INDEX idx_cphp_grants_package_id ON controlled_printhouse_handoff_access_grants (handoff_package_id);
CREATE INDEX idx_cphp_grants_participant_id ON controlled_printhouse_handoff_access_grants (participant_id);
CREATE INDEX idx_cphp_grants_printhouse_tenant ON controlled_printhouse_handoff_access_grants (printhouse_tenant_id);
CREATE INDEX idx_cphp_grants_status ON controlled_printhouse_handoff_access_grants (grant_status);
CREATE INDEX idx_cphp_grants_expires_at ON controlled_printhouse_handoff_access_grants (expires_at);
CREATE INDEX idx_cphp_grants_created_at ON controlled_printhouse_handoff_access_grants (created_at);

-- Indexes on findings
CREATE INDEX idx_cphp_findings_package_id ON controlled_printhouse_handoff_findings (handoff_package_id);
CREATE INDEX idx_cphp_findings_program_id ON controlled_printhouse_handoff_findings (pilot_program_id);
CREATE INDEX idx_cphp_findings_participant_id ON controlled_printhouse_handoff_findings (participant_id);
CREATE INDEX idx_cphp_findings_status ON controlled_printhouse_handoff_findings (finding_status);
CREATE INDEX idx_cphp_findings_blocks_handoff ON controlled_printhouse_handoff_findings (blocks_handoff);
CREATE INDEX idx_cphp_findings_severity ON controlled_printhouse_handoff_findings (severity);
CREATE INDEX idx_cphp_findings_created_at ON controlled_printhouse_handoff_findings (created_at);

-- Indexes on audits
CREATE INDEX idx_cphp_audits_package_id ON controlled_printhouse_handoff_audits (handoff_package_id);
CREATE INDEX idx_cphp_audits_program_id ON controlled_printhouse_handoff_audits (pilot_program_id);
CREATE INDEX idx_cphp_audits_participant_id ON controlled_printhouse_handoff_audits (participant_id);
CREATE INDEX idx_cphp_audits_event_type ON controlled_printhouse_handoff_audits (event_type);
CREATE INDEX idx_cphp_audits_created_at ON controlled_printhouse_handoff_audits (created_at);

-- Indexes on evidence_packs
CREATE INDEX idx_cphp_evidence_package_id ON controlled_printhouse_handoff_evidence_packs (handoff_package_id);
CREATE INDEX idx_cphp_evidence_program_id ON controlled_printhouse_handoff_evidence_packs (pilot_program_id);
CREATE INDEX idx_cphp_evidence_participant_id ON controlled_printhouse_handoff_evidence_packs (participant_id);
CREATE INDEX idx_cphp_evidence_status ON controlled_printhouse_handoff_evidence_packs (evidence_status);
CREATE INDEX idx_cphp_evidence_generated_at ON controlled_printhouse_handoff_evidence_packs (generated_at);

-- Foreign keys
ALTER TABLE controlled_printhouse_handoff_packages
  ADD CONSTRAINT fk_cphp_packages_program FOREIGN KEY (pilot_program_id)
  REFERENCES founding_printhouse_pilot_programs (pilot_program_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE controlled_printhouse_handoff_packages
  ADD CONSTRAINT fk_cphp_packages_participant FOREIGN KEY (participant_id)
  REFERENCES founding_printhouse_pilot_participants (participant_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE controlled_printhouse_handoff_package_files
  ADD CONSTRAINT fk_cphp_files_package FOREIGN KEY (handoff_package_id)
  REFERENCES controlled_printhouse_handoff_packages (handoff_package_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE controlled_printhouse_handoff_reviews
  ADD CONSTRAINT fk_cphp_reviews_package FOREIGN KEY (handoff_package_id)
  REFERENCES controlled_printhouse_handoff_packages (handoff_package_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE controlled_printhouse_handoff_reviews
  ADD CONSTRAINT fk_cphp_reviews_program FOREIGN KEY (pilot_program_id)
  REFERENCES founding_printhouse_pilot_programs (pilot_program_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE controlled_printhouse_handoff_access_grants
  ADD CONSTRAINT fk_cphp_grants_package FOREIGN KEY (handoff_package_id)
  REFERENCES controlled_printhouse_handoff_packages (handoff_package_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE controlled_printhouse_handoff_access_grants
  ADD CONSTRAINT fk_cphp_grants_participant FOREIGN KEY (participant_id)
  REFERENCES founding_printhouse_pilot_participants (participant_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE controlled_printhouse_handoff_findings
  ADD CONSTRAINT fk_cphp_findings_package FOREIGN KEY (handoff_package_id)
  REFERENCES controlled_printhouse_handoff_packages (handoff_package_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE controlled_printhouse_handoff_findings
  ADD CONSTRAINT fk_cphp_findings_program FOREIGN KEY (pilot_program_id)
  REFERENCES founding_printhouse_pilot_programs (pilot_program_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE controlled_printhouse_handoff_audits
  ADD CONSTRAINT fk_cphp_audits_package FOREIGN KEY (handoff_package_id)
  REFERENCES controlled_printhouse_handoff_packages (handoff_package_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE controlled_printhouse_handoff_audits
  ADD CONSTRAINT fk_cphp_audits_program FOREIGN KEY (pilot_program_id)
  REFERENCES founding_printhouse_pilot_programs (pilot_program_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE controlled_printhouse_handoff_evidence_packs
  ADD CONSTRAINT fk_cphp_evidence_package FOREIGN KEY (handoff_package_id)
  REFERENCES controlled_printhouse_handoff_packages (handoff_package_id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE controlled_printhouse_handoff_evidence_packs
  ADD CONSTRAINT fk_cphp_evidence_program FOREIGN KEY (pilot_program_id)
  REFERENCES founding_printhouse_pilot_programs (pilot_program_id) ON DELETE RESTRICT ON UPDATE CASCADE;
