-- migrations/rollback/rollback_168_phase196g_order_quote_revisions.sql
-- PrintPrice OS — Rollback for Phase 196G: Governed Persistence for Order Quote Revisions & Single-Use Tokens
--
-- Safe rollback script: drops tables in reverse dependency order.

DROP TABLE IF EXISTS order_revision_audit_events;
DROP TABLE IF EXISTS quote_revision_tokens;
DROP TABLE IF EXISTS order_quote_revisions;
