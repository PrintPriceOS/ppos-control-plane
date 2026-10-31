-- 094_phase144_approval_decision_evidence_contract_patch.sql
-- Phase 144 schema contract patch: decision and evidence columns

SET @db_name = DATABASE();

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'controlled_beta_cohort_intervention_approvals'
    AND COLUMN_NAME = 'approved_by'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN approved_by VARCHAR(255) NULL AFTER approval_decision',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'controlled_beta_cohort_intervention_approvals'
    AND COLUMN_NAME = 'approved_at'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN approved_at TIMESTAMP NULL AFTER approved_by',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'controlled_beta_cohort_intervention_approvals'
    AND COLUMN_NAME = 'rejected_by'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN rejected_by VARCHAR(255) NULL AFTER approved_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'controlled_beta_cohort_intervention_approvals'
    AND COLUMN_NAME = 'rejected_at'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN rejected_at TIMESTAMP NULL AFTER rejected_by',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'controlled_beta_cohort_intervention_approvals'
    AND COLUMN_NAME = 'approval_result_hash'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN approval_result_hash VARCHAR(128) NULL AFTER source_prep_evidence_pack_hash',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'controlled_beta_cohort_intervention_approvals'
    AND COLUMN_NAME = 'evidence_pack_hash'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN evidence_pack_hash VARCHAR(128) NULL AFTER approval_result_hash',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'controlled_beta_cohort_intervention_approvals'
    AND COLUMN_NAME = 'lineage_hash_chain_json'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN lineage_hash_chain_json JSON NULL AFTER evidence_pack_hash',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
