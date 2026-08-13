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

async function runMigration140PreRemediation(connOrDb) {
  logger.info({ event: 'migration_remediation_140_start', message: 'Evaluating governed schema normalization pre-remediation for migration 140' });
  
  // Define metadata for the 13 legacy foreign keys to drop and recreate
  const fksToAudit = [
    { name: 'fk_machines_printer_node', childTable: 'printhouse_machines', childCols: ['printhouse_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'CASCADE', onDelete: 'CASCADE' },
    { name: 'fk_media_printer_node', childTable: 'printhouse_media', childCols: ['printhouse_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'CASCADE', onDelete: 'CASCADE' },
    { name: 'fk_policies_printer_node', childTable: 'printhouse_policy_profiles', childCols: ['printhouse_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'CASCADE', onDelete: 'CASCADE' },
    { name: 'fk_sla_printer_node', childTable: 'printhouse_sla_profiles', childCols: ['printhouse_id', 'tenant_id'], parentTable: 'printer_nodes', parentCols: ['id', 'tenant_id'], onUpdate: 'CASCADE', onDelete: 'CASCADE' },
    { name: 'job_outcomes_ibfk_1', childTable: 'job_outcomes', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printer_capacity_ibfk_1', childTable: 'printer_capacity', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printer_contacts_ibfk_1', childTable: 'printer_contacts', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printer_machines_ibfk_1', childTable: 'printer_machines', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printer_papers_ibfk_1', childTable: 'printer_papers', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printer_performance_ibfk_1', childTable: 'printer_performance', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printer_service_regions_ibfk_1', childTable: 'printer_service_regions', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'printhouse_capabilities_ibfk_1', childTable: 'printhouse_capabilities', childCols: ['printhouse_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
    { name: 'routing_history_ibfk_1', childTable: 'routing_history', childCols: ['printer_id'], parentTable: 'printer_nodes', parentCols: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' }
  ];

  // Target mappings for all 15 tables and 22 columns
  const allTargets = {
    printer_nodes: {
      id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printhouse_machines: {
      id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      printhouse_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printhouse_media: {
      printhouse_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printhouse_policy_profiles: {
      printhouse_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printhouse_sla_profiles: {
      printhouse_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    materials_catalog: {
      id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      tenant_id: { length: 64, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    job_outcomes: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printer_capacity: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printer_contacts: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printer_machines: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci', preserveWidthIfLarger: true }
    },
    printer_papers: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printer_performance: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printer_service_regions: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    printhouse_capabilities: {
      printhouse_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    },
    routing_history: {
      printer_id: { length: 50, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
    }
  };

  // 1. Audit tables that exist in the active schema
  const existingTables = new Set();
  const [tables] = await connOrDb.query(`
    SELECT TABLE_NAME 
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = DATABASE()
  `);
  for (const t of tables) {
    existingTables.add(t.TABLE_NAME);
  }

  // Filter FKs to drop/recreate based on tables that exist
  const activeFks = fksToAudit.filter(f => existingTables.has(f.childTable) && existingTables.has(f.parentTable));

  // Determine which FKs exist right now
  const existingFkNames = new Set();
  const [fksRows] = await connOrDb.query(`
    SELECT CONSTRAINT_NAME 
    FROM information_schema.REFERENTIAL_CONSTRAINTS 
    WHERE CONSTRAINT_SCHEMA = DATABASE()
  `);
  for (const r of fksRows) {
    existingFkNames.add(r.CONSTRAINT_NAME);
  }

  // Set FOREIGN_KEY_CHECKS = 0 strictly for the duration of drops and alters
  await connOrDb.query('SET FOREIGN_KEY_CHECKS = 0');
  
  try {
    // 2. Drop legacy FK constraints if they are present
    for (const fk of activeFks) {
      if (existingFkNames.has(fk.name)) {
        logger.info({ event: 'migration_remediation_140_drop_fk', constraintName: fk.name, table: fk.childTable, message: `Dropping foreign key constraint ${fk.name} on ${fk.childTable}` });
        await connOrDb.query(`ALTER TABLE ${fk.childTable} DROP FOREIGN KEY ${fk.name}`);
      }
    }

    // 3. Widen columns and convert charsets/collations
    for (const [table, columns] of Object.entries(allTargets)) {
      if (!existingTables.has(table)) continue;
      
      for (const [column, spec] of Object.entries(columns)) {
        const [cols] = await connOrDb.query(`
          SELECT CHARACTER_MAXIMUM_LENGTH, CHARACTER_SET_NAME, COLLATION_NAME, IS_NULLABLE
          FROM information_schema.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
        `, [table, column]);
        
        if (cols && cols[0]) {
          const current = cols[0];
          let targetLength = spec.length;
          if (spec.preserveWidthIfLarger && current.CHARACTER_MAXIMUM_LENGTH > targetLength) {
            targetLength = current.CHARACTER_MAXIMUM_LENGTH;
          }
          
          const needsLengthWiden = current.CHARACTER_MAXIMUM_LENGTH < targetLength;
          const needsCharsetConvert = current.CHARACTER_SET_NAME !== spec.charset || current.COLLATION_NAME !== spec.collation;
          
          if (needsLengthWiden || needsCharsetConvert) {
            const nullability = current.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
            logger.info({ 
              event: 'migration_remediation_140_exec', 
              table, 
              column, 
              message: `Normalizing ${table}.${column} to VARCHAR(${targetLength}) CHARACTER SET ${spec.charset} COLLATE ${spec.collation} ${nullability} (was VARCHAR(${current.CHARACTER_MAXIMUM_LENGTH}) ${current.CHARACTER_SET_NAME}/${current.COLLATION_NAME})`
            });
            
            await connOrDb.query(`
              ALTER TABLE ${table} 
              MODIFY COLUMN ${column} VARCHAR(${targetLength}) CHARACTER SET ${spec.charset} COLLATE ${spec.collation} ${nullability}
            `);
          }
        }
      }
    }
  } catch (err) {
    logger.error({ event: 'migration_remediation_140_error', message: `Failure during normalization alters: ${err.message}`, error: err });
    throw err;
  } finally {
    // 4. Recreate dropped foreign keys to ensure database integrity (recovery sequence)
    const recreationErrors = [];
    for (const fk of activeFks) {
      try {
        const [checkFk] = await connOrDb.query(`
          SELECT CONSTRAINT_NAME 
          FROM information_schema.REFERENTIAL_CONSTRAINTS 
          WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?
        `, [fk.name]);
        
        if (!checkFk || checkFk.length === 0) {
          logger.info({ event: 'migration_remediation_140_recreate_fk', constraintName: fk.name, table: fk.childTable, message: `Recreating foreign key constraint ${fk.name} on ${fk.childTable}` });
          
          const childColsCsv = fk.childCols.join(', ');
          const parentColsCsv = fk.parentCols.join(', ');
          
          await connOrDb.query(`
            ALTER TABLE ${fk.childTable} 
            ADD CONSTRAINT ${fk.name} 
            FOREIGN KEY (${childColsCsv}) 
            REFERENCES ${fk.parentTable}(${parentColsCsv}) 
            ON UPDATE ${fk.onUpdate} 
            ON DELETE ${fk.onDelete}
          `);
        }
      } catch (recErr) {
        logger.error({ event: 'migration_remediation_140_recreate_error', constraintName: fk.name, message: `Failed to recreate constraint ${fk.name}: ${recErr.message}`, error: recErr });
        recreationErrors.push(recErr);
      }
    }
    
    // Always restore FOREIGN_KEY_CHECKS = 1
    await connOrDb.query('SET FOREIGN_KEY_CHECKS = 1');
    
    if (recreationErrors.length > 0) {
      throw new Error(`Normalization pre-remediation failed during constraint recreation: ${recreationErrors.map(e => e.message).join('; ')}`);
    }
  }
  
  logger.info({ event: 'migration_remediation_140_success', message: 'Schema normalization pre-remediation completed' });
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

                    if (relPath === 'migrations/140_phase191e_materials_capacity_leadtimes.sql') {
                        await runMigration140PreRemediation(connection);
                    }

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
