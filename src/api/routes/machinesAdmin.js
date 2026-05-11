const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

/**
 * GET /api/admin/machines
 * Returns live machines derived from print_nodes.
 */
router.get('/', async (req, res) => {
    try {
        const rows = await db.query('SELECT * FROM print_nodes');
        
        if (!rows || rows.length === 0) {
            return res.json({
                ok: true,
                total: 0,
                machines: [],
                status: "NOT_CONFIGURED"
            });
        }

        const normalizeJson = (val) => {
            if (!val) return {};
            if (typeof val === 'object') return val;
            try {
                return JSON.parse(val);
            } catch (e) {
                return {};
            }
        };

        const machines = rows.map(node => ({
            id: node.id,
            tenantId: node.tenant_id,
            companyName: node.company_name,
            status: node.status,
            licenseStatus: node.license_status,
            country: node.country,
            city: node.city,
            region: node.region,
            locationLabel: node.city && node.country ? `${node.city}, ${node.country}` : (node.city || node.country || 'Unknown'),
            machineState: node.machine_state,
            workerState: node.worker_state,
            capacityUtilizationPct: node.capacity_utilization_pct,
            maxFileSizeMb: node.max_file_size_mb,
            throughput: node.throughput,
            uptimeScore: node.uptime_score,
            economicEfficiency: node.economic_efficiency,
            capabilities: normalizeJson(node.capabilities_json),
            machineProfile: normalizeJson(node.machine_profile_json),
            supportedPolicies: normalizeJson(node.supported_policies_json),
            supportedProducts: normalizeJson(node.supported_products),
            bindingCapabilities: normalizeJson(node.binding_capabilities),
            colorProfiles: normalizeJson(node.color_profiles),
            rates: normalizeJson(node.rates_json),
            lastHeartbeatAt: node.last_heartbeat_at,
            updatedAt: node.updated_at
        }));

        res.json({
            ok: true,
            total: machines.length,
            machines,
            status: "LIVE"
        });
    } catch (err) {
        console.error('[MACHINES-ADMIN] Error fetching machines:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
