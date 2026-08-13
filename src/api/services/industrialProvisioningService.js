/**
 * src/api/services/industrialProvisioningService.js
 * 
 * Idempotent provisioning layer for industrial operations.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('provisioning-service');
const machineRegistry = require('./machineRegistryService');
const activationAdapter = require('./printhouseActivationAdapter');

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

        // Step 1: Schema Readiness Check (Phase 184 read-only validation)
        try {
            const { assertSchemaReady } = require('./schemaCompatibilityService');
            await assertSchemaReady('CORE_RUNTIME');
            summary.columnsEnsured = 0;
            summary.migrationsApplied = 0;
        } catch (err) {
            summary.failedSteps.push('schemaReadinessAssertion');
            this._logStepError('schemaReadinessAssertion', err);
            throw err;
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

    async ensureCoreColumns() {
        if (process.env.PPOS_MIGRATION_EXECUTION !== 'true') {
            throw new Error('DDL_EXECUTION_FORBIDDEN_OUTSIDE_MIGRATION_CONTEXT');
        }
        // DDL extracted to src/migrations/phase184g_industrial_provisioning_schema.js
        // Run via: node scripts/run_control_plane_migrations.js
        // This method is retained for backward compatibility but performs no DDL.
        logger.info({ event: 'provisioning_ddl_delegated', message: 'DDL delegated to migration module phase184g_industrial_provisioning_schema' });
        return 0;
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
     * Syncs ACTIVE printer_nodes with active JOB_ROUTING_ALLOWED grants into print_nodes topology.
     */
    async syncPrinterNodesToPrintNodes() {
        logger.info({ event: 'provisioning_step_start', step: 'syncPrinterNodesToPrintNodes' });
        const filterSql = activationAdapter.getCanonicalBulkFilterSql('g', 'JOB_ROUTING_ALLOWED');
        const printerNodes = await db.query(`
            SELECT p.* 
            FROM printer_nodes p
            INNER JOIN printhouse_activation_grants g ON p.tenant_id = g.tenant_id
            WHERE p.status = 'ACTIVE' AND ${filterSql}
        `);
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
        const filterSql = activationAdapter.getCanonicalBulkFilterSql('g', 'PRODUCTION_DISPATCH_ALLOWED');
        const printerNodes = await db.query(`
            SELECT p.* 
            FROM printer_nodes p
            INNER JOIN printhouse_activation_grants g ON p.tenant_id = g.tenant_id
            WHERE p.status = 'ACTIVE' AND ${filterSql}
        `);
        let seeded = 0;

        for (const pn of printerNodes) {
            try {
                const rates = typeof pn.rates_json === 'string' ? JSON.parse(pn.rates_json) : (pn.rates_json || {});
                
                const profileId = `pricing_${pn.id}_printer`;

                await db.query(`
                    INSERT INTO printer_pricing_profiles (
                        id, printer_id, pricing_scope, currency, active,
                        target_margin_pct, platform_markup_pct, dynamic_routing_premium,
                        minimum_job_fee
                    ) VALUES (?, ?, 'PRINTER', 'EUR', 0, 20.0, 15.0, 0.0, 150.00)
                    ON DUPLICATE KEY UPDATE
                        active = 0
                `, [
                    profileId, pn.id
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
