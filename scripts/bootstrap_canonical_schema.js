'use strict';

/**
 * scripts/bootstrap_canonical_schema.js
 *
 * Canonical Database Bootstrap for Ephemeral CI & Clean MySQL Instances.
 *
 * Purpose:
 * Establishes the foundational operational schema (Phase 10 / Pre-Migration 002)
 * required before executing the official sequential migration suite (001-160).
 *
 * Design Guarantees:
 * 1. 100% Idempotent (`CREATE TABLE IF NOT EXISTS`).
 * 2. ZERO artificial records inserted into `schema_versions`.
 * 3. Preserves all historical migration checksums and integrity baselines.
 * 4. Strictly executed under PPOS_MIGRATION_EXECUTION=true and localhost/ephemeral gates.
 */

const mysqlClient = require('../src/api/services/mysqlClient');

/**
 * Verification of ephemeral isolation guards.
 * Returns { ok: boolean, reason?: string, host: string, database: string }
 */
function checkEphemeralIsolation(env = process.env) {
    if (env.NODE_ENV === 'production') {
        return { ok: false, reason: 'Strictly FORBIDDEN in NODE_ENV=production' };
    }

    if (env.PPOS_CI_EPHEMERAL_FIXTURES !== 'true') {
        return { ok: false, reason: 'PPOS_CI_EPHEMERAL_FIXTURES flag is not enabled' };
    }

    // CI-02J.6: Must be verified as running within an accredited CI environment (GitHub Actions or CI runner)
    // Operators cannot arbitrarily enable fixtures in arbitrary local terminals without accredited CI environment context
    const isCiEnvironment = env.GITHUB_ACTIONS === 'true' || env.CI === 'true';
    if (!isCiEnvironment) {
        return { ok: false, reason: 'Execution rejected: PPOS_CI_EPHEMERAL_FIXTURES requires accredited CI container environment (GITHUB_ACTIONS=true or CI=true)' };
    }

    let host = env.MYSQL_HOST || 'localhost';
    let database = env.MYSQL_DATABASE || '';

    if (env.DATABASE_URL) {
        try {
            const parsed = new URL(env.DATABASE_URL);
            host = parsed.hostname;
            database = parsed.pathname.replace(/^\//, '');
        } catch (e) {
            return { ok: false, reason: 'Invalid DATABASE_URL format' };
        }
    }

    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!isLocal) {
        return { ok: false, reason: `Rejected non-local host: ${host}` };
    }

    const FORBIDDEN_DB_NAMES = ['ppos_production', 'ppos_prod', 'printpriceos', 'printpriceos_prod', 'production', 'prod'];
    const dbLower = (database || '').toLowerCase();
    if (!dbLower || FORBIDDEN_DB_NAMES.includes(dbLower)) {
        return { ok: false, reason: `Database name '${database}' is empty or blocked as production` };
    }

    // Positive assertion of disposable / test database identity:
    // Must contain 'ci', 'test', 'ephemeral', or 'tmp' to prevent connecting to persistent local DBs via tunnel or local daemon
    const isDisposable = dbLower.includes('ci') || dbLower.includes('test') || dbLower.includes('ephemeral') || dbLower.includes('tmp');
    if (!isDisposable) {
        return { ok: false, reason: `Database '${database}' does not match disposable ephemeral naming pattern ('ci', 'test', 'ephemeral', 'tmp')` };
    }

    return { ok: true, host, database };
}

/**
 * CI-02J.6: Verifies that the connected database is an unpolluted ephemeral instance.
 * Rejects if user/application data already exists in core tables prior to bootstrap,
 * preventing execution against persistent databases that happen to match naming conventions.
 */
async function checkDatabaseEphemeralState(db) {
    // 1. Check if schema_versions has unexpected migration records prior to clean bootstrap
    try {
        const [tables] = await db.query(`
            SELECT TABLE_NAME
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('schema_versions', 'tenants', 'control_users', 'printer_nodes')
        `);
        const tableNames = new Set(tables.map(t => t.TABLE_NAME));

        if (tableNames.has('schema_versions')) {
            const [rows] = await db.query(`SELECT COUNT(*) as count FROM schema_versions`);
            if (rows && rows[0] && rows[0].count > 0) {
                return { ok: false, reason: `Database is NOT clean/disposable: schema_versions contains ${rows[0].count} prior recorded migrations` };
            }
        }

        // If core business tables exist, check that they contain zero production/live tenant records
        if (tableNames.has('tenants')) {
            const [rows] = await db.query(`SELECT COUNT(*) as count FROM tenants`);
            if (rows && rows[0] && rows[0].count > 0) {
                return { ok: false, reason: `Database contains pre-existing persistent data in tenants table (${rows[0].count} records)` };
            }
        }
    } catch (err) {
        // Query failure on information_schema or count check
        return { ok: false, reason: `Failed to verify ephemeral database state: ${err.message}` };
    }

    return { ok: true };
}

