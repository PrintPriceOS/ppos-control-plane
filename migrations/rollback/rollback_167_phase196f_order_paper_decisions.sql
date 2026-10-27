-- migrations/rollback/rollback_167_phase196f_order_paper_decisions.sql
-- PrintPrice OS — Rollback for Phase 196F: Governed Persistence for Printhouse Paper Decisions
--
-- Safe rollback script: drops the order_paper_decisions table cleanly.

DROP TABLE IF EXISTS order_paper_decisions;
