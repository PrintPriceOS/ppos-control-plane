-- Migration 153: Multilingual PDF Quote Ingestion Schema Extension
-- Phase 194E: Adds extraction metadata, translation text, confidence tracking, and operator corrections.

ALTER TABLE quote_evidence_documents
  ADD COLUMN page_count INTEGER DEFAULT 1,
  ADD COLUMN extraction_method VARCHAR(64) NULL,
  ADD COLUMN extraction_version VARCHAR(32) NULL,
  ADD COLUMN processing_status VARCHAR(64) DEFAULT 'COMPLETED';

ALTER TABLE quote_evidence_extractions
  ADD COLUMN translated_text TEXT NULL,
  ADD COLUMN confidence_status VARCHAR(32) DEFAULT 'HIGH_CONFIDENCE',
  ADD COLUMN interpretation_version VARCHAR(32) NULL,
  ADD COLUMN operator_corrections_json JSON NULL;
