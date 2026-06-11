/**
 * src/api/services/productionQueueMonitoringService.js
 * 
 * Production Queue and Machine Workload Monitoring Service.
 */
'use strict';

const db = require('./mysqlClient');
const logger = require('./logger').child('production-queue-monitor');

class ProductionQueueMonitoringService {

    async getQueueOverview({ tenantId = null, printhouseId = null }, actor = {}) {
        const depth = await this.calculateQueueDepth({ tenantId, printhouseId }, actor);
        const bottlenecks = await this.evaluateQueueBottlenecks({ tenantId, printhouseId }, actor);
        
        const machineLoadMonitoringService = require('./machineLoadMonitoringService');
        const machineLoads = await machineLoadMonitoringService.listMachineLoads({ tenantId, printhouseId }, actor);

        return {
            queue_depth: depth,
            bottlenecks,
            machines: machineLoads,
            overview_timestamp: new Date().toISOString()
        };
    }

    async getMachineQueue({ machineId }, actor = {}) {
        let sql = 'SELECT * FROM production_monitoring_snapshots WHERE machine_id = ?';
        const params = [machineId];
        
        if (actor.tenantId && actor.tenantId !== 'system-tenant') {
            sql += ' AND tenant_id = ?';
            params.push(actor.tenantId);
        }

        return await db.query(sql, params);
    }

    async calculateQueueDepth({ tenantId = null, printhouseId = null }, actor = {}) {
        let sql = 'SELECT production_status, COUNT(*) as count FROM production_monitoring_snapshots WHERE 1=1';
        const params = [];

        if (actor.tenantId && actor.tenantId !== 'system-tenant') {
            sql += ' AND tenant_id = ?';
            params.push(actor.tenantId);
        } else if (tenantId) {
            sql += ' AND tenant_id = ?';
            params.push(tenantId);
        }

        if (printhouseId) {
            sql += ' AND printhouse_id = ?';
            params.push(printhouseId);
        }

        sql += ' GROUP BY production_status';
        const rows = await db.query(sql, params);

        const depth = {
            NOT_STARTED: 0,
            QUEUED: 0,
            IN_PRODUCTION: 0,
            COMPLETED: 0,
            PAUSED: 0,
            FAILED: 0
        };

        for (const row of rows) {
            if (depth[row.production_status] !== undefined) {
                depth[row.production_status] = Number(row.count || 0);
            } else {
                depth[row.production_status] = Number(row.count || 0);
            }
        }

        return depth;
    }

    async calculateMachineWorkload({ machineId }, actor = {}) {
        let sql = 'SELECT * FROM machine_load_snapshots WHERE machine_id = ?';
        const params = [machineId];

        if (actor.tenantId && actor.tenantId !== 'system-tenant') {
            sql += ' AND tenant_id = ?';
            params.push(actor.tenantId);
        }

        const rows = await db.query(sql, params);
        if (rows.length === 0) return null;

        return {
            machine_id: rows[0].machine_id,
            machine_name: rows[0].machine_name,
            load_status: rows[0].load_status,
            queued_jobs_count: Number(rows[0].queued_jobs_count || 0),
            active_jobs_count: Number(rows[0].active_jobs_count || 0),
            estimated_queue_minutes: Number(rows[0].estimated_queue_minutes || 0),
            capacity_score: Number(rows[0].capacity_score || 100)
        };
    }

    async estimateMachineNextAvailableAt({ machineId }, actor = {}) {
        let sql = 'SELECT next_available_at FROM machine_load_snapshots WHERE machine_id = ?';
        const params = [machineId];

        if (actor.tenantId && actor.tenantId !== 'system-tenant') {
            sql += ' AND tenant_id = ?';
            params.push(actor.tenantId);
        }

        const rows = await db.query(sql, params);
        return rows[0]?.next_available_at || null;
    }

    async evaluateQueueBottlenecks({ tenantId = null, printhouseId = null }, actor = {}) {
        const bottlenecks = [];

        // 1. Offline and Overloaded machines
        const machineLoadMonitoringService = require('./machineLoadMonitoringService');
        const machineLoads = await machineLoadMonitoringService.listMachineLoads({ tenantId, printhouseId }, actor);

        for (const m of machineLoads) {
            if (m.load_status === 'OFFLINE') {
                bottlenecks.push({
                    type: 'MACHINE_OFFLINE',
                    target: m.machine_id,
                    name: m.machine_name,
                    severity: 'HIGH',
                    message: `Machine "${m.machine_name}" is offline. Capacity is degraded.`
                });
            } else if (m.load_status === 'OVERLOADED') {
                bottlenecks.push({
                    type: 'MACHINE_OVERLOADED',
                    target: m.machine_id,
                    name: m.machine_name,
                    severity: 'MEDIUM',
                    message: `Machine "${m.machine_name}" is overloaded with ${m.queued_jobs_count} queued jobs.`
                });
            }
        }

        // 2. Blocked production snapshots
        let sql = "SELECT * FROM production_monitoring_snapshots WHERE sla_status = 'BLOCKED'";
        const params = [];

        if (actor.tenantId && actor.tenantId !== 'system-tenant') {
            sql += ' AND tenant_id = ?';
            params.push(actor.tenantId);
        } else if (tenantId) {
            sql += ' AND tenant_id = ?';
            params.push(tenantId);
        }

        if (printhouseId) {
            sql += ' AND printhouse_id = ?';
            params.push(printhouseId);
        }

        const blockedJobs = await db.query(sql, params);
        for (const j of blockedJobs) {
            bottlenecks.push({
                type: 'JOB_BLOCKED',
                target: j.order_id,
                severity: 'HIGH',
                message: `Job/Order "${j.order_id}" is blocked by governance or plan limits.`,
                reasons: j.blocking_reasons_json
            });
        }

        return bottlenecks;
    }

    async createQueueMonitoringSnapshot(payload, actor = {}) {
        const productionMonitoringService = require('./productionMonitoringService');
        return await productionMonitoringService.createOrUpdateMonitoringSnapshot({
            tenantId: payload.tenantId || payload.tenant_id,
            printhouseId: payload.printhouseId || payload.printhouse_id,
            orderId: payload.orderId || payload.order_id,
            jobId: payload.jobId || payload.job_id,
            payload,
            actor
        });
    }

    async auditQueueMonitoringEvent(event) {
        logger.debug({ event: 'queue_monitoring_event', ...event });
    }
}

module.exports = new ProductionQueueMonitoringService();
