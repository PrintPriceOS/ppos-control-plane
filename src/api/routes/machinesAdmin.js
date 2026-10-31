const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const { requireAdmin, resolveActorContext } = require('../middleware/auth');

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
    const caps = normalizeJson(node.capabilities_json);
    
    const city = node.city || metadata.city || profile.city || caps.city || '';
    const country = node.country || metadata.country || profile.country || caps.country || '';
    const region = node.region || metadata.region || profile.region || caps.region || '';
    
    let label = '';
    let needsProfile = false;
    
    if (city && country) {
        label = `${city}, ${country}`;
    } else if (region) {
        label = region;
    } else if (country) {
        label = country;
    } else {
        label = "Unassigned location";
        needsProfile = true;
    }
    
    return { city, country, region, label, needsProfile };
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
    
    // Check utilization for degradation
    const cap = node.capacity_utilization_pct;
    if (cap !== null && cap !== undefined && parseFloat(cap) > 95) return 'DEGRADED';
    
    return node.status || 'ONLINE';
};

const resolveEconomicEfficiency = (node, healthState) => {
    if (healthState === 'OFFLINE') return null;
    
    const telemetry = normalizeJson(node.telemetry_json);
    const metrics = normalizeJson(node.metrics_json);
    
    const efficiency = node.economic_efficiency || 
                      telemetry.economic_efficiency || 
                      metrics.economic_efficiency;
    
    if (efficiency === undefined || efficiency === null || parseFloat(efficiency) === 0) return null;
    
    // Special case: ignore static 1.00% if it feels like a default/fake value
    // (In this system, 1.00 is often the unconfigured default)
    if (parseFloat(efficiency) === 1.00 && !node.economic_efficiency) return null;

    return parseFloat(efficiency);
};

const resolveCapacityUtilization = (node, healthState) => {
    // Capacity can persist even if offline if it was recorded, but usually N/A is safer for live telemetry
    if (healthState === 'OFFLINE') return null;

    const telemetry = normalizeJson(node.telemetry_json);
    const metrics = normalizeJson(node.metrics_json);
    
    let cap = node.capacity_utilization_pct || 
              telemetry.capacity || 
              metrics.capacity_pct;
              
    if (cap === undefined || cap === null) return null;
    return Math.min(100, Math.max(0, parseFloat(cap)));
};

const calculateCompleteness = (node, location, healthState) => {
    const missingProfileFields = [];
    if (!node.company_name || node.company_name.includes('Node')) missingProfileFields.push('company_name');
    if (location.needsProfile) missingProfileFields.push('location');
    
    const caps = normalizeJson(node.capabilities_json);
    if (!caps || Object.keys(caps).length === 0) missingProfileFields.push('capabilities');
    
    const rates = normalizeJson(node.rates_json);
    if (!rates || Object.keys(rates).length === 0) missingProfileFields.push('rates');
    
    const profileScore = Math.max(0, 100 - (missingProfileFields.length * 25));
    
    const missingTelemetry = [];
    if (healthState === 'OFFLINE') missingTelemetry.push('heartbeat');
    
    const cap = resolveCapacityUtilization(node, healthState);
    if (cap === null) missingTelemetry.push('capacity');
    
    if (node.uptime_score === null || (parseFloat(node.uptime_score) === 100 && healthState === 'OFFLINE')) {
        // If offline, 100% uptime is dishonest
        missingTelemetry.push('uptime');
    }
    
    const efficiency = resolveEconomicEfficiency(node, healthState);
    if (efficiency === null) missingTelemetry.push('efficiency');
    
    const telemetryScore = Math.max(0, 100 - (missingTelemetry.length * 25));
    
    return {
        profileCompletenessScore: profileScore,
        missingProfileFields,
        telemetryCompletenessScore: telemetryScore,
        missingTelemetry
    };
};

/**
 * GET /api/admin/machines
 * Returns live machines derived from print_nodes with normalized industrial telemetry.
 */
router.get('/', async (req, res) => {
    const context = resolveActorContext(req);
    try {
        let sql = `
            SELECT pn.*, pm.printhouse_id 
            FROM print_nodes pn
            LEFT JOIN printhouse_machines pm ON pn.id = pm.id
            WHERE 1=1
        `;
        const params = [];

        if (!context.isSuperAdmin) {
            if (context.tenantId) {
                sql += ` AND pn.tenant_id = ?`;
                params.push(context.tenantId);
            }
            if (context.printhouseId) {
                sql += ` AND pm.printhouse_id = ?`;
                params.push(context.printhouseId);
            }
        }

        const rows = await db.query(sql, params);
        
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
            
            const completeness = calculateCompleteness(node, location, healthState);
            
            // Truthful metrics
            const capacityUtilizationPct = resolveCapacityUtilization(node, healthState);
            const economicEfficiency = resolveEconomicEfficiency(node, healthState);
            
            // Uptime is dishonest if 100% for offline machines
            let uptimeScore = node.uptime_score !== undefined && node.uptime_score !== null ? parseFloat(node.uptime_score) : null;
            if (healthState === 'OFFLINE') uptimeScore = null;

            return {
                id: node.id,
                tenantId: node.tenant_id,
                printhouseId: node.printhouse_id || null,
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
                needsProfile: location.needsProfile,
                
                // Telemetry Normalization
                capacityUtilizationPct,
                throughput: node.throughput || null,
                uptimeScore,
                economicEfficiency,
                
                // Federation Metadata
                federationId: node.federation_id || null,
                clusterId: node.cluster_id || null,
                
                // Completeness Scores
                ...completeness,
                
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
