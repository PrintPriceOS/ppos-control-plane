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
                version VARCHAR(50) NOT NULL UNIQUE,
                description TEXT,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                checksum VARCHAR(64) NOT NULL
            )
        `);
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

        const applied = await db.query('SELECT version, checksum FROM schema_versions');
        const appliedMap = new Map(applied.map(m => [m.version, m.checksum]));

        let appliedCount = 0;

        for (const file of files) {
            const version = file.split('_')[0];
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
                await db.query(sql);
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
