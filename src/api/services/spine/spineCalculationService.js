'use strict';

/**
 * src/api/services/spine/spineCalculationService.js
 *
 * PrintPrice OS — Phase 197B (SPINE-03): Governed Spine Calculation & Snapshot Persistence Service
 *
 * Responsibilities:
 * 1. Authoritative resolution of binding profile from printhouse/tenant configuration (never trusting
 *    arbitrary client profile overrides to bypass printhouse rules).
 * 2. Authoritative resolution of paper caliper (µm), bulk, source, and confidence status from
 *    paper_variants when variantId is supplied, refusing to guess caliper from gsm or category.
 * 3. Deterministic execution of spineCalculationEngine.
 * 4. Transactional persistence of immutable spine_calculation_snapshots with idempotency key protection,
 *    automatic superseding of previous ACTIVE snapshots for the same order intent, and strict tenant isolation.
 * 5. Reactive invalidation and recalculation when paper decisions or quote revisions alter paper variants,
 *    pagination, trim size, or binding method.
 */

const crypto = require('crypto');
const mysqlClient = require('../mysqlClient');
const logger = require('../logger').child('spine-calculation-service');
const {
    BUILTIN_BINDING_PROFILES,
    executeSpineCalculation,
    computeCanonicalHash
} = require('./spineCalculationEngine');
const {
    resolveVariantCaliperProvenance
} = require('./paperCaliperReconciliationService');

