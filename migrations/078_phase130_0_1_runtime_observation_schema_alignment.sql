-- Migration 078: Phase 130.0.1 Runtime Observation Schema Alignment

-- Add event_type to sessions table to align with the service's insertion logic
-- We don't use IF NOT EXISTS per instructions, we rely on the migration runner.

ALTER TABLE controlled_beta_runtime_observation_sessions
ADD COLUMN event_type VARCHAR(64) NOT NULL DEFAULT 'SESSION_STARTED_OBSERVED' AFTER session_id;

-- Add an index on event_type for fast querying if needed
CREATE INDEX idx_cb_obs_sess_type ON controlled_beta_runtime_observation_sessions (event_type);
