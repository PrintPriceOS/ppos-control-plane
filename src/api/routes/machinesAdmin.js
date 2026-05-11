const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

/**
 * Normalization Helpers
 */

const normalizeJson = (val) => {
    if (!val) return {};
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch (e) {
        return {};
    }
};

const resolveMachineLocation = (node) => {
    const profile = normalizeJson(node.machine_profile_json);
    const metadata = normalizeJson(node.metadata_json);
    
    const city = node.city || metadata.city || profile.city || '';
    const country = node.country || metadata.country || profile.country || '';
    const region = node.region || metadata.region || profile.region || '';
    
    let label = 'Unknown';
    if (city && country) label = `${city}, ${country}`;
    else if (region) label = region;
    else if (country) label = country;
    
    return { city, country, region, label };
};

const resolveEconomicEfficiency = (node) => {
    const telemetry = normalizeJson(node.telemetry_json);
    const metrics = normalizeJson(node.metrics_json);
    
    const efficiency = node.economic_efficiency || 
                      telemetry.economic_efficiency || 
                      metrics.economic_efficiency;
    
    if (efficiency === undefined || efficiency === null) return null;
    return parseFloat(efficiency);
};

const resolveCapacityUtilization = (node) => {
    const telemetry = normalizeJson(node.telemetry_json);
    const metrics = normalizeJson(node.metrics_json);
    
    let cap = node.capacity_utilization_pct || 
              telemetry.capacity || 
              metrics.capacity_pct;
              
    if (cap === undefined || cap === null) return null;
    return Math.min(100, Math.max(0, parseFloat(cap)));
};

const resolveLastHeartbeat = (node) => {
    const telemetry = normalizeJson(node.telemetry_json);
    
    const hb = node.last_heartbeat_at || 
               node.lastHeartbeatAt || 
               telemetry.last_seen_at || 
               node.updated_at;
               
    return hb || null;
};

const resolveMachineHealth = (node, lastHeartbeatAt) => {
    if (!lastHeartbeatAt) return 'OFFLINE';
    
    const hbDate = new Date(lastHeartbeatAt);
    const ageMinutes = (Date.now() - hbDate.getTime()) / (1000 * 60);
    
    if (ageMinutes > 60) return 'OFFLINE';
    if (ageMinutes > 15) return 'DEGRADED';
    
    if (node.worker_state === 'BLOCKED' || node.machine_state === 'BLOCKED') return 'CAPACITY_BLOCKED';
    if (node.machine_state === 'PROCESSING') return 'PROCESSING';
    
    const cap = resolveCapacityUtilization(node);
    if (cap !== null && cap > 95) return 'DEGRADED';
    
    return node.status || 'ONLINE';
};

/**
 * GET /api/admin/machines
 * Returns live machines derived from print_nodes with normalized industrial telemetry.
 */
router.get('/', async (req, res) => {
    try {
        // Fetch from print_nodes as the primary registry
        const rows = await db.query('SELECT * FROM print_nodes');
        
        if (!rows || rows.length === 0) {
            return res.json({
                ok: true,
                total: 0,
                machines: [],
                status: "NOT_CONFIGURED"
            });
        }

        const machines = rows.map(node => {
            const lastHeartbeatAt = resolveLastHeartbeat(node);
            const location = resolveMachineLocation(node);
            const healthState = resolveMachineHealth(node, lastHeartbeatAt);
            
            return {
                id: node.id,
                tenantId: node.tenant_id,
                companyName: node.company_name,
                status: node.status,
                healthState,
                machineState: node.machine_state || 'IDLE',
                workerState: node.worker_state || 'IDLE',
                
                // Location Normalization
                city: location.city,
                country: location.country,
                region: location.region,
                locationLabel: location.label,
                
                // Telemetry Normalization
                capacityUtilizationPct: resolveCapacityUtilization(node),
                throughput: node.throughput || null,
                uptimeScore: node.uptime_score !== undefined ? parseFloat(node.uptime_score) : null,
                economicEfficiency: resolveEconomicEfficiency(node),
                
                // Federation Metadata
                federationId: node.federation_id || null,
                clusterId: node.cluster_id || node.continental_cluster_id || null,
                
                // Metadata
                capabilities: normalizeJson(node.capabilities_json),
                machineProfile: normalizeJson(node.machine_profile_json),
                rates: normalizeJson(node.rates_json),
                lastHeartbeatAt,
                updatedAt: node.updated_at
            };
        });

        res.json({
            ok: true,
            total: machines.length,
            machines,
            timestamp: new Date().toISOString(),
            status: "LIVE"
        });
    } catch (err) {
        console.error('[MACHINES-ADMIN] Error fetching machines:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
