/**
 * src/api/services/paperThicknessService.js
 *
 * PAPER-CALIPER-UI-01 — Read-only paper thickness (caliper) resolution for Printhouse
 * Materials, plus routing of printhouse-proposed thickness values into the EXISTING
 * technical evidence workflow (paperEvidenceService).
 *
 * Invariants:
 *  - Authoritative thickness is ONLY `paper_variants.caliper_um` of the linked master
 *    catalog variant. It is never derived from GSM and never written here.
 *  - Printhouse proposals never overwrite `paper_variants.caliper_um`; linked materials
 *    create evidence records (supplier-reported datasheet OR ISO 534 physical measurement)
 *    that follow the standard technologist review / promotion workflow.
 *  - Manually created (unlinked) materials cannot enter the variant evidence workflow;
 *    their proposal is stored as a non-authoritative, pending note on the material only.
 */
const db = require('./mysqlClient');
const { paperEvidenceService, PaperEvidenceError } = require('./paperEvidenceService');

const PENDING_REVIEW_STATUSES = ['DRAFT', 'PENDING_TECH_REVIEW'];
const PROPOSAL_KINDS = ['SUPPLIER_REPORTED', 'PHYSICAL_MEASUREMENT'];
const CALIPER_METADATA_KEYS = [
    'caliper_um', 'caliperUm', 'caliper_mm', 'caliper_source', 'caliperSource',
    'caliper_confidence_status', 'caliperConfidenceStatus', 'thickness_proposal'
];

const unwrap = (r) => (Array.isArray(r) ? (Array.isArray(r[0]) ? r[0] : r) : []);

function parseMetadata(material) {
    if (!material) return {};
    const raw = material.metadata !== undefined && material.metadata !== null
        ? material.metadata
        : material.metadata_json;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw) || {}; } catch (_) { return {}; }
}

function linkedVariantId(material) {
    const meta = parseMetadata(material);
    const id = meta.paper_variant_id || meta.paperVariantId || null;
    return id ? String(id) : null;
}

/** Removes client-supplied caliper keys so thickness can never be forged via metadata. */
function stripClientCaliperMetadata(meta) {
    if (!meta || typeof meta !== 'object') return meta;
    const copy = { ...meta };
    for (const k of CALIPER_METADATA_KEYS) delete copy[k];
    return copy;
}

function buildThickness(material, variantRow, pendingEvidence) {
    const variantId = linkedVariantId(material);
    const meta = parseMetadata(material);
    const caliperUm = variantRow && Number(variantRow.caliper_um) > 0 ? Number(variantRow.caliper_um) : null;
    return {
        linkedVariantId: variantId,
        isLinkedToMasterCatalog: Boolean(variantId),
        caliperUm,
        caliperSource: variantRow ? (variantRow.caliper_source || 'NONE') : null,
        verificationStatus: variantRow ? (variantRow.caliper_confidence_status || 'MISSING') : null,
        isAuthoritative: Boolean(variantId && caliperUm),
        pendingProposals: (pendingEvidence || []).map((e) => {
            const rawUm = e.proposed_caliper_um ?? e.proposed_effective_caliper_um;
            return {
                evidenceId: e.evidence_id,
                kind: e.evidence_type === 'PHYSICAL_MICROMETER_RECORD' ? 'PHYSICAL_MEASUREMENT' : 'SUPPLIER_REPORTED',
                evidenceType: e.evidence_type,
                reviewStatus: e.review_status,
                proposedCaliperUm: rawUm !== null && rawUm !== undefined ? Number(rawUm) : null,
                createdAt: e.created_at
            };
        }),
        unlinkedProposal: !variantId && meta.thickness_proposal ? meta.thickness_proposal : null
    };
}

class PaperThicknessService {
    constructor({ dbClient = db, evidenceService = paperEvidenceService } = {}) {
        this.db = dbClient;
        this.evidence = evidenceService;
    }

    /**
     * Attaches a read-only `paper_thickness` object to each material.
     * Never throws: on lookup failure the materials are returned with `paper_thickness: null`.
     */
    async attachThickness(tenantId, materials) {
        const list = Array.isArray(materials) ? materials : [];
        if (list.length === 0) return list;
        const variantIds = [...new Set(list.map(linkedVariantId).filter(Boolean))];

        const variants = new Map();
        const pending = new Map();
        try {
            if (variantIds.length > 0) {
                const ph = variantIds.map(() => '?').join(',');
                const vRows = unwrap(await this.db.query(
                    `SELECT id, caliper_um, caliper_source, caliper_confidence_status
                     FROM paper_variants WHERE id IN (${ph})`,
                    variantIds
                ));
                for (const r of vRows) variants.set(String(r.id), r);

                if (tenantId) {
                    try {
                        const eRows = unwrap(await this.db.query(
                            `SELECT evidence_id, variant_id, evidence_type, review_status, proposed_effective_caliper_um, created_at
                             FROM paper_variant_caliper_evidence
                             WHERE tenant_id = ? AND variant_id IN (${ph})
                               AND review_status IN (${PENDING_REVIEW_STATUSES.map(() => '?').join(',')})
                             ORDER BY created_at DESC`,
                            [tenantId, ...variantIds, ...PENDING_REVIEW_STATUSES]
                        ));
                        for (const e of eRows) {
                            const k = String(e.variant_id);
                            if (!pending.has(k)) pending.set(k, []);
                            pending.get(k).push(e);
                        }
                    } catch (_) { /* evidence table optional in isolated contexts */ }
                }
            }
        } catch (err) {
            return list.map((m) => ({ ...m, paper_thickness: null }));
        }

        return list.map((m) => {
            const vid = linkedVariantId(m);
            return {
                ...m,
                paper_thickness: buildThickness(m, vid ? variants.get(vid) : null, vid ? pending.get(vid) : [])
            };
        });
    }

