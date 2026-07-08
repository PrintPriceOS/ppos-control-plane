-- Migration 118: Phase 166 - Controlled High-Risk Cohort Intervention Activation Token Redemption Unlock Eligibility Gate Table Repair

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_activation_token_redempt_unlock_elig_rl (
  rule_id VARCHAR(64) PRIMARY KEY,
  activation_token_redemption_unlock_eligibility_id VARCHAR(64) NOT NULL,
  check_type VARCHAR(128) NOT NULL,
  severity VARCHAR(32) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unlock_elig_rl_parent (activation_token_redemption_unlock_eligibility_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_activation_token_redempt_unlock_elig_ev (
  evidence_id VARCHAR(64) PRIMARY KEY,
  activation_token_redemption_unlock_eligibility_id VARCHAR(64) NOT NULL,
  evidence_schema_version VARCHAR(16) NOT NULL,
  evidence_pack_hash VARCHAR(64) NOT NULL,
  evidence_payload_json LONGTEXT NOT NULL,
  lineage_hash_chain_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unlock_elig_ev_parent (activation_token_redemption_unlock_eligibility_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS cb_cohort_intervention_activation_token_redempt_unlock_elig_aud (
  audit_id VARCHAR(64) PRIMARY KEY,
  activation_token_redemption_unlock_eligibility_id VARCHAR(64) NOT NULL,
  action_type VARCHAR(128) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  details_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unlock_elig_aud_parent (activation_token_redemption_unlock_eligibility_id),
  INDEX idx_unlock_elig_aud_action (action_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;
