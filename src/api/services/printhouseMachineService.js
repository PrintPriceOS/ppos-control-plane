'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

// ──── Constants ────────────────────────────────────────────────────────────────

/** Fields that MUST NOT be mutated through the public API */
const PROTECTED_FIELDS = [
    'id',
    'tenant_id',
    'printhouse_id',
    'printer_node_id',
    'approved',
    'verified',
    'marketplace_enabled',
    'routing_enabled',
    'production_enabled',
    'license_status',
    'risk_status',
    'internal_score',
    'created_at',
    'created_by',
    'updated_at'
];

/** Valid machine types */
const VALID_MACHINE_TYPES = [
    'OFFSET_PRESS', 'DIGITAL_PRESS', 'LARGE_FORMAT', 'BINDER',
    'FINISHER', 'CUTTER', 'FOLDER', 'LAMINATOR', 'OTHER'
];

/** Valid machine statuses */
const VALID_STATUSES = ['ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED', 'ARCHIVED'];

/** Canonical technical capability enums */
const VALID_COLOR_MODES = ['CMYK', 'CMYK+SPOT', 'CMYK+WHITE', 'RGB', 'GRAYSCALE', 'MONOCHROME', 'SPOT_ONLY'];
const VALID_PRINT_METHODS = ['SHEETFED_OFFSET', 'DIGITAL_TONER', 'DIGITAL_INKJET', 'WIDE_FORMAT_INKJET', 'WEB_OFFSET', 'FLEXO', 'SCREEN_PRINTING'];
const VALID_SIDES = ['SIMPLEX', 'DUPLEX'];

/**
 * Machine templates: pre-populated defaults for common machine types.
 * Used in the Setup Hub to accelerate onboarding.
 */
const MACHINE_TEMPLATES = {
    OFFSET_PRESS: {
        machine_type: 'OFFSET_PRESS',
        max_sheet_width_mm: 720,
        max_sheet_height_mm: 1020,
        min_sheet_width_mm: 210,
        min_sheet_height_mm: 297,
        max_print_width_mm: 710,
        max_print_height_mm: 1010,
        supported_color_modes_json: ['CMYK', 'CMYK+SPOT'],
        supported_print_methods_json: ['SHEETFED_OFFSET'],
        supported_sides_json: ['SIMPLEX', 'DUPLEX'],
        max_tac_percent: 320,
        supports_pdfx: true,
        supports_pdfa: false,
        supports_variable_data: false,
        supports_white_ink: false,
        supports_spot_uv: false,
        supports_lamination: false,
        supports_hardcover: false,
        supports_softcover: false,
        supports_saddle_stitch: false,
        supports_perfect_binding: false,
        supports_case_binding: false
    },
    DIGITAL_PRESS: {
        machine_type: 'DIGITAL_PRESS',
        max_sheet_width_mm: 330,
        max_sheet_height_mm: 488,
        min_sheet_width_mm: 100,
        min_sheet_height_mm: 148,
        max_print_width_mm: 320,
        max_print_height_mm: 480,
        supported_color_modes_json: ['CMYK'],
        supported_print_methods_json: ['DIGITAL_TONER', 'DIGITAL_INKJET'],
        supported_sides_json: ['SIMPLEX', 'DUPLEX'],
        max_tac_percent: 280,
        supports_pdfx: true,
        supports_pdfa: true,
        supports_variable_data: true,
        supports_white_ink: false,
        supports_spot_uv: false,
        supports_lamination: false,
        supports_hardcover: false,
        supports_softcover: false,
        supports_saddle_stitch: false,
        supports_perfect_binding: false,
        supports_case_binding: false
    },
    LARGE_FORMAT: {
        machine_type: 'LARGE_FORMAT',
        max_sheet_width_mm: 2500,
        max_sheet_height_mm: 1300,
        min_sheet_width_mm: 200,
        min_sheet_height_mm: 200,
        max_print_width_mm: 2500,
        max_print_height_mm: 1300,
        supported_color_modes_json: ['CMYK', 'CMYK+WHITE'],
        supported_print_methods_json: ['WIDE_FORMAT_INKJET'],
        supported_sides_json: ['SIMPLEX'],
        max_tac_percent: 250,
        supports_pdfx: false,
        supports_pdfa: false,
        supports_variable_data: false,
        supports_white_ink: true,
        supports_spot_uv: false,
        supports_lamination: true,
        supports_hardcover: false,
        supports_softcover: false,
        supports_saddle_stitch: false,
        supports_perfect_binding: false,
        supports_case_binding: false
    },
    BINDER: {
        machine_type: 'BINDER',
        supported_color_modes_json: [],
        supported_print_methods_json: [],
        supported_sides_json: [],
        supports_pdfx: false,
        supports_pdfa: false,
        supports_variable_data: false,
        supports_white_ink: false,
        supports_spot_uv: false,
        supports_lamination: false,
        supports_hardcover: true,
        supports_softcover: true,
        supports_saddle_stitch: true,
        supports_perfect_binding: true,
        supports_case_binding: true
    },
    FINISHER: {
        machine_type: 'FINISHER',
        supported_color_modes_json: [],
        supported_print_methods_json: [],
        supported_sides_json: [],
        supports_pdfx: false,
        supports_pdfa: false,
        supports_variable_data: false,
        supports_white_ink: false,
        supports_spot_uv: true,
        supports_lamination: true,
        supports_hardcover: false,
        supports_softcover: false,
        supports_saddle_stitch: false,
        supports_perfect_binding: false,
        supports_case_binding: false
    }
};

