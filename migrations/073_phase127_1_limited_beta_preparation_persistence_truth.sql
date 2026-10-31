-- Phase 127.1: Limited Beta Preparation Persistence & Production Truth Hardening
-- Adds indexes, status columns, and integrity tracking to limited_beta_% tables.

-- limited_beta_preparation_gates updates
ALTER TABLE limited_beta_preparation_gates ADD COLUMN gate_status VARCHAR(80) DEFAULT NULL;
ALTER TABLE limited_beta_preparation_gates ADD COLUMN persistence_status VARCHAR(80) DEFAULT NULL;
ALTER TABLE limited_beta_preparation_gates ADD COLUMN runtime_truth_status VARCHAR(80) NOT NULL DEFAULT 'DEGRADED';
ALTER TABLE limited_beta_preparation_gates ADD COLUMN evidence_integrity_hash VARCHAR(128) DEFAULT NULL;
ALTER TABLE limited_beta_preparation_gates ADD COLUMN verified_from_db TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE limited_beta_preparation_gates ADD COLUMN verified_from_phase126_1 TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE limited_beta_preparation_gates ADD COLUMN verified_secret_hygiene TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE limited_beta_preparation_gates ADD COLUMN restart_safe TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE limited_beta_preparation_gates ADD COLUMN fail_closed_verified TINYINT(1) NOT NULL DEFAULT 0;

CREATE INDEX idx_lbpg_gate_id ON limited_beta_preparation_gates(gate_id);
CREATE INDEX idx_lbpg_gate_status ON limited_beta_preparation_gates(gate_status);
CREATE INDEX idx_lbpg_created_at ON limited_beta_preparation_gates(created_at);

-- limited_beta_cohorts updates
ALTER TABLE limited_beta_cohorts ADD COLUMN cohort_status VARCHAR(80) DEFAULT NULL;
CREATE INDEX idx_lbc_gate_id ON limited_beta_cohorts(gate_id);
CREATE INDEX idx_lbc_cohort_id ON limited_beta_cohorts(cohort_id);
CREATE INDEX idx_lbc_cohort_status ON limited_beta_cohorts(cohort_status);
CREATE INDEX idx_lbc_created_at ON limited_beta_cohorts(created_at);

-- limited_beta_cohort_participants updates
ALTER TABLE limited_beta_cohort_participants ADD COLUMN gate_id VARCHAR(80) DEFAULT NULL;
CREATE INDEX idx_lbcp_gate_id ON limited_beta_cohort_participants(gate_id);
CREATE INDEX idx_lbcp_cohort_id ON limited_beta_cohort_participants(cohort_id);
CREATE INDEX idx_lbcp_participant_id ON limited_beta_cohort_participants(participant_id);
CREATE INDEX idx_lbcp_participant_status ON limited_beta_cohort_participants(participant_status);
CREATE INDEX idx_lbcp_participant_type ON limited_beta_cohort_participants(participant_type);
CREATE INDEX idx_lbcp_tenant_id ON limited_beta_cohort_participants(tenant_id);

-- limited_beta_invite_codes updates
ALTER TABLE limited_beta_invite_codes ADD COLUMN gate_id VARCHAR(80) DEFAULT NULL;
ALTER TABLE limited_beta_invite_codes ADD COLUMN participant_id VARCHAR(80) DEFAULT NULL;
ALTER TABLE limited_beta_invite_codes ADD COLUMN invite_status VARCHAR(80) DEFAULT NULL;
ALTER TABLE limited_beta_invite_codes ADD COLUMN invite_hash VARCHAR(128) DEFAULT NULL;
ALTER TABLE limited_beta_invite_codes ADD COLUMN expires_at TIMESTAMP NULL DEFAULT NULL;
CREATE INDEX idx_lbic_gate_id ON limited_beta_invite_codes(gate_id);
CREATE INDEX idx_lbic_cohort_id ON limited_beta_invite_codes(cohort_id);
CREATE INDEX idx_lbic_participant_id ON limited_beta_invite_codes(participant_id);
CREATE INDEX idx_lbic_invite_status ON limited_beta_invite_codes(invite_status);
CREATE INDEX idx_lbic_invite_hash ON limited_beta_invite_codes(invite_hash);
CREATE INDEX idx_lbic_expires_at ON limited_beta_invite_codes(expires_at);

-- limited_beta_terms_acceptances updates
ALTER TABLE limited_beta_terms_acceptances ADD COLUMN gate_id VARCHAR(80) DEFAULT NULL;
ALTER TABLE limited_beta_terms_acceptances ADD COLUMN acceptance_status VARCHAR(80) DEFAULT NULL;
CREATE INDEX idx_lbta_gate_id ON limited_beta_terms_acceptances(gate_id);
CREATE INDEX idx_lbta_participant_id ON limited_beta_terms_acceptances(participant_id);
CREATE INDEX idx_lbta_acceptance_status ON limited_beta_terms_acceptances(acceptance_status);
CREATE INDEX idx_lbta_accepted_at ON limited_beta_terms_acceptances(accepted_at);

-- limited_beta_role_boundaries updates
ALTER TABLE limited_beta_role_boundaries ADD COLUMN gate_id VARCHAR(80) DEFAULT NULL;
ALTER TABLE limited_beta_role_boundaries ADD COLUMN role_boundary_status VARCHAR(80) DEFAULT NULL;
CREATE INDEX idx_lbrb_gate_id ON limited_beta_role_boundaries(gate_id);
CREATE INDEX idx_lbrb_participant_id ON limited_beta_role_boundaries(participant_id);
CREATE INDEX idx_lbrb_status ON limited_beta_role_boundaries(role_boundary_status);

-- limited_beta_support_escalations updates
ALTER TABLE limited_beta_support_escalations ADD COLUMN escalation_status VARCHAR(80) DEFAULT NULL;
CREATE INDEX idx_lbse_gate_id ON limited_beta_support_escalations(gate_id);
CREATE INDEX idx_lbse_status ON limited_beta_support_escalations(escalation_status);

-- limited_beta_incident_rollback_plans updates
ALTER TABLE limited_beta_incident_rollback_plans ADD COLUMN rollback_plan_status VARCHAR(80) DEFAULT NULL;
CREATE INDEX idx_lbrp_gate_id ON limited_beta_incident_rollback_plans(gate_id);
CREATE INDEX idx_lbrp_status ON limited_beta_incident_rollback_plans(rollback_plan_status);

-- limited_beta_findings updates
ALTER TABLE limited_beta_findings ADD COLUMN blocks_readiness TINYINT(1) NOT NULL DEFAULT 0;
CREATE INDEX idx_lbf_gate_id ON limited_beta_findings(gate_id);
CREATE INDEX idx_lbf_finding_status ON limited_beta_findings(finding_status);
CREATE INDEX idx_lbf_severity ON limited_beta_findings(severity);
CREATE INDEX idx_lbf_blocks_readiness ON limited_beta_findings(blocks_readiness);

-- limited_beta_audits updates
CREATE INDEX idx_lba_gate_id ON limited_beta_audits(gate_id);
CREATE INDEX idx_lba_event_type ON limited_beta_audits(event_type);
CREATE INDEX idx_lba_created_at ON limited_beta_audits(created_at);

-- limited_beta_evidence_packs updates
CREATE INDEX idx_lbep_gate_id ON limited_beta_evidence_packs(gate_id);
CREATE INDEX idx_lbep_evidence_status ON limited_beta_evidence_packs(evidence_status);
CREATE INDEX idx_lbep_generated_at ON limited_beta_evidence_packs(generated_at);
