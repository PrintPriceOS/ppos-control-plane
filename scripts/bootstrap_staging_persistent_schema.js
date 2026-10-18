'use strict';

/**
 * scripts/bootstrap_staging_persistent_schema.js
 *
 * Governed Persistent Schema Bootstrap for Isolated Staging Environments.
 *
 * Purpose:
 * Provisions foundational Phase 10 tables required prior to running the official
 * sequential migration runner (001-161), without relying on CI ephemeral flags.
 *
 * Safety Invariants:
 * 1. Strictly forbidden in NODE_ENV=production.
 * 2. Strictly forbids production database names (e.g. ppos_production, prod).
 * 3. Requires explicit confirmation that database is clean / unpopulated.
 * 4. Idempotent CREATE TABLE IF NOT EXISTS with canonical utf8mb4 collation.
 * 5. Does NOT insert artificial records into schema_versions.
 * 6. Preserves all historical baseline checksums intact.
 */

const fs = require('fs');

// Resolve Docker secrets if specified via _FILE environment variables
if (process.env.MYSQL_PASSWORD_FILE && fs.existsSync(process.env.MYSQL_PASSWORD_FILE)) {
    try {
        process.env.MYSQL_PASSWORD = fs.readFileSync(process.env.MYSQL_PASSWORD_FILE, 'utf8').trim();
    } catch (e) {}
}
if (process.env.JWT_SECRET_FILE && fs.existsSync(process.env.JWT_SECRET_FILE)) {
    try {
        process.env.JWT_SECRET = fs.readFileSync(process.env.JWT_SECRET_FILE, 'utf8').trim();
    } catch (e) {}
}

const mysqlClient = require('../src/api/services/mysqlClient');

