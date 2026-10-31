/**
 * Machine Capability Service
 * 
 * Manages industrial machine capabilities and compatibility matrices.
 * Phase 34 - Live Federation Activation.
 */
const db = require('./mysqlClient');

class MachineCapabilityService {
    /**
     * Get industrial capabilities for a machine
     */
    async getCapabilities(machineId) {
        let targetId = machineId;
        if (targetId && targetId.startsWith('machine_') && targetId.endsWith('_primary')) {
            targetId = targetId.substring(8, targetId.length - 8);
        }

        try {
            const [capabilityRows] = await db.query(`
                SELECT * FROM machine_capabilities WHERE machine_id = ?
            `, [targetId]);

            if (!capabilityRows) {
                const [nodeRows] = await db.query(`
                    SELECT id, capabilities_json FROM print_nodes WHERE id = ?
                `, [targetId]);

                if (nodeRows && nodeRows.capabilities_json) {
                    const caps = typeof nodeRows.capabilities_json === 'string' 
                        ? JSON.parse(nodeRows.capabilities_json) 
                        : nodeRows.capabilities_json;
                    
                    return this.normalizeCapabilities(machineId, caps);
                }
                
                return this.getDefaultCapabilities(machineId);
            }

            return capabilityRows;
        } catch (e) {
            return this.getDefaultCapabilities(machineId);
        }
    }

    /**
     * Normalize capabilities from raw JSON
     */
    normalizeCapabilities(machineId, raw) {
        return {
            machine_id: machineId,
            paper_types: raw.papers || ['COATED', 'UNCOATED'],
            gsm_ranges: raw.gsm || ['80-350'],
            trim_formats: raw.formats || ['A4', 'A5', 'US-LETTER'],
            max_sheet_size: raw.max_size || 'B2',
            bindings: raw.bindings || ['PERFECT', 'SADDLE'],
            uv_support: raw.uv || false,
            varnish_support: raw.varnish || false,
            foil_support: raw.foil || false,
            hardcover_support: raw.hardcover || false,
            sewn_binding_support: raw.sewn || false,
            coating_support: true,
            lamination_support: true
        };
    }

    /**
     * Fallback for empty state
     */
    getDefaultCapabilities(machineId) {
        return {
            machine_id: machineId,
            paper_types: [],
            gsm_ranges: [],
            trim_formats: [],
            max_sheet_size: 'N/A',
            bindings: [],
            uv_support: false,
            varnish_support: false,
            foil_support: false,
            hardcover_support: false,
            sewn_binding_support: false,
            coating_support: false,
            lamination_support: false
        };
    }
}

module.exports = new MachineCapabilityService();
