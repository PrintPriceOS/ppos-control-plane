-- migrations/014_audit_logs_indexes.sql
-- Goal: Add missing indexes to api_audit_logs for performance

CREATE INDEX idx_user_id ON api_audit_logs (user_id);
CREATE INDEX idx_status ON api_audit_logs (status);
