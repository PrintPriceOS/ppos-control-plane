'use strict';

/**
 * src/api/services/migrationService.js
 * 
 * Industrial Migration Engine for PPOS Control Plane (Phase 185).
 * Governs schema versions using a secure state machine, checksum checks, and concurrency locks.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const logger = require('./logger').child('migration-service');
const { 
  discoverMigrations, 
  calculateFileChecksum, 
  verifyMigrationBaseline 
} = require('../../../scripts/lib/migrationIntegrity');

const ledgerRead = require('./migrationLedgerReadService');
const ledgerWrite = require('./migrationLedgerWriteService');
const { parseMigrationSql } = require('./migrationSqlParser');

async function ensurePreviousFailuresColumn(connOrDb) {
  try {
    const tableCheck = await connOrDb.query(`
      SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_versions'
    `);
    if (!tableCheck || tableCheck.length === 0) return;

    await connOrDb.query('ALTER TABLE schema_versions ADD COLUMN previous_failures JSON NULL');
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME' && err.errno !== 1060) {
      throw err;
    }
  }
}

class MigrationService {
    constructor() {
        this.migrationsPath = path.join(__dirname, '../../../migrations');
        this.baselinePath = path.join(this.migrationsPath, 'migration-integrity-baseline.json');
    }

    /**
     * Run all pending migrations with concurrency locking and preflight safety checks.
     */
    async runMigrations() {
        if (process.env.PPOS_MIGRATION_EXECUTION !== 'true') {
            throw new Error('DDL_EXECUTION_FORBIDDEN_OUTSIDE_MIGRATION_CONTEXT');
        }

        logger.info({ event: 'migration_start', message: 'Starting database migration sequence (Phase 185)' });

        // 1. Preflight local repository check (Verify Phase 183 baseline)
        const integrity = verifyMigrationBaseline(this.migrationsPath, this.baselinePath);
        if (!integrity.ok) {
            const msg = `Local migration integrity compromised: ${integrity.error}`;
            logger.error({ event: 'migration_preflight_failed', reason: integrity.error });
            throw new Error(msg);
        }

        const lockName = 'ppos-control-plane:migrations';
        const lockTimeout = 10; // seconds

        // 2. Acquire a dedicated connection from pool for advisory locking
        const connection = await db.getPool().getConnection();

        try {
            const [lockRows] = await connection.query('SELECT GET_LOCK(?, ?) as is_locked', [lockName, lockTimeout]);
            const lockResult = lockRows ? lockRows[0] : null;
            if (!lockResult || lockResult.is_locked !== 1) {
                const lockMsg = 'Could not acquire database migration lock. Another runner might be active.';
                logger.error({ event: 'migration_lock_failed', lockName });
                throw new Error(lockMsg);
            }


            try {
                // Load local migrations to match against database
                const { migrations } = discoverMigrations(this.migrationsPath);
                const baselineData = JSON.parse(fs.readFileSync(this.baselinePath, 'utf8'));

                // 3. Preflight database ledger check
                const ledgerStatus = await ledgerRead.evaluateLedgerStatus(baselineData);

                if (ledgerStatus.status === 'DATABASE_UNREACHABLE') {
                    throw new Error(`Database connection failed: ${ledgerStatus.reason}`);
                }

                if (
                  ledgerStatus.status === 'MIGRATION_FAILED' ||
                  ledgerStatus.status === 'MIGRATION_CHECKSUM_MISMATCH' ||
                  ledgerStatus.status === 'MIGRATION_LEDGER_INCOMPATIBLE' ||
                  ledgerStatus.status === 'MIGRATION_IN_PROGRESS'
                ) {
                    const blockMsg = `Migration blocked due to incompatible/corrupted database state: ${ledgerStatus.reason}`;
                    logger.error({ event: 'migration_preflight_failed', status: ledgerStatus.status, reason: ledgerStatus.reason });
                    throw new Error(blockMsg);
                }

                // If we are ready and no migrations are pending, we are done
                if (ledgerStatus.status === 'READY' && !ledgerStatus.legacy) {
                    logger.info({ event: 'migration_complete', message: 'Database schema is already up to date.' });
                    return { appliedCount: 0, total: migrations.length };
                }

                // 4. Determine pending migrations
                // To be backward compatible, we look up legacy table records as well.
                await ensurePreviousFailuresColumn(connection);

                const applied = await connection.query('SELECT version, description, checksum, state FROM schema_versions');
                const appliedMap = new Map();
                for (const m of applied[0]) {
                    if (m.state === 'FAILED' || m.state === 'STARTED') {
                        continue;
                    }
                    const legacyPath = `migrations/${m.version}.sql`;
                    appliedMap.set(legacyPath, m.checksum);
                    if (m.description) {
                        appliedMap.set(`migrations/${m.description}`, m.checksum);
                    }
                }

                let appliedCount = 0;
                const runnerId = `runner-${process.pid}-${require('os').hostname()}`;

                for (const m of migrations) {
                    const relPath = m.relativePath.replace(/\\/g, '/');

                    if (appliedMap.has(relPath)) {
                        continue; // Already applied
                    }

                    const canonicalHash = calculateFileChecksum(m.absolutePath);
                    const content = fs.readFileSync(m.absolutePath, 'utf8');

                    logger.info({ event: 'migration_applying', file: m.filename, path: relPath });

                    const executionId = uuidv4();
                    const parsed = parseMigrationSql(content);
                    const statements = parsed.statements;

                    // Audit check: load current record if it exists to preserve failure evidence
                    let previousFailures = '[]';
                    const [existingRows] = await connection.query(`
                      SELECT execution_id, runner_id, started_at, failed_at, failure_code, failure_message, failed_statement_index, previous_failures
                      FROM schema_versions
                      WHERE migration_path = ?
                    `, [relPath]);

                    if (existingRows && existingRows.length > 0) {
                        const existing = existingRows[0];
                        let history = [];
                        if (existing.previous_failures) {
                            try {
                                history = typeof existing.previous_failures === 'string'
                                    ? JSON.parse(existing.previous_failures)
                                    : existing.previous_failures;
                            } catch (e) {
                                history = [];
                            }
                        }
                        if (existing.execution_id) {
                            history.push({
                                execution_id: existing.execution_id,
                                runner_id: existing.runner_id,
                                started_at: existing.started_at,
                                failed_at: existing.failed_at,
                                failure_code: existing.failure_code,
                                failure_message: existing.failure_message,
                                failed_statement_index: existing.failed_statement_index
                            });
                        }
                        previousFailures = JSON.stringify(history);
                    }

                    // Mark execution as STARTED in ledger (via connection)
                    await connection.query(`
                      INSERT INTO schema_versions (
                        migration_path, version, checksum, state, execution_id, runner_id, repository_commit, started_at, previous_failures
                      ) VALUES (?, ?, ?, 'STARTED', ?, ?, ?, NOW(3), ?)
                      ON DUPLICATE KEY UPDATE
                        state = 'STARTED',
                        execution_id = VALUES(execution_id),
                        runner_id = VALUES(runner_id),
                        repository_commit = VALUES(repository_commit),
                        started_at = NOW(3),
                        failed_at = NULL,
                        failure_code = NULL,
                        failure_message = NULL,
                        previous_failures = VALUES(previous_failures)
                    `, [
                      relPath,
                      m.filename.replace(/\.sql$/, ''),
                      canonicalHash,
                      executionId,
                      runnerId,
                      process.env.DEPLOY_COMMIT || null,
                      previousFailures
                    ]);

                    const startTime = Date.now();
                    let lastSql = '';
                    let lastIndex = 0;

                    try {
                        for (let i = 0; i < statements.length; i++) {
                            const stmt = statements[i];
                            lastSql = stmt.sql;
                            lastIndex = stmt.index;
                            await connection.query(`
                              UPDATE schema_versions
                              SET heartbeat_at = NOW(3)
                              WHERE execution_id = ?
                            `, [executionId]);
                            
                            // Execute statement
                            try {
                                await connection.query(lastSql);
                            } catch (err) {
                                // Idempotency: skip duplicates, table exists, or trigger exists
                                const ignoreCodes = ['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_INDEX', 'ER_TRG_ALREADY_EXISTS'];
                                if (ignoreCodes.includes(err.code) || err.errno === 1060 || err.errno === 1061 || err.errno === 1050 || err.errno === 1359) {
                                    continue;
                                }
                                throw err;
                            }
                        }

                        // Success: mark as APPLIED
                        await connection.query(`
                          UPDATE schema_versions
                          SET 
                            state = 'APPLIED',
                            applied_at = NOW(3),
                            execution_time_ms = ?
                          WHERE execution_id = ?
                        `, [Date.now() - startTime, executionId]);
                        
                        appliedCount++;

                    } catch (err) {
                        // Failure: mark as FAILED with audit-safe metrics
                        const failureCode = err.code || 'MIGRATION_ERROR';
                        const failureMessage = ledgerWrite.sanitizeError(err);
                        const fingerprint = statements[lastIndex - 1] ? statements[lastIndex - 1].fingerprint : ledgerWrite.getStatementFingerprint(lastSql);

                        await connection.query(`
                          UPDATE schema_versions
                          SET 
                            state = 'FAILED',
                            failed_at = NOW(3),
                            execution_time_ms = ?,
                            failure_code = ?,
                            failure_message = ?,
                            failed_statement_index = ?,
                            description = ?
                          WHERE execution_id = ?
                        `, [
                          Date.now() - startTime,
                          failureCode,
                          failureMessage,
                          lastIndex,
                          `SQL Fingerprint: ${fingerprint}`,
                          executionId
                        ]);
                        throw err;
                    }
                }

                logger.info({ 
                    event: 'migration_complete', 
                    message: `Migration sequence finished successfully. Applied ${appliedCount} new migrations.`
                });

                return { appliedCount, total: migrations.length };

            } finally {
                // 5. Always release database advisory lock
                await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
            }
        } finally {
            // Release connection back to pool
            connection.release();
        }
    }


    /**
     * Fail-fast schema validation.
     */
    async validateSchema() {
        try {
            const [rows] = await db.query('SELECT COUNT(*) as count FROM schema_versions');
            if (!rows || rows.count === 0) {
                throw new Error('Schema version tracking missing or empty.');
            }
            return true;
        } catch (err) {
            logger.warn({ event: 'schema_validation_failed', message: err.message });
            return false;
        }
    }
}

const migrationService = new MigrationService();

module.exports = {
    MigrationService,
    migrationService
};