function checkStagingPersistentGuards(envOrOpts = process.env) {
    const nodeEnv = envOrOpts.nodeEnv !== undefined ? envOrOpts.nodeEnv : (envOrOpts.NODE_ENV || process.env.NODE_ENV);
    const bootstrapFlag = envOrOpts.bootstrapFlag !== undefined ? envOrOpts.bootstrapFlag : (envOrOpts.PPOS_STAGING_PERSISTENT_BOOTSTRAP || process.env.PPOS_STAGING_PERSISTENT_BOOTSTRAP);

    // Explicit DATABASE_URL precedence over MYSQL_* variables
    let database = '';
    let host = '';
    const dbUrl = envOrOpts.DATABASE_URL || (envOrOpts.targetDb === undefined ? process.env.DATABASE_URL : null);

    if (dbUrl) {
        try {
            const parsed = new URL(dbUrl);
            host = parsed.hostname;
            database = parsed.pathname.replace(/^\//, '');
        } catch (e) {
            throw new Error('Invalid DATABASE_URL format');
        }
    }

    if (envOrOpts.targetDb !== undefined) {
        database = envOrOpts.targetDb;
    } else if (!database) {
        database = envOrOpts.MYSQL_DATABASE || process.env.MYSQL_DATABASE || '';
    }

    if (envOrOpts.host !== undefined) {
        host = envOrOpts.host;
    } else if (!host) {
        host = envOrOpts.MYSQL_HOST || process.env.MYSQL_HOST || 'localhost';
    }

    if (nodeEnv === 'production') {
        throw new Error('Strictly forbidden in production environment (NODE_ENV=production)');
    }

    if (bootstrapFlag !== 'true') {
        throw new Error('PPOS_STAGING_PERSISTENT_BOOTSTRAP=true is required to execute persistent bootstrap');
    }

    // Host inspection: Strictly reject known or suspected production endpoints even if database is named staging
    const hostLower = (host || '').toLowerCase();
    const FORBIDDEN_HOST_PATTERNS = [
        'prod', 'production', 'live', 'rds.amazonaws.com', 'azure.com', 'googlecloud', 'printpriceos.com'
    ];
    for (const pattern of FORBIDDEN_HOST_PATTERNS) {
        if (hostLower.includes(pattern) && !hostLower.includes('staging') && !hostLower.includes('test')) {
            throw new Error(`Forbidden production host identifier '${host}': execution against production infrastructure is strictly rejected`);
        }
    }

    const FORBIDDEN_DB_NAMES = [
        'ppos_production', 'ppos_prod', 'ppos_control_plane', 'printpriceos', 'printpriceos_prod',
        'production', 'prod', 'master', 'main', 'production_db'
    ];
    const dbLower = (database || '').toLowerCase();
    if (!dbLower || FORBIDDEN_DB_NAMES.includes(dbLower) || dbLower.includes('prod')) {
        throw new Error(`Forbidden target database '${database}': rejected as a production or ambiguous identifier`);
    }

    // Must be explicitly targeted at staging, sandbox, test, or lab
    const isStagingOrSandbox = dbLower.includes('staging') || dbLower.includes('sandbox') || dbLower.includes('lab') || dbLower.includes('test') || dbLower.includes('drill');
    if (!isStagingOrSandbox) {
        throw new Error(`Database '${database}' does not match expected staging/sandbox pattern`);
    }

    return { ok: true, host, database };
}

async function verifyTargetDatabaseIsClean(db) {
    const [allTables] = await db.query(`
        SELECT TABLE_NAME, TABLE_ROWS
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
    `);

    if (!allTables || allTables.length === 0) {
        // Completely pristine, empty database
        return { ok: true, tableCount: 0 };
    }

    const tableNames = new Set(allTables.map(t => t.TABLE_NAME));
    const ALLOWED_FOUNDATION_TABLES = new Set(Object.keys(STAGING_FOUNDATION_DDL));

    // 1. Check for unexpected or alien pre-existing tables
    for (const name of tableNames) {
        if (!ALLOWED_FOUNDATION_TABLES.has(name) && name !== 'schema_versions') {
            return {
                ok: false,
                reason: `Database contains unexpected pre-existing table '${name}'. Persistent bootstrap requires a clean dedicated schema.`
            };
        }
    }

    // 2. If schema_versions exists, it MUST have 0 rows
    if (tableNames.has('schema_versions')) {
        const [rows] = await db.query(`SELECT COUNT(*) as count FROM schema_versions`);
        if (rows && rows[0] && rows[0].count > 0) {
            return { ok: false, reason: `Database already contains ${rows[0].count} migrations in schema_versions. Aborting bootstrap without mutation.` };
        }
    }

    // 3. If tenants exists, it MUST have 0 rows
    if (tableNames.has('tenants')) {
        const [rows] = await db.query(`SELECT COUNT(*) as count FROM tenants`);
        if (rows && rows[0] && rows[0].count > 0) {
            return { ok: false, reason: `Database already contains ${rows[0].count} records in tenants table. Cannot bootstrap populated database.` };
        }
    }

    // 4. If control_users exists, it MUST have 0 rows
    if (tableNames.has('control_users')) {
        const [rows] = await db.query(`SELECT COUNT(*) as count FROM control_users`);
        if (rows && rows[0] && rows[0].count > 0) {
            return { ok: false, reason: `Database already contains ${rows[0].count} records in control_users table. Cannot bootstrap populated database.` };
        }
    }

    return { ok: true, tableCount: allTables.length };
}

// Canonical Pre-002 Foundations: Essential tables required before migration 002
const STAGING_FOUNDATION_DDL = {
    tenants: `
        CREATE TABLE IF NOT EXISTS tenants (
            id VARCHAR(64) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            status ENUM('ACTIVE', 'SUSPENDED', 'PENDING', 'DELETED', 'TRIAL') DEFAULT 'ACTIVE',
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    control_users: `
        CREATE TABLE IF NOT EXISTS control_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role ENUM('SUPER_ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR', 'VIEWER') DEFAULT 'VIEWER',
            tenant_id VARCHAR(64) NOT NULL DEFAULT 'ppos-staging',
            printhouse_id VARCHAR(64) NULL,
            status ENUM('ACTIVE', 'SUSPENDED', 'DELETED') DEFAULT 'ACTIVE',
            last_login_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_email (email),
            INDEX idx_tenant (tenant_id),
            INDEX idx_printhouse (printhouse_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    tenant_notification_preferences: `
        CREATE TABLE IF NOT EXISTS tenant_notification_preferences (
            tenant_id VARCHAR(64) PRIMARY KEY,
            email_enabled BOOLEAN DEFAULT TRUE,
            webhook_enabled BOOLEAN DEFAULT FALSE,
            email_order_alerts TINYINT(1) DEFAULT 1,
            email_qc_alerts TINYINT(1) DEFAULT 1,
            email_sla_alerts TINYINT(1) DEFAULT 1,
            email_recipients_json JSON NULL,
            webhook_endpoint VARCHAR(512) NULL,
            webhook_url VARCHAR(512) NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    printer_nodes: `
        CREATE TABLE IF NOT EXISTS printer_nodes (
            id VARCHAR(64) PRIMARY KEY,
            tenant_id VARCHAR(64) NOT NULL,
            name VARCHAR(255) NOT NULL,
            country VARCHAR(64) NULL,
            city VARCHAR(64) NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            phone VARCHAR(64) NULL,
            website VARCHAR(255) NULL,
            status ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED') DEFAULT 'PENDING',
            onboarding_status ENUM('STARTED', 'DOCS_UPLOADED', 'PRICING_CONFIGURED', 'COMPLETED') DEFAULT 'STARTED',
            rates_json JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_tenant (tenant_id),
            INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    jobs: `
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    metrics: `
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    manufacturing_packages: `
        CREATE TABLE IF NOT EXISTS manufacturing_packages (
            id VARCHAR(64) PRIMARY KEY,
            tenant_id VARCHAR(64) NOT NULL,
            source VARCHAR(32) DEFAULT 'PREFLIGHT',
            source_job_id VARCHAR(64) NOT NULL,
            source_artifact_id VARCHAR(64) NOT NULL,
            fixed_pdf_artifact_id VARCHAR(64) NULL,
            certified_pdf_artifact_id VARCHAR(64) NULL,
            book_spec_json JSON NULL,
            preflight_report_json JSON NULL,
            policy_id VARCHAR(64) NULL,
            status ENUM('DRAFT', 'READY_FOR_DISPATCH', 'DISPATCHED', 'ACCEPTED_BY_PRINTER', 'REJECTED_BY_PRINTER', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED') DEFAULT 'DRAFT',
            created_by_user_id VARCHAR(64) NOT NULL,
            assigned_printer_tenant_id VARCHAR(64) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_tenant (tenant_id),
            INDEX idx_status (status),
            INDEX idx_printer (assigned_printer_tenant_id),
            INDEX idx_source_job (source_job_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    manufacturing_dispatches: `
        CREATE TABLE IF NOT EXISTS manufacturing_dispatches (
            id VARCHAR(64) PRIMARY KEY,
            manufacturing_package_id VARCHAR(64) NULL,
            print_node_id VARCHAR(64) NULL,
            node_id VARCHAR(64) NULL,
            job_id VARCHAR(64) NULL,
            machine_id VARCHAR(64) NULL,
            sender_tenant_id VARCHAR(64) NULL,
            receiver_tenant_id VARCHAR(64) NULL,
            status VARCHAR(32) DEFAULT 'PENDING',
            message TEXT NULL,
            score_snapshot_json JSON NULL,
            routing_state_json JSON NULL,
            sla_estimate_json JSON NULL,
            orchestration_metadata_json JSON NULL,
            operator_id VARCHAR(64) NULL,
            estimated_cost DECIMAL(10,2) DEFAULT 0,
            estimated_margin DECIMAL(10,2) DEFAULT 0,
            reserved_from TIMESTAMP NULL,
            reserved_until TIMESTAMP NULL,
            economic_score FLOAT DEFAULT 0,
            profitability_score FLOAT DEFAULT 0,
            energy_efficiency_score FLOAT DEFAULT 0,
            federation_node_id VARCHAR(64) NULL,
            governance_policy_score FLOAT DEFAULT 0,
            evidence_snapshot_json JSON NULL,
            metadata_json JSON NULL,
            expires_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            accepted_at TIMESTAMP NULL,
            rejected_at TIMESTAMP NULL,
            INDEX idx_package (manufacturing_package_id),
            INDEX idx_print_node (print_node_id),
            INDEX idx_node (node_id),
            INDEX idx_job (job_id),
            INDEX idx_sender (sender_tenant_id),
            INDEX idx_receiver (receiver_tenant_id),
            INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    federation_factories: `
        CREATE TABLE IF NOT EXISTS federation_factories (
            id VARCHAR(64) PRIMARY KEY,
            company_name VARCHAR(255) NOT NULL,
            factory_name VARCHAR(255) NOT NULL,
            region VARCHAR(64),
            timezone VARCHAR(64) DEFAULT 'UTC',
            specialization VARCHAR(128),
            capacity_index DECIMAL(5,2) DEFAULT 0.00,
            reliability_index DECIMAL(5,2) DEFAULT 0.00,
            latency_score DECIMAL(5,2) DEFAULT 0.00,
            economic_score DECIMAL(5,2) DEFAULT 0.00,
            energy_score DECIMAL(5,2) DEFAULT 0.00,
            federation_state VARCHAR(32) DEFAULT 'ACTIVE',
            last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    orders: `
        CREATE TABLE IF NOT EXISTS orders (
            id VARCHAR(64) PRIMARY KEY,
            job_id VARCHAR(64) NULL,
            tenant_id VARCHAR(64) NOT NULL,
            assigned_printhouse_id VARCHAR(64) NULL,
            currency CHAR(3) NOT NULL DEFAULT 'EUR',
            active_pricing_snapshot_id VARCHAR(64) NULL,
            status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    job_quotes: `
        CREATE TABLE IF NOT EXISTS job_quotes (
            id VARCHAR(64) PRIMARY KEY,
            job_id VARCHAR(64) NOT NULL,
            printer_id VARCHAR(64) NULL,
            calculation_breakdown_json JSON NULL,
            status ENUM('DRAFT','ACCEPTED','EXPIRED','REJECTED','SUPERSEDED','VOIDED') NOT NULL DEFAULT 'DRAFT',
            revision INT NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    print_nodes: `
        CREATE TABLE IF NOT EXISTS print_nodes (
            id VARCHAR(64) PRIMARY KEY,
            tenant_id VARCHAR(64) NOT NULL,
            company_name VARCHAR(255) NOT NULL,
            status ENUM('ONLINE', 'OFFLINE', 'BUSY', 'MAINTENANCE', 'DEGRADED', 'SATURATED', 'RECOVERING', 'DESYNCHRONIZED') DEFAULT 'OFFLINE',
            license_status ENUM('ACTIVE', 'EXPIRED', 'PENDING', 'SUSPENDED') DEFAULT 'PENDING',
            country VARCHAR(64) NULL,
            city VARCHAR(64) NULL,
            capabilities_json JSON NULL,
            machine_profile_json JSON NULL,
            supported_policies_json JSON NULL,
            max_file_size_mb INT DEFAULT 500,
            api_enabled BOOLEAN DEFAULT FALSE,
            rates_json JSON NULL,
            last_heartbeat_at TIMESTAMP NULL,
            capacity_utilization_pct INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_tenant (tenant_id),
            INDEX idx_status (status),
            INDEX idx_license (license_status),
            INDEX idx_heartbeat (last_heartbeat_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    api_audit_log: `
        CREATE TABLE IF NOT EXISTS api_audit_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id VARCHAR(64) NULL,
            action VARCHAR(255) NULL,
            metadata_json JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_tenant (tenant_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    // Pre-requisites for migration 140 (printhouse machine capabilities relations)
    printer_machines: `
        CREATE TABLE IF NOT EXISTS printer_machines (
            id INT AUTO_INCREMENT PRIMARY KEY,
            printer_id VARCHAR(64) NOT NULL,
            nickname VARCHAR(255) NOT NULL,
            type VARCHAR(64) NULL,
            status VARCHAR(64) DEFAULT 'ACTIVE',
            INDEX idx_pm_printer (printer_id),
            CONSTRAINT printer_machines_ibfk_1 FOREIGN KEY (printer_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    printhouse_capabilities: `
        CREATE TABLE IF NOT EXISTS printhouse_capabilities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            printhouse_id VARCHAR(64) NOT NULL,
            tenant_id VARCHAR(64) NOT NULL,
            min_quantity INT DEFAULT 1,
            max_quantity INT DEFAULT 1000000,
            hardcover_support BOOLEAN DEFAULT FALSE,
            softcover_support BOOLEAN DEFAULT FALSE,
            sewing_support BOOLEAN DEFAULT FALSE,
            lamination_support BOOLEAN DEFAULT FALSE,
            uv_support BOOLEAN DEFAULT FALSE,
            foil_support BOOLEAN DEFAULT FALSE,
            embossing_support BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_pc_printhouse (printhouse_id),
            CONSTRAINT printhouse_capabilities_ibfk_1 FOREIGN KEY (printhouse_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    routing_history: `
        CREATE TABLE IF NOT EXISTS routing_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            printer_id VARCHAR(64) NOT NULL,
            job_id VARCHAR(64) NULL,
            action VARCHAR(64) NOT NULL,
            details_json JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_rh_printer (printer_id),
            CONSTRAINT routing_history_ibfk_1 FOREIGN KEY (printer_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    printer_capacity: `
        CREATE TABLE IF NOT EXISTS printer_capacity (
            id INT AUTO_INCREMENT PRIMARY KEY,
            printer_id VARCHAR(64) NOT NULL,
            date DATE NOT NULL,
            capacity_total INT DEFAULT 10000,
            capacity_available INT DEFAULT 10000,
            lead_time_days INT DEFAULT 3,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_pcap_printer (printer_id),
            CONSTRAINT printer_capacity_ibfk_1 FOREIGN KEY (printer_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    job_outcomes: `
        CREATE TABLE IF NOT EXISTS job_outcomes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            printer_id VARCHAR(64) NOT NULL,
            job_id VARCHAR(64) NULL,
            outcome VARCHAR(64) NOT NULL DEFAULT 'COMPLETED',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_jo_printer (printer_id),
            CONSTRAINT job_outcomes_ibfk_1 FOREIGN KEY (printer_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    printer_contacts: `
        CREATE TABLE IF NOT EXISTS printer_contacts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            printer_id VARCHAR(64) NOT NULL,
            contact_name VARCHAR(255) NULL,
            email VARCHAR(255) NULL,
            phone VARCHAR(64) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_pcon_printer (printer_id),
            CONSTRAINT printer_contacts_ibfk_1 FOREIGN KEY (printer_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    printer_papers: `
        CREATE TABLE IF NOT EXISTS printer_papers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            printer_id VARCHAR(64) NOT NULL,
            paper_type VARCHAR(128) NOT NULL DEFAULT 'STANDARD',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ppap_printer (printer_id),
            CONSTRAINT printer_papers_ibfk_1 FOREIGN KEY (printer_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    printer_performance: `
        CREATE TABLE IF NOT EXISTS printer_performance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            printer_id VARCHAR(64) NOT NULL,
            metric_name VARCHAR(64) NOT NULL DEFAULT 'LATENCY',
            metric_value DECIMAL(10,2) DEFAULT 0.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_pperf_printer (printer_id),
            CONSTRAINT printer_performance_ibfk_1 FOREIGN KEY (printer_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    printer_service_regions: `
        CREATE TABLE IF NOT EXISTS printer_service_regions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            printer_id VARCHAR(64) NOT NULL,
            region_code VARCHAR(64) NOT NULL DEFAULT 'DEFAULT_REGION',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_psr_printer (printer_id),
            CONSTRAINT printer_service_regions_ibfk_1 FOREIGN KEY (printer_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `
};

async function runStagingPersistentBootstrap() {
    console.log('=== Staging Persistent Database Bootstrap ===\n');

    const guard = checkStagingPersistentGuards(process.env);
    if (!guard.ok) {
        console.error(`FATAL GUARD VIOLATION: ${guard.reason}`);
        process.exit(1);
    }

    console.log(`[GUARD CONFIRMED] Staging Host: ${guard.host}, Database: ${guard.database}`);

    const db = mysqlClient.getPool();

    try {
        const cleanCheck = await verifyTargetDatabaseIsClean(db);
        if (!cleanCheck.ok) {
            console.error(`ABORTING: ${cleanCheck.reason}`);
            process.exit(1);
        }

        console.log('[1/3] Enforcing canonical database charset and collation...');
        await db.query(`ALTER DATABASE \`${guard.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

        console.log('[2/3] Applying canonical staging foundational tables...');
        for (const [tableName, ddl] of Object.entries(STAGING_FOUNDATION_DDL)) {
            await db.query(ddl);
            console.log(`  ✓ Table '${tableName}' verified/created.`);
        }

        console.log('[3/3] Foundation tables applied successfully without touching schema_versions.');
        console.log('Database is now ready for sequential execution via run_control_plane_migrations.js.\n');
    } catch (err) {
        console.error('FATAL ERROR during staging persistent bootstrap:', err);
        process.exit(1);
    } finally {
        await mysqlClient.closePool();
    }
}

if (require.main === module) {
    runStagingPersistentBootstrap();
}

module.exports = {
    checkStagingPersistentGuards,
    verifyTargetDatabaseIsClean,
    STAGING_FOUNDATION_DDL,
    runStagingPersistentBootstrap
};
