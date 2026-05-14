/**
 * src/api/services/industrialProvisioningService.js
 * 
 * Idempotent provisioning layer for industrial operations.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('provisioning-service');
const machineRegistry = require('./machineRegistryService');
const migrationService = require('./migrationService');

class IndustrialProvisioningService {
    /**
     * Helper to log detailed errors during provisioning.
     */
    _logStepError(step, err) {
        logger.error({
            event: 'provisioning_step_failed',
            step,
            message: err.message || 'Unknown Error',
            code: err.code,
            sqlMessage: err.sqlMessage,
            sql: err.sql,
            stack: err.stack,
            metadata: {
                timestamp: new Date().toISOString()
            }
        });
    }

    /**
     * Helper to ensure JSON values are MySQL-safe.
     */
    normalizeJsonForMysql(value, fallback = {}) {
        if (value === null || value === undefined || value === '') {
            return JSON.stringify(fallback);
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        if (typeof value === 'string') {
            try {
                JSON.parse(value);
                return value;
            } catch (e) {
                return JSON.stringify(fallback);
            }
        }
        // Fallback for primitives or other types
        return JSON.stringify(fallback);
    }

    /**
     * Entry point for full system provisioning.
     * Consolidates modern migrations and legacy column hardening.
     */
    async runFullProvisioning() {
        const summary = {
            startTime: new Date().toISOString(),
            columnsEnsured: 0,
            migrationsApplied: 0,
            printNodesSynced: 0,
            machinesDiscovered: 0,
            pricingProfilesSeeded: 0,
            federationFactoriesSeeded: 0,
            warnings: [],
            failedSteps: [],
            sourceCounts: {},
            timestamp: new Date().toISOString()
        };

        try {
            summary.sourceCounts = await this.getSourceCounts();
        } catch (err) {
            summary.warnings.push(`Initial metadata sync warning: ${err.message}`);
        }

        // Step 1: Idempotent Column Hardening (Phase 18-22)
        try {
            summary.columnsEnsured = await this.ensureCoreColumns();
        } catch (err) {
            summary.failedSteps.push('ensureCoreColumns');
            this._logStepError('ensureCoreColumns', err);
        }

        // Step 2: Modern SQL Migrations
        try {
            const migrationResult = await migrationService.runMigrations();
            summary.migrationsApplied = migrationResult.appliedCount;
        } catch (err) {
            summary.failedSteps.push('migrations');
            this._logStepError('migrations', err);
        }

        // Step 3: Operational Node Sync
        try {
            summary.printNodesSynced = await this.syncPrinterNodesToPrintNodes();
        } catch (err) {
            summary.failedSteps.push('syncPrinterNodesToPrintNodes');
            this._logStepError('syncPrinterNodesToPrintNodes', err);
        }

        // Step 4: Machine Discovery
        try {
            summary.machinesDiscovered = await this.discoverMachineProfiles();
        } catch (err) {
            summary.failedSteps.push('discoverMachineProfiles');
            this._logStepError('discoverMachineProfiles', err);
        }

        // Step 5: Pricing & Federation Seeding
        try {
            summary.pricingProfilesSeeded = await this.seedPricingProfiles();
            summary.federationFactoriesSeeded = await this.seedFederationFactories();
        } catch (err) {
            summary.failedSteps.push('seeding');
            this._logStepError('seeding', err);
        }

        // Refresh source counts after provisioning
        try {
            summary.sourceCounts = await this.getSourceCounts();
        } catch (err) {
            summary.warnings.push(`Final metadata sync warning: ${err.message}`);
        }

        summary.endTime = new Date().toISOString();
        return summary;
    }

    /**
     * Idempotent column hardening for Phase 18-22 industrial features.
     */
    async ensureCoreColumns() {
        let ensured = 0;
        const coreTables = []; // Placeholder for any specific table creation logic if needed

        try {
            await require('./controlPlaneSchemaService').ensurePreflightRegistrySchema();
            await require('./controlPlaneSchemaService').ensureMarketplaceRegistrySchema();
        } catch (schemaErr) {
            this._logStepError('ensurePreflightRegistrySchema', schemaErr);
        }

        // Ensure Phase 18 Governance columns exist
        const governanceMigrations = [
            { table: 'print_nodes', column: 'rates_json', type: 'JSON NULL' },
            { table: 'printer_pricing_profiles', column: 'rates_json', type: 'JSON NULL' },
            { table: 'manufacturing_dispatches', column: 'federation_node_id', type: 'VARCHAR(64) NULL' },
            { table: 'manufacturing_dispatches', column: 'governance_policy_score', type: 'FLOAT DEFAULT 0.0' },
            { table: 'manufacturing_dispatches', column: 'governance_risk_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'constitutional_compliance', type: 'DECIMAL(5,2) DEFAULT 100.00' },
            { table: 'manufacturing_dispatches', column: 'cognition_priority', type: 'INT DEFAULT 0' },
            { table: 'manufacturing_dispatches', column: 'recursive_generation_id', type: 'VARCHAR(64) NULL' },
            { table: 'print_node_machine_profiles', column: 'governance_stability_score', type: 'DECIMAL(5,2) DEFAULT 100.00' },
            { table: 'print_node_machine_profiles', column: 'federation_learning_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'print_node_machine_profiles', column: 'ethics_compliance_score', type: 'DECIMAL(5,2) DEFAULT 100.00' }
        ];

        for (const gm of governanceMigrations) {
            try {
                const exists = await this.checkColumnExists(gm.table, gm.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${gm.table} ADD COLUMN ${gm.column} ${gm.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureGovernanceColumns:${gm.table}.${gm.column}`, err);
            }
        }

        // Ensure Phase 19 Civilization columns exist
        const civilizationMigrations = [
            { table: 'manufacturing_dispatches', column: 'planetary_priority_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'civilization_risk_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'intercontinental_route_id', type: 'VARCHAR(64) NULL' },
            { table: 'manufacturing_dispatches', column: 'planetary_equilibrium_weight', type: 'DECIMAL(5,2) DEFAULT 1.00' },
            { table: 'print_node_machine_profiles', column: 'continental_cluster_id', type: 'VARCHAR(64) NULL' },
            { table: 'print_node_machine_profiles', column: 'planetary_reliability_index', type: 'DECIMAL(5,2) DEFAULT 100.00' },
            { table: 'print_node_machine_profiles', column: 'civilization_contribution_score', type: 'DECIMAL(5,2) DEFAULT 0.00' }
        ];

        for (const gm of civilizationMigrations) {
            try {
                const exists = await this.checkColumnExists(gm.table, gm.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${gm.table} ADD COLUMN ${gm.column} ${gm.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureCivilizationColumns:${gm.table}.${gm.column}`, err);
            }
        }

        // Ensure Phase 20 Interplanetary columns exist
        const interplanetaryMigrations = [
            { table: 'manufacturing_dispatches', column: 'interplanetary_priority_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'existential_risk_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'orbital_route_id', type: 'VARCHAR(64) NULL' },
            { table: 'manufacturing_dispatches', column: 'continuity_weight', type: 'DECIMAL(5,2) DEFAULT 1.00' },
            { table: 'print_node_machine_profiles', column: 'orbital_cluster_id', type: 'VARCHAR(64) NULL' },
            { table: 'print_node_machine_profiles', column: 'synthetic_awareness_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'print_node_machine_profiles', column: 'civilization_survival_score', type: 'DECIMAL(5,2) DEFAULT 100.00' }
        ];

        for (const gm of interplanetaryMigrations) {
            try {
                const exists = await this.checkColumnExists(gm.table, gm.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${gm.table} ADD COLUMN ${gm.column} ${gm.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureInterplanetaryColumns:${gm.table}.${gm.column}`, err);
            }
        }

        // Ensure Phase 21 Reality columns exist
        const realityMigrations = [
            { table: 'manufacturing_dispatches', column: 'timeline_weight', type: 'DECIMAL(5,2) DEFAULT 1.00' },
            { table: 'manufacturing_dispatches', column: 'existence_priority', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'reality_risk_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'universal_dependency', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'print_node_machine_profiles', column: 'simulation_coherence', type: 'DECIMAL(5,2) DEFAULT 100.00' },
            { table: 'print_node_machine_profiles', column: 'universal_synchronization', type: 'DECIMAL(5,2) DEFAULT 100.00' },
            { table: 'print_node_machine_profiles', column: 'reality_stability_index', type: 'DECIMAL(5,2) DEFAULT 100.00' },
            { table: 'print_node_machine_profiles', column: 'recursive_continuity', type: 'DECIMAL(5,2) DEFAULT 100.00' }
        ];

        for (const gm of realityMigrations) {
            try {
                const exists = await this.checkColumnExists(gm.table, gm.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${gm.table} ADD COLUMN ${gm.column} ${gm.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureRealityColumns:${gm.table}.${gm.column}`, err);
            }
        }

        // Ensure Phase 22 Omniversal/Singularity columns exist
        const singularityMigrations = [
            { table: 'manufacturing_dispatches', column: 'singularity_weight',       type: 'DECIMAL(5,2) DEFAULT 1.00' },
            { table: 'manufacturing_dispatches', column: 'omniversal_priority',       type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'causal_chain_id',           type: 'VARCHAR(64) NULL' },
            { table: 'manufacturing_dispatches', column: 'entropy_score',             type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'print_node_machine_profiles', column: 'dimensional_cluster_id', type: 'VARCHAR(64) NULL' },
            { table: 'print_node_machine_profiles', column: 'omniversal_coherence',   type: 'DECIMAL(5,2) DEFAULT 100.00' },
            { table: 'print_node_machine_profiles', column: 'transcendent_awareness', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'print_node_machine_profiles', column: 'singularity_stability',  type: 'DECIMAL(5,2) DEFAULT 100.00' }
        ];

        for (const gm of singularityMigrations) {
            try {
                const exists = await this.checkColumnExists(gm.table, gm.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${gm.table} ADD COLUMN ${gm.column} ${gm.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureSingularityColumns:${gm.table}.${gm.column}`, err);
            }
        }

        // Phase 23: Manufacturing Grid Geolocation Hardening
        const geolocationMigrations = [
            { table: 'printer_nodes', column: 'region',       type: 'VARCHAR(128) NULL' },
            { table: 'printer_nodes', column: 'latitude',     type: 'DECIMAL(10, 8) NULL' },
            { table: 'printer_nodes', column: 'longitude',    type: 'DECIMAL(11, 8) NULL' },
            { table: 'printer_nodes', column: 'timezone',     type: 'VARCHAR(64) NULL' },
            { table: 'printer_nodes', column: 'address_line', type: 'TEXT NULL' },
            { table: 'printer_nodes', column: 'federation_id', type: 'VARCHAR(64) NULL' },
            { table: 'printer_nodes', column: 'cluster_id',    type: 'VARCHAR(64) NULL' }
        ];

        for (const gm of geolocationMigrations) {
            try {
                const exists = await this.checkColumnExists(gm.table, gm.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${gm.table} ADD COLUMN ${gm.column} ${gm.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureGeolocationColumns:${gm.table}.${gm.column}`, err);
            }
        }

        // Phase 34: Live Federation Agent Hardening
        const agentMigrations = [
            { table: 'printer_nodes', column: 'printer_api_key_hash', type: 'VARCHAR(255) NULL' },
            { table: 'printer_nodes', column: 'machine_state', type: 'VARCHAR(64) NULL' },
            { table: 'printer_nodes', column: 'worker_state', type: 'VARCHAR(64) NULL' },
            { table: 'printer_nodes', column: 'sync_version', type: 'VARCHAR(32) NULL' },
            { table: 'printer_nodes', column: 'queue_depth', type: 'INT DEFAULT 0' },
            { table: 'printer_nodes', column: 'active_jobs', type: 'INT DEFAULT 0' },
            { table: 'printer_nodes', column: 'capacity_utilization_pct', type: 'INT DEFAULT 0' },
            { table: 'printer_nodes', column: 'company_name', type: 'VARCHAR(255) NULL' },
            { table: 'print_nodes', column: 'active_jobs', type: 'INT DEFAULT 0' },
            { table: 'print_nodes', column: 'queue_depth', type: 'INT DEFAULT 0' },
            { table: 'print_nodes', column: 'region', type: 'VARCHAR(128) NULL' },
            { table: 'print_nodes', column: 'federation_id', type: 'VARCHAR(64) NULL' },
            { table: 'print_nodes', column: 'cluster_id', type: 'VARCHAR(64) NULL' },
            { table: 'print_nodes', column: 'latitude', type: 'DECIMAL(10, 8) NULL' },
            { table: 'print_nodes', column: 'longitude', type: 'DECIMAL(11, 8) NULL' }
        ];

        for (const gm of agentMigrations) {
            try {
                const exists = await this.checkColumnExists(gm.table, gm.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${gm.table} ADD COLUMN ${gm.column} ${gm.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureAgentColumns:${gm.table}.${gm.column}`, err);
            }
        }

        // Phase 1: Live Industrial Integration Columns (Real Topology & Performance)
        const industrialIntegrationMigrations = [
            { table: 'printer_nodes', column: 'supported_products', type: 'JSON NULL' },
            { table: 'printer_nodes', column: 'binding_capabilities', type: 'JSON NULL' },
            { table: 'printer_nodes', column: 'color_profiles', type: 'JSON NULL' },
            { table: 'printer_nodes', column: 'throughput', type: 'DECIMAL(12,2) DEFAULT 0.00' },
            { table: 'printer_nodes', column: 'uptime_score', type: 'DECIMAL(5,2) DEFAULT 100.00' },
            { table: 'printer_nodes', column: 'economic_efficiency', type: 'DECIMAL(5,2) DEFAULT 1.00' },
            { table: 'print_nodes', column: 'supported_products', type: 'JSON NULL' },
            { table: 'print_nodes', column: 'binding_capabilities', type: 'JSON NULL' },
            { table: 'print_nodes', column: 'color_profiles', type: 'JSON NULL' },
            { table: 'print_nodes', column: 'throughput', type: 'DECIMAL(12,2) DEFAULT 0.00' },
            { table: 'print_nodes', column: 'uptime_score', type: 'DECIMAL(5,2) DEFAULT 100.00' },
            { table: 'print_nodes', column: 'economic_efficiency', type: 'DECIMAL(5,2) DEFAULT 1.00' },
            { table: 'print_node_machine_profiles', column: 'throughput', type: 'DECIMAL(12,2) DEFAULT 0.00' },
            { table: 'print_node_machine_profiles', column: 'uptime_score', type: 'DECIMAL(5,2) DEFAULT 100.00' },
            { table: 'print_node_machine_profiles', column: 'economic_efficiency', type: 'DECIMAL(5,2) DEFAULT 1.00' }
        ];

        for (const gm of industrialIntegrationMigrations) {
            try {
                const exists = await this.checkColumnExists(gm.table, gm.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${gm.table} ADD COLUMN ${gm.column} ${gm.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureIndustrialIntegrationColumns:${gm.table}.${gm.column}`, err);
            }
        }

        // Phase 1: Live Dispatch Hardening (Economic, Forensic & Integration)
        const dispatchHardeningMigrations = [
            { table: 'manufacturing_dispatches', column: 'economic_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'profitability_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'energy_efficiency_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'evidence_snapshot_json', type: 'JSON NULL' },
            { table: 'manufacturing_dispatches', column: 'certification_state', type: 'VARCHAR(64) DEFAULT "PENDING"' },
            { table: 'manufacturing_dispatches', column: 'forensic_risk', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'autofix_state', type: 'VARCHAR(64) DEFAULT "NONE"' },
            { table: 'manufacturing_dispatches', column: 'artifact_count', type: 'INT DEFAULT 0' },
            { table: 'manufacturing_dispatches', column: 'certified_pdf_url', type: 'TEXT NULL' },
            { table: 'manufacturing_dispatches', column: 'normalized_pdf_url', type: 'TEXT NULL' }
        ];

        for (const gm of dispatchHardeningMigrations) {
            try {
                const exists = await this.checkColumnExists(gm.table, gm.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${gm.table} ADD COLUMN ${gm.column} ${gm.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureDispatchHardeningColumns:${gm.table}.${gm.column}`, err);
            }
        }

        // Phase 1: Capacity Reservation Hardening
        const capacityMigrations = [
            { table: 'manufacturing_capacity_reservations', column: 'utilization_snapshot', type: 'INT DEFAULT 0' }
        ];

        for (const gm of capacityMigrations) {
            try {
                const exists = await this.checkColumnExists(gm.table, gm.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${gm.table} ADD COLUMN ${gm.column} ${gm.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureCapacityHardeningColumns:${gm.table}.${gm.column}`, err);
            }
        }

        // Phase C: Industrial Event Orchestration Hardening
        const eventOrchestrationMigrations = [
            { table: 'manufacturing_dispatch_events', column: 'trace_id', type: 'VARCHAR(64) NULL' },
            { table: 'manufacturing_dispatch_events', column: 'correlation_id', type: 'VARCHAR(64) NULL' },
            { table: 'manufacturing_dispatch_events', column: 'source_service', type: 'VARCHAR(128) NULL' },
            { table: 'manufacturing_dispatch_events', column: 'routing_reason', type: 'VARCHAR(255) NULL' },
            { table: 'manufacturing_dispatch_events', column: 'orchestration_metadata', type: 'JSON NULL' },
            { table: 'federation_factories', column: 'company_name', type: 'VARCHAR(255) NULL' }
        ];

        for (const gm of eventOrchestrationMigrations) {
            try {
                const exists = await this.checkColumnExists(gm.table, gm.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${gm.table} ADD COLUMN ${gm.column} ${gm.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureEventOrchestrationColumns:${gm.table}.${gm.column}`, err);
            }
        }

        for (const table of coreTables) {
            try {
                await db.query(table.sql);
            } catch (err) {
                this._logStepError(`ensureCoreColumns:table:${table.name}`, err);
                throw err;
            }
        }

        // Phase 34: Live Capacity Snapshots
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS live_capacity_snapshots (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    node_id VARCHAR(64) NOT NULL,
                    status VARCHAR(32),
                    utilization_pct INT,
                    freshness_state VARCHAR(32),
                    routing_eligible BOOLEAN,
                    saturation_risk VARCHAR(32),
                    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_node (node_id),
                    INDEX idx_captured (captured_at)
                ) ENGINE=InnoDB;
            `);
        } catch (err) {
            this._logStepError('createLiveCapacitySnapshots', err);
        }

        // Phase 34: Immutable Evidence Ledger
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS production_evidence_ledger (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    dispatch_id VARCHAR(64) NOT NULL,
                    node_id VARCHAR(64),
                    tenant_id VARCHAR(64),
                    evidence_type VARCHAR(64) NOT NULL,
                    payload_json JSON NOT NULL,
                    hash VARCHAR(64) NOT NULL,
                    previous_hash VARCHAR(64),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_dispatch (dispatch_id),
                    INDEX idx_evidence_type (evidence_type)
                ) ENGINE=InnoDB;
            `);
        } catch (err) {
            this._logStepError('createProductionEvidenceLedger', err);
        }

        // Phase 34: Live SLA Evidence Snapshots
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS sla_evidence_snapshots (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    dispatch_id VARCHAR(64) NOT NULL,
                    promised_delivery_at DATETIME,
                    estimated_completion_at DATETIME,
                    sla_drift_minutes INT DEFAULT 0,
                    risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'LOW',
                    evidence_count INT DEFAULT 0,
                    last_node_seen_at TIMESTAMP NULL,
                    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_dispatch (dispatch_id),
                    INDEX idx_risk (risk_level)
                ) ENGINE=InnoDB;
            `);
        } catch (err) {
            this._logStepError('createSlaEvidenceSnapshots', err);
        }

        // Phase 16: Federation Factories (Industrial Hubs) - REQUIRED for Registry Seeding
        try {
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
                ) ENGINE=InnoDB;
            `);
        } catch (err) {
            this._logStepError('createFederationFactories', err);
        }

        // Phase 34: Autonomous Routing Infrastructure
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS routing_decisions (
                    id VARCHAR(64) PRIMARY KEY,
                    job_id VARCHAR(64),
                    selected_machine_id VARCHAR(64),
                    routing_score DECIMAL(5,2),
                    explanation TEXT,
                    status ENUM('PENDING', 'COMMITTED', 'REJECTED') DEFAULT 'PENDING',
                    metadata_json JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_job (job_id),
                    INDEX idx_machine (selected_machine_id)
                ) ENGINE=InnoDB;
            `);
            
            await db.query(`
                CREATE TABLE IF NOT EXISTS routing_scores (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    decision_id VARCHAR(64) NOT NULL,
                    cost_score DECIMAL(5,2),
                    time_score DECIMAL(5,2),
                    capability_score DECIMAL(5,2),
                    risk_score DECIMAL(5,2),
                    geographic_score DECIMAL(5,2),
                    carbon_score DECIMAL(5,2),
                    total_score DECIMAL(5,2),
                    INDEX idx_decision (decision_id)
                ) ENGINE=InnoDB;
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS routing_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    job_id VARCHAR(64),
                    action VARCHAR(128),
                    details_json JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_job (job_id)
                ) ENGINE=InnoDB;
            `);
        } catch (err) {
            this._logStepError('createRoutingInfrastructure', err);
        }

        return ensured;
    }

    async checkColumnExists(table, column) {
        const rows = await db.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = ?
        `, [table, column]);
        return rows.length > 0;
    }

    /**
     * Syncs ACTIVE printer_nodes into print_nodes.
     */
    async syncPrinterNodesToPrintNodes() {
        logger.info({ event: 'provisioning_step_start', step: 'syncPrinterNodesToPrintNodes' });
        const printerNodes = await db.query("SELECT * FROM printer_nodes WHERE status = 'ACTIVE'");
        let synced = 0;

        for (const pn of printerNodes) {
            try {
                await db.query(`
                    INSERT INTO print_nodes (
                        id, tenant_id, company_name, status, license_status, country, city, region,
                        capabilities_json, machine_profile_json, supported_policies_json,
                        max_file_size_mb, api_enabled, rates_json,
                        supported_products, binding_capabilities, color_profiles,
                        throughput, uptime_score, economic_efficiency,
                        federation_id, cluster_id, active_jobs, queue_depth,
                        latitude, longitude
                    ) VALUES (?, ?, ?, 'ONLINE', 'ACTIVE', ?, ?, ?, ?, ?, ?, 500, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        company_name = VALUES(company_name),
                        country = VALUES(country),
                        city = VALUES(city),
                        region = VALUES(region),
                        rates_json = VALUES(rates_json),
                        supported_products = VALUES(supported_products),
                        binding_capabilities = VALUES(binding_capabilities),
                        color_profiles = VALUES(color_profiles),
                        throughput = VALUES(throughput),
                        uptime_score = VALUES(uptime_score),
                        economic_efficiency = VALUES(economic_efficiency),
                        federation_id = VALUES(federation_id),
                        cluster_id = VALUES(cluster_id),
                        active_jobs = VALUES(active_jobs),
                        queue_depth = VALUES(queue_depth),
                        latitude = VALUES(latitude),
                        longitude = VALUES(longitude)
                `, [
                    pn.id, pn.tenant_id, pn.company_name || pn.name || 'Industrial Node', pn.country || null, pn.city || null, pn.region || null,
                    this.normalizeJsonForMysql(pn.capabilities_json, {}),
                    this.normalizeJsonForMysql(pn.machine_profile_json, {}),
                    this.normalizeJsonForMysql(pn.supported_policies_json, []),
                    this.normalizeJsonForMysql(pn.rates_json, {}),
                    this.normalizeJsonForMysql(pn.supported_products, []),
                    this.normalizeJsonForMysql(pn.binding_capabilities, []),
                    this.normalizeJsonForMysql(pn.color_profiles, []),
                    pn.throughput || 0.00, pn.uptime_score || 100.00, pn.economic_efficiency || 1.00,
                    pn.federation_id || null, pn.cluster_id || null,
                    pn.active_jobs || 0, pn.queue_depth || 0,
                    pn.latitude || null, pn.longitude || null
                ]);
                synced++;
            } catch (err) {
                this._logStepError(`syncPrinterNodesToPrintNodes:node:${pn.id}`, err);
                // We continue with other nodes
            }
        }
        return synced;
    }

    /**
     * Creates one primary machine per ONLINE print_node.
     */
    async discoverMachineProfiles() {
        logger.info({ event: 'provisioning_step_start', step: 'discoverMachineProfiles' });
        const nodes = await db.query("SELECT * FROM print_nodes WHERE status = 'ONLINE'");
        let discovered = 0;

        for (const node of nodes) {
            try {
                const machineId = `machine_${node.id}_primary`;
                const profile = typeof node.machine_profile_json === 'string' 
                    ? JSON.parse(node.machine_profile_json) 
                    : (node.machine_profile_json || {});

                await machineRegistry.registerMachine(node.id, {
                    id: machineId,
                    profile_name: `${node.company_name} Primary Press`,
                    manufacturer: 'Generic',
                    model: 'Offset/Web Production Line',
                    profile_type: 'PRIMARY_PRESS',
                    raw_data_json: profile
                });
                discovered++;
            } catch (err) {
                this._logStepError(`discoverMachineProfiles:node:${node.id}`, err);
            }
        }
        return discovered;
    }

    /**
     * Seeds PRINTER-scope pricing profiles per ACTIVE printer_node.
     */
    async seedPricingProfiles() {
        logger.info({ event: 'provisioning_step_start', step: 'seedPricingProfiles' });
        const printerNodes = await db.query("SELECT * FROM printer_nodes WHERE status = 'ACTIVE'");
        let seeded = 0;

        for (const pn of printerNodes) {
            try {
                const rates = typeof pn.rates_json === 'string' ? JSON.parse(pn.rates_json) : (pn.rates_json || {});
                
                const baseCost = rates.interior_full_colour_var_16p || rates.interior_full_colour_var_8p || 0.05;
                const setupCost = rates.interior_full_colour_fixed_16p || rates.interior_full_colour_fixed_8p || 50.00;

                const profileId = `pricing_${pn.id}_printer`;

                await db.query(`
                    INSERT INTO printer_pricing_profiles (
                        id, printer_id, pricing_scope, currency, active,
                        base_cost_per_sheet, setup_cost, color_multiplier,
                        tac_penalty_multiplier, bleed_handling_cost, minimum_job_fee,
                        rush_multiplier, lead_time_discount_multiplier
                ) VALUES (?, ?, 'PRINTER', 'EUR', 1, ?, ?, 1.2, 1.1, 5.00, 150.00, 1.2, 0.95)
                ON DUPLICATE KEY UPDATE
                    base_cost_per_sheet = VALUES(base_cost_per_sheet),
                    setup_cost = VALUES(setup_cost)
            `, [
                profileId, pn.id, baseCost, setupCost
            ]);
            seeded++;
        } catch (err) {
                this._logStepError(`seedPricingProfiles:node:${pn.id}`, err);
            }
        }
        return seeded;
    }

    /**
     * Seeds deterministic federation factories for Phase 16 validation.
     */
    async seedFederationFactories() {
        logger.info({ event: 'provisioning_step_start', step: 'seedFederationFactories' });
        const federationRegistry = require('./federationRegistryService');
        
        const demoFactories = [
            {
                id: 'factory_eu_west_01',
                company_name: 'EU West Production Hub',
                factory_name: 'EU West Production Hub',
                region: 'eu-west',
                timezone: 'Europe/Dublin',
                specialization: 'OFFSET_HIGH_VOLUME',
                capacity_index: 85,
                reliability_index: 98,
                latency_score: 12,
                economic_score: 92,
                energy_score: 88,
                federation_state: 'ACTIVE'
            },
            {
                id: 'factory_baltic_01',
                company_name: 'Baltic Logistics Center',
                factory_name: 'Baltic Logistics Center',
                region: 'eu-north',
                timezone: 'Europe/Tallinn',
                specialization: 'DIGITAL_FAST_TRACK',
                capacity_index: 40,
                reliability_index: 95,
                latency_score: 45,
                economic_score: 95,
                energy_score: 90,
                federation_state: 'ACTIVE'
            },
            {
                id: 'factory_us_east_01',
                company_name: 'US East Edge Factory',
                factory_name: 'US East Edge Factory',
                region: 'us-east',
                timezone: 'America/New_York',
                specialization: 'LARGE_FORMAT_INDUSTRIAL',
                capacity_index: 60,
                reliability_index: 92,
                latency_score: 85,
                economic_score: 88,
                energy_score: 75,
                federation_state: 'ACTIVE'
            }
        ];

        let seeded = 0;
        for (const f of demoFactories) {
            try {
                await federationRegistry.registerFactory(f);
                seeded++;
            } catch (err) {
                this._logStepError(`seedFederationFactories:factory:${f.id}`, err);
            }
        }
        return seeded;
    }

    /**
     * Collection of row counts for diagnostic visibility.
     */
    async getSourceCounts() {
        const tables = [
            'printer_nodes',
            'print_nodes',
            'print_node_machine_profiles',
            'printer_pricing_profiles',
            'manufacturing_dispatches',
            'manufacturing_capacity_reservations',
            'manufacturing_dispatch_events',
            'federation_factories'
        ];

        const counts = {};
        for (const table of tables) {
            try {
                const rows = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
                counts[table] = rows[0]?.count ?? 0;
            } catch (err) {
                counts[table] = -1; // Indicate error fetching count
            }
        }
        return counts;
    }


    async getProvisioningStatus() {
        const counts = await this.getSourceCounts();
        const [capacityRows] = await db.query("SELECT COUNT(*) as count FROM printer_capacity_state");
        const [reliabilityRows] = await db.query("SELECT COUNT(*) as count FROM printer_reliability_metrics");

        return {
            printerNodes: counts.printer_nodes,
            printNodes: counts.print_nodes,
            machineProfiles: counts.print_node_machine_profiles,
            pricingProfiles: counts.printer_pricing_profiles,
            capacityProfiles: capacityRows.count,
            reliabilityProfiles: reliabilityRows.count,
            manufacturingDispatches: counts.manufacturing_dispatches,
            jobsHasMetadataJson: await this.checkColumnExists('jobs', 'metadata_json'),
            metricsHasMetadataJson: await this.checkColumnExists('metrics', 'metadata_json'),
            missingColumns: []
        };
    }
}

module.exports = new IndustrialProvisioningService();
