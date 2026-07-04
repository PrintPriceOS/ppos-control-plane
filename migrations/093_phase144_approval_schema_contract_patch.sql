-- 093_phase144_approval_schema_contract_patch.sql
-- Phase 144 schema contract patch: approval JSON review columns

SET @db_name = DATABASE();

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'controlled_beta_cohort_intervention_approvals'
    AND COLUMN_NAME = 'approval_summary_json'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN approval_summary_json JSON NULL AFTER write_scope_status',
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
    AND COLUMN_NAME = 'impact_review_json'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN impact_review_json JSON NULL AFTER approval_summary_json',
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
    AND COLUMN_NAME = 'rollback_review_json'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN rollback_review_json JSON NULL AFTER impact_review_json',
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
    AND COLUMN_NAME = 'guardrail_review_json'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE controlled_beta_cohort_intervention_approvals ADD COLUMN guardrail_review_json JSON NULL AFTER rollback_review_json',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
