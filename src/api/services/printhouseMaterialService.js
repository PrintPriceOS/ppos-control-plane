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

        const id = 'mat-' + uuidv4();
        const materialName = payload.material_name || 'New Substrate';
        const materialType = payload.material_type || 'PAPER';
        const substrateClass = payload.substrate_class || 'STANDARD';
        const gsm = payload.gsm || null;
        const sheetFormat = payload.sheet_format || 'SRA3';
        const finishType = payload.finish_type || 'UNCOATED';
        const supplierName = payload.supplier_name || 'Generic Supplier';
        const supplierCountry = payload.supplier_country || 'ES';
        const metadata = payload.metadata_json || {};

        await db.query(
            `INSERT INTO materials_catalog 
             (id, tenant_id, printhouse_id, material_name, material_type, substrate_class, gsm, sheet_format, finish_type, supplier_name, supplier_country, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                tenantId,
                siteId,
                materialName,
                materialType,
                substrateClass,
                gsm,
                sheetFormat,
                finishType,
                supplierName,
                supplierCountry,
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

        const fieldsToUpdate = [];
        const params = [];

        const allowedFields = [
            'material_name',
            'material_type',
            'substrate_class',
            'gsm',
            'sheet_format',
            'finish_type',
            'supplier_name',
            'supplier_country',
            'metadata_json'
        ];

        for (const field of allowedFields) {
            if (field in payload) {
                fieldsToUpdate.push(`${field} = ?`);
                if (field === 'metadata_json') {
                    params.push(JSON.stringify(payload[field]));
                } else {
                    params.push(payload[field]);
                }
            }
        }

        if (fieldsToUpdate.length > 0) {
            params.push(materialId, tenantId, siteId);
            await db.query(
                `UPDATE materials_catalog SET ${fieldsToUpdate.join(', ')} 
                 WHERE id = ? AND tenant_id = ? AND printhouse_id = ?`,
                params
            );
        }

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
