/**
 * src/api/services/printhouseMaterialService.js
 *
 * Handles Materials Catalog onboarding and Machine-Material compatibilities.
 * Implements strict tenant boundary isolation and field protection.
 */
const db = require('./mysqlClient');
const { v4: uuidv4 } = require('uuid');

const PROTECTED_FIELDS = [
    'id',
    'tenant_id',
    'cost_per_unit',
    'pricing',
    'pricing_model',
    'price',
    'markup',
    'approved',
    'verified',
    'marketplace_enabled',
    'routing_enabled',
    'production_enabled'
];

function checkProtectedFields(payload) {
    const violatingFields = PROTECTED_FIELDS.filter(field => field in payload);
    if (violatingFields.length > 0) {
        const err = new Error('FIELD_NOT_EDITABLE');
        err.fields = violatingFields;
        throw err;
    }
}

const VALID_MATERIAL_TYPES = ['PAPER', 'BOARD', 'VINYL', 'INK', 'CONSUMABLE'];

function validateAndNormalizeMaterial(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('INVALID_MATERIAL_CONFIGURATION');
    }

    // 1. material_name (required, non-empty, trimmed)
    if (typeof data.material_name !== 'string' || !data.material_name.trim()) {
        throw new Error('INVALID_MATERIAL_CONFIGURATION');
    }
    const materialName = data.material_name.trim();

    // 2. material_type (required, supported value)
    if (typeof data.material_type !== 'string' || !data.material_type.trim()) {
        throw new Error('INVALID_MATERIAL_CONFIGURATION');
    }
    const materialType = data.material_type.trim().toUpperCase();
    if (!VALID_MATERIAL_TYPES.includes(materialType)) {
        throw new Error('INVALID_MATERIAL_CONFIGURATION');
    }

    // 3. substrate_class (required, non-empty trimmed string)
    if (typeof data.substrate_class !== 'string' || !data.substrate_class.trim()) {
        throw new Error('INVALID_MATERIAL_CONFIGURATION');
    }
    const substrateClass = data.substrate_class.trim();

    // 4. sheet_format (required, non-empty trimmed string)
    if (typeof data.sheet_format !== 'string' || !data.sheet_format.trim()) {
        throw new Error('INVALID_MATERIAL_CONFIGURATION');
    }
    const sheetFormat = data.sheet_format.trim();

    // 5. finish_type (required, non-empty trimmed string)
    if (typeof data.finish_type !== 'string' || !data.finish_type.trim()) {
        throw new Error('INVALID_MATERIAL_CONFIGURATION');
    }
    const finishType = data.finish_type.trim();

    // 6. gsm (nullable; if provided, must be finite number > 0)
    let gsm = null;
    if (data.gsm !== undefined && data.gsm !== null) {
        if (typeof data.gsm !== 'number' || !Number.isFinite(data.gsm) || Number.isNaN(data.gsm) || data.gsm <= 0) {
            throw new Error('INVALID_MATERIAL_CONFIGURATION');
        }
        gsm = data.gsm;
    }

    // 7. supplier_country (optional; if provided, must be valid 2-letter code)
    let supplierCountry = null;
    if (data.supplier_country !== undefined && data.supplier_country !== null && data.supplier_country !== '') {
        if (typeof data.supplier_country !== 'string' || !/^[A-Za-z]{2}$/.test(data.supplier_country.trim())) {
            throw new Error('INVALID_MATERIAL_CONFIGURATION');
        }
        supplierCountry = data.supplier_country.trim().toUpperCase();
    }

    // 8. supplier_name (optional string)
    let supplierName = null;
    if (data.supplier_name !== undefined && data.supplier_name !== null) {
        if (typeof data.supplier_name !== 'string') {
            throw new Error('INVALID_MATERIAL_CONFIGURATION');
        }
        supplierName = data.supplier_name.trim() || null;
    }

    return {
        material_name: materialName,
        material_type: materialType,
        substrate_class: substrateClass,
        sheet_format: sheetFormat,
        finish_type: finishType,
        gsm,
        supplier_country: supplierCountry,
        supplier_name: supplierName
    };
}

