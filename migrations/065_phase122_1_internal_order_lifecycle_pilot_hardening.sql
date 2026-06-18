-- Phase 122.1: Internal Order Lifecycle Pilot Operational Hardening
-- Adds operational indexes and relational safeguards to Phase 122 tables.
-- Foreign keys are used where safe (InnoDB, all tables in same schema).

-- Indexes on internal_order_lifecycle_pilot_runs
CREATE INDEX idx_iolp_runs_tenant_id ON internal_order_lifecycle_pilot_runs (tenant_id);
CREATE INDEX idx_iolp_runs_status ON internal_order_lifecycle_pilot_runs (status);
CREATE INDEX idx_iolp_runs_created_at ON internal_order_lifecycle_pilot_runs (created_at);

-- Indexes on internal_order_lifecycle_pilot_orders
CREATE INDEX idx_iolp_orders_pilot_run_id ON internal_order_lifecycle_pilot_orders (pilot_run_id);
CREATE INDEX idx_iolp_orders_tenant_id ON internal_order_lifecycle_pilot_orders (tenant_id);
CREATE INDEX idx_iolp_orders_order_status ON internal_order_lifecycle_pilot_orders (order_status);
CREATE INDEX idx_iolp_orders_created_at ON internal_order_lifecycle_pilot_orders (created_at);

-- Indexes on internal_order_lifecycle_pilot_steps
CREATE INDEX idx_iolp_steps_pilot_run_id ON internal_order_lifecycle_pilot_steps (pilot_run_id);
CREATE INDEX idx_iolp_steps_pilot_order_id ON internal_order_lifecycle_pilot_steps (pilot_order_id);
CREATE INDEX idx_iolp_steps_step_key ON internal_order_lifecycle_pilot_steps (step_key);
CREATE INDEX idx_iolp_steps_step_status ON internal_order_lifecycle_pilot_steps (step_status);
CREATE INDEX idx_iolp_steps_created_at ON internal_order_lifecycle_pilot_steps (created_at);

-- Indexes on internal_order_lifecycle_pilot_findings
CREATE INDEX idx_iolp_findings_pilot_run_id ON internal_order_lifecycle_pilot_findings (pilot_run_id);
CREATE INDEX idx_iolp_findings_pilot_order_id ON internal_order_lifecycle_pilot_findings (pilot_order_id);
CREATE INDEX idx_iolp_findings_finding_status ON internal_order_lifecycle_pilot_findings (finding_status);
CREATE INDEX idx_iolp_findings_blocks_lifecycle ON internal_order_lifecycle_pilot_findings (blocks_lifecycle);
CREATE INDEX idx_iolp_findings_severity ON internal_order_lifecycle_pilot_findings (severity);

-- Indexes on internal_order_lifecycle_pilot_audits
CREATE INDEX idx_iolp_audits_pilot_run_id ON internal_order_lifecycle_pilot_audits (pilot_run_id);
CREATE INDEX idx_iolp_audits_pilot_order_id ON internal_order_lifecycle_pilot_audits (pilot_order_id);
CREATE INDEX idx_iolp_audits_event_type ON internal_order_lifecycle_pilot_audits (event_type);
CREATE INDEX idx_iolp_audits_created_at ON internal_order_lifecycle_pilot_audits (created_at);

-- Indexes on internal_order_lifecycle_pilot_rollback_points
CREATE INDEX idx_iolp_rollback_pilot_run_id ON internal_order_lifecycle_pilot_rollback_points (pilot_run_id);
CREATE INDEX idx_iolp_rollback_pilot_order_id ON internal_order_lifecycle_pilot_rollback_points (pilot_order_id);
CREATE INDEX idx_iolp_rollback_status ON internal_order_lifecycle_pilot_rollback_points (rollback_point_status);
CREATE INDEX idx_iolp_rollback_created_at ON internal_order_lifecycle_pilot_rollback_points (created_at);

-- Indexes on internal_order_lifecycle_pilot_evidence_packs
CREATE INDEX idx_iolp_evidence_pilot_run_id ON internal_order_lifecycle_pilot_evidence_packs (pilot_run_id);
CREATE INDEX idx_iolp_evidence_pilot_order_id ON internal_order_lifecycle_pilot_evidence_packs (pilot_order_id);
CREATE INDEX idx_iolp_evidence_status ON internal_order_lifecycle_pilot_evidence_packs (evidence_status);
CREATE INDEX idx_iolp_evidence_generated_at ON internal_order_lifecycle_pilot_evidence_packs (generated_at);

-- Foreign keys (InnoDB, same schema — safe to add)
-- Orders → Runs
ALTER TABLE internal_order_lifecycle_pilot_orders
  ADD CONSTRAINT fk_iolp_orders_run FOREIGN KEY (pilot_run_id)
  REFERENCES internal_order_lifecycle_pilot_runs (pilot_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Steps → Runs
ALTER TABLE internal_order_lifecycle_pilot_steps
  ADD CONSTRAINT fk_iolp_steps_run FOREIGN KEY (pilot_run_id)
  REFERENCES internal_order_lifecycle_pilot_runs (pilot_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Findings → Runs
ALTER TABLE internal_order_lifecycle_pilot_findings
  ADD CONSTRAINT fk_iolp_findings_run FOREIGN KEY (pilot_run_id)
  REFERENCES internal_order_lifecycle_pilot_runs (pilot_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Audits → Runs
ALTER TABLE internal_order_lifecycle_pilot_audits
  ADD CONSTRAINT fk_iolp_audits_run FOREIGN KEY (pilot_run_id)
  REFERENCES internal_order_lifecycle_pilot_runs (pilot_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rollback points → Runs
ALTER TABLE internal_order_lifecycle_pilot_rollback_points
  ADD CONSTRAINT fk_iolp_rollback_run FOREIGN KEY (pilot_run_id)
  REFERENCES internal_order_lifecycle_pilot_runs (pilot_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Evidence packs → Runs
ALTER TABLE internal_order_lifecycle_pilot_evidence_packs
  ADD CONSTRAINT fk_iolp_evidence_run FOREIGN KEY (pilot_run_id)
  REFERENCES internal_order_lifecycle_pilot_runs (pilot_run_id) ON DELETE RESTRICT ON UPDATE CASCADE;
