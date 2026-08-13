/**
 * src/api/services/printhouseCapacityService.js
 *
 * Handles Site and Machine indicative capacity configurations.
 * Implements strict tenant boundary isolation and field protection.
 */
const db = require('./mysqlClient');
const { v4: uuidv4 } = require('uuid');

const PROTECTED_FIELDS = [
    'id',
    'tenant_id',
    'approved',
    'verified',
    'marketplace_enabled',
    'routing_enabled',
    'production_enabled'
];

function checkProtectedFields(payload) {
    const violatingFields = PROTECTED_FIELDS.filter(field => field in payload);
    if (violatingFields.length > 0) {
        const err = new Error('FIELD_NOT_EDITABLE');
        err.fields = violatingFields;
        throw err;
    }
}

class PrinthouseCapacityService {
    /**
     * Retrieve site capacity profile
     */
    async getSiteCapacity(tenantId, siteId) {
        // Enforce boundary check
        const siteRows = await db.query(
            'SELECT * FROM printer_nodes WHERE id = ? AND tenant_id = ?',
            [siteId, tenantId]
        );
        if (siteRows.length === 0) return null;

        const rows = await db.query(
            'SELECT * FROM printhouse_site_capacities WHERE printhouse_id = ? AND tenant_id = ?',
            [siteId, tenantId]
        );
        if (rows.length === 0) return null;
        return rows[0];
    }

    /**
     * Set or update site capacity profile
     */
    async setSiteCapacity(tenantId, siteId, payload) {
        checkProtectedFields(payload);

        // Enforce boundary check
        const siteRows = await db.query(
            'SELECT * FROM printer_nodes WHERE id = ? AND tenant_id = ?',
            [siteId, tenantId]
        );
        if (siteRows.length === 0) throw new Error('SITE_NOT_FOUND');

        const existing = await this.getSiteCapacity(tenantId, siteId);

        const dailyJobsLimit = payload.daily_jobs_limit !== undefined ? payload.daily_jobs_limit : null;
        const dailySheetsLimit = payload.daily_sheets_limit !== undefined ? payload.daily_sheets_limit : null;
        const workingDaysPerWeek = payload.working_days_per_week !== undefined ? payload.working_days_per_week : null;
        const operatingHoursPerDay = payload.operating_hours_per_day !== undefined ? payload.operating_hours_per_day : null;
        const notes = payload.notes || '';

        if (existing) {
            await db.query(
                `UPDATE printhouse_site_capacities 
                 SET daily_jobs_limit = ?, daily_sheets_limit = ?, working_days_per_week = ?, operating_hours_per_day = ?, notes = ?
                 WHERE printhouse_id = ? AND tenant_id = ?`,
                [dailyJobsLimit, dailySheetsLimit, workingDaysPerWeek, operatingHoursPerDay, notes, siteId, tenantId]
            );
        } else {
            const id = 'cap-' + uuidv4();
            await db.query(
                `INSERT INTO printhouse_site_capacities 
                 (id, printhouse_id, tenant_id, daily_jobs_limit, daily_sheets_limit, working_days_per_week, operating_hours_per_day, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, siteId, tenantId, dailyJobsLimit, dailySheetsLimit, workingDaysPerWeek, operatingHoursPerDay, notes]
            );
        }

        return await this.getSiteCapacity(tenantId, siteId);
    }

    /**
     * Update machine-specific capacity attributes
     */
    async setMachineCapacity(tenantId, siteId, machineId, payload) {
        checkProtectedFields(payload);

        // Enforce boundary check
        const machineRows = await db.query(
            'SELECT * FROM printhouse_machines WHERE id = ? AND tenant_id = ? AND printhouse_id = ?',
            [machineId, tenantId, siteId]
        );
        if (machineRows.length === 0) throw new Error('MACHINE_NOT_FOUND');

        const dailyCapacity = payload.indicative_daily_capacity !== undefined ? payload.indicative_daily_capacity : null;
        const unitName = payload.capacity_unit_name || 'impressions';

        await db.query(
            `UPDATE printhouse_machines 
             SET indicative_daily_capacity = ?, capacity_unit_name = ?
             WHERE id = ? AND tenant_id = ? AND printhouse_id = ?`,
            [dailyCapacity, unitName, machineId, tenantId, siteId]
        );

        const updatedRows = await db.query(
            'SELECT id, machine_name, indicative_daily_capacity, capacity_unit_name FROM printhouse_machines WHERE id = ?',
            [machineId]
        );
        return updatedRows[0];
    }
}

module.exports = new PrinthouseCapacityService();