// ──── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJson(str, fallback = {}) {
    if (!str) return fallback;
    if (typeof str !== 'string') return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

/**
 * Strip internal / protected fields from a machine row for API consumers.
 */
function makeMachinePublic(row) {
    if (!row) return null;
    const out = { ...row };
    out.supported_color_modes_json = safeParseJson(out.supported_color_modes_json, []);
    out.supported_print_methods_json = safeParseJson(out.supported_print_methods_json, []);
    out.supported_sides_json = safeParseJson(out.supported_sides_json, []);
    out.metadata_json = safeParseJson(out.metadata_json, {});
    out.supports_pdfx = !!out.supports_pdfx;
    out.supports_pdfa = !!out.supports_pdfa;
    out.supports_variable_data = !!out.supports_variable_data;
    out.supports_white_ink = !!out.supports_white_ink;
    out.supports_spot_uv = !!out.supports_spot_uv;
    out.supports_lamination = !!out.supports_lamination;
    out.supports_hardcover = !!out.supports_hardcover;
    out.supports_softcover = !!out.supports_softcover;
    out.supports_saddle_stitch = !!out.supports_saddle_stitch;
    out.supports_perfect_binding = !!out.supports_perfect_binding;
    out.supports_case_binding = !!out.supports_case_binding;
    return out;
}

/**
 * Remove protected fields from user-supplied payloads.
 */
function stripProtectedFields(payload) {
    const sanitised = { ...payload };
    for (const field of PROTECTED_FIELDS) {
        delete sanitised[field];
    }
    return sanitised;
}

/**
 * Detect attempted mutation of protected fields.
 */
function checkProtectedFields(payload) {
    if (!payload) return;
    const violations = [];
    for (const key of PROTECTED_FIELDS) {
        if (payload[key] !== undefined) {
            violations.push(key);
        }
    }
    if (violations.length > 0) {
        const error = new Error('FIELD_NOT_EDITABLE');
        error.fields = violations;
        throw error;
    }
}

// ──── Service ──────────────────────────────────────────────────────────────────

class PrinthouseMachineService {
    generateId(prefix) {
        return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
    }

    async getPrinterNode(siteId) {
        const rows = await db.query('SELECT * FROM printer_nodes WHERE id = ?', [siteId]);
        return rows[0] || null;
    }

