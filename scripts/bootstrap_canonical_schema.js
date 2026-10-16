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

module.exports = { runBootstrap };
