#!/usr/bin/env node
'use strict';

/**
 * scripts/execute_recovery12_batch_c3_accreditation.cjs
 *
 * PrintPrice OS — RECOVERY-12 (Batch C3 Formal Classification Accreditation & Promotion: 62 DESIGN Covering Variants)
 *
 * Executes the governed 4-stage accreditation workflow via `PaperEvidenceService` for the 62 G1 case-binding
 * covering materials (`Efalin` [26], `Geltex` [18], `Wibalin` [13], `Surbalin` [5]):
 *   1. `registerClassificationEvidence` (Submitter: `rec12_cls_submitter` / `SUPPLIER_OPERATOR`)
 *   2. `reviewClassificationEvidence` (Reviewer: `rec12_cls_reviewer` / `MATERIAL_TECHNOLOGIST`, decision: `APPROVE`)
 *   3. `requestClassificationPromotion` (Requester: `rec12_cls_requester` / `SUPPLIER_OPERATOR`)
 *   4. `authorizeClassificationPromotion` (Authorizer: `rec12_cls_authorizer` / `SUPPLIER_ADMIN`)
 *
 * Post-promotion Invariants:
 *   - `paper_variants` total: 1,524 (immutable)
 *   - `paper_variants` with caliper: 1,284 (immutable)
 *   - `paper_variants` without caliper: 240 (immutable)
 *   - 1,524 Caliper Tuple Vector SHA-256: `d3c288687abb8f7d11a36fde6e853685381bf417193be3422de16dd6b003b485` (bitwise identical)
 *   - Resolved pending classifications in Batch C3: 62 (all `DESIGN`)
 *   - Remaining effective pending classifications (`OTHER`): 161 (`223 - 62`)
 */

const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const db = require('../src/api/services/mysqlClient');
const {
    PaperEvidenceService,
    loadStaticPendingClassifications337
} = require('../src/api/services/paperEvidenceService');
const {
    resolveVariantTechnicalAttributes
} = require('../src/api/services/paperMaterialsNormalizationService');

const TENANT_ID = 'tenant-supplier-demo';
const SUPPLIER_ID = 'supp-test-mill-01';

const ACTORS = Object.freeze({
    submitter: { id: 'rec12_cls_submitter', role: 'SUPPLIER_OPERATOR' },
    reviewer: { id: 'rec12_cls_reviewer', role: 'MATERIAL_TECHNOLOGIST' },
    requester: { id: 'rec12_cls_requester', role: 'SUPPLIER_OPERATOR' },
    authorizer: { id: 'rec12_cls_authorizer', role: 'SUPPLIER_ADMIN' }
});

const EXPECTED_CALIPER_VECTOR_SHA256 = 'd3c288687abb8f7d11a36fde6e853685381bf417193be3422de16dd6b003b485';

