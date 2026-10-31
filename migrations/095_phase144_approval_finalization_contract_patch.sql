-- 095_phase144_approval_finalization_contract_patch.sql
-- Phase 144 schema contract patch: finalization columns

SET @db_name = DATABASE();

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'controlled_beta_cohort_intervention_approvals'
    AND COLUMN_NAME = 'finalized_by'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN finalized_by VARCHAR(255) NULL AFTER rejected_at',
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
    AND COLUMN_NAME = 'finalized_at'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN finalized_at TIMESTAMP NULL AFTER finalized_by',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
