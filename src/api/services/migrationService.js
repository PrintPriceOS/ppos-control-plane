/**
 * src/api/services/migrationService.js
 * 
 * Industrial Migration Engine for PPOS Control Plane.
 * Manages schema lifecycle with version tracking and checksums.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./mysqlClient');
const logger = require('./logger').child('migration-service');

class MigrationService {
    constructor() {
        this.migrationsPath = path.join(__dirname, '../../../migrations');
    }

    /**
     * Compute SHA-256 checksum for a migration file.
     */
    getChecksum(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Initialize migration table.
     */
    async ensureMigrationTable() {
        await db.query(`
            CREATE TABLE IF NOT EXISTS schema_versions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                version VARCHAR(255) NOT NULL UNIQUE,
                description TEXT,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                checksum VARCHAR(64) NOT NULL
            )
        `);
        try {
            await db.query("ALTER TABLE schema_versions MODIFY COLUMN version VARCHAR(255) NOT NULL");
        } catch (err) {
            logger.warn({ event: 'migration_alter_failed', message: err.message });
        }
    }

    /**
     * Run all pending migrations.
     */
    async runMigrations() {
        logger.info({ event: 'migration_start', message: 'Starting database migration sequence' });
        
        await this.ensureMigrationTable();

        const files = fs.readdirSync(this.migrationsPath)
            .filter(f => f.endsWith('.sql'))
            .sort();

        const applied = await db.query('SELECT version, description, checksum FROM schema_versions');
        const appliedMap = new Map();
        
        for (const m of applied) {
            appliedMap.set(m.version, m.checksum);
            if (m.description) {
                const descVersion = m.description.replace(/\.sql$/, '');
                appliedMap.set(descVersion, m.checksum);
            }
        }

        let appliedCount = 0;

        for (const file of files) {
            const version = file.replace(/\.sql$/, '');
            const content = fs.readFileSync(path.join(this.migrationsPath, file), 'utf8');
            const checksum = this.getChecksum(content);

            if (appliedMap.has(version)) {
                // Verify integrity
                if (appliedMap.get(version) !== checksum) {
                    const msg = `CHECKSUM MISMATCH for migration ${file}. Database integrity compromised.`;
                    logger.error({ event: 'migration_integrity_failure', version, file, message: msg });
                    throw new Error(msg);
                }
                continue;
            }

            // Apply Migration
            logger.info({ event: 'migration_applying', file, version });
            
            // Note: We split by ; and filter empty lines for basic multi-statement support
            const statements = content.split(';').map(s => s.trim()).filter(s => s.length > 0);
            
            for (const sql of statements) {
                try {
                    await db.query(sql);
                } catch (err) {
                    // Industrial: Ignore "Duplicate column/key" or "Table exists" errors for idempotency
                    const ignoreCodes = ['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_INDEX'];
                    if (ignoreCodes.includes(err.code) || err.errno === 1060 || err.errno === 1061 || err.errno === 1050) {
                        logger.debug({ event: 'migration_step_skipped', sql: sql.substring(0, 50) + '...', reason: err.code });
                        continue;
                    }
                    throw err;
                }
            }

            await db.query(
                'INSERT INTO schema_versions (version, description, checksum) VALUES (?, ?, ?)',
                [version, file, checksum]
            );

            appliedCount++;
        }

        logger.info({ 
            event: 'migration_complete', 
            message: `Migration sequence finished. Applied ${appliedCount} new migrations.`,
            total: files.length
        });

        return { appliedCount, total: files.length };
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

module.exports = new MigrationService();
