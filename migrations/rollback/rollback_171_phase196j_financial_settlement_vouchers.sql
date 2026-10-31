-- migrations/rollback/rollback_171_phase196j_financial_settlement_vouchers.sql
-- PrintPrice OS — Rollback for Phase 196J: Governed Financial Settlement Vouchers & Transactional Anti-Replay Ledger (BUDGET-02D-01R5V)
--
-- Safe rollback script: drops financial_settlement_vouchers table.

DROP TABLE IF EXISTS financial_settlement_vouchers;
