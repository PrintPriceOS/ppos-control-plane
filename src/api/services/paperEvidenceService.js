'use strict';

/**
 * src/api/services/paperEvidenceService.js
 *
 * PrintPrice OS — Phase 197C (PAPER-MATERIALS-RECOVERY-09):
 * Governed Paper Technical Evidence, ISO 534 Micrometer Metrology & Technologist Certification Service
 *
 * Core Invariants:
 * 1. Strict Tenant & Supplier Isolation: every evidence record is bound to tenant_id and optional supplier_id.
 * 2. Segregation of Duties (SoD): the user who submits an evidence (submitted_by) CANNOT approve or reject it
 *    (approved_by_technologist !== submitted_by).
 * 3. Non-Automatic Productive Caliper Protection:
 *    - Registering or approving documentary evidence (APPROVED_FOR_TECHNICAL_USE) or physical measurements
 *      (CERTIFIED_MEASURED) NEVER automatically mutates paper_variants.caliper_um.
 *    - Spine Calculator continues reading paper_variants.caliper_um exclusively.
 *    - Neither documentary approval nor micrometer approval can promote a binding profile to PRODUCTION_CERTIFIED
 *      or unlock canReleaseToManufacturing.
 * 4. Source Contradiction Detection:
 *    - Automatically flags has_source_contradiction = true when nominal datasheet thickness, physical batch
 *      micrometer mean, existing catalog caliper_um, or RECOVERY-08 reference candidate differ beyond tolerance (> 5%).
 * 5. PDF Attachment Security:
 *    - Validates PDF magic header (%PDF-), enforces max 10 MB size, and computes deterministic SHA-256 hash.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./mysqlClient');
const {
    evaluatePhysicalMicrometerRecord,
    readCsvFile,
    INVENTORY_CSV_PATH,
    SUPPLIER_MATRIX_CSV_PATH
} = require('../../../scripts/recover_paper_materials_08.cjs');
const {
    resolveVariantCaliperProvenance
} = require('./spine/paperCaliperReconciliationService');

const PENDING_CLASSIFICATIONS_337_CSV_PATH = path.resolve(
    __dirname,
    '../../../docs/architecture/RECOVERY_09_PENDING_CLASSIFICATIONS_337.csv'
);

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const DEFAULT_PRIVATE_EVIDENCE_STORE_DIR = path.resolve(
    __dirname,
    '../../../var/private_evidence_store'
);

function resolvePrivateEvidenceStoreDir(customRoot = null) {
    const rawRoot = customRoot || process.env.PAPER_EVIDENCE_STORAGE_DIR || DEFAULT_PRIVATE_EVIDENCE_STORE_DIR;
    return path.resolve(String(rawRoot));
}

function sanitizePathSegment(value, fallback = 'default') {
    const cleaned = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 64);
    return cleaned || fallback;
}

class PaperEvidenceError extends Error {
    constructor(message, code, statusCode = 400, details = null) {
        super(message);
        this.name = 'PaperEvidenceError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

function unwrapRows(result) {
    if (!result) return [];
    if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
    if (Array.isArray(result)) return result;
    return [];
}

function unwrapAffectResult(result) {
    if (!result) return { affectedRows: 0 };
    if (Array.isArray(result) && result[0] && typeof result[0] === 'object' && !Array.isArray(result[0])) {
        return result[0];
    }
    return result;
}

let cachedMissing252 = null;
let cachedSupplierMatrix252 = null;
let cachedPendingClassifications337 = null;

function loadStaticInventory252() {
    if (!cachedMissing252 && fs.existsSync(INVENTORY_CSV_PATH)) {
        cachedMissing252 = readCsvFile(INVENTORY_CSV_PATH);
    }
    return cachedMissing252 || [];
}

function loadStaticSupplierMatrix252() {
    if (!cachedSupplierMatrix252 && fs.existsSync(SUPPLIER_MATRIX_CSV_PATH)) {
        cachedSupplierMatrix252 = readCsvFile(SUPPLIER_MATRIX_CSV_PATH);
    }
    return cachedSupplierMatrix252 || [];
}

function loadStaticPendingClassifications337() {
    if (!cachedPendingClassifications337 && fs.existsSync(PENDING_CLASSIFICATIONS_337_CSV_PATH)) {
        cachedPendingClassifications337 = readCsvFile(PENDING_CLASSIFICATIONS_337_CSV_PATH);
    }
    return cachedPendingClassifications337 || [];
}

/**
 * Evaluates source contradictions between:
 * - nominalDatasheetCaliperUm
 * - measuredBatchCaliperUm
 * - existingVariantCaliperUm
 * - referenceCandidateUm (from RECOVERY-08 inventory if present)
 */
function detectSourceContradictions({
    nominalDatasheetCaliperUm = null,
    measuredBatchCaliperUm = null,
    existingVariantCaliperUm = null,
    referenceCandidateUm = null,
    tolerancePct = 5.0
}) {
    const contradictions = [];
    const nom = nominalDatasheetCaliperUm !== null && nominalDatasheetCaliperUm !== undefined && Number(nominalDatasheetCaliperUm) > 0
        ? Number(nominalDatasheetCaliperUm)
        : null;
    const meas = measuredBatchCaliperUm !== null && measuredBatchCaliperUm !== undefined && Number(measuredBatchCaliperUm) > 0
        ? Number(measuredBatchCaliperUm)
        : null;
    const exist = existingVariantCaliperUm !== null && existingVariantCaliperUm !== undefined && Number(existingVariantCaliperUm) > 0
        ? Number(existingVariantCaliperUm)
        : null;
    const cand = referenceCandidateUm !== null && referenceCandidateUm !== undefined && Number(referenceCandidateUm) > 0
        ? Number(referenceCandidateUm)
        : null;

    function checkPair(labelA, valA, labelB, valB) {
        if (valA === null || valB === null) return;
        const deltaUm = Math.abs(valA - valB);
        const deltaPct = (deltaUm / Math.min(valA, valB)) * 100;
        if (deltaPct > tolerancePct && deltaUm > 5) {
            contradictions.push({
                code: `CONTRADICTION_${labelA}_VS_${labelB}`,
                sourceA: labelA,
                valueAUm: valA,
                sourceB: labelB,
                valueBUm: valB,
                deltaUm: Number(deltaUm.toFixed(2)),
                deltaPct: Number(deltaPct.toFixed(2)),
                thresholdPct: tolerancePct,
                message: `${labelA} (${valA} µm) differs from ${labelB} (${valB} µm) by ${deltaUm.toFixed(1)} µm (${deltaPct.toFixed(2)}% > ${tolerancePct}%).`
            });
        }
    }

    checkPair('NOMINAL_DATASHEET', nom, 'MEASURED_MICROMETER', meas);
    checkPair('NOMINAL_DATASHEET', nom, 'EXISTING_CATALOG_CALIPER', exist);
    checkPair('MEASURED_MICROMETER', meas, 'EXISTING_CATALOG_CALIPER', exist);
    checkPair('NOMINAL_DATASHEET', nom, 'LEGACY_ODS_CANDIDATE', cand);
    checkPair('MEASURED_MICROMETER', meas, 'LEGACY_ODS_CANDIDATE', cand);

    return {
        hasSourceContradiction: contradictions.length > 0,
        contradictions
    };
}

/**
 * Validates an uploaded PDF buffer or base64 payload, performs deep structural & active-content
 * security inspection (beyond magic header bytes), computes its deterministic SHA-256 hash,
 * and optionally persists it atomically to private tenant-scoped storage.
 *
 * Accepts either ({ buffer, fileBase64, fileName, mimeType, tenantId, persistToStore, storageRoot })
 * or positional (buffer, fileName, mimeType).
 */
