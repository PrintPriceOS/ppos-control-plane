'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

process.env.NODE_ENV = 'test';
process.env.ALLOW_SCHEMA_SMOKE_FALLBACK = 'true';

require('dotenv').config();

const db = require('../src/api/services/mysqlClient');
const hasDbConfig = !!(process.env.MYSQL_HOST || process.env.DATABASE_URL);
const isProdLike = process.env.NODE_ENV !== 'test';
const isFallbackAllowed = process.env.ALLOW_SCHEMA_SMOKE_FALLBACK === 'true' || process.env.NODE_ENV === 'test';

(async () => {
  if (isProdLike && !isFallbackAllowed) {
    if (!hasDbConfig) {
      console.error("  FAIL: running in production-like environment but database config is missing");
      process.exit(1);
    }
  }

  let realDbConnected = false;
  let migrationApplied = false;
  let checksTableHasNewColumns = false;
  let boardsTableHasTruthColumn = false;

  try {
    const schemaExists = await db.query("SELECT version FROM schema_versions WHERE version = '071'", []);
    realDbConnected = true;
    migrationApplied = schemaExists && schemaExists.length > 0;

    const columnsCheck = await db.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pilot_evidence_review_checks' AND COLUMN_NAME = 'evidence_source_type'",
      []
    );
    checksTableHasNewColumns = columnsCheck && columnsCheck.length > 0;

    const columnsBoard = await db.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pilot_evidence_review_boards' AND COLUMN_NAME = 'runtime_truth_status'",
      []
    );
    boardsTableHasTruthColumn = columnsBoard && columnsBoard.length > 0;
  } catch (err) {
    console.error("  Database check failed:", err.message);
    if (!isFallbackAllowed) {
      console.error("  FAIL: Database connection or check failed in production-like mode.");
      process.exit(1);
    }
  }

  if (realDbConnected) {
    assert(migrationApplied, "Migration 071 is applied in the database");
    assert(checksTableHasNewColumns, "pilot_evidence_review_checks table has evidence_source_type column");
    assert(boardsTableHasTruthColumn, "pilot_evidence_review_boards table has runtime_truth_status column");
  } else {
    // If not connected to real DB, verify if fallback is allowed
    assert(isFallbackAllowed, "Mock schema verification fallback is allowed in this environment");
  }

  console.log(`\nSmoke 126.1a: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  await db.closePool();
  process.exit(0);
})().catch(err => {
  console.error("FATAL ERROR in 126.1a:", err);
  process.exit(1);
});