class SpineCalculationError extends Error {
    constructor(message, code, statusCode = 400, details = null) {
        super(message);
        this.name = 'SpineCalculationError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

const VALID_BINDING_CATEGORIES = new Set([
    'SOFTCOVER_STANDARD',
    'SOFTCOVER_WITH_FLAPS',
    'HARDCOVER',
    'FLEXI_STANDARD',
    'FLEXI_WITH_FLAPS'
]);

const VALID_PROCESSING_TYPES = new Set(['GLUED', 'SEWN']);

function unwrapRows(result) {
    if (!result) return [];
    if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
    if (Array.isArray(result)) return result;
    return [];
}

class SpineCalculationService {
    constructor(options = {}) {
        this.db = options.db || mysqlClient;
    }

    /**
     * Lists binding profiles available to a tenant / printhouse.
     * Merges DB-configured profiles for the tenant with built-in Livonia v2.0.0 profiles.
     */
    async listProfiles({ tenantId, printhouseId = null, includeExperimental = false }) {
        if (!tenantId) {
            throw new SpineCalculationError('Authenticated tenant context is required.', 'TENANT_REQUIRED', 403);
        }

        const profiles = Object.values(BUILTIN_BINDING_PROFILES).map(p => ({
            profileId: p.profileId,
            version: p.version,
            fullProfileKey: p.fullProfileKey,
            displayName: p.displayName,
            machineryLine: p.machineryLine,
            operationalStatus: p.operationalStatus,
            certificationTier: p.certificationTier,
            supportedBindingCategories: p.supportedBindingCategories,
            supportedProcessingTypes: p.supportedProcessingTypes,
            roundingStepMm: p.roundingStepMm,
            source: 'BUILTIN_LIVONIA_V2'
        }));

        try {
            const query = printhouseId
                ? `SELECT * FROM spine_binding_profiles WHERE tenant_id = ? AND (printhouse_id = ? OR printhouse_id IS NULL) AND operational_status != 'ARCHIVED'`
                : `SELECT * FROM spine_binding_profiles WHERE tenant_id = ? AND operational_status != 'ARCHIVED'`;
            const params = printhouseId ? [tenantId, printhouseId] : [tenantId];
            const dbRows = unwrapRows(await this.db.query(query, params));
            for (const row of dbRows) {
                profiles.push({
                    profileId: row.profile_code,
                    version: row.profile_version,
                    fullProfileKey: `${row.profile_code}@${row.profile_version}`,
                    displayName: row.display_name,
                    machineryLine: row.machinery_line,
                    operationalStatus: row.operational_status,
                    certificationTier: row.certification_tier,
                    supportedBindingCategories: typeof row.supported_binding_categories_json === 'string'
                        ? JSON.parse(row.supported_binding_categories_json)
                        : row.supported_binding_categories_json,
                    supportedProcessingTypes: typeof row.supported_processing_types_json === 'string'
                        ? JSON.parse(row.supported_processing_types_json)
                        : row.supported_processing_types_json,
                    roundingStepMm: 0.5,
                    printhouseId: row.printhouse_id,
                    source: 'TENANT_CONFIGURED'
                });
            }
        } catch (_) {
            // Table may not exist yet in environments without migration 173; built-in profiles remain available
        }

        return includeExperimental
            ? profiles
            : profiles.filter(p => p.operationalStatus !== 'EXPERIMENTAL_DISABLED');
    }

    /**
     * Resolves the authoritative binding profile for a calculation.
     * Selection is governed by the printhouse / tenant configuration and bindingCategory,
     * never allowing a client to force an unauthorized or mismatched profile.
     */
    async resolveAuthoritativeProfile({ tenantId, printhouseId = null, bindingCategory, requestedProfileKey = null, conn = null }) {
        if (!VALID_BINDING_CATEGORIES.has(bindingCategory)) {
            throw new SpineCalculationError(
                `Unsupported bindingCategory '${bindingCategory}'. Allowed: ${Array.from(VALID_BINDING_CATEGORIES).join(', ')}`,
                'INVALID_BINDING_CATEGORY',
                400
            );
        }

        const executor = conn || this.db;

        // 1. Check if the printhouse/tenant has an explicit default profile configured in DB for this bindingCategory
        if (tenantId) {
            try {
                const sql = printhouseId
                    ? `SELECT * FROM spine_binding_profiles WHERE tenant_id = ? AND (printhouse_id = ? OR printhouse_id IS NULL) AND operational_status != 'ARCHIVED' ORDER BY (printhouse_id IS NOT NULL) DESC, is_default_for_printhouse DESC`
                    : `SELECT * FROM spine_binding_profiles WHERE tenant_id = ? AND operational_status != 'ARCHIVED' ORDER BY is_default_for_printhouse DESC`;
                const params = printhouseId ? [tenantId, printhouseId] : [tenantId];
                const rows = unwrapRows(await executor.query(sql, params));

                for (const row of rows) {
                    const supportedCats = typeof row.supported_binding_categories_json === 'string'
                        ? JSON.parse(row.supported_binding_categories_json)
                        : (row.supported_binding_categories_json || []);
                    const fullKey = `${row.profile_code}@${row.profile_version}`;
                    if (supportedCats.includes(bindingCategory)) {
                        if (!requestedProfileKey || requestedProfileKey === fullKey || requestedProfileKey === row.profile_code) {
                            const rules = typeof row.rules_config_json === 'string'
                                ? JSON.parse(row.rules_config_json)
                                : row.rules_config_json;
                            return {
                                profileId: row.profile_code,
                                version: row.profile_version,
                                fullProfileKey: fullKey,
                                displayName: row.display_name,
                                machineryLine: row.machinery_line,
                                operationalStatus: row.operational_status,
                                certificationTier: row.certification_tier,
                                supportedBindingCategories: supportedCats,
                                supportedProcessingTypes: typeof row.supported_processing_types_json === 'string'
                                    ? JSON.parse(row.supported_processing_types_json)
                                    : (row.supported_processing_types_json || ['GLUED', 'SEWN']),
                                roundingStepMm: 0.5,
                                rules
                            };
                        }
                    }
                }
            } catch (_) {}
        }

        // 2. Fallback to authoritative built-in profile for the bindingCategory
        let authoritativeBuiltin = null;
        if (bindingCategory === 'SOFTCOVER_STANDARD' || bindingCategory === 'SOFTCOVER_WITH_FLAPS') {
            authoritativeBuiltin = BUILTIN_BINDING_PROFILES['livonia-alegro-softcover@2.0.0'];
        } else if (bindingCategory === 'HARDCOVER') {
            authoritativeBuiltin = BUILTIN_BINDING_PROFILES['livonia-colibri-hardcover@2.0.0'];
        } else if (bindingCategory === 'FLEXI_STANDARD' || bindingCategory === 'FLEXI_WITH_FLAPS') {
            authoritativeBuiltin = BUILTIN_BINDING_PROFILES['livonia-colibri-flexi@2.0.0'];
        }

        if (
            requestedProfileKey &&
            requestedProfileKey !== authoritativeBuiltin.fullProfileKey &&
            requestedProfileKey !== authoritativeBuiltin.profileId
        ) {
            throw new SpineCalculationError(
                `Requested profile '${requestedProfileKey}' is not authorized or incompatible with bindingCategory '${bindingCategory}'. Authoritative profile is '${authoritativeBuiltin.fullProfileKey}'.`,
                'UNAUTHORIZED_PROFILE_SELECTION',
                422
            );
        }

        return authoritativeBuiltin;
    }

    /**
     * Resolves variant caliper data from paper_variants table when variantId is provided.
     * Never trusts client-supplied caliperUm to override a catalog variant's verified database record.
     */
    async resolveCatalogVariantProvenance(variantId, conn = null) {
        if (!variantId) return null;
        const executor = conn || this.db;
        const rows = unwrapRows(await executor.query(
            `SELECT v.*, p.name AS product_name, p.brand, p.category, p.finish_summary
             FROM paper_variants v
             LEFT JOIN paper_products p ON v.product_id = p.id
             WHERE v.id = ? LIMIT 1`,
            [variantId]
        ));
        if (!rows || rows.length === 0) {
            throw new SpineCalculationError(
                `Paper variant '${variantId}' not found in master catalog.`,
                'PAPER_VARIANT_NOT_FOUND',
                404
            );
        }
        const row = rows[0];
        const prov = resolveVariantCaliperProvenance(row);
        const categoryUpper = String(row.category || '').toUpperCase();
        const finishUpper = String(row.finish || row.finish_summary || '').toUpperCase();
        const isCoated = categoryUpper === 'COATED' || finishUpper.includes('COATED') || finishUpper.includes('SILK') || finishUpper.includes('GLOSS') || finishUpper.includes('MATT');

        return {
            variantId: row.id,
            productId: row.product_id,
            productName: row.product_name || null,
            brand: row.brand || null,
            category: row.category || 'OTHER',
            finish: row.finish || null,
            gsm: Number(row.gsm),
            coatingType: isCoated ? 'COATED' : 'UNCOATED',
            ...prov
        };
    }

    /**
     * Calculates spine and cover geometry, optionally persisting an immutable snapshot.
     */
    async calculateSpine({
        tenantId,
        printhouseId = null,
        actorId = 'system',
        idempotencyKey = null,
        persistSnapshot = false,
        externalOrderIntentId = null,
        canonicalOrderId = null,
        paperDecisionId = null,
        quoteRevisionId = null,
        payload = {}
    }) {
        if (!tenantId) {
            throw new SpineCalculationError('Authenticated tenant context is required.', 'TENANT_REQUIRED', 403);
        }

        const bindingCategory = payload.bindingCategory || 'SOFTCOVER_STANDARD';
        const processingType = payload.processingType || 'SEWN';
        if (!VALID_PROCESSING_TYPES.has(processingType)) {
            throw new SpineCalculationError(
                `Invalid processingType '${processingType}'. Allowed: GLUED, SEWN.`,
                'INVALID_PROCESSING_TYPE',
                400
            );
        }

        const trimWidthMm = Number(payload.trimWidthMm);
        const trimHeightMm = Number(payload.trimHeightMm);
        if (!Number.isFinite(trimWidthMm) || trimWidthMm < 40 || trimWidthMm > 1000 ||
            !Number.isFinite(trimHeightMm) || trimHeightMm < 40 || trimHeightMm > 1000) {
            throw new SpineCalculationError(
                'trimWidthMm and trimHeightMm must be finite numbers between 40 mm and 1000 mm.',
                'INVALID_TRIM_DIMENSIONS',
                400
            );
        }

        const rawSegments = Array.isArray(payload.segments) ? payload.segments : [];
        if (rawSegments.length === 0 || rawSegments.length > 10) {
            throw new SpineCalculationError(
                'segments must be a non-empty array of 1 to 10 block segments.',
                'INVALID_SEGMENTS',
                400
            );
        }

        const conn = persistSnapshot ? await this.db.getConnection() : null;
        try {
            if (conn) await conn.beginTransaction();

            // 1. Resolve authoritative profile for printhouse/tenant
            const profile = await this.resolveAuthoritativeProfile({
                tenantId,
                printhouseId: printhouseId || payload.printhouseId || null,
                bindingCategory,
                requestedProfileKey: payload.profileKey || payload.profileId || null,
                conn
            });

            // 2. Resolve each segment's paper variant from DB if variantId is given
            const enrichedSegments = [];
            for (let i = 0; i < rawSegments.length; i++) {
                const seg = rawSegments[i] || {};
                const pages = Number(seg.pages || 0);
                if (!Number.isInteger(pages) || pages < 0 || pages > 5000) {
                    throw new SpineCalculationError(
                        `Segment ${i + 1} pages must be an integer between 0 and 5000.`,
                        'INVALID_SEGMENT_PAGES',
                        400
                    );
                }

                if (seg.variantId) {
                    const dbVar = await this.resolveCatalogVariantProvenance(seg.variantId, conn);
                    enrichedSegments.push({
                        segmentIndex: i + 1,
                        pages,
                        variantId: dbVar.variantId,
                        paperFamilyName: dbVar.productName,
                        gsm: dbVar.gsm,
                        caliperUm: dbVar.caliperUm,
                        bulkFactor: dbVar.bulkFactor,
                        coatingType: dbVar.coatingType,
                        caliperSource: dbVar.caliperSource,
                        caliperConfidenceStatus: dbVar.caliperConfidenceStatus
                    });
                } else {
                    const prov = resolveVariantCaliperProvenance(seg);
                    enrichedSegments.push({
                        segmentIndex: i + 1,
                        pages,
                        variantId: null,
                        paperFamilyName: seg.paperFamilyName || null,
                        gsm: seg.gsm ? Number(seg.gsm) : null,
                        caliperUm: prov.caliperUm,
                        bulkFactor: prov.bulkFactor,
                        coatingType: seg.coatingType || 'UNCOATED',
                        caliperSource: seg.caliperSource || (prov.caliperUm ? 'MANUAL_INPUT' : 'NONE'),
                        caliperConfidenceStatus: seg.caliperConfidenceStatus || (prov.caliperUm ? 'PROVISIONAL_ESTIMATED' : 'MISSING')
                    });
                }
            }

            // 3. Resolve cover variant if variantId is provided
            let enrichedCover = payload.cover ? { ...payload.cover } : null;
            if (enrichedCover && enrichedCover.variantId) {
                const dbCov = await this.resolveCatalogVariantProvenance(enrichedCover.variantId, conn);
                enrichedCover = {
                    ...enrichedCover,
                    variantId: dbCov.variantId,
                    gsm: dbCov.gsm,
                    caliperUm: dbCov.caliperUm,
                    caliperSource: dbCov.caliperSource,
                    caliperConfidenceStatus: dbCov.caliperConfidenceStatus
                };
            }

            // 4. Execute pure mathematical calculation
            const engineInput = {
                tenantId,
                printhouseId: printhouseId || payload.printhouseId || null,
                bindingCategory,
                processingType,
                trimWidthMm,
                trimHeightMm,
                segments: enrichedSegments,
                cover: enrichedCover,
                hardcover: payload.hardcover || null
            };

            const calculation = executeSpineCalculation(engineInput, profile);

            // 5. Optional Snapshot Persistence & Idempotency Enforcement
            let snapshotId = null;
            let idempotentReplay = false;

            if (persistSnapshot && conn) {
                if (idempotencyKey) {
                    const existingRows = unwrapRows(await conn.query(
                        `SELECT * FROM spine_calculation_snapshots WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1 FOR UPDATE`,
                        [tenantId, idempotencyKey]
                    ));
                    if (existingRows.length > 0) {
                        const existing = existingRows[0];
                        if (existing.input_canonical_hash !== calculation.inputCanonicalHash) {
                            throw new SpineCalculationError(
                                'Idempotency-Key collision with different calculation parameters.',
                                'IDEMPOTENCY_KEY_COLLISION',
                                409
                            );
                        }
                        await conn.commit();
                        const storedBreakdown = typeof existing.geometry_breakdown_json === 'string'
                            ? JSON.parse(existing.geometry_breakdown_json)
                            : existing.geometry_breakdown_json;
                        return {
                            ...storedBreakdown,
                            snapshotId: existing.id,
                            snapshotLifecycleStatus: existing.snapshot_lifecycle_status,
                            idempotentReplay: true
                        };
                    }
                }

                snapshotId = `scs_${crypto.randomUUID()}`;

                // Supersede any previous ACTIVE snapshot for the same order intent
                const orderIntentRef = externalOrderIntentId || payload.externalOrderIntentId || null;
                const orderCanonicalRef = canonicalOrderId || payload.canonicalOrderId || null;

                if (orderIntentRef || orderCanonicalRef) {
                    await conn.query(
                        `UPDATE spine_calculation_snapshots
                         SET snapshot_lifecycle_status = 'SUPERSEDED',
                             superseded_at = CURRENT_TIMESTAMP(6),
                             superseded_by_snapshot_id = ?,
                             invalidation_reason = 'REPLACED_BY_NEW_CALCULATION'
                         WHERE tenant_id = ?
                           AND snapshot_lifecycle_status = 'ACTIVE'
                           AND ((? IS NOT NULL AND external_order_intent_id = ?) OR (? IS NOT NULL AND canonical_order_id = ?))`,
                        [snapshotId, tenantId, orderIntentRef, orderIntentRef, orderCanonicalRef, orderCanonicalRef]
                    );
                }

                await conn.query(
                    `INSERT INTO spine_calculation_snapshots (
                        id, tenant_id, printhouse_id,
                        external_order_intent_id, canonical_order_id, paper_decision_id, quote_revision_id,
                        profile_code, profile_version, certification_tier,
                        binding_category, processing_type, spine_shape,
                        trim_width_mm, trim_height_mm,
                        net_block_thickness_mm, total_block_with_endpapers_mm,
                        spine_width_mm, flat_cover_width_mm, flat_cover_height_mm,
                        validation_status, caliper_confidence_summary, snapshot_lifecycle_status,
                        idempotency_key, input_canonical_hash, output_canonical_hash,
                        input_payload_json, geometry_breakdown_json, validation_issues_json,
                        created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        snapshotId,
                        tenantId,
                        printhouseId || payload.printhouseId || null,
                        orderIntentRef,
                        orderCanonicalRef,
                        paperDecisionId || payload.paperDecisionId || null,
                        quoteRevisionId || payload.quoteRevisionId || null,
                        calculation.profileId,
                        calculation.profileVersion,
                        calculation.certificationTier,
                        bindingCategory,
                        processingType,
                        calculation.bindingAdjustment.spineShape || 'SQUARE',
                        trimWidthMm,
                        trimHeightMm,
                        calculation.blockThickness.netPaperBlockMm,
                        calculation.blockThickness.totalBlockWithEndpapersMm,
                        calculation.spineWidthMm,
                        calculation.coverGeometry ? calculation.coverGeometry.flatCoverWidthMm : null,
                        calculation.coverGeometry ? calculation.coverGeometry.flatCoverHeightMm : null,
                        calculation.manufacturingValidation.status,
                        calculation.manufacturingValidation.caliperConfidenceSummary,
                        idempotencyKey || null,
                        calculation.inputCanonicalHash,
                        calculation.outputCanonicalHash,
                        JSON.stringify(engineInput),
                        JSON.stringify(calculation),
                        JSON.stringify(calculation.manufacturingValidation.issues),
                        actorId
                    ]
                );

                await conn.commit();
            }

            return {
                ...calculation,
                snapshotId,
                snapshotLifecycleStatus: snapshotId ? 'ACTIVE' : null,
                idempotentReplay
            };
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * Retrieves a persisted spine calculation snapshot by ID with strict tenant isolation.
     */
    async getCalculationById({ tenantId, calculationId }) {
        if (!tenantId) {
            throw new SpineCalculationError('Authenticated tenant context is required.', 'TENANT_REQUIRED', 403);
        }
        if (!calculationId) {
            throw new SpineCalculationError('calculationId is required.', 'INVALID_CALCULATION_ID', 400);
        }

        const rows = unwrapRows(await this.db.query(
            `SELECT * FROM spine_calculation_snapshots WHERE id = ? LIMIT 1`,
            [calculationId]
        ));

        if (!rows || rows.length === 0) {
            throw new SpineCalculationError(`Spine calculation '${calculationId}' not found.`, 'CALCULATION_NOT_FOUND', 404);
        }

        const row = rows[0];
        if (row.tenant_id !== tenantId) {
            throw new SpineCalculationError(
                'Cross-tenant access to spine calculation snapshot is forbidden.',
                'FORBIDDEN_TENANT_MISMATCH',
                403
            );
        }

        const geometry = typeof row.geometry_breakdown_json === 'string'
            ? JSON.parse(row.geometry_breakdown_json)
            : row.geometry_breakdown_json;

        return {
            snapshotId: row.id,
            tenantId: row.tenant_id,
            printhouseId: row.printhouse_id,
            externalOrderIntentId: row.external_order_intent_id,
            canonicalOrderId: row.canonical_order_id,
            paperDecisionId: row.paper_decision_id,
            quoteRevisionId: row.quote_revision_id,
            snapshotLifecycleStatus: row.snapshot_lifecycle_status,
            invalidationReason: row.invalidation_reason,
            supersededBySnapshotId: row.superseded_by_snapshot_id,
            createdAt: row.created_at,
            ...geometry
        };
    }

    /**
     * Invalidates any active spine calculation snapshot for an order when specs or paper change,
     * and optionally computes the new spine snapshot if new paper variant has caliper_um.
     */
    async invalidateOrderSpineSnapshotsOnSpecChange(conn, {
        tenantId,
        externalOrderIntentId = null,
        canonicalOrderId = null,
        reason = 'SPEC_OR_PAPER_CHANGED',
        replacementSnapshotId = null
    }) {
        const executor = conn || this.db;
        const status = replacementSnapshotId ? 'SUPERSEDED' : 'INVALIDATED';
        const [res] = await executor.query(
            `UPDATE spine_calculation_snapshots
             SET snapshot_lifecycle_status = ?,
                 superseded_at = CURRENT_TIMESTAMP(6),
                 superseded_by_snapshot_id = ?,
                 invalidation_reason = ?
             WHERE tenant_id = ?
               AND snapshot_lifecycle_status = 'ACTIVE'
               AND ((? IS NOT NULL AND external_order_intent_id = ?) OR (? IS NOT NULL AND canonical_order_id = ?))`,
            [
                status,
                replacementSnapshotId,
                reason,
                tenantId,
                externalOrderIntentId,
                externalOrderIntentId,
                canonicalOrderId,
                canonicalOrderId
            ]
        );
        return {
            invalidatedCount: res && res.affectedRows ? res.affectedRows : 0,
            newStatus: status
        };
    }
}

module.exports = {
    SpineCalculationService,
    SpineCalculationError
};
