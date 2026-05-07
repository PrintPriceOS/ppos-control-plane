/**
 * Control Plane Schema Service
 * 
 * Ensures all core operational tables exist in MySQL.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('schema-service');

class ControlPlaneSchemaService {
    async init() {
        const isProduction = process.env.NODE_ENV === 'production';
        let mutationEnabled = process.env.PPOS_ENABLE_SCHEMA_MUTATION === 'true';
        const forceOverride = process.env.PPOS_FORCE_SCHEMA_MUTATION === 'true';

        // Hardcoded Protection for Production (with override)
        if (isProduction && mutationEnabled && !forceOverride) {
            logger.warn({
                event: 'mutation_override',
                message: 'Schema mutation requested in PRODUCTION. Hard-lock engaged. Use PPOS_FORCE_SCHEMA_MUTATION=true to override.',
                metadata: { env: process.env.NODE_ENV }
            });
            mutationEnabled = false;
        }

        if (!mutationEnabled) {
            logger.info({
                event: 'skip_init',
                message: 'Schema mutation disabled or locked. Skipping initialization.'
            });
            return;
        }
        try {
            logger.info({ event: 'init_start', message: 'Initializing core tables...' });

            // 1. Tenants Table
            await db.query(`
                CREATE TABLE IF NOT EXISTS tenants (
                    id VARCHAR(64) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    status ENUM('ACTIVE', 'SUSPENDED', 'PENDING', 'DELETED') DEFAULT 'ACTIVE',
                    plan ENUM('FREE', 'PRO', 'ENTERPRISE', 'SYSTEM') DEFAULT 'FREE',
                    rate_limit_rpm INT DEFAULT 60,
                    daily_job_limit INT DEFAULT 100,
                    max_batch_size INT DEFAULT 50,
                    plan_expires_at TIMESTAMP NULL,
                    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    notification_settings_json JSON NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;
            `);

            // 2. API Keys Table
            await db.query(`
                CREATE TABLE IF NOT EXISTS api_keys (
                    id VARCHAR(64) PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    key_value VARCHAR(128) UNIQUE NOT NULL,
                    name VARCHAR(128) NULL,
                    revoked BOOLEAN DEFAULT FALSE,
                    last_used_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_tenant (tenant_id),
                    INDEX idx_key (key_value)
                ) ENGINE=InnoDB;
            `);

            // 3. Global Jobs Table (Orchestration Layer)
            await db.query(`
                CREATE TABLE IF NOT EXISTS jobs (
                    id VARCHAR(64) PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    printhouse_id VARCHAR(64) NULL,
                    type VARCHAR(64) NOT NULL,
                    status VARCHAR(32) DEFAULT 'QUEUED',
                    progress INT DEFAULT 0,
                    error JSON NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_tenant (tenant_id),
                    INDEX idx_printhouse (printhouse_id),
                    INDEX idx_status (status),
                    INDEX idx_created (created_at)
                ) ENGINE=InnoDB;
            `);

            // 4. Metrics Table (Telemetry)
            await db.query(`
                CREATE TABLE IF NOT EXISTS metrics (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    printhouse_id VARCHAR(64) NULL,
                    job_id VARCHAR(64) NULL,
                    policy_slug VARCHAR(64) NULL,
                    success BOOLEAN DEFAULT TRUE,
                    processing_ms INT DEFAULT 0,
                    value_generated DECIMAL(10, 2) DEFAULT 0.00,
                    hours_saved DECIMAL(10, 2) DEFAULT 0.00,
                    risk_score_before INT DEFAULT 0,
                    risk_score_after INT DEFAULT 0,
                    delta_score INT DEFAULT 0,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_tenant (tenant_id),
                    INDEX idx_printhouse (printhouse_id),
                    INDEX idx_created (created_at)
                ) ENGINE=InnoDB;
            `);

            // 5. Tenant Usage Stats (Aggregated)
            await db.query(`
                CREATE TABLE IF NOT EXISTS tenant_usage_stats (
                    tenant_id VARCHAR(64) NOT NULL,
                    date DATE NOT NULL,
                    jobs_count INT DEFAULT 0,
                    batches_count INT DEFAULT 0,
                    value_generated DECIMAL(10, 2) DEFAULT 0.00,
                    hours_saved DECIMAL(10, 2) DEFAULT 0.00,
                    risk_reduction INT DEFAULT 0,
                    PRIMARY KEY (tenant_id, date)
                ) ENGINE=InnoDB;
            `);

            // 6. Tenant Lifecycle History
            await db.query(`
                CREATE TABLE IF NOT EXISTS tenant_plan_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    old_plan VARCHAR(32),
                    new_plan VARCHAR(32),
                    reason TEXT,
                    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS tenant_alerts_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    alert_type VARCHAR(64) NOT NULL,
                    details_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;
            `);

            // 7. API Audit Log
            await db.query(`
                CREATE TABLE IF NOT EXISTS api_audit_log (
                    id VARCHAR(64) PRIMARY KEY,
                    request_id VARCHAR(64) NOT NULL,
                    tenant_id VARCHAR(64) NOT NULL,
                    deployment_id VARCHAR(64) NULL,
                    action VARCHAR(128) NOT NULL,
                    resource_type VARCHAR(64) NULL,
                    resource_id VARCHAR(64) NULL,
                    ip_address VARCHAR(45) NULL,
                    user_role VARCHAR(32) NULL,
                    governance_snapshot JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_request (request_id),
                    INDEX idx_tenant_action (tenant_id, action)
                ) ENGINE=InnoDB;
            `);

            // 8. Notifications System (Core)
            await db.query(`
                CREATE TABLE IF NOT EXISTS notifications (
                    id VARCHAR(64) PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    status ENUM('PENDING', 'SENT', 'FAILED', 'CANCELED') DEFAULT 'PENDING',
                    event_type VARCHAR(64) NOT NULL,
                    channel VARCHAR(32) DEFAULT 'WEB',
                    title VARCHAR(255) NOT NULL,
                    message TEXT NULL,
                    attempt_count INT DEFAULT 0,
                    last_error TEXT NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_tenant_status (tenant_id, status)
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS notification_events (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    notification_id VARCHAR(64) NOT NULL,
                    event VARCHAR(64) NOT NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_notification (notification_id)
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS tenant_notification_preferences (
                    tenant_id VARCHAR(64) PRIMARY KEY,
                    email_enabled BOOLEAN DEFAULT TRUE,
                    webhook_enabled BOOLEAN DEFAULT FALSE,
                    email_recipients_json JSON NULL,
                    webhook_url VARCHAR(512) NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;
            `);

            // 9. Intelligence & Engagement
            await db.query(`
                CREATE TABLE IF NOT EXISTS engagement_events (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    signal_type VARCHAR(64) NOT NULL,
                    severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'LOW',
                    message TEXT NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_tenant (tenant_id)
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS cs_workflows (
                    id VARCHAR(64) PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    workflow_type VARCHAR(64) NOT NULL,
                    status VARCHAR(32) DEFAULT 'ACTIVE',
                    current_step VARCHAR(64) NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_tenant (tenant_id)
                ) ENGINE=InnoDB;
            `);

            // 10. Autonomous Operations
            await db.query(`
                CREATE TABLE IF NOT EXISTS autonomous_job_pipelines (
                    id VARCHAR(64) PRIMARY KEY,
                    job_id VARCHAR(64) NOT NULL,
                    pipeline_status ENUM('RUNNING', 'PAUSED', 'COMPLETED', 'FAILED') DEFAULT 'RUNNING',
                    pipeline_state VARCHAR(64) DEFAULT 'INIT',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_job (job_id)
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS pipeline_events (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    pipeline_id VARCHAR(64) NOT NULL,
                    event_type VARCHAR(64) NOT NULL,
                    step_name VARCHAR(64) NOT NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_pipeline (pipeline_id)
                ) ENGINE=InnoDB;
            `);

            // 11. Financial Ledger
            await db.query(`
                CREATE TABLE IF NOT EXISTS financial_ledger_entries (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    transaction_id VARCHAR(128) NOT NULL,
                    type ENUM('CREDIT', 'DEBIT', 'ADJUSTMENT') NOT NULL,
                    amount DECIMAL(10, 2) NOT NULL,
                    currency VARCHAR(3) DEFAULT 'EUR',
                    description TEXT,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_tenant (tenant_id),
                    INDEX idx_transaction (transaction_id)
                ) ENGINE=InnoDB;
            `);

            // 12. Help & Analytics
            await db.query(`
                CREATE TABLE IF NOT EXISTS audit_help_analytics (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    event_type VARCHAR(64) NOT NULL,
                    article_id VARCHAR(64) NULL,
                    search_query VARCHAR(255) NULL,
                    tenant_id VARCHAR(64) NULL,
                    user_id VARCHAR(64) NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;
            `);

            // 13. Artifact Registry
            await db.query(`
                CREATE TABLE IF NOT EXISTS preflight_artifacts (
                    id VARCHAR(64) PRIMARY KEY,
                    job_id VARCHAR(64) NOT NULL,
                    tenant_id VARCHAR(64) NOT NULL,
                    artifact_type VARCHAR(64) NOT NULL,
                    filename VARCHAR(255) NOT NULL,
                    mime_type VARCHAR(64) NULL,
                    size_bytes BIGINT DEFAULT 0,
                    checksum_sha256 VARCHAR(64) NULL,
                    created_by_worker VARCHAR(64) NULL,
                    lineage_parent_id VARCHAR(64) NULL,
                    retention_class ENUM('HOT', 'WARM', 'COLD', 'PURGE') DEFAULT 'HOT',
                    storage_tier VARCHAR(32) DEFAULT 'STANDARD',
                    forensic_trace_id VARCHAR(64) NULL,
                    metadata_json JSON NULL,
                    deleted_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_job (job_id),
                    INDEX idx_tenant (tenant_id),
                    INDEX idx_trace (forensic_trace_id),
                    INDEX idx_checksum (checksum_sha256)
                ) ENGINE=InnoDB;
            `);

            // 14. Worker Cluster Registry
            await db.query(`
                CREATE TABLE IF NOT EXISTS worker_nodes (
                    id VARCHAR(64) PRIMARY KEY,
                    hostname VARCHAR(255) NOT NULL,
                    status ENUM('HEALTHY', 'DEGRADED', 'CRITICAL', 'OFFLINE') DEFAULT 'OFFLINE',
                    queue_bindings JSON NULL,
                    capabilities JSON NULL,
                    gs_version VARCHAR(32) NULL,
                    memory_profile_mb INT DEFAULT 0,
                    concurrency INT DEFAULT 1,
                    uptime_seconds BIGINT DEFAULT 0,
                    health_score INT DEFAULT 100,
                    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_status (status)
                ) ENGINE=InnoDB;
            `);

            // 15. Operational Incident Registry
            await db.query(`
                CREATE TABLE IF NOT EXISTS operational_incidents (
                    id VARCHAR(64) PRIMARY KEY,
                    tenant_id VARCHAR(64) NULL,
                    scope VARCHAR(64) NOT NULL,
                    severity ENUM('INFO', 'WARNING', 'CRITICAL', 'DEGRADED') DEFAULT 'INFO',
                    event_type VARCHAR(128) NOT NULL,
                    details_json JSON NULL,
                    status ENUM('OPEN', 'INVESTIGATING', 'RESOLVED', 'REMEDIATED') DEFAULT 'OPEN',
                    remediated_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_tenant (tenant_id),
                    INDEX idx_scope_status (scope, status),
                    INDEX idx_created (created_at)
                ) ENGINE=InnoDB;
            `);

            // 16. Industrial Lifecycle Policies
            await db.query(`
                CREATE TABLE IF NOT EXISTS lifecycle_policies (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(128) NOT NULL,
                    tenant_id VARCHAR(64) NULL,
                    artifact_type VARCHAR(64) DEFAULT '*',
                    hot_tier_days INT DEFAULT 7,
                    warm_tier_days INT DEFAULT 30,
                    cold_tier_days INT DEFAULT 90,
                    retention_policy ENUM('STANDARD', 'AGGRESSIVE', 'LEGAL_HOLD') DEFAULT 'STANDARD',
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_tenant_type (tenant_id, artifact_type)
                ) ENGINE=InnoDB;
            `);

            // 17. Control Users Table (Auth v1)
            await db.query(`
                CREATE TABLE IF NOT EXISTS control_users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    role ENUM('SUPER_ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR', 'VIEWER') DEFAULT 'VIEWER',
                    tenant_id VARCHAR(64) NOT NULL DEFAULT 'ppos-production',
                    printhouse_id VARCHAR(64) NULL,
                    status ENUM('ACTIVE', 'SUSPENDED', 'DELETED') DEFAULT 'ACTIVE',
                    last_login_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_email (email),
                    INDEX idx_tenant (tenant_id),
                    INDEX idx_printhouse (printhouse_id)
                ) ENGINE=InnoDB;
            `);

            // --- SCHEMA MIGRATIONS (PHASE 10 HARDENING) ---
            // Ensure columns exist for existing tables
            await this.ensureColumn('tenants', 'service_tier', "VARCHAR(50) NULL DEFAULT 'standard'");
            await this.ensureColumn('tenants', 'isolation_mode', "VARCHAR(50) NULL DEFAULT 'shared'");

            await this.ensureColumn('jobs', 'deployment_id', 'VARCHAR(64) NULL AFTER tenant_id');
            await this.ensureColumn('jobs', 'asset_id', 'VARCHAR(64) NULL AFTER deployment_id');
            await this.ensureColumn('jobs', 'printhouse_id', 'VARCHAR(64) NULL AFTER tenant_id');
            await this.ensureColumn('jobs', 'job_type', 'VARCHAR(50) NULL AFTER type');

            await this.ensureIndex('jobs', 'idx_deployment', 'deployment_id');
            await this.ensureIndex('jobs', 'idx_asset', 'asset_id');
            await this.ensureIndex('jobs', 'idx_printhouse', 'printhouse_id');
            await this.ensureIndex('jobs', 'idx_job_type', 'job_type');

            await this.ensureColumn('control_users', 'printhouse_id', 'VARCHAR(64) NULL AFTER tenant_id');
            await this.ensureColumn('metrics', 'printhouse_id', 'VARCHAR(64) NULL AFTER tenant_id');
            await this.ensureColumn('metrics', 'policy_slug', 'VARCHAR(64) NULL AFTER job_id');

            await this.ensureIndex('control_users', 'idx_printhouse', 'printhouse_id');
            await this.ensureIndex('metrics', 'idx_printhouse', 'printhouse_id');

            console.log('[CONTROL-PLANE-SCHEMA] Industrial Tables verified.');
        } catch (err) {
            console.error('[CONTROL-PLANE-SCHEMA] Initialization failed:', err.message);
        }
    }

    /**
     * Idempotent Column Addition
     */
    async ensureColumn(table, column, definition) {
        try {
            const result = await db.query(`
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = ?
                AND COLUMN_NAME = ?
            `, [table, column]);

            const rows = Array.isArray(result[0]) ? result[0] : result;

            if (!rows.length) {
                logger.info({ event: 'schema_migration', message: `Adding column ${column} to ${table}` });
                await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
                console.log(`[SCHEMA] Added column ${column} to ${table}`);
            } else {
                logger.debug({ event: 'schema_skip', message: `Column ${column} already exists in ${table}` });
            }
        } catch (err) {
            logger.error({ event: 'schema_error', message: `Failed to ensure column ${column} in ${table}`, error: err.message });
        }
    }

    /**
     * Idempotent Index Creation
     */
    async ensureIndex(table, indexName, columns) {
        try {
            const result = await db.query(`
                SELECT INDEX_NAME
                FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = ?
                AND INDEX_NAME = ?
            `, [table, indexName]);

            const rows = Array.isArray(result[0]) ? result[0] : result;

            if (!rows.length) {
                logger.info({ event: 'schema_migration', message: `Creating index ${indexName} on ${table}(${columns})` });
                await db.query(`CREATE INDEX ${indexName} ON ${table}(${columns})`);
                console.log(`[SCHEMA] Created index ${indexName} on ${table}`);
            } else {
                logger.debug({ event: 'schema_skip', message: `Index ${indexName} already exists on ${table}` });
            }
        } catch (err) {
            logger.error({ event: 'schema_error', message: `Failed to ensure index ${indexName} on ${table}`, error: err.message });
        }
    }
}

const service = new ControlPlaneSchemaService();
service.init().catch(err => console.error('[CONTROL-PLANE-SCHEMA] Critical init error:', err));

module.exports = service;