function validateAndHashPdfDocument(arg1 = {}, arg2 = 'datasheet.pdf', arg3 = 'application/pdf') {
    const isOptionsObject = arg1 && typeof arg1 === 'object' && !Buffer.isBuffer(arg1);
    let rawBuffer = isOptionsObject ? arg1.buffer : arg1;
    const fileBase64 = isOptionsObject ? arg1.fileBase64 : null;
    const rawFileName = isOptionsObject ? (arg1.fileName || 'datasheet.pdf') : (arg2 || 'datasheet.pdf');
    const rawMimeType = isOptionsObject ? (arg1.mimeType || 'application/pdf') : (arg3 || 'application/pdf');
    const tenantId = isOptionsObject ? (arg1.tenantId || null) : null;
    const persistToStore = isOptionsObject && arg1.persistToStore !== undefined ? Boolean(arg1.persistToStore) : false;
    const storageRoot = isOptionsObject ? (arg1.storageRoot || null) : null;

    if (!rawBuffer && fileBase64) {
        const cleaned = String(fileBase64).replace(/^data:application\/pdf;base64,/i, '').trim();
        rawBuffer = Buffer.from(cleaned, 'base64');
    }
    if (!rawBuffer || !Buffer.isBuffer(rawBuffer) || rawBuffer.length === 0) {
        throw new PaperEvidenceError('A valid PDF file buffer or base64 payload is required.', 'PDF_FILE_REQUIRED', 400);
    }
    if (rawBuffer.length > MAX_PDF_SIZE_BYTES) {
        throw new PaperEvidenceError(
            `PDF file size (${rawBuffer.length} bytes) exceeds maximum allowed limit of 10 MB.`,
            'DOCUMENT_SIZE_LIMIT_EXCEEDED',
            413
        );
    }

    // 1. Strict MIME type check
    const normalizedMime = String(rawMimeType || 'application/pdf').split(';')[0].trim().toLowerCase();
    if (normalizedMime !== 'application/pdf' && normalizedMime !== 'application/x-pdf') {
        throw new PaperEvidenceError(
            `Unsupported document MIME type '${normalizedMime}'. Only 'application/pdf' is accepted.`,
            'INVALID_PDF_MIME_TYPE',
            415
        );
    }

    // 2. Strict PDF version header at byte offset 0 (%PDF-1.0 .. %PDF-2.0) — prevents polyglot preambles
    const headerAscii = rawBuffer.subarray(0, 10).toString('ascii');
    if (!/^%PDF-(1\.[0-7]|2\.0)/.test(headerAscii)) {
        throw new PaperEvidenceError(
            'Uploaded file is not a valid PDF document (missing %PDF- signature / %PDF-1.x header at offset 0).',
            'INVALID_PDF_MAGIC_SIGNATURE',
            422
        );
    }

    // 3. Structural & trailer verification (%PDF-... indirect objects ... %%EOF)
    const contentLatin1 = rawBuffer.toString('latin1');
    const tailLatin1 = rawBuffer.subarray(Math.max(0, rawBuffer.length - 2048)).toString('latin1');
    if (!tailLatin1.includes('%%EOF')) {
        throw new PaperEvidenceError(
            'Uploaded PDF document is truncated or malformed (missing %%EOF trailer marker).',
            'INVALID_PDF_STRUCTURE_MISSING_EOF',
            422
        );
    }

    const hasIndirectObject = /\b\d+\s+\d+\s+obj\b/.test(contentLatin1) && /\bendobj\b/.test(contentLatin1);
    const hasCatalogOrPage =
        /\/Type\s*\/Catalog\b/.test(contentLatin1) ||
        /\/Type\s*\/Pages?\b/.test(contentLatin1) ||
        /\bxref\b/.test(contentLatin1);
    if (!hasIndirectObject && !hasCatalogOrPage) {
        throw new PaperEvidenceError(
            'Uploaded file failed deep PDF structural inspection (missing indirect objects or document catalog). Header-only spoofing is rejected.',
            'INVALID_PDF_INTERNAL_STRUCTURE',
            422
        );
    }

    // 4. Active / executable content & polyglot rejection
    const forbiddenTokens = [
        { pattern: /\/JavaScript\b/i, name: '/JavaScript' },
        { pattern: /\/JS\b/i, name: '/JS' },
        { pattern: /\/Launch\b/i, name: '/Launch' },
        { pattern: /\/EmbeddedFiles\b/i, name: '/EmbeddedFiles' },
        { pattern: /\/RichMedia\b/i, name: '/RichMedia' },
        { pattern: /\/SubmitForm\b/i, name: '/SubmitForm' },
        { pattern: /\/ImportData\b/i, name: '/ImportData' },
        { pattern: /<script\b/i, name: '<script>' }
    ];
    for (const rule of forbiddenTokens) {
        if (rule.pattern.test(contentLatin1)) {
            throw new PaperEvidenceError(
                `Security policy violation: PDF contains forbidden active or executable construct (${rule.name}).`,
                'PDF_ACTIVE_CONTENT_FORBIDDEN',
                422
            );
        }
    }

    // 5. Path-traversal-safe filename sanitization
    const baseName = path.basename(String(rawFileName || 'datasheet.pdf')).replace(/\0/g, '');
    let safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '_').slice(0, 180);
    if (!safeName.toLowerCase().endsWith('.pdf')) {
        safeName = `${safeName}.pdf`;
    }

    const sha256 = crypto.createHash('sha256').update(rawBuffer).digest('hex');

    let persistedFilePath = null;
    let newlyCreatedOnDisk = false;
    if (persistToStore) {
        const persisted = persistPdfBufferToPrivateStore({
            buffer: rawBuffer,
            sha256,
            tenantId: tenantId || 'global',
            storageRoot
        });
        persistedFilePath = persisted.filePath;
        newlyCreatedOnDisk = persisted.newlyCreated;
    }

    const safeTenantSegment = sanitizePathSegment(tenantId || 'global', 'global');
    return {
        fileName: safeName,
        mimeType: 'application/pdf',
        sizeBytes: rawBuffer.length,
        sha256,
        storageUri: `private-evidence-store://${safeTenantSegment}/${sha256}/${safeName}`,
        persistedFilePath,
        newlyCreatedOnDisk
    };
}

/**
 * Persists a validated PDF buffer into the private, non-public evidence store on disk.
 * Uses content-addressable naming (`<storageRoot>/<safeTenantId>/<sha256>.pdf`) so:
 * - Path traversal is impossible (both segments strictly sanitized + path.resolve prefix check).
 * - Existing verified files cannot be overwritten with different content (immutable content-addressed store).
 * - File permissions are restricted to owner-only (`0o600`).
 */
function persistPdfBufferToPrivateStore({ buffer, sha256, tenantId = 'global', storageRoot = null }) {
    if (!Buffer.isBuffer(buffer) || !/^[a-f0-9]{64}$/i.test(String(sha256 || ''))) {
        throw new PaperEvidenceError('Invalid buffer or SHA-256 hash for private evidence storage.', 'INVALID_STORAGE_INPUT', 400);
    }
    const normalizedHash = String(sha256).toLowerCase();
    const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (actualHash !== normalizedHash) {
        throw new PaperEvidenceError(
            'SHA-256 integrity mismatch before persisting PDF to private store.',
            'DOCUMENT_HASH_MISMATCH',
            422
        );
    }

    const rootDir = resolvePrivateEvidenceStoreDir(storageRoot);
    const safeTenantDir = sanitizePathSegment(tenantId, 'global');
    const tenantDir = path.resolve(rootDir, safeTenantDir);

    if (!tenantDir.startsWith(rootDir + path.sep)) {
        throw new PaperEvidenceError('Path traversal detected in tenant storage directory resolution.', 'PATH_TRAVERSAL_BLOCKED', 403);
    }

    fs.mkdirSync(tenantDir, { recursive: true, mode: 0o700 });

    const finalPath = path.resolve(tenantDir, `${normalizedHash}.pdf`);
    if (!finalPath.startsWith(tenantDir + path.sep)) {
        throw new PaperEvidenceError('Path traversal detected in evidence file path resolution.', 'PATH_TRAVERSAL_BLOCKED', 403);
    }

    if (fs.existsSync(finalPath)) {
        // Verify existing file on disk has not been tampered with
        const existingBytes = fs.readFileSync(finalPath);
        const existingHash = crypto.createHash('sha256').update(existingBytes).digest('hex');
        if (existingHash !== normalizedHash) {
            throw new PaperEvidenceError(
                'Integrity violation: existing stored PDF hash does not match expected content-addressable SHA-256.',
                'STORED_DOCUMENT_INTEGRITY_VIOLATION',
                409
            );
        }
        return { filePath: finalPath, newlyCreated: false };
    }

    const tempPath = path.resolve(tenantDir, `.tmp_${normalizedHash}_${process.pid}_${ crypto.randomBytes(4).toString('hex') }.pdf`);
    fs.writeFileSync(tempPath, buffer, { mode: 0o600 });
    fs.renameSync(tempPath, finalPath);
    return { filePath: finalPath, newlyCreated: true };
}

/**
 * Safely deletes an unreferenced / orphan evidence file if a database transaction fails after writing to disk.
 */
function cleanupOrphanEvidenceFile(filePath, storageRoot = null) {
    if (!filePath) return false;
    try {
        const rootDir = resolvePrivateEvidenceStoreDir(storageRoot);
        const resolved = path.resolve(String(filePath));
        if (!resolved.startsWith(rootDir + path.sep)) {
            return false;
        }
        if (fs.existsSync(resolved)) {
            fs.unlinkSync(resolved);
            return true;
        }
    } catch (_) {}
    return false;
}

class PaperEvidenceService {
    constructor(options = {}) {
        this.db = options.db || options.dbClient || db;
        this.storageRoot = options.storageRoot || null;
    }

    async _withTransaction(fn) {
        if (this.db && typeof this.db.getConnection === 'function') {
            const conn = await this.db.getConnection();
            try {
                await conn.beginTransaction();
                const res = await fn(conn, true);
                await conn.commit();
                return res;
            } catch (err) {
                try {
                    await conn.rollback();
                } catch (_) {}
                throw err;
            } finally {
                try {
                    conn.release();
                } catch (_) {}
            }
        }
        return fn(this.db, false);
    }

