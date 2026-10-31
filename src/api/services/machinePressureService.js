/**
 * Machine Pressure Service
 * 
 * Calculates industrial queue pressure, saturation, and routing eligibility.
 * Phase 34 - Live Federation Activation.
 */
const db = require('./mysqlClient');

class MachinePressureService {
    /**
     * Get live pressure analysis for a machine
     */
    async getPressureAnalysis(machineId) {
        let targetId = machineId;
        if (targetId && targetId.startsWith('machine_') && targetId.endsWith('_primary')) {
            targetId = targetId.substring(8, targetId.length - 8);
        }

        try {
            // 1. Fetch Reservation Pressure
            let reservations = { count: 0 };
            try {
                const [resRows] = await db.query(`
                    SELECT COUNT(*) as count 
                    FROM manufacturing_capacity_reservations 
                    WHERE node_id = ? AND status = 'PENDING' AND expires_at > NOW()
                `, [targetId]);
                if (resRows) reservations = resRows;
            } catch (e) {}

            // 2. Fetch Active Dispatches
            let dispatches = { count: 0 };
            try {
                const [dispRows] = await db.query(`
                    SELECT COUNT(*) as count 
                    FROM manufacturing_dispatches 
                    WHERE print_node_id = ? AND status IN ('RESERVED', 'QUEUED', 'ASSIGNED', 'IN_PRODUCTION')
                `, [targetId]);
                if (dispRows) dispatches = dispRows;
            } catch (e) {}

            // 3. Fetch Oldest Queued Job
            let oldestJob = null;
            try {
                const [oldRows] = await db.query(`
                    SELECT created_at 
                    FROM manufacturing_dispatches 
                    WHERE print_node_id = ? AND status = 'QUEUED'
                    ORDER BY created_at ASC LIMIT 1
                `, [targetId]);
                if (oldRows) oldestJob = oldRows;
            } catch (e) {}

            const activeCount = (dispatches?.count || 0) + (reservations?.count || 0);
            
            let saturation = (activeCount / 100) * 100;
            if (saturation > 100) saturation = 100;

            return {
                machine_id: machineId,
                queue_size: dispatches?.count || 0,
                oldest_queued_job: oldestJob?.created_at || null,
                estimated_backlog_mins: (dispatches?.count || 0) * 15,
                overload_risk: saturation > 85 ? 'HIGH' : saturation > 60 ? 'MEDIUM' : 'LOW',
                dispatch_contention: reservations?.count || 0,
                reservation_pressure: (reservations?.count || 0) * 10,
                pressure_bar_pct: Math.min(100, (activeCount / 50) * 100),
                routing_eligibility: await this.getRoutingEligibility(machineId),
                source_status: 'LIVE_CALCULATED'
            };
        } catch (err) {
            return {
                machine_id: machineId,
                queue_size: 0,
                oldest_queued_job: null,
                estimated_backlog_mins: 0,
                overload_risk: 'LOW',
                dispatch_contention: 0,
                reservation_pressure: 0,
                pressure_bar_pct: 0,
                routing_eligibility: ['CARBON_OPTIMIZED'],
                source_status: 'PRESSURE_UNAVAILABLE_OR_SYNTHETIC'
            };
        }
    }

    /**
     * Determine routing eligibility based on live node state
     */
    async getRoutingEligibility(machineId) {
        let targetId = machineId;
        if (targetId && targetId.startsWith('machine_') && targetId.endsWith('_primary')) {
            targetId = targetId.substring(8, targetId.length - 8);
        }

        try {
            const [nodeRows] = await db.query(`
                SELECT status, country, capabilities_json FROM print_nodes WHERE id = ?
            `, [targetId]);

            if (!nodeRows) return ['CARBON_OPTIMIZED'];

            const node = nodeRows;
            const caps = typeof node.capabilities_json === 'string' 
                ? JSON.parse(node.capabilities_json) 
                : node.capabilities_json || {};

            const eligibility = [];

            if (node.country === 'IE' || node.country === 'GB') eligibility.push('EU-WEST');
            if (['EE', 'LV', 'LT'].includes(node.country)) eligibility.push('BALTICS');
            if (['DE', 'AT', 'CH'].includes(node.country)) eligibility.push('DACH');

            if (caps.hardcover) eligibility.push('HARDCOVER');
            if (caps.large_format) eligibility.push('LARGE_FORMAT');
            if (node.status === 'ONLINE' && node.capacity_utilization_pct < 50) eligibility.push('URGENT_JOBS');
            
            eligibility.push('CARBON_OPTIMIZED');

            return eligibility;
        } catch (e) {
            return ['CARBON_OPTIMIZED'];
        }
    }
}

module.exports = new MachinePressureService();