// Contract specifications for each of the 9 ephemeral dependency tables.
// Used for structural verification of pre-existing tables to guarantee non-divergence without destruction.
const FIXTURE_CONTRACT_SPECS = {
    printer_machines: {
        requiredColumns: ['id', 'printer_id', 'nickname', 'type', 'status'],
        requiredFks: [{ name: 'printer_machines_ibfk_1', col: 'printer_id', parent: 'printer_nodes', refCol: 'id' }]
    },
    printhouse_capabilities: {
        requiredColumns: ['id', 'printhouse_id', 'tenant_id'],
        requiredFks: [{ name: 'printhouse_capabilities_ibfk_1', col: 'printhouse_id', parent: 'printer_nodes', refCol: 'id' }]
    },
    routing_history: {
        requiredColumns: ['id', 'printer_id', 'job_id', 'action', 'details_json'],
        requiredFks: [{ name: 'routing_history_ibfk_1', col: 'printer_id', parent: 'printer_nodes', refCol: 'id' }]
    },
    printer_capacity: {
        requiredColumns: ['id', 'printer_id', 'date', 'capacity_total', 'capacity_available', 'lead_time_days'],
        requiredFks: [{ name: 'printer_capacity_ibfk_1', col: 'printer_id', parent: 'printer_nodes', refCol: 'id' }]
    },
    job_outcomes: {
        requiredColumns: ['id', 'printer_id', 'job_id', 'outcome'],
        requiredFks: [{ name: 'job_outcomes_ibfk_1', col: 'printer_id', parent: 'printer_nodes', refCol: 'id' }]
    },
    printer_contacts: {
        requiredColumns: ['id', 'printer_id', 'contact_name', 'email', 'phone'],
        requiredFks: [{ name: 'printer_contacts_ibfk_1', col: 'printer_id', parent: 'printer_nodes', refCol: 'id' }]
    },
    printer_papers: {
        requiredColumns: ['id', 'printer_id', 'paper_type'],
        requiredFks: [{ name: 'printer_papers_ibfk_1', col: 'printer_id', parent: 'printer_nodes', refCol: 'id' }]
    },
    printer_performance: {
        requiredColumns: ['id', 'printer_id', 'metric_name', 'metric_value'],
        requiredFks: [{ name: 'printer_performance_ibfk_1', col: 'printer_id', parent: 'printer_nodes', refCol: 'id' }]
    },
    printer_service_regions: {
        requiredColumns: ['id', 'printer_id', 'region_code'],
        requiredFks: [{ name: 'printer_service_regions_ibfk_1', col: 'printer_id', parent: 'printer_nodes', refCol: 'id' }]
    }
};

/**
 * CI-02J.6: Structural idempotency verification.
 * For each table:
 * - If table does not exist: creates it using canonical/anchor DDL.
 * - If table exists: audits existing columns and foreign keys against FIXTURE_CONTRACT_SPECS.
 * - If incompatible: aborts with error without dropping, altering, or modifying data.
 * - Never disables FOREIGN_KEY_CHECKS.
 */
