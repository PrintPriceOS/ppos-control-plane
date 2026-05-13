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
                    storage_key VARCHAR(512) NULL,
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

            // 18. Predictive Material Inventory (Phase 34 Canonical Materials & Paper Catalog)
            await db.query(`
                CREATE TABLE IF NOT EXISTS materials_catalog (
                    id VARCHAR(64) PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL DEFAULT 'ppos-production',
                    printhouse_id VARCHAR(64) NULL,
                    material_name VARCHAR(128) NOT NULL,
                    material_type VARCHAR(64) NOT NULL,
                    substrate_class VARCHAR(64) NULL,
                    gsm INT NULL,
                    sheet_format VARCHAR(64) NULL,
                    finish_type VARCHAR(64) NULL,
                    supplier_name VARCHAR(128) NULL,
                    supplier_country VARCHAR(64) NULL,
                    cost_per_unit DECIMAL(10,4) DEFAULT 0.0000,
                    unit_name VARCHAR(32) DEFAULT 'sheets',
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_tenant (tenant_id),
                    INDEX idx_printhouse (printhouse_id)
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS predictive_material_inventory (
                    id VARCHAR(64) PRIMARY KEY,
                    node_id VARCHAR(64) NOT NULL,
                    material_catalog_id VARCHAR(64) NULL,
                    material_name VARCHAR(128) NOT NULL,
                    material_type VARCHAR(64) NOT NULL,
                    paper_gsm INT NULL,
                    finish VARCHAR(64) NULL,
                    current_stock_units INT DEFAULT 0,
                    reserved_stock_units INT DEFAULT 0,
                    available_units INT DEFAULT 0,
                    reorder_point INT DEFAULT 100,
                    replenishment_lead_days INT DEFAULT 7,
                    shortage_risk VARCHAR(32) DEFAULT 'NONE',
                    depletion_forecast_days INT DEFAULT 30,
                    operational_status VARCHAR(32) DEFAULT 'AVAILABLE',
                    status VARCHAR(32) DEFAULT 'STABLE',
                    machine_lock VARCHAR(64) NULL,
                    tenant_id VARCHAR(64) NOT NULL DEFAULT 'ppos-production',
                    printhouse_id VARCHAR(64) NULL,
                    daily_burn_rate DECIMAL(10,2) DEFAULT 0.00,
                    forecasted_depletion_date TIMESTAMP NULL,
                    procurement_risk VARCHAR(32) DEFAULT 'LOW',
                    supplier_name VARCHAR(128) NULL,
                    cost_per_unit DECIMAL(10,4) DEFAULT 0.0000,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_node (node_id)
                ) ENGINE=InnoDB;
            `);

            // Apply backward-compatible schema modifications gracefully for existing deployed columns
            const pmiCols = [
                "ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS material_catalog_id VARCHAR(64) NULL",
                "ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS available_units INT DEFAULT 0",
                "ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS reorder_point INT DEFAULT 100",
                "ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS replenishment_lead_days INT DEFAULT 7",
                "ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'STABLE'",
                "ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS machine_lock VARCHAR(64) NULL",
                "ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) NOT NULL DEFAULT 'ppos-production'",
                "ALTER TABLE predictive_material_inventory ADD COLUMN IF NOT EXISTS printhouse_id VARCHAR(64) NULL"
            ];
            for (const sql of pmiCols) {
                await db.query(sql).catch(() => {});
            }

            await db.query(`
                CREATE TABLE IF NOT EXISTS material_machine_compatibility (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    material_id VARCHAR(64) NOT NULL,
                    machine_profile_id VARCHAR(64) NOT NULL,
                    compatibility_status ENUM('OPTIMAL', 'CERTIFIED', 'SUPPORTED', 'EXPERIMENTAL', 'UNSUPPORTED') DEFAULT 'OPTIMAL',
                    wear_factor DECIMAL(3,2) DEFAULT 1.00,
                    max_speed_ppm INT NULL,
                    notes TEXT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_mat_machine (material_id, machine_profile_id),
                    INDEX idx_material (material_id),
                    INDEX idx_machine (machine_profile_id)
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS material_inventory_events (
                    id VARCHAR(64) PRIMARY KEY,
                    material_inventory_id VARCHAR(64) NOT NULL,
                    event_type VARCHAR(32) NOT NULL,
                    quantity_units INT NOT NULL,
                    before_stock INT NOT NULL,
                    after_stock INT NOT NULL,
                    job_id VARCHAR(64) NULL,
                    dispatch_id VARCHAR(64) NULL,
                    operator_id VARCHAR(64) NULL,
                    reason TEXT NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_inventory (material_inventory_id),
                    INDEX idx_event_type (event_type),
                    INDEX idx_created (created_at)
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS manufacturing_material_reservations (
                    id VARCHAR(64) PRIMARY KEY,
                    material_inventory_id VARCHAR(64) NOT NULL,
                    job_id VARCHAR(64) NULL,
                    dispatch_id VARCHAR(64) NULL,
                    reserved_units INT NOT NULL,
                    reservation_status VARCHAR(32) DEFAULT 'ACTIVE',
                    expires_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_inventory (material_inventory_id),
                    INDEX idx_dispatch (dispatch_id)
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS material_procurements (
                    id VARCHAR(64) PRIMARY KEY,
                    material_inventory_id VARCHAR(64) NOT NULL,
                    supplier_name VARCHAR(128) NULL,
                    ordered_units INT NOT NULL,
                    expected_delivery_date TIMESTAMP NULL,
                    procurement_status VARCHAR(32) DEFAULT 'ORDERED',
                    procurement_risk VARCHAR(32) DEFAULT 'LOW',
                    notes TEXT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_inventory (material_inventory_id)
                ) ENGINE=InnoDB;
            `);

            // Seed initial materials if empty to guarantee robust inventory demonstration without hardcoded UI mocks
            try {
                const [matRows] = await db.query("SELECT COUNT(*) as cnt FROM predictive_material_inventory");
                const cnt = Array.isArray(matRows) ? (matRows[0]?.cnt || 0) : (matRows?.cnt || 0);
                if (cnt === 0) {
                    logger.info({ event: 'seed_materials', message: 'Seeding baseline predictive materials catalog...' });
                    const seedNodes = await db.query("SELECT id FROM print_nodes LIMIT 3");
                    const nodes = Array.isArray(seedNodes[0]) ? seedNodes[0] : (Array.isArray(seedNodes) ? seedNodes : []);
                    const defaultNodeId = nodes.length > 0 ? (nodes[0].id || 'node-default') : 'node-alpha-1';
                    
                    const baselineMaterials = [
                        { id: 'mat-p-100g', name: 'Premium Uncoated Text', type: 'PAPER', gsm: 100, finish: 'UNCOATED', stock: 25000, reserved: 4500, risk: 'NONE', forecast: 45, status: 'AVAILABLE', burn: 450.00, procRisk: 'LOW', supplier: 'Sappi Fine Paper', cost: 0.0450 },
                        { id: 'mat-p-130g', name: 'Silk Premium Digital', type: 'PAPER', gsm: 130, finish: 'SILK', stock: 12000, reserved: 9500, risk: 'SHORTAGE_RISK', forecast: 6, status: 'SHORTAGE_RISK', burn: 1850.00, procRisk: 'HIGH', supplier: 'Mondi Group PLC', cost: 0.0620 },
                        { id: 'mat-p-300g', name: 'Heavyweight Glossy Cover', type: 'PAPER', gsm: 300, finish: 'GLOSSY', stock: 4500, reserved: 500, risk: 'NONE', forecast: 60, status: 'AVAILABLE', burn: 65.00, procRisk: 'LOW', supplier: 'Stora Enso Industrial', cost: 0.1850 },
                        { id: 'mat-p-80g', name: 'Standard Bond Recycled', type: 'PAPER', gsm: 80, finish: 'MATTE', stock: 2200, reserved: 2100, risk: 'SHORTAGE_RISK', forecast: 2, status: 'LOW_STOCK', burn: 950.00, procRisk: 'CRITICAL', supplier: 'UPM-Kymmene Corp', cost: 0.0210 },
                        { id: 'mat-ink-c', name: 'Industrial Cyan Toner Cartridge', type: 'INK', gsm: null, finish: null, stock: 12, reserved: 2, risk: 'NONE', forecast: 120, status: 'AVAILABLE', burn: 0.08, procRisk: 'MEDIUM', supplier: 'Heidelberger Druckmaschinen AG', cost: 185.0000 }
                    ];

                    for (const bm of baselineMaterials) {
                        const depDate = new Date(Date.now() + bm.forecast * 86400000).toISOString().slice(0, 19).replace('T', ' ');
                        const available = bm.stock - bm.reserved;
                        let statusStr = 'STABLE';
                        if (available <= 0) statusStr = 'CRITICAL';
                        else if (available <= 5000) statusStr = 'AT_RISK';

                        await db.query(`
                            INSERT IGNORE INTO materials_catalog
                            (id, tenant_id, material_name, material_type, gsm, finish_type, supplier_name, cost_per_unit)
                            VALUES (?, 'ppos-production', ?, ?, ?, ?, ?, ?)
                        `, [bm.id, bm.name, bm.type, bm.gsm, bm.finish, bm.supplier, bm.cost]);

                        await db.query(`
                            INSERT IGNORE INTO predictive_material_inventory 
                            (id, node_id, material_catalog_id, material_name, material_type, paper_gsm, finish, current_stock_units, reserved_stock_units, available_units, reorder_point, replenishment_lead_days, shortage_risk, depletion_forecast_days, operational_status, status, daily_burn_rate, forecasted_depletion_date, procurement_risk, supplier_name, cost_per_unit)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5000, 7, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [bm.id, defaultNodeId, bm.id, bm.name, bm.type, bm.gsm, bm.finish, bm.stock, bm.reserved, available, bm.risk, bm.forecast, bm.status, statusStr, bm.burn, depDate, bm.procRisk, bm.supplier, bm.cost]);
                    }
                }
            } catch (seedErr) {
                logger.warn({ event: 'seed_materials_error', message: seedErr.message });
            }

            // --- INDUSTRIAL PREFLIGHT CONSOLE PERSISTENCE LAYER ---
            await db.query(`
                CREATE TABLE IF NOT EXISTS preflight_job_registry (
                    job_id VARCHAR(64) PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    printhouse_id VARCHAR(64) NULL,
                    operator_id VARCHAR(64) NULL,
                    batch_id VARCHAR(64) NULL,
                    status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
                    policy VARCHAR(128) NULL,
                    type VARCHAR(64) DEFAULT 'ANALYZE',
                    progress INT DEFAULT 0,
                    file_size_bytes BIGINT DEFAULT 0,
                    original_filename VARCHAR(255) NULL,
                    canonical_payload_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_tenant (tenant_id),
                    INDEX idx_printhouse (printhouse_id),
                    INDEX idx_batch (batch_id),
                    INDEX idx_status (status),
                    INDEX idx_created (created_at)
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS preflight_artifact_registry (
                    artifact_id VARCHAR(64) PRIMARY KEY,
                    job_id VARCHAR(64) NOT NULL,
                    tenant_id VARCHAR(64) NOT NULL,
                    artifact_type VARCHAR(64) NOT NULL,
                    filename VARCHAR(255) NOT NULL,
                    size_bytes BIGINT DEFAULT 0,
                    storage_path VARCHAR(512) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_job (job_id),
                    INDEX idx_tenant (tenant_id)
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS preflight_audit_events (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    trace_id VARCHAR(64) NULL,
                    request_id VARCHAR(64) NULL,
                    job_id VARCHAR(64) NULL,
                    tenant_id VARCHAR(64) NOT NULL,
                    printhouse_id VARCHAR(64) NULL,
                    operator_id VARCHAR(64) NULL,
                    action VARCHAR(128) NOT NULL,
                    status VARCHAR(32) NOT NULL,
                    message TEXT NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_tenant_action (tenant_id, action),
                    INDEX idx_job (job_id),
                    INDEX idx_created (created_at)
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS preflight_governance_events (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    rule_slug VARCHAR(128) NOT NULL,
                    evaluation_result VARCHAR(32) NOT NULL,
                    job_id VARCHAR(64) NULL,
                    enforcement_action VARCHAR(64) NULL,
                    details_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_tenant_rule (tenant_id, rule_slug),
                    INDEX idx_job (job_id)
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
            await this.ensureColumn('preflight_artifacts', 'storage_key', 'VARCHAR(512) NULL AFTER storage_tier');

            await this.ensureIndex('control_users', 'idx_printhouse', 'printhouse_id');
            await this.ensureIndex('metrics', 'idx_printhouse', 'printhouse_id');

            // PHASE 2 - Industrial Autonomy Schema Hardening
            await this.ensureColumn('print_nodes', 'rates_json', 'JSON NULL AFTER capabilities_json');
            await this.ensureColumn('print_node_machine_profiles', 'normalized_capabilities_json', 'JSON NULL AFTER raw_data_json');
            await this.ensureColumn('print_node_machine_profiles', 'status', "ENUM('ACTIVE', 'MAINTENANCE', 'OFFLINE') DEFAULT 'ACTIVE' AFTER profile_type");
            await this.ensureColumn('print_node_machine_profiles', 'manufacturer', 'VARCHAR(128) NULL AFTER profile_name');
            await this.ensureColumn('print_node_machine_profiles', 'model', 'VARCHAR(128) NULL AFTER manufacturer');

            // PHASE 3 - MES Materials Orchestration Hardening
            await this.ensureColumn('predictive_material_inventory', 'daily_burn_rate', 'DECIMAL(10,2) DEFAULT 0.00');
            await this.ensureColumn('predictive_material_inventory', 'forecasted_depletion_date', 'TIMESTAMP NULL');
            await this.ensureColumn('predictive_material_inventory', 'procurement_risk', "VARCHAR(32) DEFAULT 'LOW'");
            await this.ensureColumn('predictive_material_inventory', 'supplier_name', 'VARCHAR(128) NULL');
            await this.ensureColumn('predictive_material_inventory', 'cost_per_unit', 'DECIMAL(10,4) DEFAULT 0.0000');

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
// Legacy init disabled. Moved to MigrationService.
// service.init().catch(err => console.error('[CONTROL-PLANE-SCHEMA] Critical init error:', err));

module.exports = service;
