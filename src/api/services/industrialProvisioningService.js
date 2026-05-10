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
     * Entry point for full system provisioning.
     * Delegates schema management to migrationService.
     */
    async runFullProvisioning() {
        const summary = {
            startTime: new Date().toISOString(),
            migrationsApplied: 0,
            machinesDiscovered: 0,
            sourceCounts: {},
            failedSteps: [],
            warnings: []
        };

        try {
            // 1. Run migrations first (Schema Hardening)
            const migrationResult = await migrationService.runMigrations();
            summary.migrationsApplied = migrationResult.appliedCount;
        } catch (err) {
            summary.failedSteps.push('migrations');
            this._logStepError('migrations', err);
            // Critical failure: if schema can't be hardened, we might want to stop,
            // but for now we continue to attempt operational bootstrap.
        }

        // 2. Operational Bootstrap (Real Industrial Logic)
        try {
            await this.syncActivePrintNodes();
            const machineSummary = await machineRegistry.refreshFleet();
            summary.machinesDiscovered = machineSummary.total;
        } catch (err) {
            summary.failedSteps.push('operational_bootstrap');
            this._logStepError('operational_bootstrap', err);
        }

        try {
            summary.sourceCounts = await this.getSourceCounts();
        } catch (err) {
            summary.warnings.push(`Metadata sync warning: ${err.message}`);
        }

        summary.endTime = new Date().toISOString();
        return summary;
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
