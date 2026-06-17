-- Phase 120: Final Pre-Production Release Candidate
-- Aggregates all readiness layers (Phases 113-119) into a single sign-off record.
-- Safety: review_only only. No production activation, no live execution, no source mutation.

CREATE TABLE IF NOT EXISTS final_preproduction_release_candidates (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  candidate_ref VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT 'Final Pre-Production Release Candidate',
  status ENUM(
    'DRAFT',
    'AGGREGATING',
    'READY_FOR_REVIEW',
    'CHANGES_REQUIRED',
    'VALIDATED',
    'REJECTED'
  ) NOT NULL DEFAULT 'DRAFT',
  -- Phase validation references
  phase_113_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  phase_114_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  phase_115_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  phase_116_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  phase_117_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  phase_118_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  phase_119_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  -- Safety invariants (immutable)
  review_only TINYINT(1) NOT NULL DEFAULT 1,
  external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
  source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
  live_provider_connectivity_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  -- Metadata
  created_by VARCHAR(100) NOT NULL DEFAULT 'system',
  notes TEXT NULL,
  evidence_pack_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS final_preproduction_release_candidate_checks (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  candidate_id VARCHAR(36) NOT NULL,
  check_name VARCHAR(200) NOT NULL,
  check_category VARCHAR(100) NOT NULL,
  status ENUM('PENDING', 'PASS', 'FAIL', 'BLOCKED') NOT NULL DEFAULT 'PENDING',
  detail TEXT NULL,
  evaluated_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS final_preproduction_release_candidate_findings (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  candidate_id VARCHAR(36) NOT NULL,
  severity ENUM('BLOCKER', 'MAJOR', 'MINOR', 'INFO') NOT NULL DEFAULT 'MINOR',
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  remediation TEXT NULL,
  status ENUM('OPEN', 'RESOLVED', 'WONT_FIX') NOT NULL DEFAULT 'OPEN',
  created_by VARCHAR(100) NOT NULL DEFAULT 'system',
  resolved_by VARCHAR(100) NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS final_preproduction_release_candidate_audits (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  candidate_id VARCHAR(36) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  actor VARCHAR(100) NOT NULL DEFAULT 'system',
  detail TEXT NULL,
  review_only TINYINT(1) NOT NULL DEFAULT 1,
  production_activation_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
