/**
 * src/api/services/printhouseLeadTimeService.js
 *
 * Handles Site lead times, cutoff rules, and completion date forecasting.
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

// Timezone offset helper using standard toLocaleString
function getTzOffsetMs(date, timeZone) {
    try {
        const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
        const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
        return tzDate.getTime() - utcDate.getTime();
    } catch (e) {
        return 0; // fallback to UTC
    }
}

class PrinthouseLeadTimeService {
    /**
     * Retrieve lead times configuration for a site
     */
    async getLeadTimes(tenantId, siteId) {
        // Enforce boundary check
        const siteRows = await db.query(
            'SELECT * FROM printer_nodes WHERE id = ? AND tenant_id = ?',
            [siteId, tenantId]
        );
        if (siteRows.length === 0) return null;

        const rows = await db.query(
            'SELECT * FROM printhouse_site_lead_times WHERE printhouse_id = ? AND tenant_id = ?',
            [siteId, tenantId]
        );
        if (rows.length === 0) return null;
        return rows[0];
    }

    /**
     * Create or update lead times configuration
     */
    async setLeadTimes(tenantId, siteId, payload) {
        checkProtectedFields(payload);

        // Enforce boundary check
        const siteRows = await db.query(
            'SELECT * FROM printer_nodes WHERE id = ? AND tenant_id = ?',
            [siteId, tenantId]
        );
        if (siteRows.length === 0) throw new Error('SITE_NOT_FOUND');

        const existing = await this.getLeadTimes(tenantId, siteId);

        const timezone = payload.timezone || 'UTC';
        const workdays = payload.workdays_json ? JSON.stringify(payload.workdays_json) : '[1,2,3,4,5]';
        const cutoff = payload.daily_cutoff_time || '14:00';
        const baseLeadDays = payload.base_lead_time_days !== undefined ? payload.base_lead_time_days : 3;
        const customRules = payload.custom_rules_json ? JSON.stringify(payload.custom_rules_json) : null;

        if (existing) {
            await db.query(
                `UPDATE printhouse_site_lead_times 
                 SET timezone = ?, workdays_json = ?, daily_cutoff_time = ?, base_lead_time_days = ?, custom_rules_json = ?
                 WHERE printhouse_id = ? AND tenant_id = ?`,
                [timezone, workdays, cutoff, baseLeadDays, customRules, siteId, tenantId]
            );
        } else {
            const id = 'lt-' + uuidv4();
            await db.query(
                `INSERT INTO printhouse_site_lead_times 
                 (id, printhouse_id, tenant_id, timezone, workdays_json, daily_cutoff_time, base_lead_time_days, custom_rules_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, siteId, tenantId, timezone, workdays, cutoff, baseLeadDays, customRules]
            );
        }

        return await this.getLeadTimes(tenantId, siteId);
    }

    /**
     * Estimate dynamic production completion date
     * Transit time is strictly excluded.
     */
    async calculateEstimatedProductionCompletion(tenantId, siteId, startTimestamp) {
        const config = await this.getLeadTimes(tenantId, siteId);
        if (!config) throw new Error('LEAD_TIMES_NOT_CONFIGURED');

        const tz = config.timezone || 'UTC';
        const workdays = typeof config.workdays_json === 'string' 
            ? JSON.parse(config.workdays_json) 
            : config.workdays_json || [1, 2, 3, 4, 5];
        const cutoff = config.daily_cutoff_time || '14:00';
        const baseLeadDays = config.base_lead_time_days || 3;

        const start = new Date(startTimestamp || Date.now());

        // 1. Calculate start date local components
        const offset = getTzOffsetMs(start, tz);
        const localTime = new Date(start.getTime() + offset);

        const localHour = localTime.getUTCHours();
        const localMinute = localTime.getUTCMinutes();

        const [cutoffHour, cutoffMinute] = cutoff.split(':').map(Number);

        let workingDate = new Date(localTime.getTime());

        // 2. Check Cut-off
        if (localHour > cutoffHour || (localHour === cutoffHour && localMinute >= cutoffMinute)) {
            // Roll over to next business day, set to 09:00 AM local time
            workingDate.setUTCHours(9, 0, 0, 0);
            workingDate.setUTCDate(workingDate.getUTCDate() + 1);
        }

        // Ensure start is a workday (roll forward if needed)
        while (!workdays.includes(workingDate.getUTCDay())) {
            workingDate.setUTCDate(workingDate.getUTCDate() + 1);
            workingDate.setUTCHours(9, 0, 0, 0);
        }

        // 3. Add base lead days skipping weekends/non-workdays
        let daysAdded = 0;
        while (daysAdded < baseLeadDays) {
            workingDate.setUTCDate(workingDate.getUTCDate() + 1);
            if (workdays.includes(workingDate.getUTCDay())) {
                daysAdded++;
            }
        }

        // 4. Convert local workingDate back to UTC
        const finalUtcTime = new Date(workingDate.getTime() - offset);
        return finalUtcTime.toISOString();
    }
}

module.exports = new PrinthouseLeadTimeService();