    /**
     * Validate a machine payload. Throws on invalid data.
     */
    validateMachinePayload(payload, isCreate = false) {
        // Required fields on creation
        if (isCreate) {
            if (!payload.machine_name || typeof payload.machine_name !== 'string' || payload.machine_name.trim().length < 2) {
                throw new Error('INVALID_NAME: machine_name is required (min 2 characters)');
            }
            if (!payload.machine_type) {
                throw new Error('INVALID_TYPE: machine_type is required');
            }
        }

        // Machine type validation
        if (payload.machine_type && !VALID_MACHINE_TYPES.includes(payload.machine_type)) {
            throw new Error(`INVALID_TYPE: machine_type must be one of: ${VALID_MACHINE_TYPES.join(', ')}`);
        }

        // Status validation
        if (payload.status && !VALID_STATUSES.includes(payload.status)) {
            throw new Error(`INVALID_STATUS: status must be one of: ${VALID_STATUSES.join(', ')}`);
        }

        // Dimensional constraints
        const dimFields = [
            'max_sheet_width_mm', 'max_sheet_height_mm',
            'min_sheet_width_mm', 'min_sheet_height_mm',
            'max_print_width_mm', 'max_print_height_mm'
        ];
        for (const dim of dimFields) {
            if (payload[dim] !== undefined && payload[dim] !== null) {
                if (typeof payload[dim] !== 'number' || !Number.isFinite(payload[dim]) || Number.isNaN(payload[dim]) || payload[dim] <= 0) {
                    throw new Error(`INVALID_DIMENSIONS: ${dim} must be a positive number > 0`);
                }
            }
        }

        if (payload.max_sheet_width_mm !== undefined && payload.min_sheet_width_mm !== undefined &&
            payload.max_sheet_width_mm !== null && payload.min_sheet_width_mm !== null) {
            if (payload.max_sheet_width_mm <= payload.min_sheet_width_mm) {
                throw new Error('INVALID_DIMENSIONS: max_sheet_width_mm must be greater than min_sheet_width_mm');
            }
        }
        if (payload.max_sheet_height_mm !== undefined && payload.min_sheet_height_mm !== undefined &&
            payload.max_sheet_height_mm !== null && payload.min_sheet_height_mm !== null) {
            if (payload.max_sheet_height_mm <= payload.min_sheet_height_mm) {
                throw new Error('INVALID_DIMENSIONS: max_sheet_height_mm must be greater than min_sheet_height_mm');
            }
        }
        if (payload.max_print_width_mm !== undefined && payload.max_sheet_width_mm !== undefined &&
            payload.max_print_width_mm !== null && payload.max_sheet_width_mm !== null) {
            if (payload.max_print_width_mm > payload.max_sheet_width_mm) {
                throw new Error('INVALID_DIMENSIONS: max_print_width_mm cannot exceed max_sheet_width_mm');
            }
        }
        if (payload.max_print_height_mm !== undefined && payload.max_sheet_height_mm !== undefined &&
            payload.max_print_height_mm !== null && payload.max_sheet_height_mm !== null) {
            if (payload.max_print_height_mm > payload.max_sheet_height_mm) {
                throw new Error('INVALID_DIMENSIONS: max_print_height_mm cannot exceed max_sheet_height_mm');
            }
        }

        // Color modes array validation
        if (payload.supported_color_modes_json !== undefined && payload.supported_color_modes_json !== null) {
            if (!Array.isArray(payload.supported_color_modes_json)) {
                throw new Error('INVALID_COLOR_MODES: supported_color_modes_json must be an array');
            }
            for (const mode of payload.supported_color_modes_json) {
                if (typeof mode !== 'string' || !VALID_COLOR_MODES.includes(mode)) {
                    throw new Error(`INVALID_COLOR_MODES: unknown color mode '${mode}'`);
                }
            }
        }

        // Print methods array validation
        if (payload.supported_print_methods_json !== undefined && payload.supported_print_methods_json !== null) {
            if (!Array.isArray(payload.supported_print_methods_json)) {
                throw new Error('INVALID_PRINT_METHODS: supported_print_methods_json must be an array');
            }
            for (const method of payload.supported_print_methods_json) {
                if (typeof method !== 'string' || !VALID_PRINT_METHODS.includes(method)) {
                    throw new Error(`INVALID_PRINT_METHODS: unknown print method '${method}'`);
                }
            }
        }

        // Sides array validation
        if (payload.supported_sides_json !== undefined && payload.supported_sides_json !== null) {
            if (!Array.isArray(payload.supported_sides_json)) {
                throw new Error('INVALID_SIDES: supported_sides_json must be an array');
            }
            for (const side of payload.supported_sides_json) {
                if (typeof side !== 'string' || !VALID_SIDES.includes(side)) {
                    throw new Error(`INVALID_SIDES: unknown side '${side}'`);
                }
            }
        }

        // TAC
        if (payload.max_tac_percent !== undefined && payload.max_tac_percent !== null) {
            if (payload.max_tac_percent < 100 || payload.max_tac_percent > 400) {
                throw new Error('INVALID_TAC: max_tac_percent must be between 100 and 400');
            }
        }

        // Non-negative constraints
        if (payload.max_pages_per_job !== undefined && payload.max_pages_per_job !== null && payload.max_pages_per_job < 0) {
            throw new Error('INVALID_PAGES: max_pages_per_job must be >= 0');
        }
        if (payload.max_file_size_mb !== undefined && payload.max_file_size_mb !== null && payload.max_file_size_mb < 0) {
            throw new Error('INVALID_FILE_SIZE: max_file_size_mb must be >= 0');
        }
    }