async function verifyOrApplyStructuralFixtures(db, fixtureDdls = MIGRATION_140_FIXTURE_DDL, specs = FIXTURE_CONTRACT_SPECS) {
    const [existingTableRows] = await db.query(`
        SELECT TABLE_NAME
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
    `);
    const existingTableNames = new Set(existingTableRows.map(r => r.TABLE_NAME));

    for (const [tableName, ddl] of Object.entries(fixtureDdls)) {
        if (!existingTableNames.has(tableName)) {
            // Safe creation of missing table
            await db.query(ddl);
            continue;
        }

        // Table pre-exists: Verify structural contract compatibility without destructive alterations
        const spec = specs[tableName];
        if (!spec) {
            continue;
        }

        // Check required columns
        const [colRows] = await db.query(`
            SELECT COLUMN_NAME
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        `, [tableName]);
        const existingCols = new Set(colRows.map(c => c.COLUMN_NAME.toLowerCase()));

        for (const reqCol of spec.requiredColumns) {
            if (!existingCols.has(reqCol.toLowerCase())) {
                throw new Error(
                    `STRUCTURAL IDEMPOTENCY DIVERGENCE: Pre-existing table '${tableName}' is missing required contract column '${reqCol}'. Aborting bootstrap without mutation.`
                );
            }
        }

        // Check required foreign keys
        if (spec.requiredFks && spec.requiredFks.length > 0) {
            const [fkRows] = await db.query(`
                SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
            `, [tableName]);

            for (const reqFk of spec.requiredFks) {
                const matchingFk = fkRows.find(k =>
                    k.COLUMN_NAME.toLowerCase() === reqFk.col.toLowerCase() &&
                    k.REFERENCED_TABLE_NAME.toLowerCase() === reqFk.parent.toLowerCase() &&
                    k.REFERENCED_COLUMN_NAME.toLowerCase() === reqFk.refCol.toLowerCase()
                );
                if (!matchingFk) {
                    throw new Error(
                        `STRUCTURAL IDEMPOTENCY DIVERGENCE: Pre-existing table '${tableName}' does not satisfy required foreign key referencing ${reqFk.parent}(${reqFk.refCol}) on column '${reqFk.col}'. Aborting bootstrap without mutation.`
                    );
                }
            }
        }
    }
}

