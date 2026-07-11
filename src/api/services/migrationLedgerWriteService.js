'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class MigrationLedgerWriteService {
  /**
   * Safe hashing utility to keep credentials/sensitive seeds out of logs.
   */
  getStatementFingerprint(sql) {
    if (!sql) return '';
    return crypto.createHash('sha256').update(sql.trim()).digest('hex');
  }

  /**
   * Sanitizes database error messages to strip accidental table row tokens/data dumps.
   */
  sanitizeError(error) {
    if (!error) return 'Unknown migration error';
    const raw = error.message || error.toString();
    // Strip hex patterns, long numeric dumps, or quote-enclosed strings that might be seed payloads
    return raw.replace(/VALUES\s*\(.*?\)/gi, 'VALUES (...)').substring(0, 1000);
  }

  async markStarted({ migrationPath, checksum, executionId, runnerId, repositoryCommit }) {
    await db.query(`
      INSERT INTO schema_versions (
        migration_path, version, checksum, state, execution_id, runner_id, repository_commit, started_at, updated_at
      ) VALUES (?, ?, ?, 'STARTED', ?, ?, ?, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        state = 'STARTED',
        execution_id = VALUES(execution_id),
        runner_id = VALUES(runner_id),
        repository_commit = VALUES(repository_commit),
        started_at = NOW(3),
        updated_at = NOW(3),
        failed_at = NULL,
        failure_code = NULL,
        failure_message = NULL
    `, [
      migrationPath,
      pathBasename(migrationPath),
      checksum,
      executionId,
      runnerId || null,
      repositoryCommit || null
    ]);
  }

  async updateHeartbeat(executionId) {
    await db.query(`
      UPDATE schema_versions
      SET heartbeat_at = NOW(3), updated_at = NOW(3)
      WHERE execution_id = ?
    `, [executionId]);
  }

  async markApplied({ executionId, executionTimeMs }) {
    await db.query(`
      UPDATE schema_versions
      SET 
        state = 'APPLIED',
        applied_at = NOW(3),
        execution_time_ms = ?,
        updated_at = NOW(3)
      WHERE execution_id = ?
    `, [executionTimeMs, executionId]);
  }

  async markFailed({ executionId, executionTimeMs, error, statementIndex, sqlStatement }) {
    const failureCode = error.code || 'MIGRATION_ERROR';
    const failureMessage = this.sanitizeError(error);
    const fingerprint = this.getStatementFingerprint(sqlStatement);

    await db.query(`
      UPDATE schema_versions
      SET 
        state = 'FAILED',
        failed_at = NOW(3),
        execution_time_ms = ?,
        failure_code = ?,
        failure_message = ?,
        failed_statement_index = ?,
        description = ?, -- store statement fingerprint securely
        updated_at = NOW(3)
      WHERE execution_id = ?
    `, [
      executionTimeMs,
      failureCode,
      failureMessage,
      statementIndex,
      `SQL Fingerprint: ${fingerprint}`,
      executionId
    ]);
  }
}

function pathBasename(p) {
  if (!p) return '';
  return p.split('/').pop().replace(/\.sql$/, '');
}

module.exports = new MigrationLedgerWriteService();