    /**
     * Return the list of available machine templates.
     */
    getTemplates() {
        return Object.entries(MACHINE_TEMPLATES).map(([key, tmpl]) => ({
            template_id: key,
            machine_type: tmpl.machine_type,
            defaults: tmpl
        }));
    }

    /**
     * Apply a machine template to a payload (pre-populate defaults).
     */
    applyTemplate(templateId, overrides = {}) {
        const tmpl = MACHINE_TEMPLATES[templateId];
        if (!tmpl) throw new Error('INVALID_TEMPLATE: unknown template_id');
        return { ...tmpl, ...stripProtectedFields(overrides) };
    }

    async createMachine(tenantId, siteId, payload, actorContext) {
        checkProtectedFields(payload);
        const node = await this.getPrinterNode(siteId);
        if (!node) throw new Error('SITE_NOT_FOUND');
        if (node.tenant_id !== tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');

        // Apply template if specified
        let effectivePayload = stripProtectedFields(payload);
        if (payload.template_id) {
            effectivePayload = this.applyTemplate(payload.template_id, effectivePayload);
        }

        this.validateMachinePayload(effectivePayload, true);

        const id = this.generateId('mach');
        await db.query(`
            INSERT INTO printhouse_machines
            (id, printhouse_id, tenant_id, machine_name, machine_type, manufacturer, model, status,
             max_sheet_width_mm, max_sheet_height_mm, min_sheet_width_mm, min_sheet_height_mm,
             max_print_width_mm, max_print_height_mm, supported_color_modes_json, supported_print_methods_json,
             supported_sides_json, max_pages_per_job, max_file_size_mb, max_tac_percent, supports_pdfx, supports_pdfa,
             supports_variable_data, supports_white_ink, supports_spot_uv, supports_lamination, supports_hardcover,
             supports_softcover, supports_saddle_stitch, supports_perfect_binding, supports_case_binding, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, siteId, tenantId, effectivePayload.machine_name, effectivePayload.machine_type,
            effectivePayload.manufacturer || null, effectivePayload.model || null,
            effectivePayload.status || 'ACTIVE',
            effectivePayload.max_sheet_width_mm || null, effectivePayload.max_sheet_height_mm || null,
            effectivePayload.min_sheet_width_mm || null, effectivePayload.min_sheet_height_mm || null,
            effectivePayload.max_print_width_mm || null, effectivePayload.max_print_height_mm || null,
            effectivePayload.supported_color_modes_json ? JSON.stringify(effectivePayload.supported_color_modes_json) : null,
            effectivePayload.supported_print_methods_json ? JSON.stringify(effectivePayload.supported_print_methods_json) : null,
            effectivePayload.supported_sides_json ? JSON.stringify(effectivePayload.supported_sides_json) : null,
            effectivePayload.max_pages_per_job || null, effectivePayload.max_file_size_mb || null,
            effectivePayload.max_tac_percent || null,
            effectivePayload.supports_pdfx !== undefined ? (effectivePayload.supports_pdfx ? 1 : 0) : 0,
            effectivePayload.supports_pdfa !== undefined ? (effectivePayload.supports_pdfa ? 1 : 0) : 0,
            effectivePayload.supports_variable_data !== undefined ? (effectivePayload.supports_variable_data ? 1 : 0) : 0,
            effectivePayload.supports_white_ink !== undefined ? (effectivePayload.supports_white_ink ? 1 : 0) : 0,
            effectivePayload.supports_spot_uv !== undefined ? (effectivePayload.supports_spot_uv ? 1 : 0) : 0,
            effectivePayload.supports_lamination !== undefined ? (effectivePayload.supports_lamination ? 1 : 0) : 0,
            effectivePayload.supports_hardcover !== undefined ? (effectivePayload.supports_hardcover ? 1 : 0) : 0,
            effectivePayload.supports_softcover !== undefined ? (effectivePayload.supports_softcover ? 1 : 0) : 0,
            effectivePayload.supports_saddle_stitch !== undefined ? (effectivePayload.supports_saddle_stitch ? 1 : 0) : 0,
            effectivePayload.supports_perfect_binding !== undefined ? (effectivePayload.supports_perfect_binding ? 1 : 0) : 0,
            effectivePayload.supports_case_binding !== undefined ? (effectivePayload.supports_case_binding ? 1 : 0) : 0,
            effectivePayload.metadata_json ? JSON.stringify(effectivePayload.metadata_json) : null
        ]);

        return await this.getMachine(tenantId, siteId, id);
    }

    async getMachine(tenantId, siteId, machineId) {
        const rows = await db.query(
            'SELECT * FROM printhouse_machines WHERE id = ? AND printhouse_id = ? AND tenant_id = ?',
            [machineId, siteId, tenantId]
        );
        return makeMachinePublic(rows[0]);
    }

    async listMachines(tenantId, siteId) {
        const node = await this.getPrinterNode(siteId);
        if (!node) throw new Error('SITE_NOT_FOUND');
        if (node.tenant_id !== tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');

        const rows = await db.query(
            'SELECT * FROM printhouse_machines WHERE printhouse_id = ? AND tenant_id = ?',
            [siteId, tenantId]
        );
        return rows.map(makeMachinePublic);
    }

    /**
     * Count all active machines for a tenant (across all sites).
     */
    async countMachinesForTenant(tenantId) {
        const rows = await db.query(
            'SELECT COUNT(*) AS cnt FROM printhouse_machines WHERE tenant_id = ? AND status != ?',
            [tenantId, 'ARCHIVED']
        );
        return rows[0]?.cnt || 0;
    }

    async updateMachine(tenantId, siteId, machineId, payload, actorContext) {
        checkProtectedFields(payload);
        const before = await this.getMachine(tenantId, siteId, machineId);
        if (!before) throw new Error('MACHINE_NOT_FOUND');

        // Strip protected fields
        const safePayload = stripProtectedFields(payload);
        const merged = { ...before, ...safePayload };
        this.validateMachinePayload(merged);

        await db.query(`
            UPDATE printhouse_machines
            SET machine_name = COALESCE(?, machine_name),
                machine_type = COALESCE(?, machine_type),
                manufacturer = COALESCE(?, manufacturer),
                model = COALESCE(?, model),
                status = COALESCE(?, status),
                max_sheet_width_mm = COALESCE(?, max_sheet_width_mm),
                max_sheet_height_mm = COALESCE(?, max_sheet_height_mm),
                min_sheet_width_mm = COALESCE(?, min_sheet_width_mm),
                min_sheet_height_mm = COALESCE(?, min_sheet_height_mm),
                max_print_width_mm = COALESCE(?, max_print_width_mm),
                max_print_height_mm = COALESCE(?, max_print_height_mm),
                supported_color_modes_json = COALESCE(?, supported_color_modes_json),
                supported_print_methods_json = COALESCE(?, supported_print_methods_json),
                supported_sides_json = COALESCE(?, supported_sides_json),
                max_pages_per_job = COALESCE(?, max_pages_per_job),
                max_file_size_mb = COALESCE(?, max_file_size_mb),
                max_tac_percent = COALESCE(?, max_tac_percent),
                supports_pdfx = COALESCE(?, supports_pdfx),
                supports_pdfa = COALESCE(?, supports_pdfa),
                supports_variable_data = COALESCE(?, supports_variable_data),
                supports_white_ink = COALESCE(?, supports_white_ink),
                supports_spot_uv = COALESCE(?, supports_spot_uv),
                supports_lamination = COALESCE(?, supports_lamination),
                supports_hardcover = COALESCE(?, supports_hardcover),
                supports_softcover = COALESCE(?, supports_softcover),
                supports_saddle_stitch = COALESCE(?, supports_saddle_stitch),
                supports_perfect_binding = COALESCE(?, supports_perfect_binding),
                supports_case_binding = COALESCE(?, supports_case_binding),
                metadata_json = COALESCE(?, metadata_json)
            WHERE id = ? AND printhouse_id = ? AND tenant_id = ?
        `, [
            safePayload.machine_name || null,
            safePayload.machine_type || null,
            safePayload.manufacturer || null,
            safePayload.model || null,
            safePayload.status || null,
            safePayload.max_sheet_width_mm !== undefined ? safePayload.max_sheet_width_mm : null,
            safePayload.max_sheet_height_mm !== undefined ? safePayload.max_sheet_height_mm : null,
            safePayload.min_sheet_width_mm !== undefined ? safePayload.min_sheet_width_mm : null,
            safePayload.min_sheet_height_mm !== undefined ? safePayload.min_sheet_height_mm : null,
            safePayload.max_print_width_mm !== undefined ? safePayload.max_print_width_mm : null,
            safePayload.max_print_height_mm !== undefined ? safePayload.max_print_height_mm : null,
            safePayload.supported_color_modes_json !== undefined ? JSON.stringify(safePayload.supported_color_modes_json) : null,
            safePayload.supported_print_methods_json !== undefined ? JSON.stringify(safePayload.supported_print_methods_json) : null,
            safePayload.supported_sides_json !== undefined ? JSON.stringify(safePayload.supported_sides_json) : null,
            safePayload.max_pages_per_job !== undefined ? safePayload.max_pages_per_job : null,
            safePayload.max_file_size_mb !== undefined ? safePayload.max_file_size_mb : null,
            safePayload.max_tac_percent !== undefined ? safePayload.max_tac_percent : null,
            safePayload.supports_pdfx !== undefined ? (safePayload.supports_pdfx ? 1 : 0) : null,
            safePayload.supports_pdfa !== undefined ? (safePayload.supports_pdfa ? 1 : 0) : null,
            safePayload.supports_variable_data !== undefined ? (safePayload.supports_variable_data ? 1 : 0) : null,
            safePayload.supports_white_ink !== undefined ? (safePayload.supports_white_ink ? 1 : 0) : null,
            safePayload.supports_spot_uv !== undefined ? (safePayload.supports_spot_uv ? 1 : 0) : null,
            safePayload.supports_lamination !== undefined ? (safePayload.supports_lamination ? 1 : 0) : null,
            safePayload.supports_hardcover !== undefined ? (safePayload.supports_hardcover ? 1 : 0) : null,
            safePayload.supports_softcover !== undefined ? (safePayload.supports_softcover ? 1 : 0) : null,
            safePayload.supports_saddle_stitch !== undefined ? (safePayload.supports_saddle_stitch ? 1 : 0) : null,
            safePayload.supports_perfect_binding !== undefined ? (safePayload.supports_perfect_binding ? 1 : 0) : null,
            safePayload.supports_case_binding !== undefined ? (safePayload.supports_case_binding ? 1 : 0) : null,
            safePayload.metadata_json !== undefined ? JSON.stringify(safePayload.metadata_json) : null,
            machineId,
            siteId,
            tenantId
        ]);

        return await this.getMachine(tenantId, siteId, machineId);
    }

    async archiveMachine(tenantId, siteId, machineId, actorContext) {
        const before = await this.getMachine(tenantId, siteId, machineId);
        if (!before) throw new Error('MACHINE_NOT_FOUND');

        await db.query(
            'UPDATE printhouse_machines SET status = ? WHERE id = ? AND printhouse_id = ? AND tenant_id = ?',
            ['ARCHIVED', machineId, siteId, tenantId]
        );
    }
}

module.exports = new PrinthouseMachineService();
