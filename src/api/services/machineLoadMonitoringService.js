/**
 * src/api/services/machineLoadMonitoringService.js
 * 
 * Machine Load Monitoring Service.
 */
'use strict';

const db = require('./mysqlClient');
const logger = require('./logger').child('machine-load-monitor');

class MachineLoadMonitoringService {

    async createMachineLoadSnapshot({ tenantId, printhouseId, machineId, payload = {} }) {
        if (!tenantId || !printhouseId || !machineId) {
            throw new Error('MISSING_PARAMETERS: tenantId, printhouseId, and machineId are required');
        }

        // Fetch existing snapshot first to merge payload
        const rows = await db.query('SELECT * FROM machine_load_snapshots WHERE machine_id = ?', [machineId]);
        const existing = rows[0] || null;
        const merged = existing ? { ...existing } : {};

        // Merge payload fields
        for (const [key, val] of Object.entries(payload)) {
            if (val !== undefined) {
                merged[key] = val;
            }
        }

        const machineName = merged.machine_name || 'Printer Node';
        const machineType = merged.machine_type || 'DIGITAL_PRESS';
        const loadStatus = merged.load_status || 'IDLE';
        const snapshotJson = merged.snapshot_json ? (typeof merged.snapshot_json === 'string' ? merged.snapshot_json : JSON.stringify(merged.snapshot_json)) : null;

        await db.query(`
            INSERT INTO machine_load_snapshots (
                tenant_id, printhouse_id, machine_id, machine_name, machine_type, load_status,
                queued_jobs_count, active_jobs_count, estimated_queue_minutes, capacity_score,
                next_available_at, snapshot_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                machine_name=VALUES(machine_name), machine_type=VALUES(machine_type), load_status=VALUES(load_status),
                queued_jobs_count=VALUES(queued_jobs_count), active_jobs_count=VALUES(active_jobs_count),
                estimated_queue_minutes=VALUES(estimated_queue_minutes), capacity_score=VALUES(capacity_score),
                next_available_at=VALUES(next_available_at), snapshot_json=VALUES(snapshot_json)
        `, [
            tenantId, printhouseId, machineId, machineName, machineType, loadStatus,
            merged.queued_jobs_count || 0, merged.active_jobs_count || 0,
            merged.estimated_queue_minutes || 0, merged.capacity_score || 100,
            merged.next_available_at || null, snapshotJson
        ]);

        const updatedRows = await db.query('SELECT * FROM machine_load_snapshots WHERE machine_id = ?', [machineId]);
        return updatedRows[0] || null;
    }

    async evaluateMachineLoad({ tenantId, printhouseId, machineId }) {
        // Fetch printer profile details
        const machines = await db.query('SELECT * FROM printhouse_machines WHERE id = ?', [machineId]);
        const m = machines[0] || { machine_name: 'Printer ' + machineId, machine_type: 'DIGITAL_PRESS', status: 'ACTIVE' };

        // Count queued jobs assigned to this machine
        let queuedCount = 0;
        let activeCount = 0;
        try {
            // Check order statuses
            const queuedRows = await db.query(
                "SELECT COUNT(*) as count FROM marketplace_orders WHERE status = 'MACHINE_ASSIGNED' AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.production_queue.machineAssignment.machineId')) = ?",
                [machineId]
            );
            queuedCount = Number(queuedRows[0]?.count || 0);

            const activeRows = await db.query(
                "SELECT COUNT(*) as count FROM marketplace_orders WHERE status = 'IN_PRODUCTION' AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.production_queue.machineAssignment.machineId')) = ?",
                [machineId]
            );
            activeCount = Number(activeRows[0]?.count || 0);
        } catch (e) {}

        const isOffline = m.status === 'OFFLINE' || m.status === 'MAINTENANCE';
        const totalLoad = queuedCount + activeCount;

        let loadStatus = 'IDLE';
        if (isOffline) {
            loadStatus = 'OFFLINE';
        } else if (totalLoad > 10) {
            loadStatus = 'OVERLOADED';
        } else if (totalLoad > 5) {
            loadStatus = 'BUSY';
        } else if (totalLoad > 0) {
            loadStatus = 'NORMAL';
        }

        const estQueueMinutes = this.estimateQueueMinutes({ queuedCount, activeCount, isOffline });
        const capacityScore = this.calculateCapacityScore({ loadStatus, totalLoad });

        const nextAvail = new Date();
        nextAvail.setMinutes(nextAvail.getMinutes() + estQueueMinutes);

        const snapshot = {
            machine_name: m.machine_name || m.name || 'Printer Press',
            machine_type: m.machine_type || 'DIGITAL_PRESS',
            load_status: loadStatus,
            queued_jobs_count: queuedCount,
            active_jobs_count: activeCount,
            estimated_queue_minutes: estQueueMinutes,
            capacity_score: capacityScore,
            next_available_at: loadStatus === 'OFFLINE' ? null : nextAvail,
            snapshot_json: {
                evaluated_at: new Date().toISOString(),
                status_raw: m.status
            }
        };

        return await this.createMachineLoadSnapshot({
            tenantId,
            printhouseId,
            machineId,
            payload: snapshot
        });
    }

    async listMachineLoads({ tenantId = null, printhouseId = null }, actor = {}) {
        let sql = 'SELECT * FROM machine_load_snapshots WHERE 1=1';
        const params = [];

        // Tenant isolation
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

        return await db.query(sql, params);
    }

    estimateQueueMinutes({ queuedCount, activeCount, isOffline }) {
        if (isOffline) return 999999;
        // Estimate 15 minutes per queued job + 30 minutes for current active job
        return (queuedCount * 15) + (activeCount * 30);
    }

    calculateCapacityScore({ loadStatus, totalLoad }) {
        if (loadStatus === 'OFFLINE') return 0;
        if (loadStatus === 'OVERLOADED') return 10;
        if (loadStatus === 'BUSY') return 50;
        if (loadStatus === 'NORMAL') return 90;
        return 100; // IDLE
    }

    async auditMachineLoadEvent(event) {
        logger.debug({ event: 'machine_load_event', ...event });
    }
}

module.exports = new MachineLoadMonitoringService();