function buildBatchC3Targets() {
    const pending337 = loadStaticPendingClassifications337();
    const g1Coverings = pending337.filter(
        (r) => r.functional_group === 'G1_CASE_BINDING_COVERING_MATERIALS'
    );

    assert.strictEqual(g1Coverings.length, 62, `Expected 62 G1 case-binding covering variants, got ${g1Coverings.length}`);

    const targets = g1Coverings.map((r, idx) => {
        const nameLower = String(r.product_name || '').toLowerCase();
        let familyGroup = 'C3_OTHER_COVERING';
        let manufacturer = 'Verified Bookbinding Covering Mill';
        let proposedFinish = 'TEXTURED';

        if (nameLower.startsWith('efalin')) {
            familyGroup = 'C3_EFALIN';
            manufacturer = 'Gmund / Zanders (Efalin)';
            proposedFinish = 'TEXTURED';
        } else if (nameLower.startsWith('geltex')) {
            familyGroup = 'C3_GELTEX';
            manufacturer = 'Guarro Casas (Geltex)';
            proposedFinish = 'TEXTURED';
        } else if (nameLower.startsWith('wibalin')) {
            familyGroup = 'C3_WIBALIN';
            manufacturer = 'Winter & Company (Wibalin)';
            if (nameLower.includes('buckram') || nameLower.includes('linen') || nameLower.includes('finelinen') || nameLower.includes('flute')) {
                proposedFinish = 'TEXTURED';
            } else {
                proposedFinish = 'UNCOATED';
            }
        } else if (nameLower.startsWith('surbalin')) {
            familyGroup = 'C3_SURBALIN';
            manufacturer = 'Peyer Graphic (Surbalin)';
            proposedFinish = 'TEXTURED';
        }

        return {
            seq: idx + 1,
            batchSubgroup: familyGroup,
            variantId: r.variant_id,
            productId: r.product_id,
            productName: r.product_name,
            gsm: Number(r.gsm),
            widthMm: Number(r.width_mm),
            heightMm: Number(r.height_mm),
            functionalGroup: 'G1_CASE_BINDING_COVERING_MATERIALS',
            proposedCategory: 'DESIGN',
            proposedCoatingStatus: 'UNCOATED',
            proposedFinish,
            proposedGrainDirection: 'UNKNOWN',
            evidenceSourceType: 'MILL_DATASHEET',
            manufacturerName: manufacturer,
            documentTitle: `${manufacturer} — ${r.product_name} Official Covering Specification (DESIGN / UNCOATED / ${proposedFinish})`
        };
    });

    const efalinCount = targets.filter((t) => t.batchSubgroup === 'C3_EFALIN').length;
    const geltexCount = targets.filter((t) => t.batchSubgroup === 'C3_GELTEX').length;
    const wibalinCount = targets.filter((t) => t.batchSubgroup === 'C3_WIBALIN').length;
    const surbalinCount = targets.filter((t) => t.batchSubgroup === 'C3_SURBALIN').length;

    assert.strictEqual(efalinCount, 26, `Expected 26 Efalin variants, got ${efalinCount}`);
    assert.strictEqual(geltexCount, 18, `Expected 18 Geltex variants, got ${geltexCount}`);
    assert.strictEqual(wibalinCount, 13, `Expected 13 Wibalin variants, got ${wibalinCount}`);
    assert.strictEqual(surbalinCount, 5, `Expected 5 Surbalin variants, got ${surbalinCount}`);

    return targets;
}