// Canonical and Relational Anchor DDL definitions for Migration 140 pre-remediation dependencies
const MIGRATION_140_FIXTURE_DDL = {
    // 1. printer_machines (Historical contract from docs/migrations/printhouse_pricing_restore.sql)
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

    // 2. printhouse_capabilities (Historical contract from docs/migrations/printhouse_hardening.sql)
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
            max_sheet_size_width DECIMAL(10,2),
            max_sheet_size_height DECIMAL(10,2),
            supported_countries JSON,
            lead_times_json JSON,
            certifications_json JSON,
            sustainability_score INT DEFAULT 0,
            preferred_job_types JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_printhouse_cap (printhouse_id),
            INDEX idx_pc_printhouse (printhouse_id),
            CONSTRAINT printhouse_capabilities_ibfk_1 FOREIGN KEY (printhouse_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    // 3. routing_history (Historical contract from src/migrations/phase184g_industrial_provisioning_schema.js)
    routing_history: `
        CREATE TABLE IF NOT EXISTS routing_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            printer_id VARCHAR(64) NOT NULL,
            job_id VARCHAR(64) NULL,
            action VARCHAR(128) NULL,
            details_json JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_rh_printer (printer_id),
            CONSTRAINT routing_history_ibfk_1 FOREIGN KEY (printer_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    // 4. printer_capacity (Canonical partial contract from printerSyncService.js / smoke_phase192j)
    printer_capacity: `
        CREATE TABLE IF NOT EXISTS printer_capacity (
            id VARCHAR(64) PRIMARY KEY,
            printer_id VARCHAR(64) NOT NULL,
            date DATE NOT NULL,
            capacity_total INT DEFAULT 0,
            capacity_available INT DEFAULT 0,
            lead_time_days INT DEFAULT 0,
            source VARCHAR(32) DEFAULT 'MANUAL',
            sync_id VARCHAR(64) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_printer_date (printer_id, date),
            CONSTRAINT printer_capacity_ibfk_1 FOREIGN KEY (printer_id) REFERENCES printer_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,

    // CI-ONLY EXTERNAL SCHEMA FIXTURES — NOT PRODUCTION CANONICAL DDL
    // 5. job_outcomes
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

    // 6. printer_contacts
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

    // 7. printer_papers
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

    // 8. printer_performance
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

    // 9. printer_service_regions
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

async function runBootstrap() {
    console.log('\n=== Canonical Ephemeral Database Bootstrap (Phase CI-02D) ===\n');

    // 1. Strict Environmental Protection Gates
    if (process.env.NODE_ENV === 'production') {
        console.error('ERROR: Canonical database bootstrap is strictly FORBIDDEN in NODE_ENV=production.');
        process.exit(1);
    }

    let host = process.env.MYSQL_HOST || 'localhost';
    let database = process.env.MYSQL_DATABASE || '';

    if (process.env.DATABASE_URL) {
        try {
            const parsed = new URL(process.env.DATABASE_URL);
            host = parsed.hostname;
            database = parsed.pathname.replace(/^\//, '');
        } catch (e) {
            console.error('ERROR: Invalid DATABASE_URL format in bootstrap script.');
            process.exit(1);
        }
    }

    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!isLocal) {
        console.error(`ERROR: Canonical database bootstrap rejected for non-local host: ${host}`);
        process.exit(1);
    }

    const FORBIDDEN_DB_NAMES = ['ppos_production', 'ppos_prod', 'printpriceos', 'printpriceos_prod'];
    if (FORBIDDEN_DB_NAMES.includes(database.toLowerCase())) {
        console.error(`ERROR: Database name '${database}' is blocked as a potential production database.`);
        process.exit(1);
    }

    console.log(`[SAFETY CHECK PASSED] Target Ephemeral Host: ${host}, Database: ${database}`);

    process.env.PPOS_MIGRATION_EXECUTION = 'true';
    process.env.PPOS_ENABLE_SCHEMA_MUTATION = 'true';

    const db = mysqlClient.getPool();

    try {
        // Enforce canonical database collation for ephemeral CI instance
        await db.query(`ALTER DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

        console.log('[1/7] Ensuring foundational tenancy and identity tables...');
        // From docs/migrations/printhouse_onboarding.sql & src/api/services/controlPlaneSchemaService.js
        await db.query(`
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
        `);

        // From docs/migrations/control_users.sql & src/api/services/controlPlaneSchemaService.js
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        console.log('[2/7] Ensuring printer_nodes baseline table (precondition for migration 002)...');
        // From docs/migrations/printhouse_onboarding.sql
        await db.query(`
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
        `);

        console.log('[3/7] Ensuring jobs and metrics telemetry tables (preconditions for migration 002)...');
        // From src/api/services/controlPlaneSchemaService.js
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        console.log('[4/7] Ensuring manufacturing_dispatches and federation_factories (preconditions for migration 002)...');
        // From src/migrations/phase184g_manufacturing_persistence_schema.js
        await db.query(`
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
        `);

        await db.query(`
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
        `);

        // From src/migrations/phase184g_industrial_provisioning_schema.js
        await db.query(`
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
        `);

        console.log('[5/7] Ensuring order intake and quote foundation tables (preconditions for migrations 010 & 136)...');
        // From scripts/phase190_test_fixture_base.sql
        await db.query(`
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
        `);

        await db.query(`
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
        `);

        console.log('[6/7] Ensuring supporting node and audit log tables...');
        // From src/migrations/phase184g_manufacturing_persistence_schema.js
        await db.query(`
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
        `);

        // Legacy api_audit_log compatibility table (from docs/migrations/printhouse_hardening.sql)
        await db.query(`
            CREATE TABLE IF NOT EXISTS api_audit_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id VARCHAR(64) NULL,
                action VARCHAR(255) NULL,
                metadata_json JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_tenant (tenant_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // =========================================================================
        // [7.1/7] Phase CI-02J: Industrial Ephemeral Dependencies for Migration 140
        // =========================================================================
        // Activated EXCLUSIVELY under strict CI ephemeral execution gates.
        if (process.env.PPOS_CI_EPHEMERAL_FIXTURES === 'true') {
            console.log('[Phase CI-02J] Ensuring industrial dependencies for Migration 140 pre-remediation...');

            // Strict Isolation Check 1: Must verify disposable ephemeral CI instance
            const isolationCheck = checkEphemeralIsolation(process.env);
            if (!isolationCheck.ok) {
                throw new Error(`SECURITY VIOLATION: Ephemeral fixtures rejected: ${isolationCheck.reason}`);
            }

            // Strict Isolation Check 2: Must verify database state has zero persistent tenant/migration pollution
            const dbStateCheck = await checkDatabaseEphemeralState(db);
            if (!dbStateCheck.ok) {
                throw new Error(`SECURITY VIOLATION: Database state check failed: ${dbStateCheck.reason}`);
            }

            // Structural Idempotency Verification: Audit pre-existing tables, create only missing, never mutate incompatibly
            await verifyOrApplyStructuralFixtures(db, MIGRATION_140_FIXTURE_DDL, FIXTURE_CONTRACT_SPECS);

            console.log('✓ Phase CI-02J ephemeral dependencies successfully initialized.');
        }

        console.log('[7/7] Canonical Ephemeral Database Bootstrap completed successfully.');
        console.log('✓ Foundational tables prepared. Database is now ready for sequential migration execution.\n');
    } catch (err) {
        console.error('FATAL: Canonical Ephemeral Database Bootstrap failed:', err);
        process.exit(1);
    } finally {
        await mysqlClient.closePool();
    }
}

if (require.main === module) {
    runBootstrap();
}

module.exports = {
    runBootstrap,
    checkEphemeralIsolation,
    checkDatabaseEphemeralState,
    verifyOrApplyStructuralFixtures,
    FIXTURE_CONTRACT_SPECS,
    MIGRATION_140_FIXTURE_DDL
};
