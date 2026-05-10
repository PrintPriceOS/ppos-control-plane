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
     * Ensures all core operational columns exist.
     */
    async ensureCoreColumns() {
        const migrations = [
            { table: 'jobs', column: 'metadata_json', type: 'JSON NULL' },
            { table: 'metrics', column: 'metadata_json', type: 'JSON NULL' },
            { table: 'print_node_machine_profiles', column: 'manufacturer', type: 'VARCHAR(128) NULL' },
            { table: 'print_node_machine_profiles', column: 'model', type: 'VARCHAR(128) NULL' },
            { table: 'print_node_machine_profiles', column: 'status', type: "ENUM('ACTIVE', 'MAINTENANCE', 'OFFLINE') DEFAULT 'ACTIVE'" },
            { table: 'print_node_machine_profiles', column: 'normalized_capabilities_json', type: 'JSON NULL' }
        ];

        let ensured = 0;
        for (const m of migrations) {
            const exists = await this.checkColumnExists(m.table, m.column);
            if (!exists) {
                logger.info({ event: 'migration_exec', table: m.table, column: m.column });
                await db.query(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`);
                ensured++;
            }
        }

        // Phase 4: Create routing-specific tables
        await db.query(`
            CREATE TABLE IF NOT EXISTS printer_capacity_state (
                printer_id VARCHAR(64) PRIMARY KEY,
                active_jobs INT DEFAULT 0,
                queued_jobs INT DEFAULT 0,
                utilization_percent DECIMAL(5,2) DEFAULT 0.00,
                maintenance_mode BOOLEAN DEFAULT FALSE,
                estimated_completion_hours DECIMAL(10,2) DEFAULT 0.00,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_utilization (utilization_percent)
            ) ENGINE=InnoDB;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS printer_reliability_metrics (
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
            ) ENGINE=InnoDB;
        `);

        // Phase 5: Production Orchestration (MES)
        await db.query(`
            CREATE TABLE IF NOT EXISTS manufacturing_dispatches (
                id VARCHAR(64) PRIMARY KEY,
                job_id VARCHAR(64) NOT NULL,
                node_id VARCHAR(64) NOT NULL,
                machine_id VARCHAR(64) NULL,
                status ENUM(
                    'QUEUED','RECOMMENDED','ASSIGNED','ACCEPTED','PREPARING',
                    'PRINTING','BINDING','PACKAGING','SHIPPED','DELIVERED',
                    'FAILED','REROUTED','CANCELED'
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
            ) ENGINE=InnoDB;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS manufacturing_capacity_reservations (
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
            ) ENGINE=InnoDB;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS manufacturing_dispatch_events (
                id VARCHAR(64) PRIMARY KEY,
                dispatch_id VARCHAR(64) NOT NULL,
                event_type VARCHAR(64) NOT NULL,
                old_status VARCHAR(64) NULL,
                new_status VARCHAR(64) NULL,
                message TEXT NULL,
                metadata_json JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_dispatch (dispatch_id)
            ) ENGINE=InnoDB;
        `);

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
        const printerNodes = await db.query("SELECT * FROM printer_nodes WHERE status = 'ACTIVE'");
        let synced = 0;

        for (const pn of printerNodes) {
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
        }
        return synced;
    }

    /**
     * Creates one primary machine per ONLINE print_node.
     */
    async discoverMachineProfiles() {
        const nodes = await db.query("SELECT * FROM print_nodes WHERE status = 'ONLINE'");
        let discovered = 0;

        for (const node of nodes) {
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
        }
        return discovered;
    }

    /**
     * Seeds PRINTER-scope pricing profiles per ACTIVE printer_node.
     */
    async seedPricingProfiles() {
        const printerNodes = await db.query("SELECT * FROM printer_nodes WHERE status = 'ACTIVE'");
        let seeded = 0;

        for (const pn of printerNodes) {
            const rates = typeof pn.rates_json === 'string' ? JSON.parse(pn.rates_json) : (pn.rates_json || {});
            
            // Logic: interior_full_colour_var 16p / 8p fallback
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
        }
        return seeded;
    }

    /**
     * Runs full provisioning.
     */
    async runFullProvisioning() {
        const summary = {
            columnsEnsured: 0,
            printNodesSynced: 0,
            machinesDiscovered: 0,
            pricingProfilesSeeded: 0,
            warnings: []
        };

        try {
            summary.columnsEnsured = await this.ensureCoreColumns();
            summary.printNodesSynced = await this.syncPrinterNodesToPrintNodes();
            summary.machinesDiscovered = await this.discoverMachineProfiles();
            summary.pricingProfilesSeeded = await this.seedPricingProfiles();
        } catch (err) {
            logger.error({ event: 'provisioning_failed', error: err.message });
            summary.warnings.push(err.message);
        }

        return summary;
    }

    async getProvisioningStatus() {
        const [printerNodes] = await db.query("SELECT COUNT(*) as count FROM printer_nodes");
        const [printNodes] = await db.query("SELECT COUNT(*) as count FROM print_nodes");
        const [machineProfiles] = await db.query("SELECT COUNT(*) as count FROM print_node_machine_profiles");
        const [pricingProfiles] = await db.query("SELECT COUNT(*) as count FROM printer_pricing_profiles");
        const [capacityRows] = await db.query("SELECT COUNT(*) as count FROM printer_capacity_state");
        const [reliabilityRows] = await db.query("SELECT COUNT(*) as count FROM printer_reliability_metrics");
        const [mfgDispatches] = await db.query("SELECT COUNT(*) as count FROM manufacturing_dispatches");

        return {
            printerNodes: printerNodes.count,
            printNodes: printNodes.count,
            machineProfiles: machineProfiles.count,
            pricingProfiles: pricingProfiles.count,
            capacityProfiles: capacityRows.count,
            reliabilityProfiles: reliabilityRows.count,
            manufacturingDispatches: mfgDispatches.count,
            jobsHasMetadataJson: await this.checkColumnExists('jobs', 'metadata_json'),
            metricsHasMetadataJson: await this.checkColumnExists('metrics', 'metadata_json'),
            missingColumns: []
        };
    }
}

module.exports = new IndustrialProvisioningService();
