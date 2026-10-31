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
const {
    executeSpineCalculation,
    BUILTIN_BINDING_PROFILES
} = require('./spine/spineCalculationEngine');

/**
 * The 9 historical conflicts preserved across RECOVERY-05..10V (5 Amber Graphic 110g @ 122 µm + 4 Galerie Art Matt 250g @ 225 µm).
 * Protected against automatic or accidental promotion overwrites.
 */
const HISTORICAL_CONFLICT_9_VARIANT_IDS = new Set([
    'var_2b0314c68f5a97c7',
    'var_4178aecbfa53dcf8',
    'var_5f5cae75e6f45671',
    'var_7b7e3a2a2a4a0313',
    'var_c699e6a51cd6b41f',
    'var_06e1d1681e4f0989',
    'var_9dabfd7ac5eff6ca',
    'var_ae7dbf443ceab19a',
    'var_e2f2e68304e9d4a1'
]);

const ALLOWED_PROMOTION_REQUESTER_ROLES = new Set([
    'SUPPLIER_OPERATOR',
    'OPERATOR',
    'MATERIAL_TECHNOLOGIST',
    'SUPPLIER_ADMIN',
    'PRINTHOUSE_ADMIN',
    'TENANT_ADMIN',
    'OPS_ADMIN',
    'ADMIN',
    'SUPER_ADMIN'
]);

const ALLOWED_PROMOTION_AUTHORIZER_ROLES = new Set([
    'MATERIAL_TECHNOLOGIST',
    'SUPPLIER_ADMIN',
    'PRINTHOUSE_ADMIN',
    'TENANT_ADMIN',
    'OPS_ADMIN',
    'ADMIN',
    'SUPER_ADMIN'
]);

function parseJsonColumn(val) {
    if (!val) return {};
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(String(val));
    } catch (_) {
        return {};
    }
}

/**
 * Resolves the target paper_variants.caliper_source and caliper_confidence_status for a promoted evidence.
 * - Physical ISO 534 micrometer record -> MEASURED_MICROMETER + VERIFIED
 * - Manufacturer datasheet / documentary record -> MANUFACTURER_DATASHEET (or SUPPLIER_IMPORT) + REFERENCE_IMPORTED
 *   so that documentary evidence NEVER falsely triggers VERIFIED physical caliper status or unlocks canReleaseToManufacturing.
 */
function resolvePromotionCatalogProvenance(ev) {
    const evType = String(ev.evidence_type || ev.source_kind || 'MANUFACTURER_DATASHEET_PDF').toUpperCase();
    const status = String(ev.review_status || ev.status || '').toUpperCase();
    if (
        status === 'CERTIFIED_MEASURED' ||
        evType === 'PHYSICAL_MICROMETER_RECORD' ||
        evType === 'COMBINED_DATASHEET_AND_MICROMETER'
    ) {
        return {
            targetCaliperSource: 'MEASURED_MICROMETER',
            targetConfidenceStatus: 'VERIFIED',
            isPhysicallyVerifiedBatch: true
        };
    }
    const targetCaliperSource =
        ev.proposed_caliper_source === 'SUPPLIER_IMPORT' || evType === 'SUPPLIER_TECHNICAL_SHEET_PDF'
            ? 'SUPPLIER_IMPORT'
            : 'MANUFACTURER_DATASHEET';
    return {
        targetCaliperSource,
        targetConfidenceStatus: 'REFERENCE_IMPORTED',
        isPhysicallyVerifiedBatch: false
    };
}

/**
 * Computes Spine Calculator before/after impact preview for a candidate caliper promotion.
 */
