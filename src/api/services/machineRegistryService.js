/**
 * Machine Registry Service
 * 
 * Manages industrial machine capabilities and technical specifications.
 * Normalizes machine profiles for autonomous routing decisions.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('machine-registry');
const { v4: uuidv4 } = require('uuid');

class MachineRegistryService {
    /**
     * Normalizes a machine profile into a standard capability JSON.
     */
    normalizeCapabilities(rawData) {
        // Industry-standard defaults and structure
        const capabilities = {
            paper_types: rawData.paper_types || ['mc', 'offset', 'munken'],
            max_sheet: rawData.max_sheet || { width: 0, height: 0 },
            min_sheet: rawData.min_sheet || { width: 0, height: 0 },
            colour_modes: rawData.colour_modes || ['1/1', '4/4'],
            binding: rawData.binding || ['pb', 'hc'],
            min_run: rawData.min_run || 0,
            max_run: rawData.max_run || 0,
            max_gsm: rawData.max_gsm || 350,
            min_gsm: rawData.min_gsm || 60,
            last_normalized_at: new Date().toISOString()
        };

        // Specific extraction logic for known formats
        if (rawData.format && typeof rawData.format === 'string') {
            const parts = rawData.format.toLowerCase().split('x').map(s => parseInt(s.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                capabilities.max_sheet = { width: parts[0], height: parts[1] };
            }
        }

        return capabilities;
    }

    /**
     * Register or update a machine within a node.
     */
    async registerMachine(nodeId, machineData) {
        const id = machineData.id || uuidv4();
        const { 
            profile_name, 
            profile_type = 'OFFSET', 
            manufacturer = 'UNKNOWN', 
            model = 'UNKNOWN', 
            raw_data_json = {} 
        } = machineData;

        const normalized = this.normalizeCapabilities(raw_data_json);

        const sql = `
            INSERT INTO print_node_machine_profiles (
                id, node_id, profile_name, profile_type, manufacturer, model, 
                raw_data_json, normalized_capabilities_json, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
            ON DUPLICATE KEY UPDATE
                profile_name = VALUES(profile_name),
                profile_type = VALUES(profile_type),
                manufacturer = VALUES(manufacturer),
                model = VALUES(model),
                raw_data_json = VALUES(raw_data_json),
                normalized_capabilities_json = VALUES(normalized_capabilities_json),
                status = VALUES(status),
                updated_at = CURRENT_TIMESTAMP
        `;

        try {
            await db.query(sql, [
                id, nodeId, profile_name, profile_type, manufacturer, model, 
                JSON.stringify(raw_data_json), JSON.stringify(normalized)
            ]);

            logger.info({
                event: 'machine_registered',
                nodeId,
                machineId: id,
                profileName: profile_name
            });

            return { id, normalized_capabilities: normalized };
        } catch (err) {
            logger.error({
                event: 'machine_registration_failed',
                nodeId,
                error: err.message
            });
            throw err;
        }
    }

    /**
     * Get all machines for a node with their capabilities.
     */
    async getMachinesForNode(nodeId) {
        const rows = await db.query('SELECT * FROM print_node_machine_profiles WHERE node_id = ?', [nodeId]);
        return rows.map(row => ({
            ...row,
            raw_data_json: typeof row.raw_data_json === 'string' ? JSON.parse(row.raw_data_json) : row.raw_data_json,
            normalized_capabilities_json: typeof row.normalized_capabilities_json === 'string' ? JSON.parse(row.normalized_capabilities_json) : row.normalized_capabilities_json
        }));
    }

    /**
     * Find machines across the network matching technical requirements.
     */
    async findMatchingMachines(requirements) {
        const { paper_type, sheet_size, colour_mode, binding, gsm, run_length } = requirements;
        
        // Fetch active machines
        const allMachines = await db.query('SELECT * FROM print_node_machine_profiles WHERE status = "ACTIVE"');
        
        return allMachines.filter(m => {
            const caps = typeof m.normalized_capabilities_json === 'string' 
                ? JSON.parse(m.normalized_capabilities_json) 
                : m.normalized_capabilities_json;
            
            if (!caps) return false;

            // Technical compatibility checks
            if (paper_type && Array.isArray(caps.paper_types) && !caps.paper_types.includes(paper_type)) return false;
            if (colour_mode && Array.isArray(caps.colour_modes) && !caps.colour_modes.includes(colour_mode)) return false;
            if (binding && Array.isArray(caps.binding) && !caps.binding.includes(binding)) return false;
            
            if (gsm && (gsm < (caps.min_gsm || 0) || gsm > (caps.max_gsm || 999))) return false;
            if (run_length && (run_length < (caps.min_run || 0) || (caps.max_run > 0 && run_length > caps.max_run))) return false;

            if (sheet_size && caps.max_sheet && caps.max_sheet.width > 0) {
                if (sheet_size.width > caps.max_sheet.width || sheet_size.height > caps.max_sheet.height) return false;
            }

            return true;
        });
    }
}

module.exports = new MachineRegistryService();
