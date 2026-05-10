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
     * Returns { matched: [], rejected: [] } for explainability.
     */
    async findMatchingMachines(requirements) {
        const { paper_type, sheet_size, colour_mode, binding, gsm, run_length } = requirements;
        
        const allMachines = await db.query('SELECT * FROM print_node_machine_profiles WHERE status = "ACTIVE"');
        
        const matched = [];
        const rejected = [];

        for (const m of allMachines) {
            const caps = typeof m.normalized_capabilities_json === 'string' 
                ? JSON.parse(m.normalized_capabilities_json) 
                : m.normalized_capabilities_json;
            
            if (!caps) {
                rejected.push({ id: m.id, nodeId: m.node_id, reason: 'MISSING_CAPABILITIES' });
                continue;
            }

            // Normalization for comparison
            const targetPaper = paper_type?.toLowerCase();
            const targetBinding = binding?.toLowerCase();
            const targetColour = colour_mode?.toLowerCase();

            const supportedPapers = (caps.paper_types || []).map(s => s.toLowerCase());
            const supportedBindings = (caps.binding || []).map(s => s.toLowerCase());
            const supportedColours = (caps.colour_modes || []).map(s => s.toLowerCase());

            // Technical compatibility checks
            if (targetPaper && !supportedPapers.includes(targetPaper)) {
                rejected.push({ id: m.id, nodeId: m.node_id, reason: 'PAPER_NOT_SUPPORTED', details: { target: targetPaper, supported: supportedPapers } });
                continue;
            }

            if (targetBinding && !supportedBindings.includes(targetBinding)) {
                rejected.push({ id: m.id, nodeId: m.node_id, reason: 'BINDING_NOT_SUPPORTED', details: { target: targetBinding, supported: supportedBindings } });
                continue;
            }

            if (targetColour && !supportedColours.includes(targetColour)) {
                rejected.push({ id: m.id, nodeId: m.node_id, reason: 'COLOUR_NOT_SUPPORTED', details: { target: targetColour, supported: supportedColours } });
                continue;
            }
            
            if (gsm && (gsm < (caps.min_gsm || 60) || gsm > (caps.max_gsm || 350))) {
                rejected.push({ id: m.id, nodeId: m.node_id, reason: 'GSM_OUT_OF_RANGE', details: { gsm, min: caps.min_gsm, max: caps.max_gsm } });
                continue;
            }

            if (run_length) {
                const minRun = caps.min_run || 0;
                const maxRun = caps.max_run || 0;
                if (run_length < minRun || (maxRun > 0 && run_length > maxRun)) {
                    rejected.push({ id: m.id, nodeId: m.node_id, reason: 'RUN_SIZE_OUT_OF_RANGE', details: { run_length, min: minRun, max: maxRun } });
                    continue;
                }
            }

            if (sheet_size && caps.max_sheet && caps.max_sheet.width > 0) {
                if (sheet_size.width > caps.max_sheet.width || sheet_size.height > caps.max_sheet.height) {
                    rejected.push({ id: m.id, nodeId: m.node_id, reason: 'SHEET_SIZE_TOO_LARGE', details: { target: sheet_size, max: caps.max_sheet } });
                    continue;
                }
            }

            matched.push({
                ...m,
                normalized_capabilities_json: caps
            });
        }

        return { matched, rejected };
    }
}

module.exports = new MachineRegistryService();
