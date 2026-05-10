/**
 * src/api/services/industrialProvisioningService.js
 * 
 * Idempotent provisioning layer for industrial operations.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('provisioning-service');
const machineRegistry = require('./machineRegistryService');

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
     * Ensures all core operational columns exist.
     */
    async ensureCoreColumns() {
        logger.info({ event: 'provisioning_step_start', step: 'ensureCoreColumns' });
        const migrations = [
            { table: 'jobs', column: 'metadata_json', type: 'JSON NULL' },
            { table: 'metrics', column: 'metadata_json', type: 'JSON NULL' },
            { table: 'print_node_machine_profiles', column: 'manufacturer', type: 'VARCHAR(128) NULL' },
            { table: 'print_node_machine_profiles', column: 'model', type: 'VARCHAR(128) NULL' },
            { table: 'print_node_machine_profiles', column: 'status', type: "ENUM('ACTIVE', 'MAINTENANCE', 'OFFLINE') DEFAULT 'ACTIVE'" },
            { table: 'print_node_machine_profiles', column: 'normalized_capabilities_json', type: 'JSON NULL' },
            { table: 'jobs', column: 'federation_id', type: 'VARCHAR(64) NULL' },
            { table: 'jobs', column: 'regional_priority', type: 'INT DEFAULT 0' },
            { table: 'jobs', column: 'swarm_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'federation_id', type: 'VARCHAR(64) NULL' },
            { table: 'manufacturing_dispatches', column: 'delegated_from_factory', type: 'VARCHAR(64) NULL' },
            { table: 'manufacturing_dispatches', column: 'delegated_to_factory', type: 'VARCHAR(64) NULL' },
            { table: 'print_node_machine_profiles', column: 'federation_state', type: "ENUM('LOCAL', 'FEDERATED', 'ISOLATED') DEFAULT 'LOCAL'" },
            { table: 'print_node_machine_profiles', column: 'swarm_score', type: 'DECIMAL(5,2) DEFAULT 0.00' }
        ];

        // Ensure status enum is updated for Phase 12
        try {
            await db.query(`
                ALTER TABLE manufacturing_dispatches 
                MODIFY COLUMN status ENUM(
                    'QUEUED','RECOMMENDED','ASSIGNED','ACCEPTED','PREPARING',
                    'PRINTING','BINDING','PACKAGING','SHIPPED','DELIVERED',
                    'FAILED','REROUTED','CANCELED',
                    'AUTO_ASSIGNED', 'AUTO_REROUTED', 'SLA_AT_RISK', 'CAPACITY_BLOCKED'
                ) DEFAULT 'QUEUED'
            `);
        } catch (err) {
            // Might fail if table doesn't exist yet, which is fine since CREATE TABLE will use the new definition
            logger.debug({ event: 'migration_enum_skip', message: err.message });
        }

        let ensured = 0;
        for (const m of migrations) {
            try {
                const exists = await this.checkColumnExists(m.table, m.column);
                if (!exists) {
                    logger.info({ event: 'migration_exec', table: m.table, column: m.column });
                    await db.query(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureCoreColumns:${m.table}.${m.column}`, err);
                throw err;
            }
        }

        const coreTables = [
            {
                name: 'printer_capacity_state',
                sql: `CREATE TABLE IF NOT EXISTS printer_capacity_state (
                    printer_id VARCHAR(64) PRIMARY KEY,
                    active_jobs INT DEFAULT 0,
                    queued_jobs INT DEFAULT 0,
                    utilization_percent DECIMAL(5,2) DEFAULT 0.00,
                    maintenance_mode BOOLEAN DEFAULT FALSE,
                    estimated_completion_hours DECIMAL(10,2) DEFAULT 0.00,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_utilization (utilization_percent)
                ) ENGINE=InnoDB;`
            },
            {
                name: 'printer_reliability_metrics',
                sql: `CREATE TABLE IF NOT EXISTS printer_reliability_metrics (
                    printer_id VARCHAR(64) PRIMARY KEY,
                    completed_jobs INT DEFAULT 0,
                    failed_jobs INT DEFAULT 0,
                    avg_turnaround_hours DECIMAL(10,2) DEFAULT 0.00,
                    autofix_success_rate DECIMAL(5,2) DEFAULT 0.00,
                    certification_failures INT DEFAULT 0,
                    reprint_rate DECIMAL(5,2) DEFAULT 0.00,
                    reliability_score DECIMAL(5,2) DEFAULT 0.00,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_score (reliability_score)
                ) ENGINE=InnoDB;`
            },
            {
                name: 'manufacturing_dispatches',
                sql: `CREATE TABLE IF NOT EXISTS manufacturing_dispatches (
                    id VARCHAR(64) PRIMARY KEY,
                    job_id VARCHAR(64) NOT NULL,
                    node_id VARCHAR(64) NOT NULL,
                    machine_id VARCHAR(64) NULL,
                    status ENUM(
                        'QUEUED','RECOMMENDED','ASSIGNED','ACCEPTED','PREPARING',
                        'PRINTING','BINDING','PACKAGING','SHIPPED','DELIVERED',
                        'FAILED','REROUTED','CANCELED',
                        'AUTO_ASSIGNED', 'AUTO_REROUTED', 'SLA_AT_RISK', 'CAPACITY_BLOCKED'
                    ) DEFAULT 'QUEUED',
                    estimated_cost DECIMAL(12,2) NULL,
                    estimated_margin DECIMAL(8,2) NULL,
                    sla_hours INT NULL,
                    reserved_from TIMESTAMP NULL,
                    reserved_until TIMESTAMP NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_job (job_id),
                    INDEX idx_status (status),
                    INDEX idx_node (node_id)
                ) ENGINE=InnoDB;`
            },
            {
                name: 'manufacturing_capacity_reservations',
                sql: `CREATE TABLE IF NOT EXISTS manufacturing_capacity_reservations (
                    id VARCHAR(64) PRIMARY KEY,
                    dispatch_id VARCHAR(64) NOT NULL,
                    job_id VARCHAR(64) NOT NULL,
                    node_id VARCHAR(64) NOT NULL,
                    machine_id VARCHAR(64) NULL,
                    reserved_units INT DEFAULT 1,
                    reserved_from TIMESTAMP NULL,
                    reserved_until TIMESTAMP NULL,
                    reservation_status ENUM('ACTIVE','EXPIRED','CONFIRMED','CANCELLED','RELEASED') DEFAULT 'ACTIVE',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_dispatch (dispatch_id),
                    INDEX idx_machine (machine_id),
                    INDEX idx_range (reserved_from, reserved_until)
                ) ENGINE=InnoDB;`
            },
            {
                name: 'manufacturing_dispatch_events',
                sql: `CREATE TABLE IF NOT EXISTS manufacturing_dispatch_events (
                    id VARCHAR(64) PRIMARY KEY,
                    dispatch_id VARCHAR(64) NOT NULL,
                    event_type VARCHAR(64) NOT NULL,
                    old_status VARCHAR(64) NULL,
                    new_status VARCHAR(64) NULL,
                    message TEXT NULL,
                    metadata_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_dispatch (dispatch_id)
                ) ENGINE=InnoDB;`
            },
            {
                name: 'predictive_machine_metrics',
                sql: `CREATE TABLE IF NOT EXISTS predictive_machine_metrics (
                    machine_id VARCHAR(64) PRIMARY KEY,
                    node_id VARCHAR(64) NOT NULL,
                    predicted_failure_probability DECIMAL(5,4) DEFAULT 0.0000,
                    remaining_useful_life_hours INT NULL,
                    projected_maintenance_date TIMESTAMP NULL,
                    wear_index DECIMAL(5,2) DEFAULT 0.00,
                    last_prediction_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_node (node_id)
                ) ENGINE=InnoDB;`
            },
            {
                name: 'predictive_material_inventory',
                sql: `CREATE TABLE IF NOT EXISTS predictive_material_inventory (
                    id VARCHAR(64) PRIMARY KEY,
                    node_id VARCHAR(64) NOT NULL,
                    material_type VARCHAR(64) NOT NULL,
                    material_name VARCHAR(128) NOT NULL,
                    current_stock_units DECIMAL(12,2) DEFAULT 0.00,
                    reserved_stock_units DECIMAL(12,2) DEFAULT 0.00,
                    stock_unit_name VARCHAR(32) DEFAULT 'units',
                    replenishment_lead_days INT DEFAULT 5,
                    reorder_point DECIMAL(12,2) DEFAULT 100.00,
                    forecasted_depletion_date TIMESTAMP NULL,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_node_material (node_id, material_type)
                ) ENGINE=InnoDB;`
            },
            {
                name: 'predictive_dispatch_risk',
                sql: `CREATE TABLE IF NOT EXISTS predictive_dispatch_risk (
                    dispatch_id VARCHAR(64) PRIMARY KEY,
                    job_id VARCHAR(64) NOT NULL,
                    risk_score DECIMAL(5,2) DEFAULT 0.00,
                    risk_level ENUM('LOW', 'MODERATE', 'HIGH', 'CRITICAL') DEFAULT 'LOW',
                    breach_probability DECIMAL(5,4) DEFAULT 0.0000,
                    contributing_factors_json JSON NULL,
                    projected_delay_hours DECIMAL(8,2) DEFAULT 0.00,
                    last_scored_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_job (job_id),
                    INDEX idx_risk (risk_score)
                ) ENGINE=InnoDB;`
            },
            {
                name: 'predictive_capacity_forecasts',
                sql: `CREATE TABLE IF NOT EXISTS predictive_capacity_forecasts (
                    id VARCHAR(64) PRIMARY KEY,
                    node_id VARCHAR(64) NOT NULL,
                    machine_id VARCHAR(64) NULL,
                    forecast_date DATE NOT NULL,
                    projected_saturation_percent DECIMAL(5,2) DEFAULT 0.00,
                    projected_queue_depth INT DEFAULT 0,
                    bottleneck_risk_level ENUM('STABLE', 'STRESSED', 'SATURATED') DEFAULT 'STABLE',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_node_date (node_id, forecast_date)
                ) ENGINE=InnoDB;`
            },
            {
                name: 'industrial_digital_twin_snapshots',
                sql: `CREATE TABLE IF NOT EXISTS industrial_digital_twin_snapshots (
                    id VARCHAR(64) PRIMARY KEY,
                    snapshot_type ENUM('PERIODIC', 'ON_ANOMALY', 'MANUAL') DEFAULT 'PERIODIC',
                    active_dispatches_count INT DEFAULT 0,
                    avg_saturation_percent DECIMAL(5,2) DEFAULT 0.00,
                    bottleneck_count INT DEFAULT 0,
                    material_risk_count INT DEFAULT 0,
                    avg_anomaly_score DECIMAL(5,2) DEFAULT 0.00,
                    global_stability_index DECIMAL(5,2) DEFAULT 100.00,
                    telemetry_snapshot_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_created (created_at)
                ) ENGINE=InnoDB;`
            },
            {
                name: 'federation_factories',
                sql: `CREATE TABLE IF NOT EXISTS federation_factories (
                    id VARCHAR(64) PRIMARY KEY,
                    factory_name VARCHAR(128) NOT NULL,
                    region VARCHAR(64) NOT NULL,
                    timezone VARCHAR(64) DEFAULT 'UTC',
                    specialization VARCHAR(128) NULL,
                    capacity_index DECIMAL(5,2) DEFAULT 0.00,
                    reliability_index DECIMAL(5,2) DEFAULT 0.00,
                    latency_score INT DEFAULT 0,
                    economic_score DECIMAL(5,2) DEFAULT 0.00,
                    energy_score DECIMAL(5,2) DEFAULT 0.00,
                    federation_state ENUM('ACTIVE', 'DEGRADED', 'OFFLINE', 'RECOVERING') DEFAULT 'ACTIVE',
                    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'federated_digital_twin_snapshots',
                sql: `CREATE TABLE IF NOT EXISTS federated_digital_twin_snapshots (
                    id VARCHAR(64) PRIMARY KEY,
                    snapshot_type ENUM('PERIODIC', 'ON_ANOMALY', 'MANUAL') DEFAULT 'PERIODIC',
                    global_utilization DECIMAL(5,2) DEFAULT 0.00,
                    federation_stability DECIMAL(5,2) DEFAULT 0.00,
                    inter_factory_imbalance DECIMAL(5,2) DEFAULT 0.00,
                    economic_efficiency DECIMAL(5,2) DEFAULT 0.00,
                    swarm_resilience_index DECIMAL(5,2) DEFAULT 100.00,
                    telemetry_snapshot_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'federation_recovery_events',
                sql: `CREATE TABLE IF NOT EXISTS federation_recovery_events (
                    id VARCHAR(64) PRIMARY KEY,
                    factory_id VARCHAR(64) NOT NULL,
                    event_type VARCHAR(64) NOT NULL,
                    severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
                    action_taken TEXT NULL,
                    recovery_status ENUM('PENDING', 'ACTIVE', 'RESOLVED') DEFAULT 'PENDING',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'swarm_consensus_events',
                sql: `CREATE TABLE IF NOT EXISTS swarm_consensus_events (
                    id VARCHAR(64) PRIMARY KEY,
                    decision_type VARCHAR(64) NOT NULL,
                    consensus_score DECIMAL(5,2) DEFAULT 0.00,
                    confidence_score DECIMAL(5,2) DEFAULT 0.00,
                    decision_json JSON NULL,
                    rejected_factories_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'distributed_dispatch_delegations',
                sql: `CREATE TABLE IF NOT EXISTS distributed_dispatch_delegations (
                    id VARCHAR(64) PRIMARY KEY,
                    dispatch_id VARCHAR(64) NOT NULL,
                    from_factory_id VARCHAR(64) NOT NULL,
                    to_factory_id VARCHAR(64) NOT NULL,
                    delegation_reason TEXT NULL,
                    delegation_status ENUM('PENDING', 'ACCEPTED', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'economic_digital_twin_snapshots',
                sql: `CREATE TABLE IF NOT EXISTS economic_digital_twin_snapshots (
                    id VARCHAR(64) PRIMARY KEY,
                    snapshot_type ENUM('PERIODIC', 'ON_OPTIMIZATION', 'MANUAL') DEFAULT 'PERIODIC',
                    global_utilization_percent DECIMAL(5,2) DEFAULT 0.00,
                    global_profitability_index DECIMAL(5,2) DEFAULT 0.00,
                    global_energy_efficiency_score DECIMAL(5,2) DEFAULT 0.00,
                    network_imbalance_index DECIMAL(5,2) DEFAULT 0.00,
                    total_estimated_margin DECIMAL(12,2) DEFAULT 0.00,
                    economic_waste_prediction DECIMAL(12,2) DEFAULT 0.00,
                    telemetry_snapshot_json JSON NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_created (created_at)
                ) ENGINE=InnoDB;`
            },
            {
                name: 'marketplace_capacity_offers',
                sql: `CREATE TABLE IF NOT EXISTS marketplace_capacity_offers (
                    id VARCHAR(64) PRIMARY KEY,
                    factory_id VARCHAR(64) NOT NULL,
                    capacity_type VARCHAR(64) NOT NULL,
                    available_slots INT DEFAULT 0,
                    min_margin_score DECIMAL(5,2) DEFAULT 0.00,
                    status ENUM('ACTIVE', 'CLOSED', 'EXPIRED') DEFAULT 'ACTIVE',
                    expires_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'marketplace_dispatch_auctions',
                sql: `CREATE TABLE IF NOT EXISTS marketplace_dispatch_auctions (
                    id VARCHAR(64) PRIMARY KEY,
                    dispatch_id VARCHAR(64) NOT NULL,
                    starting_bid DECIMAL(12,2) DEFAULT 0.00,
                    max_acceptable_bid DECIMAL(12,2) DEFAULT 0.00,
                    winning_factory_id VARCHAR(64) NULL,
                    status ENUM('OPEN', 'CLOSED', 'CANCELLED') DEFAULT 'OPEN',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'federation_trade_ledger',
                sql: `CREATE TABLE IF NOT EXISTS federation_trade_ledger (
                    id VARCHAR(64) PRIMARY KEY,
                    source_factory_id VARCHAR(64) NOT NULL,
                    target_factory_id VARCHAR(64) NOT NULL,
                    dispatch_id VARCHAR(64) NOT NULL,
                    margin_transferred DECIMAL(12,2) DEFAULT 0.00,
                    status ENUM('PENDING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'capacity_exchange_reservations',
                sql: `CREATE TABLE IF NOT EXISTS capacity_exchange_reservations (
                    id VARCHAR(64) PRIMARY KEY,
                    source_factory_id VARCHAR(64) NOT NULL,
                    target_factory_id VARCHAR(64) NOT NULL,
                    reserved_slots INT DEFAULT 0,
                    status ENUM('PENDING', 'ACCEPTED', 'REJECTED') DEFAULT 'PENDING',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'marketplace_economic_snapshots',
                sql: `CREATE TABLE IF NOT EXISTS marketplace_economic_snapshots (
                    id VARCHAR(64) PRIMARY KEY,
                    liquidity_index DECIMAL(5,2) DEFAULT 0.00,
                    trade_velocity INT DEFAULT 0,
                    economic_pressure DECIMAL(5,2) DEFAULT 0.00,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'autonomous_factory_bids',
                sql: `CREATE TABLE IF NOT EXISTS autonomous_factory_bids (
                    id VARCHAR(64) PRIMARY KEY,
                    factory_id VARCHAR(64) NOT NULL,
                    auction_id VARCHAR(64) NOT NULL,
                    bid_amount DECIMAL(12,2) DEFAULT 0.00,
                    margin_score DECIMAL(5,2) DEFAULT 0.00,
                    confidence_score DECIMAL(5,2) DEFAULT 0.00,
                    status ENUM('SUBMITTED', 'ACCEPTED', 'REJECTED') DEFAULT 'SUBMITTED',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'industrial_governance_policies',
                sql: `CREATE TABLE IF NOT EXISTS industrial_governance_policies (
                    id VARCHAR(64) PRIMARY KEY,
                    policy_name VARCHAR(128),
                    status ENUM('ACTIVE', 'DEPRECATED') DEFAULT 'ACTIVE',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'industrial_policy_generations',
                sql: `CREATE TABLE IF NOT EXISTS industrial_policy_generations (
                    id VARCHAR(64) PRIMARY KEY,
                    generation_index INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'industrial_constitution_constraints',
                sql: `CREATE TABLE IF NOT EXISTS industrial_constitution_constraints (
                    id VARCHAR(64) PRIMARY KEY,
                    constraint_name VARCHAR(128),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'industrial_memory_graph',
                sql: `CREATE TABLE IF NOT EXISTS industrial_memory_graph (
                    id VARCHAR(64) PRIMARY KEY,
                    event_type VARCHAR(64),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'governance_digital_twin_snapshots',
                sql: `CREATE TABLE IF NOT EXISTS governance_digital_twin_snapshots (
                    id VARCHAR(64) PRIMARY KEY,
                    health_score DECIMAL(5,2),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'industrial_federated_learning',
                sql: `CREATE TABLE IF NOT EXISTS industrial_federated_learning (
                    id VARCHAR(64) PRIMARY KEY,
                    model_version VARCHAR(64),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'governance_simulation_results',
                sql: `CREATE TABLE IF NOT EXISTS governance_simulation_results (
                    id VARCHAR(64) PRIMARY KEY,
                    simulation_name VARCHAR(128),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'industrial_ethics_events',
                sql: `CREATE TABLE IF NOT EXISTS industrial_ethics_events (
                    id VARCHAR(64) PRIMARY KEY,
                    event_type VARCHAR(128),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'recursive_optimization_cycles',
                sql: `CREATE TABLE IF NOT EXISTS recursive_optimization_cycles (
                    id VARCHAR(64) PRIMARY KEY,
                    cycle_index INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'industrial_cognition_snapshots',
                sql: `CREATE TABLE IF NOT EXISTS industrial_cognition_snapshots (
                    id VARCHAR(64) PRIMARY KEY,
                    awareness_score DECIMAL(5,2),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'planetary_federations',
                sql: `CREATE TABLE IF NOT EXISTS planetary_federations (
                    id VARCHAR(64) PRIMARY KEY,
                    federation_name VARCHAR(128),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'continental_industrial_clusters',
                sql: `CREATE TABLE IF NOT EXISTS continental_industrial_clusters (
                    id VARCHAR(64) PRIMARY KEY,
                    cluster_name VARCHAR(128),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'civilization_digital_twin_snapshots',
                sql: `CREATE TABLE IF NOT EXISTS civilization_digital_twin_snapshots (
                    id VARCHAR(64) PRIMARY KEY,
                    health_score DECIMAL(5,2),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'planetary_resource_forecasts',
                sql: `CREATE TABLE IF NOT EXISTS planetary_resource_forecasts (
                    id VARCHAR(64) PRIMARY KEY,
                    resource_type VARCHAR(64),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'inter_federation_diplomacy',
                sql: `CREATE TABLE IF NOT EXISTS inter_federation_diplomacy (
                    id VARCHAR(64) PRIMARY KEY,
                    negotiation_status VARCHAR(64),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'industrial_expansion_zones',
                sql: `CREATE TABLE IF NOT EXISTS industrial_expansion_zones (
                    id VARCHAR(64) PRIMARY KEY,
                    zone_name VARCHAR(128),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'civilization_stability_events',
                sql: `CREATE TABLE IF NOT EXISTS civilization_stability_events (
                    id VARCHAR(64) PRIMARY KEY,
                    event_type VARCHAR(128),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'planetary_risk_forecasts',
                sql: `CREATE TABLE IF NOT EXISTS planetary_risk_forecasts (
                    id VARCHAR(64) PRIMARY KEY,
                    risk_level VARCHAR(64),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'industrial_colonization_targets',
                sql: `CREATE TABLE IF NOT EXISTS industrial_colonization_targets (
                    id VARCHAR(64) PRIMARY KEY,
                    target_name VARCHAR(128),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            },
            {
                name: 'planetary_cognition_snapshots',
                sql: `CREATE TABLE IF NOT EXISTS planetary_cognition_snapshots (
                    id VARCHAR(64) PRIMARY KEY,
                    awareness_score DECIMAL(5,2),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;`
            }
        ];

        // Ensure economic optimization columns exist
        const economicMigrations = [
            { table: 'manufacturing_dispatches', column: 'economic_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'profitability_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'energy_efficiency_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'print_node_machine_profiles', column: 'industrial_efficiency_score', type: 'DECIMAL(5,2) DEFAULT 0.00' }
        ];

        for (const em of economicMigrations) {
            try {
                const exists = await this.checkColumnExists(em.table, em.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${em.table} ADD COLUMN ${em.column} ${em.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureEconomicColumns:${em.table}.${em.column}`, err);
            }
        }

        // Ensure anomaly score columns exist
        const anomalyMigrations = [
            { table: 'manufacturing_dispatches', column: 'anomaly_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'print_node_machine_profiles', column: 'historical_throughput_baseline', type: 'DECIMAL(12,2) DEFAULT 0.00' },
            { table: 'print_node_machine_profiles', column: 'current_drift_score', type: 'DECIMAL(5,2) DEFAULT 0.00' }
        ];

        for (const am of anomalyMigrations) {
            try {
                const exists = await this.checkColumnExists(am.table, am.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${am.table} ADD COLUMN ${am.column} ${am.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureAnomalyColumns:${am.table}.${am.column}`, err);
            }
        }

        // Ensure Phase 17 Marketplace columns exist
        const marketplaceMigrations = [
            { table: 'manufacturing_dispatches', column: 'marketplace_bid_id', type: 'VARCHAR(64) NULL' },
            { table: 'manufacturing_dispatches', column: 'delegated_factory_id', type: 'VARCHAR(64) NULL' },
            { table: 'manufacturing_dispatches', column: 'federated_margin_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'manufacturing_dispatches', column: 'exchange_priority_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'print_node_machine_profiles', column: 'marketplace_reputation', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'print_node_machine_profiles', column: 'liquidity_score', type: 'DECIMAL(5,2) DEFAULT 0.00' },
            { table: 'print_node_machine_profiles', column: 'economic_efficiency_rank', type: 'INT DEFAULT 50' }
        ];

        for (const mm of marketplaceMigrations) {
            try {
                const exists = await this.checkColumnExists(mm.table, mm.column);
                if (!exists) {
                    await db.query(`ALTER TABLE ${mm.table} ADD COLUMN ${mm.column} ${mm.type}`);
                    ensured++;
                }
            } catch (err) {
                this._logStepError(`ensureMarketplaceColumns:${mm.table}.${mm.column}`, err);
            }
        }

        // Ensure Phase 18 Governance columns exist
        const governanceMigrations = [
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

        for (const table of coreTables) {
            try {
                await db.query(table.sql);
            } catch (err) {
                this._logStepError(`ensureCoreColumns:table:${table.name}`, err);
                throw err;
            }
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
                        id, tenant_id, company_name, status, license_status, country, city,
                        capabilities_json, machine_profile_json, supported_policies_json,
                        max_file_size_mb, api_enabled, rates_json
                    ) VALUES (?, ?, ?, 'ONLINE', 'ACTIVE', ?, ?, ?, ?, ?, 500, 0, ?)
                    ON DUPLICATE KEY UPDATE
                        company_name = VALUES(company_name),
                        country = VALUES(country),
                        city = VALUES(city),
                        rates_json = VALUES(rates_json)
                `, [
                    pn.id, pn.tenant_id, pn.company_name, pn.country || null, pn.city || null,
                    pn.capabilities_json || '{}', pn.machine_profile_json || '{}', 
                    pn.supported_policies_json || '[]', pn.rates_json || null
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

    /**
     * Runs full provisioning independently.
     */
    async runFullProvisioning() {
        const summary = {
            columnsEnsured: 0,
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
            summary.warnings.push(`Failed to fetch initial source counts: ${err.message}`);
        }

        // Step 1: Schema Hardening
        try {
            summary.columnsEnsured = await this.ensureCoreColumns();
        } catch (err) {
            summary.failedSteps.push('ensureCoreColumns');
            summary.warnings.push(`Schema hardening failed: ${err.message}`);
        }

        // Step 2: Node Sync
        try {
            summary.printNodesSynced = await this.syncPrinterNodesToPrintNodes();
        } catch (err) {
            summary.failedSteps.push('syncPrinterNodesToPrintNodes');
            summary.warnings.push(`Node synchronization failed: ${err.message}`);
        }

        // Step 3: Machine Discovery
        try {
            summary.machinesDiscovered = await this.discoverMachineProfiles();
        } catch (err) {
            summary.failedSteps.push('discoverMachineProfiles');
            summary.warnings.push(`Machine discovery failed: ${err.message}`);
        }

        // Step 4: Pricing Seed
        try {
            summary.pricingProfilesSeeded = await this.seedPricingProfiles();
        } catch (err) {
            summary.failedSteps.push('seedPricingProfiles');
            summary.warnings.push(`Pricing profile seeding failed: ${err.message}`);
        }

        // Step 5: Federation Seed
        try {
            summary.federationFactoriesSeeded = await this.seedFederationFactories();
        } catch (err) {
            summary.failedSteps.push('seedFederationFactories');
            summary.warnings.push(`Federation seeding failed: ${err.message}`);
        }

        // Refresh source counts after provisioning
        try {
            summary.sourceCounts = await this.getSourceCounts();
        } catch (err) {
            summary.warnings.push(`Failed to fetch final source counts: ${err.message}`);
        }

        return summary;
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
