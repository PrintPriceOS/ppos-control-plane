-- Migration 153: Multilingual PDF Quote Ingestion Schema Extension
-- Phase 194E: Adds extraction metadata, translation text, confidence tracking, and operator corrections.

ALTER TABLE quote_evidence_documents
  ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS extraction_method VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS extraction_version VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(64) DEFAULT 'COMPLETED';

ALTER TABLE quote_evidence_extractions
  ADD COLUMN IF NOT EXISTS translated_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS confidence_status VARCHAR(32) DEFAULT 'HIGH_CONFIDENCE',
  ADD COLUMN IF NOT EXISTS interpretation_version VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS operator_corrections_json JSON NULL;
