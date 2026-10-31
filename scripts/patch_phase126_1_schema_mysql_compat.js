'use strict';

require('dotenv').config();
const db = require('../src/api/services/mysqlClient');

console.log('=== Node Schema Patch: Phase 126.1 Schema MySQL Compatibility Patch ===\n');

async function checkColumnExists(tableName, columnName) {
  try {
    const rows = await db.query(
      `SELECT COUNT(*) as count 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = ? 
         AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );
    return rows && rows[0] && rows[0].count > 0;
  } catch (err) {
    console.error(`Error checking column ${columnName} in table ${tableName}:`, err.message);
    throw err;
  }
}

async function addColumnIfMissing(tableName, columnName, columnDefinition) {
  const exists = await checkColumnExists(tableName, columnName);
  if (exists) {
    console.log(`  [EXIST] Column '${columnName}' already exists in table '${tableName}'. Skipping.`);
  } else {
    try {
      console.log(`  [ADD] Column '${columnName}' in table '${tableName}' is missing. Adding...`);
      await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
      console.log(`  [ADD-SUCCESS] Column '${columnName}' added successfully.`);
    } catch (err) {
      console.error(`  [ADD-FAILURE] Failed to add column '${columnName}' to '${tableName}':`, err.message);
      throw err;
    }
  }
}

async function run() {
  try {
    // 1. pilot_evidence_review_checks columns
    await addColumnIfMissing('pilot_evidence_review_checks', 'evidence_source_type', 'VARCHAR(80) DEFAULT NULL');
    await addColumnIfMissing('pilot_evidence_review_checks', 'evidence_source_reference', 'VARCHAR(120) DEFAULT NULL');
    await addColumnIfMissing('pilot_evidence_review_checks', 'evidence_integrity_hash', 'VARCHAR(128) DEFAULT NULL');
    await addColumnIfMissing('pilot_evidence_review_checks', 'verified_from_db', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing('pilot_evidence_review_checks', 'verified_from_acceptance_pack', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing('pilot_evidence_review_checks', 'verified_from_schema_versions', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing('pilot_evidence_review_checks', 'runtime_truth_status', "VARCHAR(80) NOT NULL DEFAULT 'DEGRADED'");

    // 2. pilot_evidence_review_boards columns
    await addColumnIfMissing('pilot_evidence_review_boards', 'runtime_truth_status', "VARCHAR(80) NOT NULL DEFAULT 'DEGRADED'");

    // 3. pilot_evidence_go_no_go_decisions columns
    await addColumnIfMissing('pilot_evidence_go_no_go_decisions', 'runtime_truth_status', "VARCHAR(80) NOT NULL DEFAULT 'DEGRADED'");

    // 4. pilot_evidence_review_packs columns
    await addColumnIfMissing('pilot_evidence_review_packs', 'runtime_truth_status', "VARCHAR(80) NOT NULL DEFAULT 'DEGRADED'");
    await addColumnIfMissing('pilot_evidence_review_packs', 'persistence_status', 'VARCHAR(80) DEFAULT NULL');

    console.log('\n[PATCH] All compatible schema updates verified/applied successfully.');
    await db.closePool();
    process.exit(0);
  } catch (err) {
    console.error('\n[PATCH-ERROR] Schema patch failed:', err.message);
    await db.closePool();
    process.exit(1);
  }
}

run();
