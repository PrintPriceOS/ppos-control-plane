-- migrations/rollback/rollback_170_phase196i_order_effective_technical_specifications.sql
-- PrintPrice OS — Rollback for Phase 196I: Governed Effective Technical Specifications for Manufacturing (BUDGET-02D-01)
--
-- Safe rollback script: drops order_effective_technical_specifications table.

DROP TABLE IF EXISTS order_effective_technical_specifications;
