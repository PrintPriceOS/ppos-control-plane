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

        // 2. Acquire database advisory lock
        const [lockResult] = await db.query('SELECT GET_LOCK(?, ?) as is_locked', [lockName, lockTimeout]);
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
            const applied = await db.query('SELECT version, description, checksum FROM schema_versions');
            const appliedMap = new Map();
            for (const m of applied) {
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
                const statements = content.split(';').map(s => s.trim()).filter(s => s.length > 0);

                // Mark execution as STARTED in ledger
                await ledgerWrite.markStarted({
                    migrationPath: relPath,
                    checksum: canonicalHash,
                    executionId,
                    runnerId,
                    repositoryCommit: process.env.DEPLOY_COMMIT || null
                });

                const startTime = Date.now();
                let lastSql = '';

                try {
                    for (let index = 0; index < statements.length; index++) {
                        lastSql = statements[index];
                        await ledgerWrite.updateHeartbeat(executionId);
                        
                        // Execute statement
                        try {
                            await db.query(lastSql);
                        } catch (err) {
                            // Idempotency: skip duplicates or table exists
                            const ignoreCodes = ['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_INDEX'];
                            if (ignoreCodes.includes(err.code) || err.errno === 1060 || err.errno === 1061 || err.errno === 1050) {
                                continue;
                            }
                            throw err;
                        }
                    }

                    // Success: mark as APPLIED
                    await ledgerWrite.markApplied({
                        executionId,
                        executionTimeMs: Date.now() - startTime
                    });
                    appliedCount++;

                } catch (err) {
                    // Failure: mark as FAILED with audit-safe metrics
                    await ledgerWrite.markFailed({
                        executionId,
                        executionTimeMs: Date.now() - startTime,
                        error: err,
                        statementIndex: statements.indexOf(lastSql),
                        sqlStatement: lastSql
                    });
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
            await db.query('SELECT RELEASE_LOCK(?)', [lockName]);
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