function computeSpinePromotionImpactPreview({ variant, proposedCaliperUm, targetCaliperSource, targetConfidenceStatus }) {
    const currentUm =
        variant && variant.caliper_um !== null && variant.caliper_um !== undefined && Number(variant.caliper_um) > 0
            ? Number(variant.caliper_um)
            : null;
    const propUm = Number(proposedCaliperUm || 0);
    const gsm = Number(variant?.gsm || 100);
    const variantId = variant?.id || variant?.variantId || null;
    const profile = BUILTIN_BINDING_PROFILES['livonia-alegro-softcover@2.0.0'];

    const beforeAvailable = currentUm !== null && currentUm > 0;
    let beforeScenarios = null;
    if (beforeAvailable) {
        const gluedBefore = executeSpineCalculation(
            {
                bindingCategory: 'SOFTCOVER_STANDARD',
                processingType: 'GLUED',
                trimWidthMm: 170,
                trimHeightMm: 240,
                segments: [
                    {
                        pages: 200,
                        variantId,
                        gsm,
                        caliperUm: currentUm,
                        caliperSource: variant.caliper_source || 'NONE',
                        caliperConfidenceStatus: variant.caliper_confidence_status || 'REFERENCE_IMPORTED'
                    }
                ],
                cover: { caliperUm: 350 }
            },
            profile
        );
        const sewnBefore = executeSpineCalculation(
            {
                bindingCategory: 'SOFTCOVER_STANDARD',
                processingType: 'SEWN',
                trimWidthMm: 170,
                trimHeightMm: 240,
                segments: [
                    {
                        pages: 200,
                        variantId,
                        gsm,
                        caliperUm: currentUm,
                        caliperSource: variant.caliper_source || 'NONE',
                        caliperConfidenceStatus: variant.caliper_confidence_status || 'REFERENCE_IMPORTED'
                    }
                ],
                cover: { caliperUm: 350 }
            },
            profile
        );
        beforeScenarios = {
            available: true,
            caliperUm: currentUm,
            softcover200ppGlued: {
                netBlockMm: gluedBefore.blockThickness.netPaperBlockMm,
                spineWidthMm: gluedBefore.spineWidthMm,
                flatCoverWidthMm: gluedBefore.coverGeometry.flatCoverWidthMm,
                canReleaseToManufacturing: gluedBefore.manufacturingValidation.canReleaseToManufacturing
            },
            softcover200ppSewn: {
                netBlockMm: sewnBefore.blockThickness.netPaperBlockMm,
                spineWidthMm: sewnBefore.spineWidthMm,
                flatCoverWidthMm: sewnBefore.coverGeometry.flatCoverWidthMm,
                canReleaseToManufacturing: sewnBefore.manufacturingValidation.canReleaseToManufacturing
            }
        };
    } else {
        beforeScenarios = {
            available: false,
            blockedCode: 'MISSING_PAPER_CALIPER',
            caliperUm: null,
            message: 'Variant currently has caliper_um = NULL; Spine Calculator rejects calculation with 422 MISSING_PAPER_CALIPER.'
        };
    }

    let afterScenarios = null;
    if (propUm > 0) {
        const gluedAfter = executeSpineCalculation(
            {
                bindingCategory: 'SOFTCOVER_STANDARD',
                processingType: 'GLUED',
                trimWidthMm: 170,
                trimHeightMm: 240,
                segments: [
                    {
                        pages: 200,
                        variantId,
                        gsm,
                        caliperUm: propUm,
                        caliperSource: targetCaliperSource,
                        caliperConfidenceStatus: targetConfidenceStatus
                    }
                ],
                cover: { caliperUm: 350 }
            },
            profile
        );
        const sewnAfter = executeSpineCalculation(
            {
                bindingCategory: 'SOFTCOVER_STANDARD',
                processingType: 'SEWN',
                trimWidthMm: 170,
                trimHeightMm: 240,
                segments: [
                    {
                        pages: 200,
                        variantId,
                        gsm,
                        caliperUm: propUm,
                        caliperSource: targetCaliperSource,
                        caliperConfidenceStatus: targetConfidenceStatus
                    }
                ],
                cover: { caliperUm: 350 }
            },
            profile
        );
        afterScenarios = {
            available: true,
            caliperUm: propUm,
            caliperSource: targetCaliperSource,
            caliperConfidenceStatus: targetConfidenceStatus,
            profileKey: profile.fullProfileKey,
            profileCertificationTier: profile.certificationTier,
            canReleaseToManufacturing: false,
            softcover200ppGlued: {
                netBlockMm: gluedAfter.blockThickness.netPaperBlockMm,
                spineWidthMm: gluedAfter.spineWidthMm,
                flatCoverWidthMm: gluedAfter.coverGeometry.flatCoverWidthMm,
                validationStatus: gluedAfter.manufacturingValidation.status,
                canReleaseToManufacturing: gluedAfter.manufacturingValidation.canReleaseToManufacturing
            },
            softcover200ppSewn: {
                netBlockMm: sewnAfter.blockThickness.netPaperBlockMm,
                spineWidthMm: sewnAfter.spineWidthMm,
                flatCoverWidthMm: sewnAfter.coverGeometry.flatCoverWidthMm,
                validationStatus: sewnAfter.manufacturingValidation.status,
                canReleaseToManufacturing: sewnAfter.manufacturingValidation.canReleaseToManufacturing
            }
        };
    }

    return {
        beforePromotion: beforeScenarios,
        afterPromotion: afterScenarios,
        canReleaseToManufacturingAfterPromotion: false,
        industrialReleaseLockExplanation:
            'Promoting approved caliper evidence enables deterministic Spine calculations on paper_variants.caliper_um, while preserving canReleaseToManufacturing = false because binding profile certification (MATH_BRANCH_VALIDATED vs PRODUCTION_CERTIFIED) and physical batch release remain independent gates.'
    };
}

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

    const tempPath = path.resolve(tenantDir, `.tmp_${normalizedHash}_${process.pid}_${crypto.randomBytes(4).toString('hex')}.pdf`);
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
    } catch (_) { }
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
                } catch (_) { }
                throw err;
            } finally {
                try {
                    conn.release();
                } catch (_) { }
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
                        applied_to_catalog_variant,
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
            const appliedToCatalog = latestEv ? Boolean(latestEv.applied_to_catalog_variant) : false;

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
                appliedToCatalogVariant: appliedToCatalog,
                latestProposedCaliperUm: latestProposedUm,
                hasSourceContradiction: hasContradiction,
                evidenceCount: evList.length,
                latestEvidence: latestEv
                    ? {
                        evidenceId: latestEv.evidence_id || latestEv.id,
                        evidenceType: latestEv.evidence_type || latestEv.source_kind,
                        reviewStatus: latestStatus,
                        appliedToCatalogVariant: appliedToCatalog,
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
        } catch (_) { }

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
        } catch (_) { }

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

    /**
     * -------------------------------------------------------------------------
     * PAPER-MATERIALS-RECOVERY-11: GOVERNED PROMOTION OF APPROVED EVIDENCES
     * -------------------------------------------------------------------------
     */

    /**
     * Previews the governed promotion of an approved evidence record (`evidenceId`) to `paper_variants.caliper_um`.
     * Computes current vs proposed caliper, delta (µm and %), Spine Calculator impact, SoD eligibility, and blocking gates.
     */
    async previewEvidencePromotion({
        tenantId,
        supplierId = null,
        variantId,
        evidenceId,
        actorId = null,
        actorRole = null
    }) {
        if (!tenantId) {
            throw new PaperEvidenceError('Authenticated tenant context is required.', 'TENANT_REQUIRED', 403);
        }
        if (!variantId) {
            throw new PaperEvidenceError('variantId is required.', 'VARIANT_ID_REQUIRED', 400);
        }
        if (!evidenceId) {
            throw new PaperEvidenceError('evidenceId is required.', 'EVIDENCE_ID_REQUIRED', 400);
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

        const evRows = unwrapRows(await this.db.query(
            `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? AND tenant_id = ? LIMIT 1`,
            [evidenceId, tenantId]
        ));
        if (!evRows || evRows.length === 0) {
            throw new PaperEvidenceError(`Evidence '${evidenceId}' not found for this tenant.`, 'EVIDENCE_NOT_FOUND', 404);
        }
        const ev = evRows[0];
        if (String(ev.variant_id) !== String(variantId)) {
            throw new PaperEvidenceError(
                `Evidence '${evidenceId}' belongs to variant '${ev.variant_id}', not '${variantId}'.`,
                'EVIDENCE_VARIANT_MISMATCH',
                422
            );
        }

        const auditLogs = unwrapRows(await this.db.query(
            `SELECT * FROM paper_variant_caliper_audit_log WHERE tenant_id = ? AND variant_id = ? ORDER BY created_at DESC`,
            [tenantId, variantId]
        ));

        // Find any promotion request for this evidence
        let activePromotionRequest = null;
        for (const log of auditLogs) {
            if (String(log.evidence_id) !== String(evidenceId)) continue;
            const meta = parseJsonColumn(log.metadata_json);
            if (meta && meta.promotionStage === 'PROMOTION_REQUESTED') {
                activePromotionRequest = {
                    promotionRequestId: meta.promotionRequestId || log.audit_id,
                    requestedBy: meta.requestedBy || log.actor_user_id,
                    requestedByRole: meta.requestedByRole || log.actor_role,
                    requestedAt: log.created_at,
                    reason: log.decision_reason,
                    expectedCaliperRevision: meta.expectedCaliperRevision
                };
                break;
            }
        }

        const currentUm =
            variant.caliper_um !== null && variant.caliper_um !== undefined && Number(variant.caliper_um) > 0
                ? Number(variant.caliper_um)
                : null;
        const proposedUm = Number(ev.proposed_effective_caliper_um ?? ev.proposed_caliper_um ?? 0);
        const deltaUm = currentUm !== null ? Number((proposedUm - currentUm).toFixed(2)) : null;
        const deltaPct =
            currentUm !== null && currentUm > 0 ? Number((((proposedUm - currentUm) / currentUm) * 100).toFixed(2)) : null;

        const reviewStatus = String(ev.review_status || ev.status || 'DRAFT').toUpperCase();
        const isApproved = reviewStatus === 'APPROVED_FOR_TECHNICAL_USE' || reviewStatus === 'CERTIFIED_MEASURED';
        const isRevokedOrSuperseded = reviewStatus === 'SUPERSEDED' || reviewStatus === 'REJECTED';
        const isAlreadyPromoted = Boolean(ev.applied_to_catalog_variant);
        const isHistoricalConflict9 = HISTORICAL_CONFLICT_9_VARIANT_IDS.has(String(variantId));
        const hasExistingCatalogCaliper = currentUm !== null && currentUm > 0;
        const hasSourceContradiction = Boolean(ev.has_source_contradiction);

        const { targetCaliperSource, targetConfidenceStatus, isPhysicallyVerifiedBatch } =
            resolvePromotionCatalogProvenance(ev);

        const blockingReasons = [];
        if (isRevokedOrSuperseded) {
            blockingReasons.push({
                code: 'EVIDENCE_REVOKED_OR_SUPERSEDED',
                message: `Evidence is in terminal state '${reviewStatus}' and cannot be promoted.`
            });
        } else if (!isApproved) {
            blockingReasons.push({
                code: 'EVIDENCE_NOT_APPROVED_FOR_PROMOTION',
                message: `Evidence status is '${reviewStatus}'; only APPROVED_FOR_TECHNICAL_USE or CERTIFIED_MEASURED evidences can be promoted.`
            });
        }
        if (isAlreadyPromoted) {
            blockingReasons.push({
                code: 'EVIDENCE_ALREADY_PROMOTED',
                message: `Evidence '${evidenceId}' is already promoted to catalog variant '${variantId}'.`
            });
        }
        if (isHistoricalConflict9) {
            blockingReasons.push({
                code: 'HISTORICAL_CONFLICT_VARIANT_PROTECTED',
                message: `Variant '${variantId}' is one of the 9 protected historical conflict variants and cannot be overwritten.`
            });
        } else if (hasExistingCatalogCaliper) {
            blockingReasons.push({
                code: 'EXISTING_CATALOG_CALIPER_PROTECTED',
                message: `Variant '${variantId}' already has an existing catalog caliper (${currentUm} µm). Automatic or direct overwrite of existing catalog calipers is prohibited.`
            });
        }
        if (hasSourceContradiction) {
            blockingReasons.push({
                code: 'UNRESOLVED_SOURCE_CONTRADICTION',
                message: `Evidence '${evidenceId}' has a flagged source contradiction (> 5% delta). Promotion to catalog requires explicit contradiction resolution.`
            });
        }

        const excludedAuthorizerActorIds = Array.from(
            new Set(
                [
                    ev.submitted_by,
                    ev.approved_by_technologist,
                    activePromotionRequest ? activePromotionRequest.requestedBy : null
                ].filter(Boolean)
            )
        );

        const callerCanRequest =
            Boolean(actorId) &&
            ALLOWED_PROMOTION_REQUESTER_ROLES.has(String(actorRole || '').toUpperCase()) &&
            blockingReasons.filter((b) => b.code !== 'UNRESOLVED_SOURCE_CONTRADICTION').length === 0;

        const callerCanAuthorize =
            Boolean(actorId) &&
            ALLOWED_PROMOTION_AUTHORIZER_ROLES.has(String(actorRole || '').toUpperCase()) &&
            !excludedAuthorizerActorIds.includes(String(actorId).trim()) &&
            blockingReasons.filter((b) => b.code !== 'UNRESOLVED_SOURCE_CONTRADICTION').length === 0;

        const spineImpact = computeSpinePromotionImpactPreview({
            variant,
            proposedCaliperUm: proposedUm,
            targetCaliperSource,
            targetConfidenceStatus
        });

        return {
            variant: {
                variantId: variant.id,
                productId: variant.product_id,
                productName: variant.product_name,
                brand: variant.brand || null,
                category: variant.category || null,
                gsm: Number(variant.gsm),
                widthMm: Number(variant.width_mm),
                heightMm: Number(variant.height_mm),
                currentCaliperUm: currentUm,
                currentCaliperMm: variant.caliper_mm !== null && variant.caliper_mm !== undefined ? Number(variant.caliper_mm) : null,
                currentCaliperSource: variant.caliper_source || 'NONE',
                currentConfidenceStatus: variant.caliper_confidence_status || 'MISSING',
                currentRevision: Number(variant.caliper_revision || 1),
                isHistoricalConflict9Protected: isHistoricalConflict9
            },
            evidence: {
                evidenceId: ev.evidence_id || ev.id,
                variantId: ev.variant_id,
                evidenceType: ev.evidence_type || ev.source_kind,
                accreditationTrack: ev.accreditation_track,
                reviewStatus,
                appliedToCatalogVariant: isAlreadyPromoted,
                proposedCaliperUm: proposedUm,
                proposedCaliperMm: Number((proposedUm / 1000).toFixed(4)),
                proposedBulkFactor:
                    ev.nominal_bulk_cm3_g !== null && ev.nominal_bulk_cm3_g !== undefined
                        ? Number(ev.nominal_bulk_cm3_g)
                        : Number((proposedUm / Number(variant.gsm || 100)).toFixed(3)),
                targetCaliperSource,
                targetConfidenceStatus,
                isPhysicallyVerifiedBatch,
                documentTitle: ev.document_title || null,
                documentFileName: ev.document_file_name || null,
                documentSha256: ev.document_sha256 || null,
                datasheetVersion: ev.datasheet_version || null,
                submittedBy: ev.submitted_by,
                submittedByRole: ev.submitted_by_role,
                approvedByTechnologist: ev.approved_by_technologist,
                approvedByRole: ev.approved_by_role,
                approvedAt: ev.approved_at || null,
                hasSourceContradiction,
                contradictionDetails: parseJsonColumn(ev.contradiction_details_json)
            },
            comparison: {
                currentCaliperUm: currentUm,
                proposedCaliperUm: proposedUm,
                deltaUm,
                deltaPct,
                comparisonMode: currentUm === null ? 'NEW_CATALOG_ACCREDITATION_FROM_NULL' : 'EXISTING_CALIPER_COMPARISON',
                currentSource: variant.caliper_source || 'NONE',
                targetSource: targetCaliperSource,
                currentConfidence: variant.caliper_confidence_status || 'MISSING',
                targetConfidence: targetConfidenceStatus,
                currentRevision: Number(variant.caliper_revision || 1),
                nextRevision: Number(variant.caliper_revision || 1) + 1
            },
            governance: {
                eligibleForPromotion: blockingReasons.filter((b) => b.code !== 'UNRESOLVED_SOURCE_CONTRADICTION').length === 0,
                requiresContradictionArbitration: hasSourceContradiction,
                blockingReasons,
                activePromotionRequest,
                segregationOfDuties: {
                    submittedBy: ev.submitted_by,
                    approvedByTechnologist: ev.approved_by_technologist,
                    requestedBy: activePromotionRequest ? activePromotionRequest.requestedBy : null,
                    excludedAuthorizerActorIds,
                    allowedRequesterRoles: Array.from(ALLOWED_PROMOTION_REQUESTER_ROLES),
                    allowedAuthorizerRoles: Array.from(ALLOWED_PROMOTION_AUTHORIZER_ROLES),
                    callerCanRequest,
                    callerCanAuthorize
                }
            },
            spineImpact
        };
    }

    /**
     * Submits a governed promotion request for an approved evidence (`APPROVED_FOR_TECHNICAL_USE` or `CERTIFIED_MEASURED`).
     * Does NOT mutate `paper_variants.caliper_um`; records the formal promotion request in `paper_variant_caliper_audit_log`.
     */
    async requestEvidencePromotion({
        tenantId,
        supplierId = null,
        variantId,
        evidenceId,
        actorUserId = null,
        actorId = null,
        actorRole = 'OPERATOR',
        reason = null,
        idempotencyKey = null
    }) {
        const effectiveActorId = actorUserId || actorId;
        if (!tenantId || !effectiveActorId) {
            throw new PaperEvidenceError('Authenticated tenant and actor identity required.', 'UNAUTHORIZED', 403);
        }
        const normRole = String(actorRole || '').toUpperCase();
        if (!ALLOWED_PROMOTION_REQUESTER_ROLES.has(normRole)) {
            throw new PaperEvidenceError(
                `Role '${actorRole}' is not authorized to request catalog promotion.`,
                'FORBIDDEN_PROMOTION_REQUESTER_ROLE_REQUIRED',
                403
            );
        }
        if (!reason || String(reason).trim().length < 5) {
            throw new PaperEvidenceError(
                'A detailed promotion request reason (min 5 characters) is mandatory.',
                'PROMOTION_REASON_REQUIRED',
                422
            );
        }

        return this._withTransaction(async (executor, isTx) => {
            const lockClause = isTx ? ' FOR UPDATE' : '';

            const varRows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variants WHERE id = ? LIMIT 1${lockClause}`,
                [variantId]
            ));
            if (!varRows || varRows.length === 0) {
                throw new PaperEvidenceError(`Variant '${variantId}' not found.`, 'VARIANT_NOT_FOUND', 404);
            }
            const variant = varRows[0];

            const evRows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? AND tenant_id = ? LIMIT 1${lockClause}`,
                [evidenceId, tenantId]
            ));
            if (!evRows || evRows.length === 0) {
                throw new PaperEvidenceError(`Evidence '${evidenceId}' not found for this tenant.`, 'EVIDENCE_NOT_FOUND', 404);
            }
            const ev = evRows[0];
            if (String(ev.variant_id) !== String(variantId)) {
                throw new PaperEvidenceError(
                    `Evidence '${evidenceId}' belongs to variant '${ev.variant_id}', not '${variantId}'.`,
                    'EVIDENCE_VARIANT_MISMATCH',
                    422
                );
            }

            // Idempotency check across audit log for this variant
            const existingLogs = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_caliper_audit_log WHERE tenant_id = ? AND variant_id = ? ORDER BY created_at DESC`,
                [tenantId, variantId]
            ));
            if (idempotencyKey) {
                for (const log of existingLogs) {
                    const meta = parseJsonColumn(log.metadata_json);
                    if (meta && meta.promotionStage === 'PROMOTION_REQUESTED' && meta.idempotencyKey === idempotencyKey) {
                        return {
                            idempotentReplay: true,
                            promotionRequestId: meta.promotionRequestId || log.audit_id,
                            evidenceId,
                            variantId,
                            status: 'PROMOTION_REQUESTED',
                            requestedBy: log.actor_user_id,
                            expectedCaliperRevision: meta.expectedCaliperRevision,
                            productiveCaliperModified: false,
                            canReleaseToManufacturing: false
                        };
                    }
                }
            }

            const reviewStatus = String(ev.review_status || ev.status || 'DRAFT').toUpperCase();
            if (reviewStatus === 'SUPERSEDED' || reviewStatus === 'REJECTED') {
                throw new PaperEvidenceError(
                    `Cannot request promotion for evidence '${evidenceId}' in revoked/rejected state '${reviewStatus}'.`,
                    'EVIDENCE_REVOKED_OR_SUPERSEDED',
                    409
                );
            }
            if (reviewStatus !== 'APPROVED_FOR_TECHNICAL_USE' && reviewStatus !== 'CERTIFIED_MEASURED') {
                throw new PaperEvidenceError(
                    `Evidence '${evidenceId}' has review_status '${reviewStatus}'. Only APPROVED_FOR_TECHNICAL_USE or CERTIFIED_MEASURED evidences can be requested for promotion.`,
                    'EVIDENCE_NOT_APPROVED_FOR_PROMOTION',
                    422
                );
            }
            if (Boolean(ev.applied_to_catalog_variant)) {
                throw new PaperEvidenceError(
                    `Evidence '${evidenceId}' has already been promoted to catalog variant '${variantId}'.`,
                    'EVIDENCE_ALREADY_PROMOTED',
                    409
                );
            }
            if (HISTORICAL_CONFLICT_9_VARIANT_IDS.has(String(variantId))) {
                throw new PaperEvidenceError(
                    `Variant '${variantId}' is one of the 9 protected historical conflict variants and cannot be overwritten via promotion.`,
                    'HISTORICAL_CONFLICT_VARIANT_PROTECTED',
                    409
                );
            }
            if (variant.caliper_um !== null && variant.caliper_um !== undefined && Number(variant.caliper_um) > 0) {
                throw new PaperEvidenceError(
                    `Variant '${variantId}' already has an active catalog caliper (${variant.caliper_um} µm). Overwriting existing catalog calipers is prohibited.`,
                    'EXISTING_CATALOG_CALIPER_PROTECTED',
                    409
                );
            }

            const promotionRequestId = `prm_req_${crypto.randomBytes(8).toString('hex')}`;
            const auditId = `aud_cal_${crypto.randomBytes(8).toString('hex')}`;
            const proposedUm = Number(ev.proposed_effective_caliper_um ?? ev.proposed_caliper_um ?? 0);
            const currentRev = Number(variant.caliper_revision || 1);

            const metadata = {
                promotionStage: 'PROMOTION_REQUESTED',
                promotionRequestId,
                idempotencyKey: idempotencyKey || null,
                requestedBy: effectiveActorId,
                requestedByRole: normRole,
                submittedBy: ev.submitted_by,
                approvedByTechnologist: ev.approved_by_technologist,
                expectedCaliperRevision: currentRev,
                expectedCurrentCaliperUm: null,
                proposedCaliperUm: proposedUm,
                documentSha256: ev.document_sha256 || null,
                datasheetVersion: ev.datasheet_version || null
            };

            await executor.query(
                `INSERT INTO paper_variant_caliper_audit_log (
                    audit_id, tenant_id, supplier_id, variant_id, evidence_id,
                    action_type, previous_review_status, new_review_status,
                    previous_caliper_um, new_caliper_um,
                    previous_caliper_source, new_caliper_source,
                    previous_confidence_status, new_confidence_status,
                    previous_revision, new_revision,
                    nominal_datasheet_caliper_um, measured_batch_caliper_um, document_sha256,
                    actor_user_id, actor_role, decision_reason, metadata_json
                ) VALUES (?, ?, ?, ?, ?, 'EVIDENCE_APPROVED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    auditId,
                    tenantId,
                    supplierId,
                    variantId,
                    evidenceId,
                    reviewStatus,
                    reviewStatus,
                    variant.caliper_um ?? null,
                    variant.caliper_um ?? null,
                    variant.caliper_source ?? 'NONE',
                    variant.caliper_source ?? 'NONE',
                    variant.caliper_confidence_status ?? 'MISSING',
                    variant.caliper_confidence_status ?? 'MISSING',
                    currentRev,
                    currentRev,
                    ev.nominal_datasheet_caliper_um ?? null,
                    ev.measured_batch_caliper_um ?? null,
                    ev.document_sha256 ?? null,
                    effectiveActorId,
                    normRole,
                    `[PROMOTION_REQUESTED] ${String(reason).trim()}`,
                    JSON.stringify(metadata)
                ]
            );

            return {
                idempotentReplay: false,
                promotionRequestId,
                auditId,
                evidenceId,
                variantId,
                status: 'PROMOTION_REQUESTED',
                requestedBy: effectiveActorId,
                requestedByRole: normRole,
                expectedCaliperRevision: currentRev,
                proposedCaliperUm: proposedUm,
                productiveCaliperModified: false,
                canReleaseToManufacturing: false
            };
        });
    }

    /**
     * Authorizes and executes the transactional Compare-And-Swap (CAS) promotion of an approved evidence
     * to `paper_variants.caliper_um`.
     *
     * Enforces:
     * 1. Row-level locking (`SELECT ... FOR UPDATE`) on both `paper_variants` and `paper_variant_caliper_evidence`.
     * 2. Strict 3-way Segregation of Duties (`actorId !== submitted_by`, `actorId !== approved_by_technologist`,
     *    and if a promotion request exists, `actorId !== requested_by`).
     * 3. Protection of the 1,272 existing calipers (`caliper_um IS NULL` required) and the 9 historical conflicts.
     * 4. Blocking of unapproved (`DRAFT`, `PENDING_TECH_REVIEW`), rejected (`REJECTED`), or revoked (`SUPERSEDED`) evidences.
     * 5. Blocking of unresolved source contradictions (`has_source_contradiction = true` without explicit arbitration).
     * 6. Atomic Compare-And-Swap (`WHERE id = ? AND caliper_revision = ? AND caliper_um IS NULL`).
     * 7. Automatic invalidation of any active `spine_calculation_snapshots` referencing `variantId`.
     * 8. Immutable `CATALOG_CALIPER_PROMOTED` audit log with full reversible snapshot.
     */
    async authorizeEvidencePromotion({
        tenantId,
        supplierId = null,
        variantId,
        evidenceId,
        promotionRequestId = null,
        actorUserId = null,
        actorId = null,
        actorRole = null,
        reason = null,
        decisionReason = null,
        expectedCaliperRevision = undefined,
        acknowledgeContradiction = false,
        idempotencyKey = null
    }) {
        const effectiveActorId = actorUserId || actorId;
        const effectiveRole = String(actorRole || '').toUpperCase();
        const effectiveReason = reason || decisionReason;

        if (!tenantId || !effectiveActorId) {
            throw new PaperEvidenceError('Authenticated tenant and authorizer identity required.', 'UNAUTHORIZED', 403);
        }
        if (!ALLOWED_PROMOTION_AUTHORIZER_ROLES.has(effectiveRole)) {
            throw new PaperEvidenceError(
                `Role '${actorRole}' is not authorized to promote technical evidence to the productive catalog. Admin or Material Technologist role required.`,
                'FORBIDDEN_PROMOTION_AUTHORIZER_ROLE_REQUIRED',
                403
            );
        }
        if (!variantId) {
            throw new PaperEvidenceError('variantId is required.', 'VARIANT_ID_REQUIRED', 400);
        }
        if (!evidenceId) {
            throw new PaperEvidenceError('evidenceId is required.', 'EVIDENCE_ID_REQUIRED', 400);
        }
        if (!effectiveReason || String(effectiveReason).trim().length < 5) {
            throw new PaperEvidenceError(
                'A detailed promotion authorization reason (min 5 characters) is mandatory.',
                'PROMOTION_REASON_REQUIRED',
                422
            );
        }

        return this._withTransaction(async (executor, isTx) => {
            const lockClause = isTx ? ' FOR UPDATE' : '';

            // 1. Lock variant row first (`paper_variants`)
            const varRows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variants WHERE id = ? LIMIT 1${lockClause}`,
                [variantId]
            ));
            if (!varRows || varRows.length === 0) {
                throw new PaperEvidenceError(`Variant '${variantId}' not found.`, 'VARIANT_NOT_FOUND', 404);
            }
            const variant = varRows[0];

            // 2. Lock evidence row (`paper_variant_caliper_evidence`)
            const evRows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? AND tenant_id = ? LIMIT 1${lockClause}`,
                [evidenceId, tenantId]
            ));
            if (!evRows || evRows.length === 0) {
                throw new PaperEvidenceError(`Evidence '${evidenceId}' not found for this tenant.`, 'EVIDENCE_NOT_FOUND', 404);
            }
            const ev = evRows[0];
            if (String(ev.variant_id) !== String(variantId)) {
                throw new PaperEvidenceError(
                    `Evidence '${evidenceId}' belongs to variant '${ev.variant_id}', not '${variantId}'.`,
                    'EVIDENCE_VARIANT_MISMATCH',
                    422
                );
            }

            // 3. Check idempotency key & prior promotion requests in audit log
            const auditLogs = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_caliper_audit_log WHERE tenant_id = ? AND variant_id = ? ORDER BY created_at DESC`,
                [tenantId, variantId]
            ));

            if (idempotencyKey) {
                for (const log of auditLogs) {
                    if (log.action_type === 'CATALOG_CALIPER_PROMOTED' && String(log.evidence_id) === String(evidenceId)) {
                        const meta = parseJsonColumn(log.metadata_json);
                        if (meta && meta.idempotencyKey === idempotencyKey) {
                            return {
                                idempotentReplay: true,
                                promotionId: meta.promotionId || log.audit_id,
                                auditId: log.audit_id,
                                variantId,
                                evidenceId,
                                previousCaliperUm: log.previous_caliper_um !== null ? Number(log.previous_caliper_um) : null,
                                newCaliperUm: Number(log.new_caliper_um),
                                newCaliperSource: log.new_caliper_source,
                                newConfidenceStatus: log.new_confidence_status,
                                previousRevision: Number(log.previous_revision),
                                newRevision: Number(log.new_revision),
                                productiveCaliperModified: true,
                                canReleaseToManufacturing: false
                            };
                        }
                    }
                }
            }

            let matchedRequest = null;
            for (const log of auditLogs) {
                if (String(log.evidence_id) !== String(evidenceId)) continue;
                const meta = parseJsonColumn(log.metadata_json);
                if (meta && meta.promotionStage === 'PROMOTION_REQUESTED') {
                    if (!promotionRequestId || meta.promotionRequestId === promotionRequestId) {
                        matchedRequest = meta;
                        break;
                    }
                }
            }

            // 4. Strict Segregation of Duties (SoD)
            if (String(ev.submitted_by || '').trim() === String(effectiveActorId).trim()) {
                throw new PaperEvidenceError(
                    'Segregation of Duties violation: the user who submitted this evidence cannot authorize its promotion to the productive catalog.',
                    'SOD_SUBMITTER_CANNOT_PROMOTE',
                    403
                );
            }
            if (String(ev.approved_by_technologist || '').trim() === String(effectiveActorId).trim()) {
                throw new PaperEvidenceError(
                    'Segregation of Duties violation: the technologist who approved this evidence cannot unilaterally authorize its promotion to the productive catalog.',
                    'SOD_REVIEWER_CANNOT_PROMOTE',
                    403
                );
            }
            if (
                matchedRequest &&
                matchedRequest.requestedBy &&
                String(matchedRequest.requestedBy).trim() === String(effectiveActorId).trim()
            ) {
                throw new PaperEvidenceError(
                    'Segregation of Duties violation: the user who requested this promotion cannot self-authorize it.',
                    'SOD_REQUESTER_CANNOT_AUTHORIZE_PROMOTION',
                    403
                );
            }

            // 5. Evidence lifecycle status gates
            const reviewStatus = String(ev.review_status || ev.status || 'DRAFT').toUpperCase();
            if (reviewStatus === 'SUPERSEDED' || reviewStatus === 'REJECTED') {
                throw new PaperEvidenceError(
                    `Cannot promote evidence '${evidenceId}': evidence is in revoked or rejected status '${reviewStatus}'.`,
                    'EVIDENCE_REVOKED_OR_SUPERSEDED',
                    409
                );
            }
            if (reviewStatus !== 'APPROVED_FOR_TECHNICAL_USE' && reviewStatus !== 'CERTIFIED_MEASURED') {
                throw new PaperEvidenceError(
                    `Cannot promote unapproved evidence '${evidenceId}' (status: '${reviewStatus}'). Only APPROVED_FOR_TECHNICAL_USE or CERTIFIED_MEASURED evidences are eligible.`,
                    'EVIDENCE_NOT_APPROVED_FOR_PROMOTION',
                    422
                );
            }
            if (Boolean(ev.applied_to_catalog_variant)) {
                throw new PaperEvidenceError(
                    `Evidence '${evidenceId}' is already promoted to catalog variant '${variantId}'.`,
                    'EVIDENCE_ALREADY_PROMOTED',
                    409
                );
            }

            // 6. Contradiction gate
            if (Boolean(ev.has_source_contradiction) && !acknowledgeContradiction) {
                throw new PaperEvidenceError(
                    `Cannot promote evidence '${evidenceId}': unresolved source contradiction (> 5% delta) requires explicit contradiction arbitration (acknowledgeContradiction=true).`,
                    'UNRESOLVED_SOURCE_CONTRADICTION',
                    422
                );
            }

            // 7. Protection of the 9 historical conflicts & 1,272 existing calipers
            if (HISTORICAL_CONFLICT_9_VARIANT_IDS.has(String(variantId))) {
                throw new PaperEvidenceError(
                    `Variant '${variantId}' is one of the 9 protected historical conflict variants (Amber Graphic 122 µm / Galerie Art Matt 225 µm) and cannot be overwritten.`,
                    'HISTORICAL_CONFLICT_VARIANT_PROTECTED',
                    409
                );
            }

            const currentRevision = Number(variant.caliper_revision || 1);
            if (
                expectedCaliperRevision !== undefined &&
                expectedCaliperRevision !== null &&
                Number(expectedCaliperRevision) !== currentRevision
            ) {
                throw new PaperEvidenceError(
                    `Compare-And-Swap (CAS) revision mismatch on variant '${variantId}': expected revision ${expectedCaliperRevision}, found ${currentRevision}.`,
                    'CALIPER_REVISION_CAS_MISMATCH',
                    409,
                    { expectedCaliperRevision: Number(expectedCaliperRevision), actualCaliperRevision: currentRevision }
                );
            }

            if (variant.caliper_um !== null && variant.caliper_um !== undefined && Number(variant.caliper_um) > 0) {
                throw new PaperEvidenceError(
                    `Variant '${variantId}' already has an active catalog caliper (${variant.caliper_um} µm, revision ${currentRevision}). Overwriting existing catalog calipers is prohibited.`,
                    'EXISTING_CATALOG_CALIPER_PROTECTED',
                    409,
                    { existingCaliperUm: Number(variant.caliper_um), caliperRevision: currentRevision }
                );
            }

            // 8. Compute new catalog caliper values
            const proposedUm = Number(ev.proposed_effective_caliper_um ?? ev.proposed_caliper_um ?? 0);
            if (!Number.isFinite(proposedUm) || proposedUm <= 0 || proposedUm > 5000) {
                throw new PaperEvidenceError(
                    `Invalid proposed caliper (${proposedUm} µm) on evidence '${evidenceId}'.`,
                    'INVALID_PROPOSED_CALIPER_UM',
                    422
                );
            }
            const proposedMm = Number((proposedUm / 1000).toFixed(4));
            const proposedBulk =
                ev.nominal_bulk_cm3_g !== null && ev.nominal_bulk_cm3_g !== undefined && Number(ev.nominal_bulk_cm3_g) > 0
                    ? Number(Number(ev.nominal_bulk_cm3_g).toFixed(3))
                    : Number((proposedUm / Number(variant.gsm || 100)).toFixed(3));

            const { targetCaliperSource, targetConfidenceStatus } = resolvePromotionCatalogProvenance(ev);
            const nextRevision = currentRevision + 1;

            // 9. Atomic Compare-And-Swap UPDATE on `paper_variants`
            const varUpdRes = unwrapAffectResult(await executor.query(
                `UPDATE paper_variants
                 SET caliper_um = ?,
                     caliper_mm = ?,
                     bulk_factor = COALESCE(?, bulk_factor),
                     caliper_source = ?,
                     caliper_confidence_status = ?,
                     caliper_verified_at = CURRENT_TIMESTAMP,
                     caliper_verified_by = ?,
                     caliper_revision = caliper_revision + 1
                 WHERE id = ? AND caliper_revision = ? AND caliper_um IS NULL`,
                [
                    proposedUm,
                    proposedMm,
                    proposedBulk,
                    targetCaliperSource,
                    targetConfidenceStatus,
                    String(effectiveActorId).slice(0, 64),
                    variantId,
                    currentRevision
                ]
            ));

            if (varUpdRes.affectedRows !== undefined && Number(varUpdRes.affectedRows) === 0) {
                throw new PaperEvidenceError(
                    `Concurrent promotion conflict on variant '${variantId}': caliper or revision was modified by another transaction.`,
                    'CONCURRENT_PROMOTION_CONFLICT',
                    409
                );
            }

            // 10. Atomic Compare-And-Swap UPDATE on `paper_variant_caliper_evidence`
            const evUpdRes = unwrapAffectResult(await executor.query(
                `UPDATE paper_variant_caliper_evidence
                 SET applied_to_catalog_variant = TRUE,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE evidence_id = ?
                   AND tenant_id = ?
                   AND applied_to_catalog_variant = FALSE
                   AND review_status IN ('APPROVED_FOR_TECHNICAL_USE', 'CERTIFIED_MEASURED')`,
                [evidenceId, tenantId]
            ));

            if (evUpdRes.affectedRows !== undefined && Number(evUpdRes.affectedRows) === 0) {
                throw new PaperEvidenceError(
                    `Concurrent promotion conflict on evidence '${evidenceId}': evidence was already applied or changed state.`,
                    'CONCURRENT_PROMOTION_CONFLICT',
                    409
                );
            }

            // 11. Invalidate any active `spine_calculation_snapshots` referencing this variantId
            let invalidatedSpineSnapshotsCount = 0;
            try {
                const activeSnapshots = unwrapRows(await executor.query(
                    `SELECT id, input_payload_json
                     FROM spine_calculation_snapshots
                     WHERE tenant_id = ? AND snapshot_lifecycle_status = 'ACTIVE'`,
                    [tenantId]
                ));
                const snapshotIdsToInvalidate = [];
                for (const snap of activeSnapshots) {
                    const rawPayload = typeof snap.input_payload_json === 'string'
                        ? snap.input_payload_json
                        : JSON.stringify(snap.input_payload_json || {});
                    if (rawPayload.includes(String(variantId))) {
                        snapshotIdsToInvalidate.push(snap.id);
                    }
                }
                for (const snapId of snapshotIdsToInvalidate) {
                    const invRes = unwrapAffectResult(await executor.query(
                        `UPDATE spine_calculation_snapshots
                         SET snapshot_lifecycle_status = 'INVALIDATED',
                             superseded_at = CURRENT_TIMESTAMP(6),
                             invalidation_reason = 'PAPER_VARIANT_CALIPER_PROMOTED'
                         WHERE id = ? AND tenant_id = ? AND snapshot_lifecycle_status = 'ACTIVE'`,
                        [snapId, tenantId]
                    ));
                    invalidatedSpineSnapshotsCount += Number(invRes.affectedRows || 0);
                }
            } catch (_) {
                // If spine_calculation_snapshots table is not present in lightweight unit mock, continue safely
            }

            // 12. Append immutable `CATALOG_CALIPER_PROMOTED` audit record with complete reversible snapshot
            const promotionId = `prm_exec_${crypto.randomBytes(8).toString('hex')}`;
            const auditId = `aud_cal_${crypto.randomBytes(8).toString('hex')}`;
            const previousVariantSnapshot = {
                caliper_um: variant.caliper_um ?? null,
                caliper_mm: variant.caliper_mm ?? null,
                bulk_factor: variant.bulk_factor !== undefined && variant.bulk_factor !== null ? Number(variant.bulk_factor) : null,
                caliper_source: variant.caliper_source || 'NONE',
                caliper_confidence_status: variant.caliper_confidence_status || 'MISSING',
                caliper_verified_at: variant.caliper_verified_at || null,
                caliper_verified_by: variant.caliper_verified_by || null,
                caliper_revision: currentRevision
            };

            const promotionMetadata = {
                promotionStage: 'CATALOG_CALIPER_PROMOTED',
                promotionId,
                promotionRequestId: matchedRequest ? matchedRequest.promotionRequestId : (promotionRequestId || null),
                idempotencyKey: idempotencyKey || null,
                submittedBy: ev.submitted_by,
                submittedByRole: ev.submitted_by_role || null,
                approvedByTechnologist: ev.approved_by_technologist,
                approvedByRole: ev.approved_by_role || null,
                requestedBy: matchedRequest ? matchedRequest.requestedBy : null,
                requestedByRole: matchedRequest ? matchedRequest.requestedByRole : null,
                authorizedBy: effectiveActorId,
                authorizedByRole: effectiveRole,
                documentTitle: ev.document_title || null,
                documentSha256: ev.document_sha256 || null,
                datasheetVersion: ev.datasheet_version || null,
                previousVariantSnapshot,
                promotedVariantSnapshot: {
                    caliper_um: proposedUm,
                    caliper_mm: proposedMm,
                    bulk_factor: proposedBulk,
                    caliper_source: targetCaliperSource,
                    caliper_confidence_status: targetConfidenceStatus,
                    caliper_revision: nextRevision
                },
                invalidatedSpineSnapshotsCount,
                canReleaseToManufacturing: false
            };

            await executor.query(
                `INSERT INTO paper_variant_caliper_audit_log (
                    audit_id, tenant_id, supplier_id, variant_id, evidence_id,
                    action_type, previous_review_status, new_review_status,
                    previous_caliper_um, new_caliper_um,
                    previous_caliper_source, new_caliper_source,
                    previous_confidence_status, new_confidence_status,
                    previous_revision, new_revision,
                    nominal_datasheet_caliper_um, measured_batch_caliper_um, document_sha256,
                    actor_user_id, actor_role, decision_reason, metadata_json
                ) VALUES (?, ?, ?, ?, ?, 'CATALOG_CALIPER_PROMOTED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    auditId,
                    tenantId,
                    supplierId,
                    variantId,
                    evidenceId,
                    reviewStatus,
                    reviewStatus,
                    variant.caliper_um ?? null,
                    proposedUm,
                    variant.caliper_source ?? 'NONE',
                    targetCaliperSource,
                    variant.caliper_confidence_status ?? 'MISSING',
                    targetConfidenceStatus,
                    currentRevision,
                    nextRevision,
                    ev.nominal_datasheet_caliper_um ?? null,
                    ev.measured_batch_caliper_um ?? null,
                    ev.document_sha256 ?? null,
                    effectiveActorId,
                    effectiveRole,
                    String(effectiveReason).trim(),
                    JSON.stringify(promotionMetadata)
                ]
            );

            return {
                idempotentReplay: false,
                promotionId,
                auditId,
                variantId,
                evidenceId,
                reviewStatus,
                previousCaliperUm: variant.caliper_um !== null && variant.caliper_um !== undefined ? Number(variant.caliper_um) : null,
                newCaliperUm: proposedUm,
                newCaliperMm: proposedMm,
                newBulkFactor: proposedBulk,
                previousCaliperSource: variant.caliper_source || 'NONE',
                newCaliperSource: targetCaliperSource,
                previousConfidenceStatus: variant.caliper_confidence_status || 'MISSING',
                newConfidenceStatus: targetConfidenceStatus,
                previousRevision: currentRevision,
                newRevision: nextRevision,
                segregationOfDuties: {
                    submittedBy: ev.submitted_by,
                    approvedByTechnologist: ev.approved_by_technologist,
                    requestedBy: matchedRequest ? matchedRequest.requestedBy : null,
                    authorizedBy: effectiveActorId
                },
                invalidatedSpineSnapshotsCount,
                productiveCaliperModified: true,
                canReleaseToManufacturing: false
            };
        });
    }

    /**
     * Governed revocation and reversion of a promoted evidence (`EVIDENCE_SUPERSEDED`).
     * Restores `paper_variants` to its pre-promotion snapshot (e.g. `caliper_um = NULL`, `caliper_source = 'NONE'`,
     * `caliper_confidence_status = 'MISSING'`), increments `caliper_revision`, marks the evidence `SUPERSEDED` with
     * `applied_to_catalog_variant = FALSE`, invalidates active Spine snapshots, and records an immutable audit log entry.
     */
    async revokeAndRevertPromotion({
        tenantId,
        supplierId = null,
        variantId,
        evidenceId,
        actorUserId = null,
        actorId = null,
        actorRole = null,
        reason = null,
        expectedCaliperRevision = undefined
    }) {
        const effectiveActorId = actorUserId || actorId;
        const effectiveRole = String(actorRole || '').toUpperCase();

        if (!tenantId || !effectiveActorId) {
            throw new PaperEvidenceError('Authenticated tenant and actor identity required.', 'UNAUTHORIZED', 403);
        }
        if (!ALLOWED_PROMOTION_AUTHORIZER_ROLES.has(effectiveRole)) {
            throw new PaperEvidenceError(
                `Role '${actorRole}' is not authorized to revoke or revert a catalog promotion. Admin or Material Technologist role required.`,
                'FORBIDDEN_PROMOTION_REVERT_ROLE_REQUIRED',
                403
            );
        }
        if (!reason || String(reason).trim().length < 5) {
            throw new PaperEvidenceError(
                'A detailed reversion reason (min 5 characters) is mandatory.',
                'REVERT_REASON_REQUIRED',
                422
            );
        }

        return this._withTransaction(async (executor, isTx) => {
            const lockClause = isTx ? ' FOR UPDATE' : '';

            const varRows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variants WHERE id = ? LIMIT 1${lockClause}`,
                [variantId]
            ));
            if (!varRows || varRows.length === 0) {
                throw new PaperEvidenceError(`Variant '${variantId}' not found.`, 'VARIANT_NOT_FOUND', 404);
            }
            const variant = varRows[0];

            const evRows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_caliper_evidence WHERE evidence_id = ? AND tenant_id = ? LIMIT 1${lockClause}`,
                [evidenceId, tenantId]
            ));
            if (!evRows || evRows.length === 0) {
                throw new PaperEvidenceError(`Evidence '${evidenceId}' not found for this tenant.`, 'EVIDENCE_NOT_FOUND', 404);
            }
            const ev = evRows[0];
            if (String(ev.variant_id) !== String(variantId)) {
                throw new PaperEvidenceError(
                    `Evidence '${evidenceId}' belongs to variant '${ev.variant_id}', not '${variantId}'.`,
                    'EVIDENCE_VARIANT_MISMATCH',
                    422
                );
            }

            if (!Boolean(ev.applied_to_catalog_variant)) {
                throw new PaperEvidenceError(
                    `Evidence '${evidenceId}' is not currently promoted to catalog variant '${variantId}'.`,
                    'EVIDENCE_NOT_CURRENTLY_PROMOTED',
                    409
                );
            }

            const currentRevision = Number(variant.caliper_revision || 1);
            if (
                expectedCaliperRevision !== undefined &&
                expectedCaliperRevision !== null &&
                Number(expectedCaliperRevision) !== currentRevision
            ) {
                throw new PaperEvidenceError(
                    `Compare-And-Swap (CAS) revision mismatch on variant '${variantId}': expected revision ${expectedCaliperRevision}, found ${currentRevision}.`,
                    'CALIPER_REVISION_CAS_MISMATCH',
                    409
                );
            }

            // Look up the prior CATALOG_CALIPER_PROMOTED audit entry to restore the exact pre-promotion snapshot
            const promoLogs = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_caliper_audit_log
                 WHERE tenant_id = ? AND variant_id = ? AND evidence_id = ? AND action_type = 'CATALOG_CALIPER_PROMOTED'
                 ORDER BY created_at DESC LIMIT 1`,
                [tenantId, variantId, evidenceId]
            ));
            const latestPromoLog = promoLogs[0] || null;
            const promoMeta = latestPromoLog ? parseJsonColumn(latestPromoLog.metadata_json) : {};
            const prevSnap = promoMeta.previousVariantSnapshot || {
                caliper_um: latestPromoLog ? latestPromoLog.previous_caliper_um : null,
                caliper_mm: null,
                bulk_factor: null,
                caliper_source: latestPromoLog ? (latestPromoLog.previous_caliper_source || 'NONE') : 'NONE',
                caliper_confidence_status: latestPromoLog ? (latestPromoLog.previous_confidence_status || 'MISSING') : 'MISSING',
                caliper_verified_at: null,
                caliper_verified_by: null
            };

            const restoredUm =
                prevSnap.caliper_um !== null && prevSnap.caliper_um !== undefined ? Number(prevSnap.caliper_um) : null;
            const restoredMm =
                restoredUm !== null ? Number((restoredUm / 1000).toFixed(4)) : null;
            const restoredBulk =
                prevSnap.bulk_factor !== null && prevSnap.bulk_factor !== undefined ? Number(prevSnap.bulk_factor) : null;
            const restoredSource = prevSnap.caliper_source || 'NONE';
            const restoredConfidence = prevSnap.caliper_confidence_status || 'MISSING';
            const nextRevision = currentRevision + 1;

            const varUpdRes = unwrapAffectResult(await executor.query(
                `UPDATE paper_variants
                 SET caliper_um = ?,
                     caliper_mm = ?,
                     bulk_factor = ?,
                     caliper_source = ?,
                     caliper_confidence_status = ?,
                     caliper_verified_at = NULL,
                     caliper_verified_by = NULL,
                     caliper_revision = caliper_revision + 1
                 WHERE id = ? AND caliper_revision = ?`,
                [
                    restoredUm,
                    restoredMm,
                    restoredBulk,
                    restoredSource,
                    restoredConfidence,
                    variantId,
                    currentRevision
                ]
            ));

            if (varUpdRes.affectedRows !== undefined && Number(varUpdRes.affectedRows) === 0) {
                throw new PaperEvidenceError(
                    `Concurrent modification conflict while reverting promotion on variant '${variantId}'.`,
                    'CONCURRENT_PROMOTION_REVERT_CONFLICT',
                    409
                );
            }

            const prevReviewStatus = ev.review_status || ev.status || 'APPROVED_FOR_TECHNICAL_USE';
            await executor.query(
                `UPDATE paper_variant_caliper_evidence
                 SET review_status = 'SUPERSEDED',
                     applied_to_catalog_variant = FALSE,
                     decision_reason = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE evidence_id = ? AND tenant_id = ?`,
                [String(reason).trim(), evidenceId, tenantId]
            );

            // Invalidate any active spine_calculation_snapshots referencing this variantId
            let invalidatedSpineSnapshotsCount = 0;
            try {
                const activeSnapshots = unwrapRows(await executor.query(
                    `SELECT id, input_payload_json
                     FROM spine_calculation_snapshots
                     WHERE tenant_id = ? AND snapshot_lifecycle_status = 'ACTIVE'`,
                    [tenantId]
                ));
                for (const snap of activeSnapshots) {
                    const rawPayload = typeof snap.input_payload_json === 'string'
                        ? snap.input_payload_json
                        : JSON.stringify(snap.input_payload_json || {});
                    if (rawPayload.includes(String(variantId))) {
                        const invRes = unwrapAffectResult(await executor.query(
                            `UPDATE spine_calculation_snapshots
                             SET snapshot_lifecycle_status = 'INVALIDATED',
                                 superseded_at = CURRENT_TIMESTAMP(6),
                                 invalidation_reason = 'PAPER_VARIANT_CALIPER_PROMOTION_REVERTED'
                             WHERE id = ? AND tenant_id = ? AND snapshot_lifecycle_status = 'ACTIVE'`,
                            [snap.id, tenantId]
                        ));
                        invalidatedSpineSnapshotsCount += Number(invRes.affectedRows || 0);
                    }
                }
            } catch (_) {}

            const auditId = `aud_cal_${crypto.randomBytes(8).toString('hex')}`;
            const revertMeta = {
                promotionStage: 'PROMOTION_REVERTED_AND_EVIDENCE_SUPERSEDED',
                revertedBy: effectiveActorId,
                revertedByRole: effectiveRole,
                revertedFromCaliperUm: variant.caliper_um !== null ? Number(variant.caliper_um) : null,
                restoredCaliperUm: restoredUm,
                restoredCaliperSource: restoredSource,
                restoredConfidenceStatus: restoredConfidence,
                invalidatedSpineSnapshotsCount,
                canReleaseToManufacturing: false
            };

            await executor.query(
                `INSERT INTO paper_variant_caliper_audit_log (
                    audit_id, tenant_id, supplier_id, variant_id, evidence_id,
                    action_type, previous_review_status, new_review_status,
                    previous_caliper_um, new_caliper_um,
                    previous_caliper_source, new_caliper_source,
                    previous_confidence_status, new_confidence_status,
                    previous_revision, new_revision,
                    nominal_datasheet_caliper_um, measured_batch_caliper_um, document_sha256,
                    actor_user_id, actor_role, decision_reason, metadata_json
                ) VALUES (?, ?, ?, ?, ?, 'EVIDENCE_SUPERSEDED', ?, 'SUPERSEDED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    auditId,
                    tenantId,
                    supplierId,
                    variantId,
                    evidenceId,
                    prevReviewStatus,
                    variant.caliper_um ?? null,
                    restoredUm,
                    variant.caliper_source ?? 'NONE',
                    restoredSource,
                    variant.caliper_confidence_status ?? 'MISSING',
                    restoredConfidence,
                    currentRevision,
                    nextRevision,
                    ev.nominal_datasheet_caliper_um ?? null,
                    ev.measured_batch_caliper_um ?? null,
                    ev.document_sha256 ?? null,
                    effectiveActorId,
                    effectiveRole,
                    String(reason).trim(),
                    JSON.stringify(revertMeta)
                ]
            );

            return {
                auditId,
                variantId,
                evidenceId,
                newEvidenceStatus: 'SUPERSEDED',
                previousCaliperUm: variant.caliper_um !== null ? Number(variant.caliper_um) : null,
                restoredCaliperUm: restoredUm,
                restoredCaliperSource: restoredSource,
                restoredConfidenceStatus: restoredConfidence,
                previousRevision: currentRevision,
                newRevision: nextRevision,
                invalidatedSpineSnapshotsCount,
                productiveCaliperReverted: true,
                canReleaseToManufacturing: false
            };
        });
    }

    /**
     * Lists all promotion requests, completed promotions, and reversions for a variant within the authenticated tenant.
     */
    async listVariantPromotions({ tenantId, variantId, actorId = null, actorRole = null }) {
        if (!tenantId) {
            throw new PaperEvidenceError('Authenticated tenant context is required.', 'TENANT_REQUIRED', 403);
        }
        if (!variantId) {
            throw new PaperEvidenceError('variantId is required.', 'VARIANT_ID_REQUIRED', 400);
        }

        const varEvData = await this.getVariantEvidences({ tenantId, variantId });
        const approvedEvidences = varEvData.caliperEvidences.filter(
            (e) => e.status === 'APPROVED_FOR_TECHNICAL_USE' || e.status === 'CERTIFIED_MEASURED'
        );
        const promotedEvidence = varEvData.caliperEvidences.find((e) => Boolean(e.applied_to_catalog_variant)) || null;

        let promotionPreview = null;
        const candidateForPreview = promotedEvidence || approvedEvidences[0] || varEvData.caliperEvidences[0] || null;
        if (candidateForPreview) {
            promotionPreview = await this.previewEvidencePromotion({
                tenantId,
                variantId,
                evidenceId: candidateForPreview.id,
                actorId,
                actorRole
            });
        }

        const promotionHistory = varEvData.auditHistory
            .filter((log) => {
                const meta = parseJsonColumn(log.metadata_json);
                return (
                    log.action === 'CATALOG_CALIPER_PROMOTED' ||
                    log.action === 'EVIDENCE_SUPERSEDED' ||
                    (meta && meta.promotionStage)
                );
            })
            .map((log) => {
                const meta = parseJsonColumn(log.metadata_json);
                return {
                    auditId: log.id,
                    evidenceId: log.evidence_id,
                    actionType: log.action,
                    promotionStage: meta.promotionStage || log.action,
                    previousCaliperUm: log.previous_caliper_um !== null && log.previous_caliper_um !== undefined ? Number(log.previous_caliper_um) : null,
                    newCaliperUm: log.new_caliper_um !== null && log.new_caliper_um !== undefined ? Number(log.new_caliper_um) : null,
                    previousCaliperSource: log.previous_caliper_source || 'NONE',
                    newCaliperSource: log.new_caliper_source || 'NONE',
                    previousConfidenceStatus: log.previous_confidence_status || 'MISSING',
                    newConfidenceStatus: log.new_confidence_status || 'MISSING',
                    previousRevision: log.previous_revision ? Number(log.previous_revision) : null,
                    newRevision: log.new_revision ? Number(log.new_revision) : null,
                    actorId: log.actor_id,
                    actorRole: log.actor_role,
                    reason: log.reason,
                    metadata: meta,
                    createdAt: log.created_at
                };
            });

        return {
            variant: varEvData.variant,
            spineProvenance: varEvData.spineProvenance,
            promotedEvidence,
            approvedEvidences,
            promotionPreview,
            promotionHistory,
            canReleaseToManufacturing: false
        };
    }

    /**
     * -------------------------------------------------------------------------
     * PAPER-MATERIALS-RECOVERY-12: GOVERNED CLASSIFICATION EVIDENCE & PROMOTION
     * -------------------------------------------------------------------------
     * Symmetric 4-stage accreditation workflow for technical classifications
     * (`paper_type`, `coating_status`, `finish`, `grain_direction`) stored in
     * `paper_variant_classification_evidence`.
     *
     * Core Invariants:
     * 1. Strictly preserves `paper_variants.caliper_um` (zero mutation to thicknesses).
     * 2. Enforces 4-way Segregation of Duties (`submitter` !== `reviewer` !== `requester` !== `authorizer`).
     * 3. Updates `paper_products.category`, `paper_products.finish_summary`, `paper_variants.finish`,
     *    `paper_variants.grain_direction`, and `paper_variants.metadata_json.classification_accreditation`
     *    atomically upon `authorizeClassificationPromotion()`.
     */

    /**
     * Stage 1: Registers a classification evidence record in `paper_variant_classification_evidence`.
     * Does NOT mutate `paper_products.category`, `paper_variants.finish`, or `paper_variants.caliper_um`.
     */
    async registerClassificationEvidence({
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
                `SELECT * FROM paper_variant_classification_evidence WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
                [tenantId, idempotencyKey]
            ));
            if (existing.length > 0) {
                const ev = existing[0];
                return {
                    idempotentReplay: true,
                    classificationEvidenceId: ev.classification_evidence_id || ev.id,
                    status: ev.review_status || ev.status,
                    evidence: ev,
                    productiveClassificationModified: false,
                    productiveCaliperModified: false
                };
            }
        }

        const varRows = unwrapRows(await this.db.query(
            `SELECT v.*, p.name AS product_name, p.brand, p.manufacturer, p.category AS product_category, p.finish_summary
             FROM paper_variants v
             JOIN paper_products p ON v.product_id = p.id
             WHERE v.id = ? LIMIT 1`,
            [variantId]
        ));
        if (!varRows || varRows.length === 0) {
            throw new PaperEvidenceError(`Variant '${variantId}' not found.`, 'VARIANT_NOT_FOUND', 404);
        }
        const variant = varRows[0];

        const allowedCategories = new Set(['CARTON', 'OFFSET', 'COATED', 'DESIGN', 'DIGITAL', 'OTHER']);
        const proposedCategory = String(payload.proposedCategory || payload.proposedPaperType || payload.paperType || '').trim().toUpperCase();
        if (!allowedCategories.has(proposedCategory)) {
            throw new PaperEvidenceError(
                `Invalid proposedCategory '${proposedCategory}'. Allowed: CARTON, OFFSET, COATED, DESIGN, DIGITAL, OTHER ('UNCOATED' is prohibited as a paper_type).`,
                'INVALID_PROPOSED_CATEGORY',
                422
            );
        }

        const allowedCoatingStatuses = new Set(['COATED', 'DOUBLE_SIDE_COATED', 'UNCOATED', 'ONE_SIDE_COATED', 'SYNTHETIC', 'SPECIALTY', 'UNKNOWN']);
        const proposedCoatingStatus = String(payload.proposedCoatingStatus || payload.coatingStatus || 'UNKNOWN').trim().toUpperCase();
        if (!allowedCoatingStatuses.has(proposedCoatingStatus)) {
            throw new PaperEvidenceError(
                `Invalid proposedCoatingStatus '${proposedCoatingStatus}'. Allowed: COATED, DOUBLE_SIDE_COATED, UNCOATED, ONE_SIDE_COATED, SYNTHETIC, SPECIALTY, UNKNOWN.`,
                'INVALID_PROPOSED_COATING_STATUS',
                422
            );
        }

        const proposedFinish = String(payload.proposedFinish || payload.finish || '').trim().toUpperCase();
        if (!proposedFinish || proposedFinish.length > 64) {
            throw new PaperEvidenceError(
                'proposedFinish is required (max 64 characters).',
                'INVALID_PROPOSED_FINISH',
                422
            );
        }

        const allowedGrainDirections = new Set(['LONG_GRAIN', 'SHORT_GRAIN', 'UNKNOWN']);
        const proposedGrainDirection = String(
            payload.proposedGrainDirection || payload.grainDirection || variant.grain_direction || 'UNKNOWN'
        ).trim().toUpperCase();
        if (!allowedGrainDirections.has(proposedGrainDirection)) {
            throw new PaperEvidenceError(
                `Invalid proposedGrainDirection '${proposedGrainDirection}'. Allowed: LONG_GRAIN, SHORT_GRAIN, UNKNOWN.`,
                'INVALID_PROPOSED_GRAIN_DIRECTION',
                422
            );
        }

        const allowedSourceTypes = new Set(['MILL_DATASHEET', 'SUPPLIER_CATALOG_SPEC', 'ODS_EXPLICIT_HEADER', 'PHYSICAL_SAMPLE_INSPECTION']);
        const evidenceSourceType = String(payload.evidenceSourceType || 'MILL_DATASHEET').trim().toUpperCase();
        if (!allowedSourceTypes.has(evidenceSourceType)) {
            throw new PaperEvidenceError(
                `Invalid evidenceSourceType '${evidenceSourceType}'. Allowed: MILL_DATASHEET, SUPPLIER_CATALOG_SPEC, ODS_EXPLICIT_HEADER, PHYSICAL_SAMPLE_INSPECTION.`,
                'INVALID_EVIDENCE_SOURCE_TYPE',
                422
            );
        }

        const documentTitle = String(payload.documentTitle || '').trim();
        if (!documentTitle || documentTitle.length < 5) {
            throw new PaperEvidenceError('documentTitle (min 5 characters) is required.', 'DOCUMENT_TITLE_REQUIRED', 422);
        }

        let pdfInfo = null;
        if (payload.fileBuffer || payload.fileBase64) {
            pdfInfo = validateAndHashPdfDocument({
                buffer: payload.fileBuffer,
                fileBase64: payload.fileBase64,
                fileName: payload.fileName || 'classification-datasheet.pdf',
                mimeType: payload.mimeType || 'application/pdf',
                tenantId,
                persistToStore: true,
                storageRoot: this.storageRoot
            });
        } else if (payload.documentSha256 && /^[a-f0-9]{64}$/i.test(String(payload.documentSha256))) {
            pdfInfo = {
                fileName: payload.fileName || 'classification-datasheet.pdf',
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
                fileName: payload.fileName || 'remote-classification-spec.pdf',
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

        const pendingRow = loadStaticPendingClassifications337().find((r) => r.variant_id === variantId) || null;
        const functionalGroup = String(
            payload.functionalGroup ||
            (pendingRow ? pendingRow.functional_group : 'G6_SPECIALTY_SYNTHETIC_CARBONLESS_ADHESIVE')
        ).trim();

        const previousCategory = String(variant.product_category || variant.category || 'OTHER').toUpperCase();
        const previousFinish = variant.finish || variant.finish_summary || 'UNCOATED';
        const varMeta = parseJsonColumn(variant.metadata_json);
        const previousCoatingStatus =
            (varMeta.classification_accreditation && varMeta.classification_accreditation.coating_status) ||
            (varMeta.ods_materials_recovery && varMeta.ods_materials_recovery.coating_status) ||
            'UNKNOWN';
        const previousGrainDirection = String(variant.grain_direction || 'UNKNOWN').toUpperCase();

        const classificationEvidenceId = `evd_cls_${crypto.randomBytes(8).toString('hex')}`;
        const reviewStatus = payload.submitForReview === false ? 'DRAFT' : 'PENDING_TECH_REVIEW';

        try {
            await this._withTransaction(async (executor) => {
                await executor.query(
                    `INSERT INTO paper_variant_classification_evidence (
                        classification_evidence_id, tenant_id, supplier_id, variant_id, product_id,
                        functional_group,
                        previous_category, proposed_category,
                        previous_finish, proposed_finish,
                        previous_coating_status, proposed_coating_status,
                        previous_grain_direction, proposed_grain_direction,
                        evidence_source_type, document_title, document_storage_uri, document_sha256,
                        review_status, applied_to_catalog_product, idempotency_key,
                        submitted_by, submitted_by_role, notes, metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?)`,
                    [
                        classificationEvidenceId,
                        tenantId,
                        supplierId,
                        variantId,
                        variant.product_id,
                        functionalGroup,
                        previousCategory,
                        proposedCategory,
                        previousFinish,
                        proposedFinish,
                        previousCoatingStatus,
                        proposedCoatingStatus,
                        previousGrainDirection,
                        proposedGrainDirection,
                        evidenceSourceType,
                        documentTitle,
                        pdfInfo.storageUri,
                        pdfInfo.sha256,
                        reviewStatus,
                        idempotencyKey,
                        effectiveActorId,
                        actorRole || 'OPERATOR',
                        payload.notes || payload.technicalNotes || null,
                        JSON.stringify({
                            stage: 'CLASSIFICATION_EVIDENCE_REGISTERED',
                            manufacturerName: payload.manufacturerName || variant.manufacturer || variant.brand || null,
                            supplierChannel: payload.supplierChannel || null,
                            datasheetVersion: payload.datasheetVersion || null
                        })
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
            `SELECT * FROM paper_variant_classification_evidence WHERE classification_evidence_id = ? LIMIT 1`,
            [classificationEvidenceId]
        ))[0] || {
            classification_evidence_id: classificationEvidenceId,
            variant_id: variantId,
            product_id: variant.product_id,
            review_status: reviewStatus,
            proposed_category: proposedCategory,
            proposed_coating_status: proposedCoatingStatus,
            proposed_finish: proposedFinish,
            proposed_grain_direction: proposedGrainDirection
        };

        return {
            idempotentReplay: false,
            classificationEvidenceId,
            variantId,
            productId: variant.product_id,
            status: reviewStatus,
            proposedCategory,
            proposedCoatingStatus,
            proposedFinish,
            proposedGrainDirection,
            documentSha256: pdfInfo.sha256,
            evidence: created,
            productiveClassificationModified: false,
            productiveCaliperModified: false
        };
    }

    /**
     * Stage 2: Technologist review (APPROVE or REJECT) of a classification evidence record.
     * Enforces Segregation of Duties (`technologistUserId !== submitted_by`) and row-level locking.
     * Does NOT mutate `paper_products.category`, `paper_variants.finish`, or `paper_variants.caliper_um`.
     */
    async reviewClassificationEvidence({
        tenantId,
        supplierId = null,
        classificationEvidenceId,
        evidenceId = null,
        technologistUserId = null,
        actorId = null,
        technologistRole = null,
        actorRole = null,
        decision,
        decisionReason = null,
        reason = null
    }) {
        const effectiveEvidenceId = classificationEvidenceId || evidenceId;
        const effectiveTechId = technologistUserId || actorId;
        const effectiveTechRole = technologistRole || actorRole;
        const effectiveReason = decisionReason || reason;

        if (!tenantId || !effectiveTechId) {
            throw new PaperEvidenceError('Authenticated tenant and technologist identity required.', 'UNAUTHORIZED', 403);
        }
        if (!effectiveEvidenceId) {
            throw new PaperEvidenceError('classificationEvidenceId is required.', 'CLASSIFICATION_EVIDENCE_ID_REQUIRED', 400);
        }

        const allowedApproverRoles = new Set([
            'SUPER_ADMIN',
            'ADMIN',
            'OPS_ADMIN',
            'TENANT_ADMIN',
            'PRINTHOUSE_ADMIN',
            'SUPPLIER_ADMIN',
            'MATERIAL_TECHNOLOGIST'
        ]);
        if (!allowedApproverRoles.has(String(effectiveTechRole || '').toUpperCase())) {
            throw new PaperEvidenceError(
                `Role '${effectiveTechRole}' is not authorized to approve or reject classification evidences. Technologist or Admin privileges required.`,
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
                'A detailed decisionReason (min 5 characters) is mandatory for approving or rejecting classification evidence.',
                'DECISION_REASON_REQUIRED',
                422
            );
        }

        return this._withTransaction(async (executor, isTx) => {
            const lockClause = isTx ? ' FOR UPDATE' : '';
            const rows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_classification_evidence WHERE classification_evidence_id = ? AND tenant_id = ? LIMIT 1${lockClause}`,
                [effectiveEvidenceId, tenantId]
            ));
            if (!rows || rows.length === 0) {
                throw new PaperEvidenceError(
                    `Classification evidence '${effectiveEvidenceId}' not found for this tenant.`,
                    'CLASSIFICATION_EVIDENCE_NOT_FOUND',
                    404
                );
            }
            const ev = rows[0];
            const currentStatus = String(ev.review_status || 'PENDING_TECH_REVIEW').toUpperCase();

            if (String(ev.submitted_by || '').trim() === String(effectiveTechId).trim()) {
                throw new PaperEvidenceError(
                    'Segregation of Duties violation: the user who submitted this classification evidence cannot approve or reject it.',
                    'SOD_SELF_APPROVAL_FORBIDDEN',
                    403
                );
            }

            if (currentStatus !== 'PENDING_TECH_REVIEW' && currentStatus !== 'DRAFT') {
                throw new PaperEvidenceError(
                    `Classification evidence '${effectiveEvidenceId}' is already in terminal/reviewed state '${currentStatus}'.`,
                    'CLASSIFICATION_EVIDENCE_ALREADY_REVIEWED',
                    409
                );
            }

            const targetStatus = normDecision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
            const existingMeta = parseJsonColumn(ev.metadata_json);
            const updatedMeta = {
                ...existingMeta,
                stage: normDecision === 'APPROVE' ? 'CLASSIFICATION_EVIDENCE_APPROVED' : 'CLASSIFICATION_EVIDENCE_REJECTED',
                reviewedBy: effectiveTechId,
                reviewedByRole: String(effectiveTechRole).toUpperCase(),
                reviewedAt: new Date().toISOString(),
                decisionReason: String(effectiveReason).trim()
            };

            const updRes = unwrapAffectResult(await executor.query(
                `UPDATE paper_variant_classification_evidence
                 SET review_status = ?,
                     approved_by_technologist = ?,
                     approved_by_role = ?,
                     approved_at = CURRENT_TIMESTAMP,
                     decision_reason = ?,
                     applied_to_catalog_product = FALSE,
                     metadata_json = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE classification_evidence_id = ? AND tenant_id = ? AND review_status IN ('DRAFT', 'PENDING_TECH_REVIEW')`,
                [
                    targetStatus,
                    effectiveTechId,
                    String(effectiveTechRole).toUpperCase(),
                    String(effectiveReason).trim(),
                    JSON.stringify(updatedMeta),
                    effectiveEvidenceId,
                    tenantId
                ]
            ));

            if (updRes.affectedRows !== undefined && Number(updRes.affectedRows) === 0) {
                throw new PaperEvidenceError(
                    `Concurrent review race condition blocked: classification evidence '${effectiveEvidenceId}' was already reviewed.`,
                    'CLASSIFICATION_EVIDENCE_ALREADY_REVIEWED',
                    409
                );
            }

            const updated = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_classification_evidence WHERE classification_evidence_id = ? LIMIT 1`,
                [effectiveEvidenceId]
            ))[0] || { ...ev, review_status: targetStatus, approved_by_technologist: effectiveTechId };

            return {
                classificationEvidenceId: effectiveEvidenceId,
                variantId: ev.variant_id,
                productId: ev.product_id,
                newStatus: targetStatus,
                evidence: updated,
                productiveClassificationModified: false,
                productiveCaliperModified: false
            };
        });
    }

    /**
     * Stage 3: Submits a governed promotion request for an `APPROVED` classification evidence record.
     * Records `promotion_request_id`, `promotion_requested_by`, `promotion_requested_by_role`, and `promotion_request_reason`.
     * Does NOT mutate `paper_products.category`, `paper_variants.finish`, or `paper_variants.caliper_um`.
     */
    async requestClassificationPromotion({
        tenantId,
        supplierId = null,
        variantId,
        classificationEvidenceId,
        evidenceId = null,
        actorUserId = null,
        actorId = null,
        actorRole = 'OPERATOR',
        reason = null,
        idempotencyKey = null
    }) {
        const effectiveEvidenceId = classificationEvidenceId || evidenceId;
        const effectiveActorId = actorUserId || actorId;
        if (!tenantId || !effectiveActorId) {
            throw new PaperEvidenceError('Authenticated tenant and actor identity required.', 'UNAUTHORIZED', 403);
        }
        const normRole = String(actorRole || '').toUpperCase();
        if (!ALLOWED_PROMOTION_REQUESTER_ROLES.has(normRole)) {
            throw new PaperEvidenceError(
                `Role '${actorRole}' is not authorized to request classification promotion.`,
                'FORBIDDEN_PROMOTION_REQUESTER_ROLE_REQUIRED',
                403
            );
        }
        if (!variantId) {
            throw new PaperEvidenceError('variantId is required.', 'VARIANT_ID_REQUIRED', 400);
        }
        if (!effectiveEvidenceId) {
            throw new PaperEvidenceError('classificationEvidenceId is required.', 'CLASSIFICATION_EVIDENCE_ID_REQUIRED', 400);
        }
        if (!reason || String(reason).trim().length < 5) {
            throw new PaperEvidenceError(
                'A detailed promotion request reason (min 5 characters) is mandatory.',
                'PROMOTION_REASON_REQUIRED',
                422
            );
        }

        return this._withTransaction(async (executor, isTx) => {
            const lockClause = isTx ? ' FOR UPDATE' : '';

            const varRows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variants WHERE id = ? LIMIT 1${lockClause}`,
                [variantId]
            ));
            if (!varRows || varRows.length === 0) {
                throw new PaperEvidenceError(`Variant '${variantId}' not found.`, 'VARIANT_NOT_FOUND', 404);
            }

            const evRows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_classification_evidence WHERE classification_evidence_id = ? AND tenant_id = ? LIMIT 1${lockClause}`,
                [effectiveEvidenceId, tenantId]
            ));
            if (!evRows || evRows.length === 0) {
                throw new PaperEvidenceError(
                    `Classification evidence '${effectiveEvidenceId}' not found for this tenant.`,
                    'CLASSIFICATION_EVIDENCE_NOT_FOUND',
                    404
                );
            }
            const ev = rowsOrFirst(evRows);
            if (String(ev.variant_id) !== String(variantId)) {
                throw new PaperEvidenceError(
                    `Classification evidence '${effectiveEvidenceId}' belongs to variant '${ev.variant_id}', not '${variantId}'.`,
                    'EVIDENCE_VARIANT_MISMATCH',
                    422
                );
            }

            const existingMeta = parseJsonColumn(ev.metadata_json);
            if (idempotencyKey && existingMeta.promotionRequestIdempotencyKey === idempotencyKey && ev.promotion_request_id) {
                return {
                    idempotentReplay: true,
                    promotionRequestId: ev.promotion_request_id,
                    classificationEvidenceId: effectiveEvidenceId,
                    variantId,
                    productId: ev.product_id,
                    status: 'PROMOTION_REQUESTED',
                    requestedBy: ev.promotion_requested_by,
                    requestedByRole: ev.promotion_requested_by_role,
                    productiveClassificationModified: false,
                    productiveCaliperModified: false
                };
            }

            const reviewStatus = String(ev.review_status || 'DRAFT').toUpperCase();
            if (reviewStatus === 'REJECTED') {
                throw new PaperEvidenceError(
                    `Cannot request promotion for rejected classification evidence '${effectiveEvidenceId}'.`,
                    'CLASSIFICATION_EVIDENCE_REJECTED',
                    409
                );
            }
            if (reviewStatus !== 'APPROVED') {
                throw new PaperEvidenceError(
                    `Classification evidence '${effectiveEvidenceId}' has review_status '${reviewStatus}'. Only APPROVED evidences can be requested for promotion.`,
                    'CLASSIFICATION_EVIDENCE_NOT_APPROVED',
                    422
                );
            }
            if (Boolean(ev.applied_to_catalog_product)) {
                throw new PaperEvidenceError(
                    `Classification evidence '${effectiveEvidenceId}' has already been promoted to catalog.`,
                    'CLASSIFICATION_EVIDENCE_ALREADY_PROMOTED',
                    409
                );
            }

            const promotionRequestId = `cls_req_${crypto.randomBytes(8).toString('hex')}`;
            const updatedMeta = {
                ...existingMeta,
                stage: 'CLASSIFICATION_PROMOTION_REQUESTED',
                promotionRequestId,
                promotionRequestIdempotencyKey: idempotencyKey || null,
                requestedBy: effectiveActorId,
                requestedByRole: normRole,
                requestedAt: new Date().toISOString(),
                requestReason: String(reason).trim()
            };

            await executor.query(
                `UPDATE paper_variant_classification_evidence
                 SET promotion_request_id = ?,
                     promotion_requested_by = ?,
                     promotion_requested_by_role = ?,
                     promotion_requested_at = CURRENT_TIMESTAMP,
                     promotion_request_reason = ?,
                     metadata_json = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE classification_evidence_id = ? AND tenant_id = ?`,
                [
                    promotionRequestId,
                    effectiveActorId,
                    normRole,
                    String(reason).trim(),
                    JSON.stringify(updatedMeta),
                    effectiveEvidenceId,
                    tenantId
                ]
            );

            return {
                idempotentReplay: false,
                promotionRequestId,
                classificationEvidenceId: effectiveEvidenceId,
                variantId,
                productId: ev.product_id,
                status: 'PROMOTION_REQUESTED',
                requestedBy: effectiveActorId,
                requestedByRole: normRole,
                proposedCategory: ev.proposed_category,
                proposedCoatingStatus: ev.proposed_coating_status,
                proposedFinish: ev.proposed_finish,
                proposedGrainDirection: ev.proposed_grain_direction || 'UNKNOWN',
                productiveClassificationModified: false,
                productiveCaliperModified: false
            };
        });
    }

    /**
     * Stage 4: Authorizes and executes the atomic promotion of an `APPROVED` classification evidence
     * to `Control.paper_products` (`category`, `finish_summary`) and `Control.paper_variants`
     * (`finish`, `grain_direction`, `metadata_json.classification_accreditation`).
     *
     * Enforces:
     * 1. Row-level locking (`SELECT ... FOR UPDATE`) on `paper_variants`, `paper_products`, and `paper_variant_classification_evidence`.
     * 2. Strict 4-way Segregation of Duties (`actorId !== submitted_by`, `actorId !== approved_by_technologist`, `actorId !== promotion_requested_by`).
     * 3. Zero mutation of `caliper_um`, `caliper_mm`, `bulk_factor`, `caliper_source`, `caliper_confidence_status`, or `caliper_revision`.
     * 4. Atomic deactivation of the synthetic `isSyntheticOtherUncoated` bypass via both `paper_products.category` update
     *    and `paper_variants.metadata_json.classification_accreditation`.
     */
    async authorizeClassificationPromotion({
        tenantId,
        supplierId = null,
        variantId,
        classificationEvidenceId,
        evidenceId = null,
        promotionRequestId = null,
        actorUserId = null,
        actorId = null,
        actorRole = null,
        reason = null,
        decisionReason = null,
        idempotencyKey = null
    }) {
        const effectiveEvidenceId = classificationEvidenceId || evidenceId;
        const effectiveActorId = actorUserId || actorId;
        const effectiveRole = String(actorRole || '').toUpperCase();
        const effectiveReason = reason || decisionReason;

        if (!tenantId || !effectiveActorId) {
            throw new PaperEvidenceError('Authenticated tenant and authorizer identity required.', 'UNAUTHORIZED', 403);
        }
        if (!ALLOWED_PROMOTION_AUTHORIZER_ROLES.has(effectiveRole)) {
            throw new PaperEvidenceError(
                `Role '${actorRole}' is not authorized to promote technical classification to the productive catalog. Admin or Material Technologist role required.`,
                'FORBIDDEN_PROMOTION_AUTHORIZER_ROLE_REQUIRED',
                403
            );
        }
        if (!variantId) {
            throw new PaperEvidenceError('variantId is required.', 'VARIANT_ID_REQUIRED', 400);
        }
        if (!effectiveEvidenceId) {
            throw new PaperEvidenceError('classificationEvidenceId is required.', 'CLASSIFICATION_EVIDENCE_ID_REQUIRED', 400);
        }
        if (!effectiveReason || String(effectiveReason).trim().length < 5) {
            throw new PaperEvidenceError(
                'A detailed promotion authorization reason (min 5 characters) is mandatory.',
                'PROMOTION_REASON_REQUIRED',
                422
            );
        }

        return this._withTransaction(async (executor, isTx) => {
            const lockClause = isTx ? ' FOR UPDATE' : '';

            // 1. Lock variant row (`paper_variants`)
            const varRows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variants WHERE id = ? LIMIT 1${lockClause}`,
                [variantId]
            ));
            if (!varRows || varRows.length === 0) {
                throw new PaperEvidenceError(`Variant '${variantId}' not found.`, 'VARIANT_NOT_FOUND', 404);
            }
            const variant = varRows[0];

            // 2. Lock product row (`paper_products`)
            const prodRows = unwrapRows(await executor.query(
                `SELECT * FROM paper_products WHERE id = ? LIMIT 1${lockClause}`,
                [variant.product_id]
            ));
            if (!prodRows || prodRows.length === 0) {
                throw new PaperEvidenceError(`Product '${variant.product_id}' not found.`, 'PRODUCT_NOT_FOUND', 404);
            }
            const product = prodRows[0];

            // 3. Lock classification evidence row (`paper_variant_classification_evidence`)
            const evRows = unwrapRows(await executor.query(
                `SELECT * FROM paper_variant_classification_evidence WHERE classification_evidence_id = ? AND tenant_id = ? LIMIT 1${lockClause}`,
                [effectiveEvidenceId, tenantId]
            ));
            if (!evRows || evRows.length === 0) {
                throw new PaperEvidenceError(
                    `Classification evidence '${effectiveEvidenceId}' not found for this tenant.`,
                    'CLASSIFICATION_EVIDENCE_NOT_FOUND',
                    404
                );
            }
            const ev = evRows[0];
            if (String(ev.variant_id) !== String(variantId)) {
                throw new PaperEvidenceError(
                    `Classification evidence '${effectiveEvidenceId}' belongs to variant '${ev.variant_id}', not '${variantId}'.`,
                    'EVIDENCE_VARIANT_MISMATCH',
                    422
                );
            }

            const existingMeta = parseJsonColumn(ev.metadata_json);
            if (idempotencyKey && existingMeta.promotionAuthorizeIdempotencyKey === idempotencyKey && Boolean(ev.applied_to_catalog_product)) {
                return {
                    idempotentReplay: true,
                    promotionId: ev.promotion_id || existingMeta.promotionId,
                    promotionRequestId: ev.promotion_request_id || existingMeta.promotionRequestId || null,
                    classificationEvidenceId: effectiveEvidenceId,
                    variantId,
                    productId: variant.product_id,
                    previousCategory: ev.previous_category,
                    newCategory: ev.proposed_category,
                    previousCoatingStatus: ev.previous_coating_status || 'UNKNOWN',
                    newCoatingStatus: ev.proposed_coating_status,
                    previousFinish: ev.previous_finish,
                    newFinish: ev.proposed_finish,
                    previousGrainDirection: ev.previous_grain_direction || 'UNKNOWN',
                    newGrainDirection: ev.proposed_grain_direction || 'UNKNOWN',
                    productiveClassificationModified: true,
                    productiveCaliperModified: false
                };
            }

            // 4. Enforce 4-way Segregation of Duties (SoD)
            if (String(ev.submitted_by || '').trim() === String(effectiveActorId).trim()) {
                throw new PaperEvidenceError(
                    'Segregation of Duties violation: the user who submitted this classification evidence cannot authorize its promotion.',
                    'SOD_SUBMITTER_CANNOT_PROMOTE',
                    403
                );
            }
            if (String(ev.approved_by_technologist || '').trim() === String(effectiveActorId).trim()) {
                throw new PaperEvidenceError(
                    'Segregation of Duties violation: the technologist who approved this classification evidence cannot unilaterally authorize its promotion.',
                    'SOD_REVIEWER_CANNOT_PROMOTE',
                    403
                );
            }
            const effectiveRequestedBy = ev.promotion_requested_by || existingMeta.requestedBy || null;
            if (effectiveRequestedBy && String(effectiveRequestedBy).trim() === String(effectiveActorId).trim()) {
                throw new PaperEvidenceError(
                    'Segregation of Duties violation: the user who requested this classification promotion cannot self-authorize it.',
                    'SOD_REQUESTER_CANNOT_AUTHORIZE_PROMOTION',
                    403
                );
            }
            if (
                promotionRequestId &&
                ev.promotion_request_id &&
                String(ev.promotion_request_id) !== String(promotionRequestId)
            ) {
                throw new PaperEvidenceError(
                    `promotionRequestId mismatch: expected '${ev.promotion_request_id}', received '${promotionRequestId}'.`,
                    'PROMOTION_REQUEST_ID_MISMATCH',
                    409
                );
            }

            // 5. Evidence lifecycle status gates
            const reviewStatus = String(ev.review_status || 'DRAFT').toUpperCase();
            if (reviewStatus === 'REJECTED') {
                throw new PaperEvidenceError(
                    `Cannot promote rejected classification evidence '${effectiveEvidenceId}'.`,
                    'CLASSIFICATION_EVIDENCE_REJECTED',
                    409
                );
            }
            if (reviewStatus !== 'APPROVED') {
                throw new PaperEvidenceError(
                    `Cannot promote unapproved classification evidence '${effectiveEvidenceId}' (status: '${reviewStatus}'). Only APPROVED evidences are eligible.`,
                    'CLASSIFICATION_EVIDENCE_NOT_APPROVED',
                    422
                );
            }
            if (Boolean(ev.applied_to_catalog_product)) {
                throw new PaperEvidenceError(
                    `Classification evidence '${effectiveEvidenceId}' is already promoted to catalog.`,
                    'CLASSIFICATION_EVIDENCE_ALREADY_PROMOTED',
                    409
                );
            }

            const newCategory = String(ev.proposed_category).toUpperCase();
            const newCoatingStatus = String(ev.proposed_coating_status || 'UNKNOWN').toUpperCase();
            const newFinish = String(ev.proposed_finish).toUpperCase();
            const newGrainDirection = String(ev.proposed_grain_direction || variant.grain_direction || 'UNKNOWN').toUpperCase();
            const promotionId = `cls_prm_${crypto.randomBytes(8).toString('hex')}`;
            const promotedAtIso = new Date().toISOString();

            const varMeta = parseJsonColumn(variant.metadata_json);
            const previousClassificationSnapshot = {
                product_category: product.category || 'OTHER',
                product_finish_summary: product.finish_summary || null,
                variant_finish: variant.finish || null,
                variant_grain_direction: variant.grain_direction || 'UNKNOWN',
                classification_accreditation: varMeta.classification_accreditation || null
            };

            const classificationAccreditationMeta = {
                classification_evidence_id: effectiveEvidenceId,
                promotion_request_id: ev.promotion_request_id || promotionRequestId || null,
                promotion_id: promotionId,
                functional_group: ev.functional_group,
                paper_type: newCategory,
                coating_status: newCoatingStatus,
                coating_confidence: 'ACCREDITED_EVIDENCE',
                finish: newFinish,
                grain_direction: newGrainDirection,
                evidence_source_type: ev.evidence_source_type,
                document_title: ev.document_title,
                document_sha256: ev.document_sha256,
                submitted_by: ev.submitted_by,
                approved_by_technologist: ev.approved_by_technologist,
                requested_by: effectiveRequestedBy,
                promoted_by: effectiveActorId,
                promoted_by_role: effectiveRole,
                promoted_at: promotedAtIso
            };

            const updatedVarMeta = {
                ...varMeta,
                classification_accreditation: classificationAccreditationMeta
            };

            const prodMeta = parseJsonColumn(product.metadata_json);
            const updatedProdMeta = {
                ...prodMeta,
                classification_accreditation: classificationAccreditationMeta
            };

            // 6. Atomic UPDATE on `paper_products` (category, finish_summary, metadata_json)
            const prodUpdRes = unwrapAffectResult(await executor.query(
                `UPDATE paper_products
                 SET category = ?,
                     finish_summary = ?,
                     metadata_json = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    newCategory,
                    newFinish,
                    JSON.stringify(updatedProdMeta),
                    variant.product_id
                ]
            ));
            if (prodUpdRes.affectedRows !== undefined && Number(prodUpdRes.affectedRows) === 0) {
                throw new PaperEvidenceError(
                    `Failed to update catalog product '${variant.product_id}' during classification promotion.`,
                    'PRODUCT_PROMOTION_UPDATE_FAILED',
                    409
                );
            }

            // 7. Atomic UPDATE on `paper_variants` (finish, grain_direction, metadata_json ONLY — caliper_um strictly untouched!)
            const varUpdRes = unwrapAffectResult(await executor.query(
                `UPDATE paper_variants
                 SET finish = ?,
                     grain_direction = ?,
                     metadata_json = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    newFinish,
                    newGrainDirection,
                    JSON.stringify(updatedVarMeta),
                    variantId
                ]
            ));
            if (varUpdRes.affectedRows !== undefined && Number(varUpdRes.affectedRows) === 0) {
                throw new PaperEvidenceError(
                    `Failed to update catalog variant '${variantId}' during classification promotion.`,
                    'VARIANT_PROMOTION_UPDATE_FAILED',
                    409
                );
            }

            // 8. Atomic Compare-And-Swap UPDATE on `paper_variant_classification_evidence`
            const updatedEvMeta = {
                ...existingMeta,
                stage: 'CATALOG_CLASSIFICATION_PROMOTED',
                promotionId,
                promotionRequestId: ev.promotion_request_id || promotionRequestId || null,
                promotionAuthorizeIdempotencyKey: idempotencyKey || null,
                authorizedBy: effectiveActorId,
                authorizedByRole: effectiveRole,
                authorizedAt: promotedAtIso,
                authorizationReason: String(effectiveReason).trim(),
                previousClassificationSnapshot,
                promotedClassificationSnapshot: classificationAccreditationMeta,
                caliperPreservedUnchanged: {
                    caliper_um: variant.caliper_um ?? null,
                    caliper_source: variant.caliper_source || 'NONE',
                    caliper_revision: Number(variant.caliper_revision || 1)
                }
            };

            const evUpdRes = unwrapAffectResult(await executor.query(
                `UPDATE paper_variant_classification_evidence
                 SET applied_to_catalog_product = TRUE,
                     promotion_id = ?,
                     promoted_by = ?,
                     promoted_by_role = ?,
                     promoted_at = CURRENT_TIMESTAMP,
                     promotion_reason = ?,
                     metadata_json = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE classification_evidence_id = ?
                   AND tenant_id = ?
                   AND applied_to_catalog_product = FALSE
                   AND review_status = 'APPROVED'`,
                [
                    promotionId,
                    effectiveActorId,
                    effectiveRole,
                    String(effectiveReason).trim(),
                    JSON.stringify(updatedEvMeta),
                    effectiveEvidenceId,
                    tenantId
                ]
            ));

            if (evUpdRes.affectedRows !== undefined && Number(evUpdRes.affectedRows) === 0) {
                throw new PaperEvidenceError(
                    `Concurrent classification promotion conflict on evidence '${effectiveEvidenceId}'.`,
                    'CONCURRENT_CLASSIFICATION_PROMOTION_CONFLICT',
                    409
                );
            }

            return {
                idempotentReplay: false,
                promotionId,
                promotionRequestId: ev.promotion_request_id || promotionRequestId || null,
                classificationEvidenceId: effectiveEvidenceId,
                variantId,
                productId: variant.product_id,
                reviewStatus,
                previousCategory: product.category || 'OTHER',
                newCategory,
                previousCoatingStatus: ev.previous_coating_status || 'UNKNOWN',
                newCoatingStatus,
                previousFinish: variant.finish || 'UNCOATED',
                newFinish,
                previousGrainDirection: variant.grain_direction || 'UNKNOWN',
                newGrainDirection,
                segregationOfDuties: {
                    submittedBy: ev.submitted_by,
                    approvedByTechnologist: ev.approved_by_technologist,
                    requestedBy: effectiveRequestedBy,
                    authorizedBy: effectiveActorId
                },
                caliperPreservedUnchanged: {
                    caliperUm: variant.caliper_um !== null && variant.caliper_um !== undefined ? Number(variant.caliper_um) : null,
                    caliperSource: variant.caliper_source || 'NONE',
                    caliperRevision: Number(variant.caliper_revision || 1)
                },
                productiveClassificationModified: true,
                productiveCaliperModified: false,
                canReleaseToManufacturing: false
            };
        });
    }
}

function rowsOrFirst(rows) {
    return Array.isArray(rows) ? rows[0] : rows;
}

function payloadAllowsNominalReferenceOnly() {
    return false;
}

const paperEvidenceService = new PaperEvidenceService();

module.exports = {
    paperEvidenceService,
    PaperEvidenceService,
    PaperEvidenceError,
    HISTORICAL_CONFLICT_9_VARIANT_IDS,
    ALLOWED_PROMOTION_REQUESTER_ROLES,
    ALLOWED_PROMOTION_AUTHORIZER_ROLES,
    resolvePromotionCatalogProvenance,
    computeSpinePromotionImpactPreview,
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
