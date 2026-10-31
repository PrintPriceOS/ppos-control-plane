-- migrations/rollback/rollback_174_phase197c_paper_evidence_and_technical_accreditation.sql
-- Safe Rollback for Phase 197C (PAPER-MATERIALS-RECOVERY-09)
-- Drops only the additive evidence and audit tables in reverse foreign-key dependency order.
-- Leaves paper_variants and paper_products 100% untouched.

DROP TABLE IF EXISTS paper_variant_classification_evidence;
DROP TABLE IF EXISTS paper_variant_caliper_audit_log;
DROP TABLE IF EXISTS paper_variant_caliper_evidence;

