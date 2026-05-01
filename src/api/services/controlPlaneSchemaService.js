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

        // Hardcoded Protection for Production
        if (isProduction && mutationEnabled) {
            logger.warn({
                event: 'mutation_override',
                message: 'Schema mutation requested in PRODUCTION. Hard-lock engaged. Mutation DISABLED.',
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
                    type VARCHAR(64) NOT NULL,
                    status VARCHAR(32) DEFAULT 'QUEUED',
                    progress INT DEFAULT 0,
                    error JSON NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_tenant (tenant_id),
                    INDEX idx_status (status),
                    INDEX idx_created (created_at)
                ) ENGINE=InnoDB;
            `);

            // 4. Metrics Table (Telemetry)
            await db.query(`
                CREATE TABLE IF NOT EXISTS metrics (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    job_id VARCHAR(64) NULL,
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

            // 10. Autonomous Operations (Migration from autonomyAdmin.js)
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

            console.log('[CONTROL-PLANE-SCHEMA] Tables verified.');
        } catch (err) {
            console.error('[CONTROL-PLANE-SCHEMA] Initialization failed:', err.message);
        }
    }
}

const service = new ControlPlaneSchemaService();
service.init().catch(err => console.error('[CONTROL-PLANE-SCHEMA] Critical init error:', err));

module.exports = service;
