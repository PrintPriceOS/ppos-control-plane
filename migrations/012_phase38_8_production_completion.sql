-- Migration 012: Phase 38.8 Production Completion & Delivery Handoff Schema
-- Author: Antigravity
-- Date: 2026-05-26

ALTER TABLE marketplace_orders ADD COLUMN production_completed_at TIMESTAMP NULL;
ALTER TABLE marketplace_orders ADD COLUMN production_completed_by VARCHAR(128) NULL;
ALTER TABLE marketplace_orders ADD COLUMN production_completion_status VARCHAR(64) NULL;
ALTER TABLE marketplace_orders ADD COLUMN delivery_handoff_status VARCHAR(64) NULL;
ALTER TABLE marketplace_orders ADD COLUMN delivery_handoff_ready_at TIMESTAMP NULL;
ALTER TABLE marketplace_orders ADD COLUMN delivery_handoff_ready_by VARCHAR(128) NULL;
ALTER TABLE marketplace_orders ADD COLUMN final_production_audit_json JSON NULL;