class PrinthouseMaterialService {
    /**
     * Retrieve material catalog entries for a site, excluding archived ones
     */
    async listMaterials(tenantId, siteId) {
        const rows = await db.query(
            `SELECT * FROM materials_catalog 
             WHERE tenant_id = ? AND (printhouse_id = ? OR printhouse_id IS NULL)
             AND (JSON_EXTRACT(metadata_json, '$.archived') IS NULL OR JSON_EXTRACT(metadata_json, '$.archived') != true)`,
            [tenantId, siteId]
        );
        return rows;
    }

    /**
     * Get a single material
     */
    async getMaterial(tenantId, siteId, materialId) {
        const rows = await db.query(
            `SELECT * FROM materials_catalog 
             WHERE id = ? AND tenant_id = ? AND (printhouse_id = ? OR printhouse_id IS NULL)`,
            [materialId, tenantId, siteId]
        );
        if (rows.length === 0) return null;
        return rows[0];
    }

    /**
     * Create a material catalog entry
     */
    async createMaterial(tenantId, siteId, payload) {
        checkProtectedFields(payload);
        const normalized = validateAndNormalizeMaterial(payload);

        const id = 'mat-' + uuidv4();
        let metadata = {};
        if (payload.metadata_json) {
            if (typeof payload.metadata_json === 'string') {
                try { metadata = JSON.parse(payload.metadata_json); } catch (e) { metadata = {}; }
            } else if (typeof payload.metadata_json === 'object' && payload.metadata_json !== null) {
                metadata = { ...payload.metadata_json };
            }
        }
        metadata.configuration_source = 'EXPLICIT_ONBOARDING';
        metadata.configured_at = new Date().toISOString();

        await db.query(
            `INSERT INTO materials_catalog 
             (id, tenant_id, printhouse_id, material_name, material_type, substrate_class, gsm, sheet_format, finish_type, supplier_name, supplier_country, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                tenantId,
                siteId,
                normalized.material_name,
                normalized.material_type,
                normalized.substrate_class,
                normalized.gsm,
                normalized.sheet_format,
                normalized.finish_type,
                normalized.supplier_name,
                normalized.supplier_country,
                JSON.stringify(metadata)
            ]
        );

        return await this.getMaterial(tenantId, siteId, id);
    }

    /**
     * Update a material catalog entry
     */
    async updateMaterial(tenantId, siteId, materialId, payload) {
        checkProtectedFields(payload);

        const material = await this.getMaterial(tenantId, siteId, materialId);
        if (!material) throw new Error('MATERIAL_NOT_FOUND');

        // Combine existing with payload to validate full resulting record
        const mergedData = {
            material_name: payload.material_name !== undefined ? payload.material_name : material.material_name,
            material_type: payload.material_type !== undefined ? payload.material_type : material.material_type,
            substrate_class: payload.substrate_class !== undefined ? payload.substrate_class : material.substrate_class,
            sheet_format: payload.sheet_format !== undefined ? payload.sheet_format : material.sheet_format,
            finish_type: payload.finish_type !== undefined ? payload.finish_type : material.finish_type,
            gsm: payload.gsm !== undefined ? payload.gsm : material.gsm,
            supplier_country: payload.supplier_country !== undefined ? payload.supplier_country : material.supplier_country,
            supplier_name: payload.supplier_name !== undefined ? payload.supplier_name : material.supplier_name
        };

        const normalized = validateAndNormalizeMaterial(mergedData);

        let metadata = {};
        if (material.metadata_json) {
            metadata = typeof material.metadata_json === 'string' ? JSON.parse(material.metadata_json) : { ...material.metadata_json };
        }
        if (payload.metadata_json) {
            const payloadMeta = typeof payload.metadata_json === 'string' ? JSON.parse(payload.metadata_json) : payload.metadata_json;
            metadata = { ...metadata, ...payloadMeta };
        }
        metadata.configuration_source = 'EXPLICIT_ONBOARDING';
        metadata.configured_at = new Date().toISOString();

        await db.query(
            `UPDATE materials_catalog 
             SET material_name = ?, material_type = ?, substrate_class = ?, gsm = ?, sheet_format = ?, finish_type = ?, supplier_name = ?, supplier_country = ?, metadata_json = ?
             WHERE id = ? AND tenant_id = ? AND printhouse_id = ?`,
            [
                normalized.material_name,
                normalized.material_type,
                normalized.substrate_class,
                normalized.gsm,
                normalized.sheet_format,
                normalized.finish_type,
                normalized.supplier_name,
                normalized.supplier_country,
                JSON.stringify(metadata),
                materialId,
                tenantId,
                siteId
            ]
        );

        return await this.getMaterial(tenantId, siteId, materialId);
    }

    /**
     * Archive a material (soft delete via metadata)
     */
    async archiveMaterial(tenantId, siteId, materialId) {
        const material = await this.getMaterial(tenantId, siteId, materialId);
        if (!material) throw new Error('MATERIAL_NOT_FOUND');

        let metadata = {};
        if (material.metadata_json) {
            metadata = typeof material.metadata_json === 'string'
                ? JSON.parse(material.metadata_json)
                : material.metadata_json;
        }
        metadata.archived = true;

        await db.query(
            `UPDATE materials_catalog SET metadata_json = ? 
             WHERE id = ? AND tenant_id = ? AND printhouse_id = ?`,
            [JSON.stringify(metadata), materialId, tenantId, siteId]
        );

        return { ok: true, status: 'ARCHIVED' };
    }

    /**
     * Associate a machine and material with explicit compatibility provenance
     */
    async associateMachineMaterial(tenantId, siteId, machineId, materialId, provenance) {
        // Enforce boundary check for machine
        const machineRows = await db.query(
            'SELECT * FROM printhouse_machines WHERE id = ? AND tenant_id = ? AND printhouse_id = ?',
            [machineId, tenantId, siteId]
        );
        if (machineRows.length === 0) throw new Error('MACHINE_NOT_FOUND');

        // Enforce boundary check for material
        const material = await this.getMaterial(tenantId, siteId, materialId);
        if (!material) throw new Error('MATERIAL_NOT_FOUND');

        const provenanceStr = provenance || 'manual_pairing';

        await db.query(
            `INSERT INTO printhouse_machine_materials (machine_id, material_catalog_id, tenant_id, compatibility_provenance)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE compatibility_provenance = ?`,
            [machineId, materialId, tenantId, provenanceStr, provenanceStr]
        );

        return { machine_id: machineId, material_catalog_id: materialId, compatibility_provenance: provenanceStr };
    }

    /**
     * Remove association
     */
    async dissociateMachineMaterial(tenantId, siteId, machineId, materialId) {
        // Check mapping exists and belongs to tenant
        const rows = await db.query(
            'SELECT * FROM printhouse_machine_materials WHERE machine_id = ? AND material_catalog_id = ? AND tenant_id = ?',
            [machineId, materialId, tenantId]
        );
        if (rows.length === 0) throw new Error('ASSOCIATION_NOT_FOUND');

        await db.query(
            'DELETE FROM printhouse_machine_materials WHERE machine_id = ? AND material_catalog_id = ? AND tenant_id = ?',
            [machineId, materialId, tenantId]
        );
        return { ok: true };
    }

    /**
     * Get machine-material compatibilities with explicit provenance
     */
    async listMachineCompatibilities(tenantId, siteId, machineId) {
        const rows = await db.query(
            `SELECT pmm.machine_id, pmm.material_catalog_id, pmm.compatibility_provenance, mc.material_name, mc.material_type
             FROM printhouse_machine_materials pmm
             JOIN materials_catalog mc ON pmm.material_catalog_id = mc.id AND pmm.tenant_id = mc.tenant_id
             WHERE pmm.machine_id = ? AND pmm.tenant_id = ?`,
            [machineId, tenantId]
        );
        return rows;
    }
}

module.exports = new PrinthouseMaterialService();
