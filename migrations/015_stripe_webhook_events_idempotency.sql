-- =============================================================================
-- Migration 015: stripe_webhook_events — Idempotency Table
-- Phase Paywall Hardened v2 — Webhook Hardening Sweep
-- =============================================================================
--
-- Stores processed Stripe event IDs to prevent duplicate processing on retries.
-- Stripe guarantees at-least-once delivery; this table enforces exactly-once semantics.
--
-- Usage:
--   Before processing any event: SELECT id WHERE event_id = ?  → skip if found
--   After processing:            INSERT IGNORE (event_id, ...)
--
-- Retention: Events older than 30 days can be pruned safely.
-- =============================================================================

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id      VARCHAR(128)  NOT NULL  COMMENT 'Stripe event ID (e.g. evt_1ABCxyz...)',
    event_type    VARCHAR(80)   NOT NULL  COMMENT 'e.g. checkout.session.completed',
    processed_at  DATETIME      NOT NULL  DEFAULT CURRENT_TIMESTAMP,
    handler_error TEXT          NULL      COMMENT 'NULL on success; error message on handler failure',

    UNIQUE KEY uq_event_id (event_id),
    KEY idx_processed_at (processed_at),
    KEY idx_event_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Stripe webhook event idempotency log — prevents duplicate processing on retries';

-- Maintenance: Prune events older than 30 days (run via scheduled job)
-- DELETE FROM stripe_webhook_events WHERE processed_at < NOW() - INTERVAL 30 DAY;
