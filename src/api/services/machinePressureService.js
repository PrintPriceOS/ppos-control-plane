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
        // 1. Fetch Reservation Pressure
        const [reservations] = await db.query(`
            SELECT COUNT(*) as count 
            FROM manufacturing_reservations 
            WHERE node_id = ? AND status = 'PENDING' AND expires_at > NOW()
        `, [machineId]);

        // 2. Fetch Active Dispatches
        const [dispatches] = await db.query(`
            SELECT COUNT(*) as count 
            FROM manufacturing_dispatches 
            WHERE print_node_id = ? AND status IN ('RESERVED', 'QUEUED', 'ASSIGNED', 'IN_PRODUCTION')
        `, [machineId]);

        // 3. Fetch Oldest Queued Job
        const [oldestJob] = await db.query(`
            SELECT created_at 
            FROM manufacturing_dispatches 
            WHERE print_node_id = ? AND status = 'QUEUED'
            ORDER BY created_at ASC LIMIT 1
        `, [machineId]);

        const activeCount = (dispatches?.count || 0) + (reservations?.count || 0);
        
        // Saturation Heuristics (Deterministic)
        let saturation = (activeCount / 100) * 100; // Simplified: 100 is nominal capacity
        if (saturation > 100) saturation = 100;

        return {
            machine_id: machineId,
            queue_size: dispatches?.count || 0,
            oldest_queued_job: oldestJob?.created_at || null,
            estimated_backlog_mins: (dispatches?.count || 0) * 15, // 15 mins per job estimate
            overload_risk: saturation > 85 ? 'HIGH' : saturation > 60 ? 'MEDIUM' : 'LOW',
            dispatch_contention: reservations?.count || 0,
            reservation_pressure: (reservations?.count || 0) * 10, // Weighting
            pressure_bar_pct: Math.min(100, (activeCount / 50) * 100), // Visual scaling
            routing_eligibility: await this.getRoutingEligibility(machineId)
        };
    }

    /**
     * Determine routing eligibility based on live node state
     */
    async getRoutingEligibility(machineId) {
        const [nodeRows] = await db.query(`
            SELECT status, country, capabilities_json FROM print_nodes WHERE id = ?
        `, [machineId]);

        if (!nodeRows) return [];

        const node = nodeRows;
        const caps = typeof node.capabilities_json === 'string' 
            ? JSON.parse(node.capabilities_json) 
            : node.capabilities_json || {};

        const eligibility = [];

        // Geolocation Eligibility
        if (node.country === 'IE' || node.country === 'GB') eligibility.push('EU-WEST');
        if (['EE', 'LV', 'LT'].includes(node.country)) eligibility.push('BALTICS');
        if (['DE', 'AT', 'CH'].includes(node.country)) eligibility.push('DACH');

        // Product Eligibility
        if (caps.hardcover) eligibility.push('HARDCOVER');
        if (caps.large_format) eligibility.push('LARGE_FORMAT');
        if (node.status === 'ONLINE' && node.capacity_utilization_pct < 50) eligibility.push('URGENT_JOBS');
        
        // ESG / Policy Eligibility
        eligibility.push('CARBON_OPTIMIZED'); // Default for federation nodes

        return eligibility;
    }
}

module.exports = new MachinePressureService();