    /**
     * Lists the 252 missing-caliper materials (and optional live evidence status per variant)
     * with filtering by supplier, family, priority tier, accreditation track, and search term.
     */
    async listMissingCaliperMaterials({
        tenantId,
        supplierId = null,
        supplier = null,
        supplierFilter = null,
        family = null,
        familyFilter = null,
        priorityTier = null,
        priorityTierFilter = null,
        track = null,
        trackFilter = null,
        search = null,
        page = 1,
        limit = 25
    }) {
        if (!tenantId) {
            throw new PaperEvidenceError('Authenticated tenant context is required.', 'TENANT_REQUIRED', 403);
        }

        const effectiveSupplierFilter = supplierFilter || supplier;
        const effectiveFamilyFilter = familyFilter || family;
        const effectivePriorityFilter = priorityTierFilter || priorityTier;
        const effectiveTrackFilter = trackFilter || track;

        const staticRows = loadStaticInventory252();
        const matrixRows = loadStaticSupplierMatrix252();
        const matrixByVid = new Map(matrixRows.map((r) => [r.variant_id, r]));

        // Query any registered evidence in DB for this tenant
        const evidenceByVid = new Map();
        try {
            const evRows = unwrapRows(await this.db.query(
                `SELECT variant_id, evidence_id, evidence_type, review_status,
                        proposed_effective_caliper_um, nominal_datasheet_caliper_um,
                        measured_batch_caliper_um, has_source_contradiction,
                        submitted_by, approved_by_technologist, updated_at
                 FROM paper_variant_caliper_evidence
                 WHERE tenant_id = ?
                 ORDER BY updated_at DESC`,
                [tenantId]
            ));
            for (const ev of evRows) {
                if (!evidenceByVid.has(ev.variant_id)) {
                    evidenceByVid.set(ev.variant_id, []);
                }
                evidenceByVid.get(ev.variant_id).push(ev);
            }
        } catch (_) {
            // If migration 174 is not yet applied on DB, return static baseline cleanly
        }

        let filtered = staticRows.map((row) => {
            const reqMeta = matrixByVid.get(row.variant_id) || {};
            const evList = evidenceByVid.get(row.variant_id) || [];
            const latestEv = evList[0] || null;
            const latestStatus = latestEv ? (latestEv.review_status || latestEv.status || null) : null;
            const latestProposedUm = latestEv
                ? Number(latestEv.proposed_effective_caliper_um ?? latestEv.proposed_caliper_um ?? 0) || null
                : null;
            const hasContradiction = latestEv ? Boolean(latestEv.has_source_contradiction) : false;

            return {
                variantId: row.variant_id,
                productId: row.product_id,
                productName: row.product_name,
                displayName: row.product_name,
                odsSourceRows: row.ods_source_rows,
                odsCode: row.ods_code,
                primarySupplierChannel: row.primary_supplier_channel,
                supplier: row.primary_supplier_channel,
                manufacturer: row.manufacturer,
                family: row.family,
                subSeries: row.sub_series,
                gsm: Number(row.gsm),
                widthMm: Number(row.width_mm),
                heightMm: Number(row.height_mm),
                paperTypeResolved: row.paper_type_resolved,
                coatingStatusResolved: row.coating_status_resolved,
                finishResolved: row.finish_resolved,
                finishTechnicalDetail: row.finish_technical_detail,
                grainDirection: row.grain_direction,
                industrialPriorityTier: row.industrial_priority_tier,
                priorityTier: String(row.industrial_priority_tier || '').split('_')[0] || row.industrial_priority_tier,
                industrialApplication: row.industrial_application,
                accreditationStatus: row.accreditation_status,
                accreditationTrack: row.accreditation_track,
                requiresOfficialDatasheet: row.requires_official_datasheet,
                requiresPhysicalMicrometer: row.requires_physical_micrometer,
                referenceCandidateUm: row.rec07_reference_candidate_um ? Number(row.rec07_reference_candidate_um) : null,
                technicalRationale: row.technical_rationale_and_next_step,
                supplierRequestId: reqMeta.request_id || null,
                requestId: reqMeta.request_id || null,
                requestStatus: latestStatus || 'AWAITING_EVIDENCE_SUBMISSION',
                emailTemplateRef: reqMeta.email_template_ref || null,
                documentaryRequestStatus: latestStatus || 'AWAITING_EVIDENCE_SUBMISSION',
                evidenceStatus: latestStatus,
                latestProposedCaliperUm: latestProposedUm,
                hasSourceContradiction: hasContradiction,
                evidenceCount: evList.length,
                latestEvidence: latestEv
                    ? {
                        evidenceId: latestEv.evidence_id || latestEv.id,
                        evidenceType: latestEv.evidence_type || latestEv.source_kind,
                        reviewStatus: latestStatus,
                        proposedEffectiveCaliperUm: latestProposedUm,
                        nominalDatasheetCaliperUm: latestEv.nominal_datasheet_caliper_um !== undefined && latestEv.nominal_datasheet_caliper_um !== null ? Number(latestEv.nominal_datasheet_caliper_um) : null,
                        measuredBatchCaliperUm: latestEv.measured_batch_caliper_um !== undefined && latestEv.measured_batch_caliper_um !== null ? Number(latestEv.measured_batch_caliper_um) : null,
                        hasSourceContradiction: hasContradiction,
                        submittedBy: latestEv.submitted_by,
                        approvedByTechnologist: latestEv.approved_by_technologist
                    }
                    : null
            };
        });

        if (effectiveSupplierFilter && effectiveSupplierFilter.trim()) {
            const sf = effectiveSupplierFilter.trim().toLowerCase();
            filtered = filtered.filter((r) =>
                r.primarySupplierChannel.toLowerCase().includes(sf) ||
                r.manufacturer.toLowerCase().includes(sf)
            );
        }
        if (effectiveFamilyFilter && effectiveFamilyFilter.trim()) {
            const ff = effectiveFamilyFilter.trim().toLowerCase();
            filtered = filtered.filter((r) => r.family.toLowerCase().includes(ff));
        }
        if (effectivePriorityFilter && effectivePriorityFilter.trim()) {
            const pf = effectivePriorityFilter.trim().toUpperCase();
            filtered = filtered.filter(
                (r) => r.industrialPriorityTier === pf || r.priorityTier === pf || r.industrialPriorityTier.startsWith(`${pf}_`)
            );
        }
        if (effectiveTrackFilter && effectiveTrackFilter.trim()) {
            const tf = effectiveTrackFilter.trim();
            const normalizedTrackAlias =
                tf === 'SUPPLIER_DATASHEET_TRACK'
                    ? 'DATASHEET_REQUEST_TRACK'
                    : tf === 'CONFLICT_HOLD_TRACK'
                    ? 'CONFLICT_RECONCILIATION_TRACK'
                    : tf;
            filtered = filtered.filter(
                (r) =>
                    r.accreditationTrack === tf ||
                    r.accreditationTrack === normalizedTrackAlias ||
                    r.accreditationStatus === tf
            );
        }
        if (search && search.trim()) {
            const q = search.trim().toLowerCase();
            filtered = filtered.filter((r) =>
                r.productName.toLowerCase().includes(q) ||
                r.variantId.toLowerCase().includes(q) ||
                r.family.toLowerCase().includes(q) ||
                r.manufacturer.toLowerCase().includes(q) ||
                String(r.odsCode || '').toLowerCase().includes(q) ||
                String(r.requestId || '').toLowerCase().includes(q)
            );
        }

        const total = filtered.length;
        const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 300));
        const safePage = Math.max(1, Number(page) || 1);
        const offset = (safePage - 1) * safeLimit;
        const items = filtered.slice(offset, offset + safeLimit);

        const pendingClassifications337 = loadStaticPendingClassifications337();

        return {
            summary: {
                catalogTotalVariants: 1524,
                totalCatalogVariants: 1524,
                withCaliperCount: 1272,
                missingCaliperCount: staticRows.length,
                missingCaliperTotal: staticRows.length,
                historicalConflictsPreserved: 9,
                physicalMeasurementRequiredCount: 145,
                physicalMicrometerTrackCount: 145,
                documentationRequiredCount: 102,
                supplierDatasheetTrackCount: 102,
                conflictHoldCount: 5,
                conflictHoldTrackCount: 5,
                pendingClassificationsEffectiveCount: pendingClassifications337.length,
                pendingClassificationTotal: pendingClassifications337.length,
                pendingClassificationsRawDbOtherCount: 338,
                canReleaseToManufacturing: false
            },
            page: safePage,
            limit: safeLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / safeLimit)),
            items
        };
    }

    /**
     * Queries all evidences and audit trail for a specific variantId within the authenticated tenant.
     */
    async getVariantEvidences({ tenantId, variantId }) {
        if (!tenantId) {
            throw new PaperEvidenceError('Authenticated tenant context is required.', 'TENANT_REQUIRED', 403);
        }
        if (!variantId) {
            throw new PaperEvidenceError('variantId is required.', 'VARIANT_ID_REQUIRED', 400);
        }

        const varRows = unwrapRows(await this.db.query(
            `SELECT v.*, p.name AS product_name, p.brand, p.category
             FROM paper_variants v
             JOIN paper_products p ON v.product_id = p.id
             WHERE v.id = ? LIMIT 1`,
            [variantId]
        ));
        if (!varRows || varRows.length === 0) {
            throw new PaperEvidenceError(`Variant '${variantId}' not found.`, 'VARIANT_NOT_FOUND', 404);
        }
        const variant = varRows[0];

        const caliperEvidences = unwrapRows(await this.db.query(
            `SELECT * FROM paper_variant_caliper_evidence
             WHERE tenant_id = ? AND variant_id = ?
             ORDER BY created_at DESC`,
            [tenantId, variantId]
        ));

        const classificationEvidences = unwrapRows(await this.db.query(
            `SELECT * FROM paper_variant_classification_evidence
             WHERE tenant_id = ? AND variant_id = ?
             ORDER BY created_at DESC`,
            [tenantId, variantId]
        ));

        const auditHistory = unwrapRows(await this.db.query(
            `SELECT * FROM paper_variant_caliper_audit_log
             WHERE tenant_id = ? AND variant_id = ?
             ORDER BY created_at DESC`,
            [tenantId, variantId]
        ));

        const approvedEv = caliperEvidences.find(
            (e) => e.review_status === 'APPROVED_FOR_TECHNICAL_USE' || e.review_status === 'CERTIFIED_MEASURED'
        ) || null;
        const spineProvenance = resolveVariantCaliperProvenance(variant, approvedEv);

        return {
            variant: {
                variantId: variant.id,
                productId: variant.product_id,
                productName: variant.product_name,
                category: variant.category,
                gsm: Number(variant.gsm),
                widthMm: Number(variant.width_mm),
                heightMm: Number(variant.height_mm),
                caliperUm: variant.caliper_um !== null ? Number(variant.caliper_um) : null,
                productiveCaliperUm: variant.caliper_um !== null ? Number(variant.caliper_um) : null,
                caliperSource: variant.caliper_source,
                caliperConfidenceStatus: variant.caliper_confidence_status,
                caliperRevision: Number(variant.caliper_revision || 1)
            },
            spineProvenance,
            caliperEvidences: caliperEvidences.map((ev) => ({
                ...ev,
                id: ev.evidence_id || ev.id,
                source_kind: ev.evidence_type || ev.source_kind,
                proposed_caliper_um: ev.proposed_effective_caliper_um ?? ev.proposed_caliper_um,
                status: ev.review_status || ev.status
            })),
            classificationEvidences,
            auditHistory: auditHistory.map((log) => ({
                ...log,
                id: log.audit_id || log.id,
                action: log.action_type || log.action,
                actor_id: log.actor_user_id || log.actor_id,
                previous_status: log.previous_review_status || log.previous_status,
                new_status: log.new_review_status || log.new_status,
                reason: log.decision_reason || log.reason
            }))
        };
    }

    /**
     * Registers a documentary evidence (Manufacturer Official Datasheet or Supplier Technical Sheet).
     * Never modifies paper_variants.caliper_um.
     */
    async registerDocumentaryEvidence({
        tenantId,
        supplierId = null,
        actorUserId = null,
        actorId = null,
        actorRole = 'OPERATOR',
        idempotencyKey = null,
        payload = {}
    }) {
        const effectiveActorId = actorUserId || actorId;
        if (!tenantId || !effectiveActorId) {
            throw new PaperEvidenceError('Authenticated tenant and actor identity required.', 'UNAUTHORIZED', 403);
        }
        const variantId = String(payload.variantId || '').trim();
        if (!variantId) {
            throw new PaperEvidenceError('variantId is required.', 'VARIANT_ID_REQUIRED', 400);
        }

        // Idempotency replay check
        if (idempotencyKey) {
            const existing = unwrapRows(await this.db.query(
                `SELECT * FROM paper_variant_caliper_evidence WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
                [tenantId, idempotencyKey]
            ));
            if (existing.length > 0) {
                const ev = existing[0];
                return {
                    idempotentReplay: true,
                    evidenceId: ev.evidence_id || ev.id,
                    status: ev.review_status || ev.status,
                    evidence: ev,
                    productiveCaliperModified: false
                };
            }
        }

        const varRows = unwrapRows(await this.db.query(
            `SELECT v.*, p.name AS product_name FROM paper_variants v JOIN paper_products p ON v.product_id = p.id WHERE v.id = ? LIMIT 1`,
            [variantId]
        ));
        if (!varRows || varRows.length === 0) {
            throw new PaperEvidenceError(`Variant '${variantId}' not found.`, 'VARIANT_NOT_FOUND', 404);
        }
        const variant = varRows[0];

        const nominalUm = Number(payload.nominalDatasheetCaliperUm ?? payload.proposedCaliperUm);
        if (!Number.isFinite(nominalUm) || nominalUm <= 0 || nominalUm > 5000) {
            throw new PaperEvidenceError(
                'nominalDatasheetCaliperUm (or proposedCaliperUm) must be a positive number between 1 and 5000 µm.',
                'INVALID_NOMINAL_CALIPER_UM',
                422
            );
        }

        const staticInv = loadStaticInventory252().find((r) => r.variant_id === variantId);
        const manufacturerName = String(
            payload.manufacturerName ||
            variant.manufacturer ||
            variant.brand ||
            (staticInv ? staticInv.manufacturer : '') ||
            'Verified Manufacturer'
        ).trim();

        const datasheetVersion = String(payload.datasheetVersion || payload.documentRevision || '2026-Q4').trim();
        const datasheetPublishedDate = String(payload.datasheetPublishedDate || '2026-01-01').trim();

        let pdfInfo = null;
        if (payload.fileBuffer || payload.fileBase64) {
            pdfInfo = validateAndHashPdfDocument({
                buffer: payload.fileBuffer,
                fileBase64: payload.fileBase64,
                fileName: payload.fileName || 'datasheet.pdf',
                mimeType: payload.mimeType || 'application/pdf',
                tenantId,
                persistToStore: true,
                storageRoot: this.storageRoot
            });
        } else if (payload.documentSha256 && /^[a-f0-9]{64}$/i.test(String(payload.documentSha256))) {
            pdfInfo = {
                fileName: payload.fileName || 'datasheet.pdf',
                mimeType: 'application/pdf',
                sizeBytes: Number(payload.documentSizeBytes || 0),
                sha256: String(payload.documentSha256).toLowerCase(),
                storageUri: payload.documentStorageUri || `evidence-store://sha256/${String(payload.documentSha256).toLowerCase()}`,
                persistedFilePath: null,
                newlyCreatedOnDisk: false
            };
        } else if (payload.documentUrl) {
            const urlHash = crypto.createHash('sha256').update(String(payload.documentUrl)).digest('hex');
            pdfInfo = {
                fileName: payload.fileName || 'remote-datasheet.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 0,
                sha256: urlHash,
                storageUri: String(payload.documentUrl),
                persistedFilePath: null,
                newlyCreatedOnDisk: false
            };
        } else {
            throw new PaperEvidenceError(
                'A valid PDF attachment, documentUrl, or verified 64-character SHA-256 document hash is required.',
                'DOCUMENT_SHA256_REQUIRED',
                422
            );
        }

        const accreditationTrack = payload.accreditationTrack ||
            (staticInv ? staticInv.accreditation_track : 'DATASHEET_REQUEST_TRACK');
        const refCandUm = staticInv && staticInv.rec07_reference_candidate_um
            ? Number(staticInv.rec07_reference_candidate_um)
            : null;

        // Also check existing evidences for this variant in the tenant to detect multi-source contradictions
        let priorEvidenceUm = null;
        try {
            const priorEvRows = unwrapRows(await this.db.query(
                `SELECT proposed_effective_caliper_um, proposed_caliper_um FROM paper_variant_caliper_evidence WHERE tenant_id = ? AND variant_id = ? ORDER BY created_at DESC`,
                [tenantId, variantId]
            ));
            if (priorEvRows.length > 0) {
                priorEvidenceUm = Number(priorEvRows[0].proposed_effective_caliper_um ?? priorEvRows[0].proposed_caliper_um ?? 0) || null;
            }
        } catch (_) {}

        const contradictionCheck = detectSourceContradictions({
            nominalDatasheetCaliperUm: nominalUm,
            existingVariantCaliperUm: variant.caliper_um || priorEvidenceUm,
            referenceCandidateUm: refCandUm
        });

        const evidenceId = `evd_cal_${crypto.randomBytes(8).toString('hex')}`;
        const reviewStatus = payload.submitForReview === true ? 'PENDING_TECH_REVIEW' : 'DRAFT';
        const rawSourceKind = payload.evidenceType || payload.sourceKind || 'MANUFACTURER_DATASHEET_PDF';
        const evidenceType = rawSourceKind.includes('SUPPLIER')
            ? 'SUPPLIER_TECHNICAL_SHEET_PDF'
            : 'MANUFACTURER_DATASHEET_PDF';
        const proposedSource = evidenceType === 'SUPPLIER_TECHNICAL_SHEET_PDF'
            ? 'SUPPLIER_IMPORT'
            : 'MANUFACTURER_DATASHEET';
        const toleranceUm = payload.nominalToleranceUm ?? payload.caliperToleranceUm ?? null;

        try {
            await this._withTransaction(async (executor) => {
                await executor.query(
                    `INSERT INTO paper_variant_caliper_evidence (
                        evidence_id, tenant_id, supplier_id, variant_id, product_id,
                        accreditation_track, evidence_type,
                        document_title, document_file_name, document_mime_type, document_size_bytes,
                        document_storage_uri, document_sha256,
                        manufacturer_name, supplier_channel, supplier_sku,
                        datasheet_version, datasheet_published_date, measurement_standard,
                        shade_embossing_invariance_confirmed,
                        nominal_datasheet_caliper_um, nominal_unit, nominal_tolerance_um, nominal_tolerance_pct, nominal_bulk_cm3_g,
                        proposed_effective_caliper_um, proposed_caliper_source, proposed_confidence_status,
                        has_source_contradiction, contradiction_details_json,
                        review_status, applied_to_catalog_variant, idempotency_key,
                        submitted_by, submitted_by_role, technical_notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'um', ?, ?, ?, ?, ?, 'REFERENCE_IMPORTED', ?, ?, ?, FALSE, ?, ?, ?, ?)`,
                    [
                        evidenceId,
                        tenantId,
                        supplierId,
                        variantId,
                        variant.product_id,
                        accreditationTrack,
                        evidenceType,
                        payload.documentTitle || `${manufacturerName} Official TDS`,
                        pdfInfo.fileName,
                        pdfInfo.mimeType,
                        pdfInfo.sizeBytes,
                        pdfInfo.storageUri,
                        pdfInfo.sha256,
                        manufacturerName,
                        payload.supplierChannel || null,
                        payload.supplierSku || null,
                        datasheetVersion,
                        datasheetPublishedDate,
                        payload.measurementStandard || 'ISO 534:2011',
                        Boolean(payload.shadeEmbossingInvarianceConfirmed),
                        nominalUm,
                        toleranceUm !== undefined && toleranceUm !== null ? Number(toleranceUm) : null,
                        payload.nominalTolerancePct !== undefined && payload.nominalTolerancePct !== null ? Number(payload.nominalTolerancePct) : null,
                        payload.nominalBulkCm3G !== undefined && payload.nominalBulkCm3G !== null ? Number(payload.nominalBulkCm3G) : Number((nominalUm / Number(variant.gsm)).toFixed(3)),
                        nominalUm,
                        proposedSource,
                        contradictionCheck.hasSourceContradiction,
                        JSON.stringify(contradictionCheck.contradictions),
                        reviewStatus,
                        idempotencyKey,
                        effectiveActorId,
                        actorRole || 'OPERATOR',
                        payload.technicalNotes || payload.notes || null
                    ]
                );

                const auditId = `aud_cal_${crypto.randomBytes(8).toString('hex')}`;
                await executor.query(
                    `INSERT INTO paper_variant_caliper_audit_log (
                        audit_id, tenant_id, supplier_id, variant_id, evidence_id,
                        action_type, previous_review_status, new_review_status,
                        previous_caliper_um, new_caliper_um,
                        previous_caliper_source, new_caliper_source,
                        previous_confidence_status, new_confidence_status,
                        previous_revision, new_revision,
                        nominal_datasheet_caliper_um, document_sha256,
                        actor_user_id, actor_role, decision_reason, metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        auditId,
                        tenantId,
                        supplierId,
                        variantId,
                        evidenceId,
                        contradictionCheck.hasSourceContradiction ? 'CONTRADICTION_FLAGGED' : 'EVIDENCE_CREATED',
                        reviewStatus,
                        variant.caliper_um,
                        variant.caliper_um, // Unchanged!
                        variant.caliper_source,
                        variant.caliper_source,
                        variant.caliper_confidence_status,
                        variant.caliper_confidence_status,
                        Number(variant.caliper_revision || 1),
                        Number(variant.caliper_revision || 1),
                        nominalUm,
                        pdfInfo.sha256,
                        effectiveActorId,
                        actorRole || 'OPERATOR',
                        'Documentary evidence registered without automatic productive caliper mutation.',
                        JSON.stringify({ contradictions: contradictionCheck.contradictions })
                    ]
                );
            });
        } catch (dbErr) {
            if (pdfInfo && pdfInfo.newlyCreatedOnDisk && pdfInfo.persistedFilePath) {
                cleanupOrphanEvidenceFile(pdfInfo.persistedFilePath, this.storageRoot);
            }
            throw dbErr;
        }

        const created = unwrapRows(await this.db.query(
            `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? LIMIT 1`,
            [evidenceId]
        ))[0] || { evidence_id: evidenceId, review_status: reviewStatus, proposed_effective_caliper_um: nominalUm };

        return {
            idempotentReplay: false,
            evidenceId,
            status: reviewStatus,
            proposedCaliperUm: nominalUm,
            documentSha256: pdfInfo.sha256,
            evidence: created,
            hasSourceContradiction: contradictionCheck.hasSourceContradiction,
            contradictionDetails: contradictionCheck.hasSourceContradiction
                ? `SOURCE_CONTRADICTION: ${contradictionCheck.contradictions.map((c) => c.message).join(' | ')}`
                : null,
            contradictions: contradictionCheck.contradictions,
            productiveCaliperModified: false
        };
    }

    /**
     * Attaches or replaces a PDF technical datasheet on an existing DRAFT or PENDING_TECH_REVIEW evidence.
     */
    async attachPdfToEvidence({
        tenantId,
        supplierId = null,
        evidenceId,
        actorUserId = null,
        actorId = null,
        actorRole = 'OPERATOR',
        fileBuffer = null,
        fileBase64 = null,
        fileName = 'datasheet.pdf',
        mimeType = 'application/pdf'
    }) {
        const effectiveActorId = actorUserId || actorId || 'operator';
        const rows = unwrapRows(await this.db.query(
            `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? AND tenant_id = ? LIMIT 1`,
            [evidenceId, tenantId]
        ));
        if (!rows || rows.length === 0) {
            throw new PaperEvidenceError(`Evidence '${evidenceId}' not found for this tenant.`, 'EVIDENCE_NOT_FOUND', 404);
        }
        const ev = rows[0];
        const currentStatus = ev.review_status || ev.status || 'DRAFT';
        if (currentStatus !== 'DRAFT' && currentStatus !== 'PENDING_TECH_REVIEW') {
            throw new PaperEvidenceError(
                `Cannot replace attachment on evidence in status '${currentStatus}'.`,
                'EVIDENCE_IMMUTABLE_IN_STATUS',
                409
            );
        }

        const pdfInfo = validateAndHashPdfDocument({
            buffer: fileBuffer,
            fileBase64,
            fileName,
            mimeType,
            tenantId,
            persistToStore: true,
            storageRoot: this.storageRoot
        });

        try {
            await this._withTransaction(async (executor) => {
                const updRes = unwrapAffectResult(await executor.query(
                    `UPDATE paper_variant_caliper_evidence
                     SET document_file_name = ?, document_mime_type = ?, document_size_bytes = ?,
                         document_storage_uri = ?, document_sha256 = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE evidence_id = ? AND tenant_id = ? AND review_status IN ('DRAFT', 'PENDING_TECH_REVIEW')`,
                    [pdfInfo.fileName, pdfInfo.mimeType, pdfInfo.sizeBytes, pdfInfo.storageUri, pdfInfo.sha256, evidenceId, tenantId]
                ));
                if (updRes.affectedRows !== undefined && Number(updRes.affectedRows) === 0) {
                    throw new PaperEvidenceError(
                        `Concurrent modification detected: evidence '${evidenceId}' is no longer in DRAFT or PENDING_TECH_REVIEW state.`,
                        'EVIDENCE_IMMUTABLE_IN_STATUS',
                        409
                    );
                }

                const auditId = `aud_cal_${crypto.randomBytes(8).toString('hex')}`;
                await executor.query(
                    `INSERT INTO paper_variant_caliper_audit_log (
                        audit_id, tenant_id, supplier_id, variant_id, evidence_id,
                        action_type, previous_review_status, new_review_status,
                        document_sha256, actor_user_id, actor_role, decision_reason
                    ) VALUES (?, ?, ?, ?, ?, 'EVIDENCE_DOCUMENT_ATTACHED', ?, ?, ?, ?, ?, ?)`,
                    [
                        auditId,
                        tenantId,
                        supplierId,
                        ev.variant_id,
                        evidenceId,
                        currentStatus,
                        currentStatus,
                        pdfInfo.sha256,
                        effectiveActorId,
                        actorRole || 'OPERATOR',
                        `Attached PDF ${pdfInfo.fileName} (SHA-256: ${pdfInfo.sha256})`
                    ]
                );
            });
        } catch (dbErr) {
            if (pdfInfo && pdfInfo.newlyCreatedOnDisk && pdfInfo.persistedFilePath) {
                cleanupOrphanEvidenceFile(pdfInfo.persistedFilePath, this.storageRoot);
            }
            throw dbErr;
        }

        const updated = unwrapRows(await this.db.query(
            `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? LIMIT 1`,
            [evidenceId]
        ))[0];

        return { evidence: updated, pdfInfo, documentSha256: pdfInfo.sha256 };
    }

    /**
     * Registers an ISO 534 physical batch micrometer measurement (10 readings + ISO 187 conditioning + calibration check).
     * Never automatically mutates paper_variants.caliper_um.
     */
    async registerPhysicalMicrometerEvidence({
        tenantId,
        supplierId = null,
        actorUserId = null,
        actorId = null,
        actorRole = 'OPERATOR',
        idempotencyKey = null,
        payload = {}
    }) {
        const effectiveActorId = actorUserId || actorId;
        if (!tenantId || !effectiveActorId) {
            throw new PaperEvidenceError('Authenticated tenant and actor identity required.', 'UNAUTHORIZED', 403);
        }
        const variantId = String(payload.variantId || '').trim();
        if (!variantId) {
            throw new PaperEvidenceError('variantId is required.', 'VARIANT_ID_REQUIRED', 400);
        }

        if (idempotencyKey) {
            const existing = unwrapRows(await this.db.query(
                `SELECT * FROM paper_variant_caliper_evidence WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
                [tenantId, idempotencyKey]
            ));
            if (existing.length > 0) {
                const ev = existing[0];
                return {
                    idempotentReplay: true,
                    evidenceId: ev.evidence_id || ev.id,
                    status: ev.review_status || ev.status,
                    evidence: ev,
                    productiveCaliperModified: false
                };
            }
        }

        const varRows = unwrapRows(await this.db.query(
            `SELECT v.*, p.name AS product_name FROM paper_variants v JOIN paper_products p ON v.product_id = p.id WHERE v.id = ? LIMIT 1`,
            [variantId]
        ));
        if (!varRows || varRows.length === 0) {
            throw new PaperEvidenceError(`Variant '${variantId}' not found.`, 'VARIANT_NOT_FOUND', 404);
        }
        const variant = varRows[0];

        const ambientRhPct = payload.conditioningRhPct ?? payload.conditioningHumidityPct;
        const calibrationCertId = payload.micrometerCalibrationCertId || payload.micrometerSerial || payload.micrometerSerialNumber;
        const calibrationValidUntil = payload.micrometerCalibrationValidUntil || payload.calibrationCertValidUntil;
        const batchLotId = payload.supplierLotBatchId || payload.measuredBatchNumber || 'LOT-UNSPECIFIED';
        const serialNum = payload.micrometerSerialNumber || payload.micrometerSerial || 'SN-ISO534';

        // Evaluate ISO 534 statistical acceptance & conditioning (using dummy placeholder approver to validate measurement physics first)
        const metroEval = evaluatePhysicalMicrometerRecord({
            readingsUm: payload.readingsUm,
            ambientTempC: payload.conditioningTempC,
            ambientRhPct,
            calibrationCertId,
            calibrationValidUntil,
            measurementDate: payload.lotReceivedDate || new Date().toISOString().slice(0, 10),
            substrateClass: payload.substrateToleranceClass || 'EMBOSSED_OR_LAID_COVERING',
            submittedByOperator: effectiveActorId,
            approvedByTechnologist: '__PENDING_SEPARATE_TECHNOLOGIST__'
        });

        if (!metroEval.approved) {
            const detailMsg = metroEval.errors.includes('MINIMUM_10_READINGS_REQUIRED')
                ? 'ISO 534 requires at least 10 individual platen readings per batch.'
                : metroEval.errors.join(', ');
            throw new PaperEvidenceError(
                `ISO 534 physical measurement validation failed: ${detailMsg}`,
                'ISO_534_METROLOGY_VALIDATION_FAILED',
                422,
                { errors: metroEval.errors, statistics: metroEval.statistics }
            );
        }

        const measuredUm = metroEval.statistics.roundedCaliperUm;
        const nominalUm = payload.nominalDatasheetCaliperUm !== undefined && payload.nominalDatasheetCaliperUm !== null
            ? Number(payload.nominalDatasheetCaliperUm)
            : null;

        const staticInv = loadStaticInventory252().find((r) => r.variant_id === variantId);
        const refCandUm = staticInv && staticInv.rec07_reference_candidate_um
            ? Number(staticInv.rec07_reference_candidate_um)
            : null;

        const contradictionCheck = detectSourceContradictions({
            nominalDatasheetCaliperUm: nominalUm,
            measuredBatchCaliperUm: measuredUm,
            existingVariantCaliperUm: variant.caliper_um,
            referenceCandidateUm: refCandUm
        });

        const evidenceId = `evd_mic_${crypto.randomBytes(8).toString('hex')}`;
        const reviewStatus = payload.submitForReview === false ? 'DRAFT' : 'PENDING_TECH_REVIEW';

        await this.db.query(
            `INSERT INTO paper_variant_caliper_evidence (
                evidence_id, tenant_id, supplier_id, variant_id, product_id,
                accreditation_track, evidence_type,
                manufacturer_name, supplier_channel, supplier_sku,
                measurement_standard,
                nominal_datasheet_caliper_um,
                measured_batch_caliper_um, measured_facestock_caliper_um, measured_liner_caliper_um,
                supplier_lot_batch_id, lot_received_date,
                conditioning_temp_c, conditioning_rh_pct, conditioning_hours,
                micrometer_make_model, micrometer_serial_number,
                micrometer_calibration_cert_id, micrometer_calibration_valid_until,
                substrate_tolerance_class,
                readings_json, readings_count, readings_mean_um, readings_std_dev_um, readings_cv_pct, readings_min_um, readings_max_um,
                proposed_effective_caliper_um, proposed_caliper_source, proposed_confidence_status,
                has_source_contradiction, contradiction_details_json,
                review_status, applied_to_catalog_variant, idempotency_key,
                submitted_by, submitted_by_role, technical_notes
            ) VALUES (?, ?, ?, ?, ?, 'PHYSICAL_MICROMETER_TRACK', 'PHYSICAL_MICROMETER_RECORD', ?, ?, ?, 'ISO 534:2011', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MEASURED_MICROMETER', 'VERIFIED', ?, ?, ?, FALSE, ?, ?, ?, ?)`,
            [
                evidenceId,
                tenantId,
                supplierId,
                variantId,
                variant.product_id,
                payload.manufacturerName || variant.manufacturer || (staticInv ? staticInv.manufacturer : 'Mill'),
                payload.supplierChannel || (staticInv ? staticInv.primary_supplier_channel : null),
                payload.supplierSku || (staticInv ? staticInv.ods_code : null),
                nominalUm,
                measuredUm,
                payload.measuredFacestockCaliperUm || null,
                payload.measuredLinerCaliperUm || null,
                batchLotId,
                payload.lotReceivedDate || new Date().toISOString().slice(0, 10),
                Number(payload.conditioningTempC),
                Number(ambientRhPct),
                Number(payload.conditioningHours || 8.0),
                payload.micrometerMakeModel || 'ISO 534 Dead-Weight Micrometer',
                serialNum,
                calibrationCertId,
                calibrationValidUntil,
                payload.substrateToleranceClass || 'EMBOSSED_OR_LAID_COVERING',
                JSON.stringify(payload.readingsUm),
                metroEval.statistics.sampleCount,
                metroEval.statistics.meanUm,
                metroEval.statistics.stdDevUm,
                metroEval.statistics.cvPct,
                metroEval.statistics.minUm,
                metroEval.statistics.maxUm,
                measuredUm,
                contradictionCheck.hasSourceContradiction,
                JSON.stringify(contradictionCheck.contradictions),
                reviewStatus,
                idempotencyKey,
                effectiveActorId,
                actorRole || 'OPERATOR',
                payload.technicalNotes || payload.notes || null
            ]
        );

        const auditId = `aud_cal_${crypto.randomBytes(8).toString('hex')}`;
        await this.db.query(
            `INSERT INTO paper_variant_caliper_audit_log (
                audit_id, tenant_id, supplier_id, variant_id, evidence_id,
                action_type, previous_review_status, new_review_status,
                previous_caliper_um, new_caliper_um,
                nominal_datasheet_caliper_um, measured_batch_caliper_um,
                actor_user_id, actor_role, decision_reason, metadata_json
            ) VALUES (?, ?, ?, ?, ?, 'EVIDENCE_CREATED', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                auditId,
                tenantId,
                supplierId,
                variantId,
                evidenceId,
                reviewStatus,
                variant.caliper_um,
                variant.caliper_um,
                nominalUm,
                measuredUm,
                effectiveActorId,
                actorRole || 'OPERATOR',
                'Physical ISO 534 micrometer batch record registered.',
                JSON.stringify({ statistics: metroEval.statistics, contradictions: contradictionCheck.contradictions })
            ]
        );

        const created = unwrapRows(await this.db.query(
            `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? LIMIT 1`,
            [evidenceId]
        ))[0] || { evidence_id: evidenceId, review_status: reviewStatus, proposed_effective_caliper_um: measuredUm };

        return {
            idempotentReplay: false,
            evidenceId,
            status: reviewStatus,
            proposedCaliperUm: measuredUm,
            measuredStdDevUm: metroEval.statistics.stdDevUm,
            measuredCvPct: metroEval.statistics.cvPct,
            evidence: created,
            statistics: metroEval.statistics,
            hasSourceContradiction: contradictionCheck.hasSourceContradiction,
            contradictions: contradictionCheck.contradictions,
            productiveCaliperModified: false
        };
    }

    /**
     * Submits a DRAFT evidence record to PENDING_TECH_REVIEW with transactional row locking and atomic CAS update.
     */
    async submitEvidenceForReview({
        tenantId,
        supplierId = null,
        evidenceId,
        actorUserId = null,
        actorId = null,
        actorRole = 'OPERATOR',
        reason = null
    }) {
        const effectiveActorId = actorUserId || actorId;
        if (!tenantId || !effectiveActorId) {
            throw new PaperEvidenceError('Authenticated tenant and actor identity required.', 'UNAUTHORIZED', 403);
        }

        return this._withTransaction(async (executor, isTx) => {
            const lockClause = isTx ? ' FOR UPDATE' : '';
            const rows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? AND tenant_id = ? LIMIT 1${lockClause}`,
                [evidenceId, tenantId]
            ));
            if (!rows || rows.length === 0) {
                throw new PaperEvidenceError(`Evidence '${evidenceId}' not found for this tenant.`, 'EVIDENCE_NOT_FOUND', 404);
            }
            const ev = rows[0];
            const currentStatus = ev.review_status || ev.status || 'DRAFT';
            if (currentStatus === 'PENDING_TECH_REVIEW') {
                return { evidence: ev, status: 'PENDING_TECH_REVIEW', idempotentReplay: true };
            }
            if (currentStatus !== 'DRAFT') {
                throw new PaperEvidenceError(
                    `Only DRAFT evidence can be submitted for review (current: '${currentStatus}').`,
                    'INVALID_STATUS_TRANSITION',
                    409
                );
            }

            const updRes = unwrapAffectResult(await executor.query(
                `UPDATE paper_variant_caliper_evidence
                 SET review_status = 'PENDING_TECH_REVIEW', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE evidence_id = ? AND tenant_id = ? AND review_status = 'DRAFT'`,
                [evidenceId, tenantId]
            ));
            if (updRes.affectedRows !== undefined && Number(updRes.affectedRows) === 0) {
                throw new PaperEvidenceError(
                    `Concurrent state transition detected on evidence '${evidenceId}'.`,
                    'EVIDENCE_CONCURRENT_MODIFICATION',
                    409
                );
            }

            const auditId = `aud_cal_${crypto.randomBytes(8).toString('hex')}`;
            await executor.query(
                `INSERT INTO paper_variant_caliper_audit_log (
                    audit_id, tenant_id, supplier_id, variant_id, evidence_id,
                    action_type, previous_review_status, new_review_status,
                    actor_user_id, actor_role, decision_reason
                ) VALUES (?, ?, ?, ?, ?, 'EVIDENCE_SUBMITTED_FOR_REVIEW', 'DRAFT', 'PENDING_TECH_REVIEW', ?, ?, ?)`,
                [
                    auditId,
                    tenantId,
                    supplierId,
                    ev.variant_id,
                    evidenceId,
                    effectiveActorId,
                    actorRole || 'OPERATOR',
                    reason || 'Evidence submitted to technologist review queue.'
                ]
            );

            const updated = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? LIMIT 1`,
                [evidenceId]
            ))[0];

            return { evidence: updated, status: 'PENDING_TECH_REVIEW', idempotentReplay: false };
        });
    }

    /**
     * Technologist approval or rejection of a caliper evidence.
     * Protected against concurrency / race conditions via transactional row locking (SELECT ... FOR UPDATE)
     * and atomic Compare-And-Swap status guard (`WHERE ... AND review_status IN ('DRAFT', 'PENDING_TECH_REVIEW')`).
     */
    async reviewEvidence({
        tenantId,
        supplierId = null,
        evidenceId,
        technologistUserId = null,
        actorId = null,
        technologistRole = null,
        actorRole = null,
        decision,
        decisionReason = null,
        reason = null,
        acknowledgeContradiction = false
    }) {
        const effectiveTechId = technologistUserId || actorId;
        const effectiveTechRole = technologistRole || actorRole;
        const effectiveReason = decisionReason || reason;

        if (!tenantId || !effectiveTechId) {
            throw new PaperEvidenceError('Authenticated tenant and technologist identity required.', 'UNAUTHORIZED', 403);
        }
        const allowedApproverRoles = new Set(['SUPER_ADMIN', 'ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN', 'SUPPLIER_ADMIN', 'MATERIAL_TECHNOLOGIST']);
        if (!allowedApproverRoles.has(String(effectiveTechRole || '').toUpperCase())) {
            throw new PaperEvidenceError(
                `Role '${effectiveTechRole}' is not authorized to approve or reject technical evidences. Technologist or Admin privileges required.`,
                'FORBIDDEN_TECHNOLOGIST_ROLE_REQUIRED',
                403
            );
        }

        const normDecision = String(decision || '').toUpperCase();
        if (normDecision !== 'APPROVE' && normDecision !== 'REJECT') {
            throw new PaperEvidenceError("decision must be 'APPROVE' or 'REJECT'.", 'INVALID_REVIEW_DECISION', 400);
        }
        if (!effectiveReason || String(effectiveReason).trim().length < 5) {
            throw new PaperEvidenceError(
                'A detailed decisionReason (min 5 characters) is mandatory for approving or rejecting technical evidence.',
                'DECISION_REASON_REQUIRED',
                422
            );
        }

        return this._withTransaction(async (executor, isTx) => {
            const lockClause = isTx ? ' FOR UPDATE' : '';
            const rows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? AND tenant_id = ? LIMIT 1${lockClause}`,
                [evidenceId, tenantId]
            ));
            if (!rows || rows.length === 0) {
                throw new PaperEvidenceError(`Evidence '${evidenceId}' not found for this tenant.`, 'EVIDENCE_NOT_FOUND', 404);
            }
            const ev = rows[0];
            const currentStatus = ev.review_status || ev.status || 'PENDING_TECH_REVIEW';
            const evType = ev.evidence_type || ev.source_kind || 'MANUFACTURER_DATASHEET_PDF';

            // Segregation of Duties (SoD)
            if (String(ev.submitted_by).trim() === String(effectiveTechId).trim()) {
                throw new PaperEvidenceError(
                    'Segregation of Duties violation: the user who submitted this evidence cannot approve or reject it.',
                    'SOD_SELF_APPROVAL_FORBIDDEN',
                    403
                );
            }

            if (currentStatus !== 'PENDING_TECH_REVIEW' && currentStatus !== 'DRAFT') {
                throw new PaperEvidenceError(
                    `Evidence '${evidenceId}' is already in terminal/reviewed state '${currentStatus}'.`,
                    'EVIDENCE_ALREADY_REVIEWED',
                    409
                );
            }

            let targetStatus = 'REJECTED';
            if (normDecision === 'APPROVE') {
                if (
                    ev.accreditation_track === 'PHYSICAL_MICROMETER_TRACK' &&
                    evType !== 'PHYSICAL_MICROMETER_RECORD' &&
                    evType !== 'COMBINED_DATASHEET_AND_MICROMETER' &&
                    !payloadAllowsNominalReferenceOnly(ev)
                ) {
                    throw new PaperEvidenceError(
                        'Materials in PHYSICAL_MICROMETER_TRACK (embossed/covering/multilayer) cannot be certified via datasheet alone without an ISO 534 physical micrometer record.',
                        'PHYSICAL_MICROMETER_REQUIRED_FOR_TRACK',
                        422
                    );
                }

                if (Boolean(ev.has_source_contradiction) && !acknowledgeContradiction) {
                    throw new PaperEvidenceError(
                        'This evidence has flagged source contradictions (> 5% delta). Technologist must explicitly pass acknowledgeContradiction=true with arbitration justification, or reject the evidence.',
                        'UNACKNOWLEDGED_SOURCE_CONTRADICTION',
                        409
                    );
                }

                targetStatus =
                    evType === 'PHYSICAL_MICROMETER_RECORD' || evType === 'COMBINED_DATASHEET_AND_MICROMETER'
                        ? 'CERTIFIED_MEASURED'
                        : 'APPROVED_FOR_TECHNICAL_USE';
            }

            const varRows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variants WHERE id = ? LIMIT 1`,
                [ev.variant_id]
            ));
            const variant = varRows[0] || {};

            const updRes = unwrapAffectResult(await executor.query(
                `UPDATE paper_variant_caliper_evidence
                 SET review_status = ?,
                     approved_by_technologist = ?,
                     approved_by_role = ?,
                     approved_at = CURRENT_TIMESTAMP,
                     decision_reason = ?,
                     applied_to_catalog_variant = FALSE,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE evidence_id = ? AND tenant_id = ? AND review_status IN ('DRAFT', 'PENDING_TECH_REVIEW')`,
                [targetStatus, effectiveTechId, effectiveTechRole, String(effectiveReason).trim(), evidenceId, tenantId]
            ));

            if (updRes.affectedRows !== undefined && Number(updRes.affectedRows) === 0) {
                throw new PaperEvidenceError(
                    `Concurrent review race condition blocked: evidence '${evidenceId}' was already reviewed by another transaction.`,
                    'EVIDENCE_ALREADY_REVIEWED',
                    409
                );
            }

            const auditId = `aud_cal_${crypto.randomBytes(8).toString('hex')}`;
            await executor.query(
                `INSERT INTO paper_variant_caliper_audit_log (
                    audit_id, tenant_id, supplier_id, variant_id, evidence_id,
                    action_type, previous_review_status, new_review_status,
                    previous_caliper_um, new_caliper_um,
                    previous_caliper_source, new_caliper_source,
                    previous_confidence_status, new_confidence_status,
                    previous_revision, new_revision,
                    nominal_datasheet_caliper_um, measured_batch_caliper_um, document_sha256,
                    actor_user_id, actor_role, decision_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    auditId,
                    tenantId,
                    supplierId,
                    ev.variant_id,
                    evidenceId,
                    normDecision === 'APPROVE' ? 'EVIDENCE_APPROVED' : 'EVIDENCE_REJECTED',
                    currentStatus,
                    targetStatus,
                    variant.caliper_um ?? null,
                    variant.caliper_um ?? null, // Strictly unchanged on paper_variants!
                    variant.caliper_source ?? 'NONE',
                    variant.caliper_source ?? 'NONE',
                    variant.caliper_confidence_status ?? 'MISSING',
                    variant.caliper_confidence_status ?? 'MISSING',
                    Number(variant.caliper_revision || 1),
                    Number(variant.caliper_revision || 1),
                    ev.nominal_datasheet_caliper_um,
                    ev.measured_batch_caliper_um,
                    ev.document_sha256,
                    effectiveTechId,
                    effectiveTechRole,
                    String(effectiveReason).trim()
                ]
            );

            const updated = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? LIMIT 1`,
                [evidenceId]
            ))[0] || { ...ev, review_status: targetStatus, approved_by_technologist: effectiveTechId };

            return {
                evidenceId,
                newStatus: targetStatus,
                evidence: updated,
                productiveCaliperModified: false,
                productiveVariantCaliperModified: false,
                canReleaseToManufacturing: false
            };
        });
    }

    /**
     * Retrieves and cryptographically verifies a persisted PDF document for an evidence record
     * within the authenticated tenant scope.
     */
    async getEvidenceDocumentDownload({ tenantId, evidenceId }) {
        if (!tenantId) {
            throw new PaperEvidenceError('Authenticated tenant context is required.', 'TENANT_REQUIRED', 403);
        }
        if (!evidenceId) {
            throw new PaperEvidenceError('evidenceId is required.', 'EVIDENCE_ID_REQUIRED', 400);
        }

        const rows = unwrapRows(await this.db.query(
            `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? AND tenant_id = ? LIMIT 1`,
            [evidenceId, tenantId]
        ));
        if (!rows || rows.length === 0) {
            throw new PaperEvidenceError(`Evidence '${evidenceId}' not found for this tenant.`, 'EVIDENCE_NOT_FOUND', 404);
        }
        const ev = rows[0];
        const expectedSha256 = String(ev.document_sha256 || '').toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
            throw new PaperEvidenceError(
                `Evidence '${evidenceId}' does not have a verifiable SHA-256 PDF document hash.`,
                'DOCUMENT_NOT_ATTACHED',
                404
            );
        }

        const rootDir = resolvePrivateEvidenceStoreDir(this.storageRoot);
        const safeTenantDir = sanitizePathSegment(tenantId, 'global');
        const tenantDir = path.resolve(rootDir, safeTenantDir);
        if (!tenantDir.startsWith(rootDir + path.sep)) {
            throw new PaperEvidenceError('Path traversal blocked.', 'PATH_TRAVERSAL_BLOCKED', 403);
        }

        const filePath = path.resolve(tenantDir, `${expectedSha256}.pdf`);
        if (!filePath.startsWith(tenantDir + path.sep) || !fs.existsSync(filePath)) {
            throw new PaperEvidenceError(
                `Private PDF file for evidence '${evidenceId}' is not present in local storage.`,
                'DOCUMENT_FILE_NOT_FOUND_ON_DISK',
                404
            );
        }

        const fileBuffer = fs.readFileSync(filePath);
        const actualSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        if (actualSha256 !== expectedSha256) {
            throw new PaperEvidenceError(
                `Cryptographic integrity failure: on-disk PDF SHA-256 (${actualSha256}) does not match recorded evidence hash (${expectedSha256}).`,
                'STORED_DOCUMENT_INTEGRITY_VIOLATION',
                409
            );
        }

        const safeFileName = String(ev.document_file_name || `${evidenceId}.pdf`)
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .slice(0, 180);

        return {
            evidenceId,
            tenantId,
            fileName: safeFileName,
            mimeType: 'application/pdf',
            sizeBytes: fileBuffer.length,
            sha256: actualSha256,
            buffer: fileBuffer
        };
    }

    /**
     * Scans the tenant's private evidence directory and deletes any unreferenced / orphan PDF files
     * whose SHA-256 is not bound to any record in paper_variant_caliper_evidence or paper_variant_classification_evidence.
     */
    async sweepOrphanEvidenceFiles({ tenantId }) {
        if (!tenantId) {
            throw new PaperEvidenceError('Authenticated tenant context is required.', 'TENANT_REQUIRED', 403);
        }

        const rootDir = resolvePrivateEvidenceStoreDir(this.storageRoot);
        const safeTenantDir = sanitizePathSegment(tenantId, 'global');
        const tenantDir = path.resolve(rootDir, safeTenantDir);
        if (!tenantDir.startsWith(rootDir + path.sep) || !fs.existsSync(tenantDir)) {
            return { scannedCount: 0, deletedCount: 0, deletedFiles: [] };
        }

        const referencedHashes = new Set();
        const calRows = unwrapRows(await this.db.query(
            `SELECT DISTINCT document_sha256 FROM paper_variant_caliper_evidence WHERE tenant_id = ? AND document_sha256 IS NOT NULL`,
            [tenantId]
        ));
        for (const r of calRows) {
            if (r.document_sha256) referencedHashes.add(String(r.document_sha256).toLowerCase());
        }
        try {
            const clsRows = unwrapRows(await this.db.query(
                `SELECT DISTINCT document_sha256 FROM paper_variant_classification_evidence WHERE tenant_id = ? AND document_sha256 IS NOT NULL`,
                [tenantId]
            ));
            for (const r of clsRows) {
                if (r.document_sha256) referencedHashes.add(String(r.document_sha256).toLowerCase());
            }
        } catch (_) {}

        const entries = fs.readdirSync(tenantDir);
        let scannedCount = 0;
        const deletedFiles = [];

        for (const entry of entries) {
            if (!entry.endsWith('.pdf')) continue;
            scannedCount++;
            const hashPart = entry.slice(0, -4).toLowerCase();
            if (!referencedHashes.has(hashPart)) {
                const fullPath = path.resolve(tenantDir, entry);
                if (fullPath.startsWith(tenantDir + path.sep)) {
                    fs.unlinkSync(fullPath);
                    deletedFiles.push(entry);
                }
            }
        }

        return {
            scannedCount,
            deletedCount: deletedFiles.length,
            deletedFiles
        };
    }

    /**
     * Explicit append-only immutability guard for `paper_variant_caliper_audit_log`.
     */
    async updateAuditLogEntry() {
        throw new PaperEvidenceError(
            'Audit log immutability violation: paper_variant_caliper_audit_log is strictly append-only and cannot be modified.',
            'AUDIT_LOG_IMMUTABLE',
            403
        );
    }

    async deleteAuditLogEntry() {
        throw new PaperEvidenceError(
            'Audit log immutability violation: paper_variant_caliper_audit_log is strictly append-only and cannot be deleted.',
            'AUDIT_LOG_IMMUTABLE',
            403
        );
    }
}

function payloadAllowsNominalReferenceOnly() {
    return false;
}

const paperEvidenceService = new PaperEvidenceService();

module.exports = {
    paperEvidenceService,
    PaperEvidenceService,
    PaperEvidenceError,
    MAX_PDF_SIZE_BYTES,
    DEFAULT_PRIVATE_EVIDENCE_STORE_DIR,
    resolvePrivateEvidenceStoreDir,
    persistPdfBufferToPrivateStore,
    cleanupOrphanEvidenceFile,
    detectSourceContradictions,
    validateAndHashPdfDocument,
    loadStaticInventory252,
    loadStaticSupplierMatrix252,
    loadStaticPendingClassifications337
};
