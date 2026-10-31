/**
 * src/api/services/slaRiskService.js
 * 
 * SLA Evaluation & Risk Engine Service.
 */
'use strict';

const db = require('./mysqlClient');
const logger = require('./logger').child('sla-risk');

class SlaRiskService {

    async createSlaPolicySnapshot({ orderId, jobId = null, slaProfileId }) {
        if (!orderId || !slaProfileId) {
            throw new Error('MISSING_PARAMETERS: orderId and slaProfileId are required');
        }

        // Fetch order details
        const orders = await db.query('SELECT tenant_id, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
        if (!orders || orders.length === 0) {
            throw new Error('ORDER_NOT_FOUND');
        }

        const order = orders[0];
        // Fetch SLA profile details (from database or mock)
        // Usually stored in printhouse_sla_profiles or bindings
        // Let's check print house bindings for the order to get the bound SLA snapshot
        const bindings = await db.query('SELECT printhouse_id, sla_profile_snapshot_json FROM tenant_printhouse_bindings WHERE tenant_id = ? LIMIT 1', [order.tenant_id]);
        
        let slaName = 'Standard Delivery';
        let daysMin = 1;
        let daysMax = 3;
        let cutoff = '17:00';
        let tz = 'UTC';
        let weekend = 0;
        let rush = 0;
        let profileRaw = null;

        if (bindings && bindings.length > 0 && bindings[0].sla_profile_snapshot_json) {
            try {
                const profile = typeof bindings[0].sla_profile_snapshot_json === 'string' ? JSON.parse(bindings[0].sla_profile_snapshot_json) : bindings[0].sla_profile_snapshot_json;
                profileRaw = profile;
                slaName = profile.name || profile.sla_name || slaName;
                daysMin = profile.production_days_min || daysMin;
                daysMax = profile.production_days_max || daysMax;
                cutoff = profile.cutoff_time_local || cutoff;
                tz = profile.timezone || tz;
                weekend = profile.weekend_production ? 1 : 0;
                rush = profile.rush_available ? 1 : 0;
            } catch (e) {}
        }

        await db.query(`
            INSERT INTO sla_policy_snapshots (
                tenant_id, printhouse_id, order_id, job_id, sla_profile_id, sla_name,
                production_days_min, production_days_max, cutoff_time_local, timezone,
                weekend_production, rush_available, sla_snapshot_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            order.tenant_id, bindings[0]?.printhouse_id || 'print_pilot_printhouse', orderId, jobId || null,
            slaProfileId, slaName, daysMin, daysMax, cutoff, tz, weekend, rush, JSON.stringify(profileRaw || {})
        ]);

        return { ok: true, slaName };
    }

    calculateSlaDueAt({ startedAt, slaProfile, timezone = 'UTC' }) {
        const start = new Date(startedAt);
        const daysMax = slaProfile.production_days_max || 3;
        const cutoffStr = slaProfile.cutoff_time_local || '17:00';
        const weekendProduction = slaProfile.weekend_production === 1 || slaProfile.weekend_production === true;

        // Simple cutoff check: parse cutoff hour/minute
        const [cutHour, cutMinute] = cutoffStr.split(':').map(Number);
        
        // Convert startedAt to the local timezone hours/minutes
        // Since we are running in Node, we will use timezone offsets or simple UTC hours representation for mock/seed
        const startHour = start.getUTCHours(); // fallback representation
        const startMinute = start.getUTCMinutes();

        let adjustedStart = new Date(start);
        
        // If past cutoff time, production start date moves to next day
        if (startHour > cutHour || (startHour === cutHour && startMinute >= cutMinute)) {
            adjustedStart.setUTCDate(adjustedStart.getUTCDate() + 1);
        }

        // Add production days
        let addedDays = 0;
        let current = new Date(adjustedStart);
        
        while (addedDays < daysMax) {
            current.setUTCDate(current.getUTCDate() + 1);
            const dayOfWeek = current.getUTCDay(); // 0 is Sunday, 6 is Saturday
            
            if (!weekendProduction && (dayOfWeek === 0 || dayOfWeek === 6)) {
                // Skip weekend
                continue;
            }
            addedDays++;
        }

        // Force due time to be local cutoff time on the target due date
        current.setUTCHours(cutHour, cutMinute, 0, 0);
        return current;
    }

    calculateRemainingMinutes({ dueAt, now = new Date() }) {
        const due = new Date(dueAt);
        const current = new Date(now);
        const diffMs = due.getTime() - current.getTime();
        return Math.round(diffMs / (1000 * 60));
    }

    evaluateSlaStatus({ dueAt, now = new Date(), blocked = false, paused = false }) {
        if (blocked) return 'BLOCKED';
        if (paused) return 'PAUSED';

        const remaining = this.calculateRemainingMinutes({ dueAt, now });
        if (remaining <= 0) {
            return 'BREACHED';
        }
        if (remaining <= 180) { // 3 hours
            return 'AT_RISK';
        }
        return 'ON_TRACK';
    }

    calculateSlaRiskScore({ remainingMinutes, queueMinutes = 0, blockers = [], warnings = [] }) {
        if (remainingMinutes <= 0) {
            return 100;
        }

        let score = 0;

        // Time factor
        if (remainingMinutes <= 180) { // <= 3 hours
            score += 50 + Math.round(((180 - remainingMinutes) / 180) * 30); // 50 to 80 points
        } else if (remainingMinutes <= 720) { // <= 12 hours
            score += 20 + Math.round(((720 - remainingMinutes) / 540) * 30); // 20 to 50 points
        } else {
            score += Math.max(0, 20 - Math.round(remainingMinutes / 1440));
        }

        // Blockers (significant risk)
        if (blockers && blockers.length > 0) {
            score += blockers.length * 20;
        }

        // Warnings
        if (warnings && warnings.length > 0) {
            score += warnings.length * 5;
        }

        // Bottlenecks
        if (queueMinutes > remainingMinutes) {
            score += 30;
        }

        return Math.min(100, Math.max(0, score));
    }

    async evaluateSlaRisk({ orderId, jobId = null }) {
        // Retrieve SLA policy snapshot
        const policies = await db.query('SELECT * FROM sla_policy_snapshots WHERE order_id = ? ORDER BY created_at DESC LIMIT 1', [orderId]);
        const snapshot = await db.query('SELECT * FROM production_monitoring_snapshots WHERE order_id = ?', [orderId]);

        if (!policies || policies.length === 0) {
            return {
                sla_status: 'NOT_APPLICABLE',
                remaining_minutes: null,
                risk_score: 0
            };
        }

        const policy = policies[0];
        const currentSnap = snapshot[0] || {};

        const slaStartedAt = currentSnap.sla_started_at || policy.created_at;
        const slaDueAt = currentSnap.sla_due_at || this.calculateSlaDueAt({ startedAt: slaStartedAt, slaProfile: policy, timezone: policy.timezone });

        const now = new Date();
        const remaining = this.calculateRemainingMinutes({ dueAt: slaDueAt, now });

        // Evaluate blockers
        let blockers = [];
        let warnings = [];
        try {
            if (currentSnap.blocking_reasons_json) {
                blockers = typeof currentSnap.blocking_reasons_json === 'string' ? JSON.parse(currentSnap.blocking_reasons_json) : currentSnap.blocking_reasons_json;
            }
            if (currentSnap.warning_reasons_json) {
                warnings = typeof currentSnap.warning_reasons_json === 'string' ? JSON.parse(currentSnap.warning_reasons_json) : currentSnap.warning_reasons_json;
            }
        } catch (e) {}

        const isBlocked = blockers.length > 0;
        const isPaused = currentSnap.production_status === 'PAUSED';

        const slaStatus = this.evaluateSlaStatus({ dueAt: slaDueAt, now, blocked: isBlocked, paused: isPaused });
        
        // Risk score
        const riskScore = this.calculateSlaRiskScore({
            remainingMinutes: remaining,
            queueMinutes: 0, // default placeholder
            blockers,
            warnings
        });

        // Trigger auto timeline events on transitions
        if (currentSnap.sla_status && currentSnap.sla_status !== slaStatus) {
            const productionMonitoringService = require('./productionMonitoringService');
            let eventType = 'SLA_RISK_UPDATED';
            let message = `SLA status updated to ${slaStatus}.`;
            let eventStatus = 'INFO';

            if (slaStatus === 'BREACHED') {
                eventType = 'SLA_BREACHED';
                message = `SLA target deadline BREACHED. Due date was ${new Date(slaDueAt).toLocaleString()}`;
                eventStatus = 'BLOCKER';
            } else if (slaStatus === 'AT_RISK') {
                message = `SLA is AT_RISK. Remaining minutes: ${remaining}`;
                eventStatus = 'WARNING';
            }

            await productionMonitoringService.createProductionTimelineEvent({
                tenant_id: policy.tenant_id,
                printhouse_id: policy.printhouse_id,
                order_id: orderId,
                job_id: jobId,
                event_type: eventType,
                event_status: eventStatus,
                message
            });
        }

        return {
            sla_status: slaStatus,
            remaining_minutes: remaining,
            risk_score: riskScore,
            sla_due_at: slaDueAt,
            sla_started_at: slaStartedAt
        };
    }

    async auditSlaRiskEvent(event) {
        logger.debug({ event: 'sla_risk_event', ...event });
    }
}

module.exports = new SlaRiskService();