    async attachThicknessOne(tenantId, material) {
        if (!material) return material;
        const [out] = await this.attachThickness(tenantId, [material]);
        return out;
    }

    /**
     * Routes a printhouse-proposed thickness into the evidence workflow.
     * `material` MUST already be access-checked (tenant + center) by the caller.
     */
    async proposeThickness({ tenantId, actorId, actorRole, material, body = {} }) {
        if (!tenantId || !actorId) {
            throw new PaperEvidenceError('Authenticated tenant and actor identity required.', 'UNAUTHORIZED', 403);
        }
        const kind = String(body.kind || '').toUpperCase();
        if (!PROPOSAL_KINDS.includes(kind)) {
            throw new PaperEvidenceError(
                `kind must be one of ${PROPOSAL_KINDS.join(', ')}.`, 'INVALID_THICKNESS_PROPOSAL_KIND', 422
            );
        }
        const variantId = linkedVariantId(material);

        if (variantId) {
            if (kind === 'SUPPLIER_REPORTED') {
                const result = await this.evidence.registerDocumentaryEvidence({
                    tenantId,
                    supplierId: null,
                    actorId,
                    actorRole,
                    idempotencyKey: body.idempotencyKey || null,
                    payload: {
                        variantId,
                        evidenceType: 'SUPPLIER_TECHNICAL_SHEET_PDF',
                        proposedCaliperUm: body.proposedCaliperUm,
                        documentUrl: body.documentUrl || undefined,
                        fileBase64: body.fileBase64 || undefined,
                        fileName: body.fileName || undefined,
                        mimeType: body.mimeType || undefined,
                        datasheetVersion: body.datasheetVersion || undefined,
                        submitForReview: true
                    }
                });
                return { route: 'EVIDENCE_WORKFLOW', kind, variantId, ...result, productiveCaliperModified: false };
            }
            const result = await this.evidence.registerPhysicalMicrometerEvidence({
                tenantId,
                supplierId: null,
                actorId,
                actorRole,
                idempotencyKey: body.idempotencyKey || null,
                payload: {
                    variantId,
                    readingsUm: body.readingsUm,
                    conditioningTempC: body.conditioningTempC,
                    conditioningRhPct: body.conditioningRhPct,
                    micrometerCalibrationCertId: body.micrometerCalibrationCertId,
                    micrometerCalibrationValidUntil: body.micrometerCalibrationValidUntil,
                    micrometerSerialNumber: body.micrometerSerialNumber,
                    supplierLotBatchId: body.supplierLotBatchId,
                    nominalDatasheetCaliperUm: body.nominalDatasheetCaliperUm ?? null,
                    submitForReview: true
                }
            });
            return { route: 'EVIDENCE_WORKFLOW', kind, variantId, ...result, productiveCaliperModified: false };
        }

        // Unlinked (manually created) material: non-authoritative pending note only.
        const um = Number(body.proposedCaliperUm);
        if (!Number.isFinite(um) || um <= 0 || um > 5000) {
            throw new PaperEvidenceError(
                'proposedCaliperUm must be a positive number between 1 and 5000 µm.', 'INVALID_PROPOSED_CALIPER_UM', 422
            );
        }
        const meta = parseMetadata(material);
        const proposal = {
            kind,
            proposedCaliperUm: um,
            status: 'PENDING_MASTER_CATALOG_LINK',
            note: 'Not authoritative. Link this material to a master catalog variant to submit it for technical review.',
            documentUrl: kind === 'SUPPLIER_REPORTED' ? (body.documentUrl || null) : null,
            proposedBy: String(actorId),
            proposedAt: new Date().toISOString()
        };
        const nextMeta = { ...meta, thickness_proposal: proposal };
        await this.db.query(
            `UPDATE materials_catalog SET metadata_json = ? WHERE id = ? AND tenant_id = ?`,
            [JSON.stringify(nextMeta), material.material_catalog_id || material.id, tenantId]
        );
        return { route: 'UNLINKED_PENDING_NOTE', kind, variantId: null, proposal, productiveCaliperModified: false };
    }
}

const paperThicknessService = new PaperThicknessService();

module.exports = {
    paperThicknessService,
    PaperThicknessService,
    stripClientCaliperMetadata,
    linkedVariantId,
    PROPOSAL_KINDS
};