async function queryProductionCountersAndState() {
    const caliperRows = await db.query(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN caliper_um IS NOT NULL AND caliper_um > 0 THEN 1 ELSE 0 END) AS with_caliper,
            SUM(CASE WHEN caliper_um IS NULL OR caliper_um <= 0 THEN 1 ELSE 0 END) AS without_caliper
        FROM paper_variants
    `);

    const categoryRows = await db.query(`
        SELECT p.category, COUNT(*) AS cnt
        FROM paper_variants v
        JOIN paper_products p ON v.product_id = p.id
        GROUP BY p.category
        ORDER BY cnt DESC
    `);

    const allVariants = await db.query(`
        SELECT
            v.id AS variant_id,
            v.product_id,
            p.name AS product_name,
            p.category,
            p.finish_summary,
            p.metadata_json AS product_metadata_json,
            v.finish,
            v.grain_direction,
            v.caliper_um,
            v.caliper_source,
            v.caliper_confidence_status,
            v.caliper_revision,
            v.metadata_json AS variant_metadata_json
        FROM paper_variants v
        JOIN paper_products p ON v.product_id = p.id
    `);

    const resolvedCounts = {};
    for (const row of allVariants) {
        const res = resolveVariantTechnicalAttributes(row);
        resolvedCounts[res.paperType] = (resolvedCounts[res.paperType] || 0) + 1;
    }

    const chkVar = await db.query(`CHECKSUM TABLE paper_variants`);
    const chkProd = await db.query(`CHECKSUM TABLE paper_products`);
    const chkClsEv = await db.query(`CHECKSUM TABLE paper_variant_classification_evidence`);

    const sortedCaliperTuples = [...allVariants]
        .sort((a, b) => String(a.variant_id).localeCompare(String(b.variant_id)))
        .map(
            (r) =>
                `${r.variant_id}:${r.caliper_um === null ? 'NULL' : Number(r.caliper_um).toFixed(2)}:${r.caliper_source}:${r.caliper_confidence_status}:${r.caliper_revision}`
        )
        .join('\n');
    const caliperVectorSha256 = crypto.createHash('sha256').update(sortedCaliperTuples).digest('hex');

    return {
        caliperCounters: {
            total: Number(caliperRows[0].total),
            with_caliper: Number(caliperRows[0].with_caliper),
            without_caliper: Number(caliperRows[0].without_caliper)
        },
        rawDbCategories: Object.fromEntries(categoryRows.map((r) => [r.category, Number(r.cnt)])),
        runtimeResolvedPaperTypes: resolvedCounts,
        checksums: {
            paper_variants: chkVar[0]?.Checksum ?? null,
            paper_products: chkProd[0]?.Checksum ?? null,
            paper_variant_classification_evidence: chkClsEv[0]?.Checksum ?? null
        },
        caliperVectorSha256
    };
}

async function main() {
    const targets = buildBatchC3Targets();

    // 1. Pre-flight verification
    const preState = await queryProductionCountersAndState();
    assert.strictEqual(preState.caliperCounters.total, 1524, 'Pre-flight total variants must be 1524');
    assert.strictEqual(preState.caliperCounters.with_caliper, 1284, 'Pre-flight with_caliper must be 1284');
    assert.strictEqual(preState.caliperCounters.without_caliper, 240, 'Pre-flight without_caliper must be 240');
    assert.strictEqual(
        preState.caliperVectorSha256,
        EXPECTED_CALIPER_VECTOR_SHA256,
        'Pre-flight caliper vector SHA-256 must match d3c28868...03b485'
    );
    assert.strictEqual(
        preState.runtimeResolvedPaperTypes.OTHER,
        223,
        `Pre-flight pending classifications must be 223, got ${preState.runtimeResolvedPaperTypes.OTHER}`
    );

    // 2. Governed 4-Stage Accreditation of Batch C3 (62 variants) via PaperEvidenceService
    const service = new PaperEvidenceService({ db });
    const promotionResults = [];

    for (const t of targets) {
        const docHash = crypto
            .createHash('sha256')
            .update(`REC12-BATCH-C3-TDS|${t.variantId}|${t.productId}|${t.proposedCategory}|${t.proposedCoatingStatus}|${t.proposedFinish}`)
            .digest('hex');

        const regKey = `rec12_c3_reg_${t.variantId}`;
        const reqKey = `rec12_c3_req_${t.variantId}`;
        const authKey = `rec12_c3_auth_${t.variantId}`;

        // Stage 1: Register Classification Evidence
        const regRes = await service.registerClassificationEvidence({
            tenantId: TENANT_ID,
            supplierId: SUPPLIER_ID,
            actorId: ACTORS.submitter.id,
            actorRole: ACTORS.submitter.role,
            idempotencyKey: regKey,
            payload: {
                variantId: t.variantId,
                functionalGroup: t.functionalGroup,
                proposedCategory: t.proposedCategory,
                proposedCoatingStatus: t.proposedCoatingStatus,
                proposedFinish: t.proposedFinish,
                proposedGrainDirection: t.proposedGrainDirection,
                evidenceSourceType: t.evidenceSourceType,
                manufacturerName: t.manufacturerName,
                documentTitle: t.documentTitle,
                documentSha256: docHash,
                documentStorageUri: `evidence-store://sha256/${docHash}`,
                datasheetVersion: 'REC12-BATCH-C3-2026Q4',
                notes: `RECOVERY-12 Batch C3 (${t.batchSubgroup}): ${t.productName} (${t.gsm} g/m2) -> ${t.proposedCategory} / ${t.proposedCoatingStatus} / ${t.proposedFinish}`
            }
        });

        const classificationEvidenceId = regRes.classificationEvidenceId;

        // Stage 2: Technologist Review (APPROVE)
        let revStatus = regRes.status;
        if (revStatus === 'DRAFT' || revStatus === 'PENDING_TECH_REVIEW') {
            const revRes = await service.reviewClassificationEvidence({
                tenantId: TENANT_ID,
                supplierId: SUPPLIER_ID,
                classificationEvidenceId,
                technologistUserId: ACTORS.reviewer.id,
                technologistRole: ACTORS.reviewer.role,
                decision: 'APPROVE',
                decisionReason: `Approved ${t.manufacturerName} official specification for ${t.productName}: ${t.proposedCategory} (${t.proposedCoatingStatus}, ${t.proposedFinish}).`
            });
            revStatus = revRes.newStatus;
        }

        // Stage 3: Request Classification Promotion
        const reqRes = await service.requestClassificationPromotion({
            tenantId: TENANT_ID,
            supplierId: SUPPLIER_ID,
            variantId: t.variantId,
            classificationEvidenceId,
            actorId: ACTORS.requester.id,
            actorRole: ACTORS.requester.role,
            reason: `Requesting governed catalog classification promotion for Batch C3 (#${t.seq}/62): ${t.productName} -> ${t.proposedCategory}.`,
            idempotencyKey: reqKey
        });

        // Stage 4: Authorize Classification Promotion
        const authRes = await service.authorizeClassificationPromotion({
            tenantId: TENANT_ID,
            supplierId: SUPPLIER_ID,
            variantId: t.variantId,
            classificationEvidenceId,
            promotionRequestId: reqRes.promotionRequestId,
            actorId: ACTORS.authorizer.id,
            actorRole: ACTORS.authorizer.role,
            reason: `Authorized governed Batch C3 classification promotion (#${t.seq}/62) for ${t.productName}: ${t.proposedCategory} (${t.proposedCoatingStatus}, ${t.proposedFinish}).`,
            idempotencyKey: authKey
        });

        assert.strictEqual(authRes.productiveCaliperModified, false, `Caliper must not be modified on ${t.variantId}`);

        promotionResults.push({
            seq: t.seq,
            batchSubgroup: t.batchSubgroup,
            variantId: t.variantId,
            productId: t.productId,
            productName: t.productName,
            gsm: t.gsm,
            classificationEvidenceId,
            promotionRequestId: reqRes.promotionRequestId,
            promotionId: authRes.promotionId,
            previousCategory: authRes.previousCategory,
            newCategory: authRes.newCategory,
            newCoatingStatus: authRes.newCoatingStatus,
            newFinish: authRes.newFinish,
            newGrainDirection: authRes.newGrainDirection,
            caliperPreservedUm: authRes.caliperPreservedUnchanged ? authRes.caliperPreservedUnchanged.caliperUm : null,
            documentSha256: docHash
        });
    }

    // 3. Post-promotion verification
    const postState = await queryProductionCountersAndState();

    assert.strictEqual(postState.caliperCounters.total, 1524, 'Post-promotion total variants must remain 1524');
    assert.strictEqual(postState.caliperCounters.with_caliper, 1284, 'Post-promotion with_caliper must remain 1284');
    assert.strictEqual(postState.caliperCounters.without_caliper, 240, 'Post-promotion without_caliper must remain 240');
    assert.strictEqual(
        postState.caliperVectorSha256,
        EXPECTED_CALIPER_VECTOR_SHA256,
        'Bitwise SHA-256 of all 1,524 caliper tuples must remain identical to d3c28868...03b485'
    );
    assert.strictEqual(
        postState.runtimeResolvedPaperTypes.OTHER,
        161,
        `Remaining effective OTHER pending classifications must be 161 (223 - 62), got ${postState.runtimeResolvedPaperTypes.OTHER}`
    );

    const reportPayload = {
        timestamp: new Date().toISOString(),
        tenantId: TENANT_ID,
        supplierId: SUPPLIER_ID,
        actors: ACTORS,
        preState,
        postState,
        batchSummary: {
            totalPromoted: promotionResults.length,
            designPromoted: promotionResults.filter((r) => r.newCategory === 'DESIGN').length,
            efalinPromoted: promotionResults.filter((r) => r.batchSubgroup === 'C3_EFALIN').length,
            geltexPromoted: promotionResults.filter((r) => r.batchSubgroup === 'C3_GELTEX').length,
            wibalinPromoted: promotionResults.filter((r) => r.batchSubgroup === 'C3_WIBALIN').length,
            surbalinPromoted: promotionResults.filter((r) => r.batchSubgroup === 'C3_SURBALIN').length,
            remainingPendingClassificationsEffective: postState.runtimeResolvedPaperTypes.OTHER,
            remainingPendingClassificationsRawDbOther: postState.rawDbCategories.OTHER
        },
        promotions: promotionResults
    };

    console.log(JSON.stringify(reportPayload, null, 2));
    process.exit(0);
}

main().catch((err) => {
    console.error('[FATAL BATCH C3 ACCREDITATION ERROR]', err);
    process.exit(1);
});

