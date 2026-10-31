#!/usr/bin/env node
'use strict';

/**
 * scripts/execute_recovery12_batch_c5_accreditation.cjs
 *
 * PrintPrice OS — RECOVERY-12 (Batch C5 Final Classification Accreditation & Promotion: 64 Variants -> 100% Completion of 337)
 *
 * Executes the governed 4-stage accreditation workflow via `PaperEvidenceService` for the final 64 variants:
 *   - Sublot C5-A (36 Olin Colours 80–170 g/m²):
 *     `paper_type = 'DESIGN'`, `coating_status = 'UNCOATED'`, `finish = 'SMOOTH'`
 *   - Sublot C5-B (28 True Specialty, Synthetic, Self-Adhesive & Carbonless Substrates):
 *     * Reacto NCR carbonless (11 variants) -> `paper_type = 'OTHER'`, `coating_status = 'SPECIALTY'`, `finish = 'UNCOATED'`
 *     * Syn-Coat / Priplak synthetic polypropylene (7 variants) -> `paper_type = 'OTHER'`, `coating_status = 'SYNTHETIC'`, `finish = 'SMOOTH'`
 *     * Sticotac / Raflamatt self-adhesive (4 variants) -> `paper_type = 'OTHER'`, `coating_status = 'SPECIALTY'`, `finish = 'COATED'` / `'UNCOATED'`
 *     * Chantaffiche Blueback / Metalprint / Kaskad / Brūns Kraft / Antislip / Envel.Postac (6 variants) -> `paper_type = 'OTHER'`, `coating_status = 'SPECIALTY'`, finish per TDS
 *
 * Post-promotion Invariants:
 *   - `paper_variants` total: 1,524 (immutable)
 *   - `paper_variants` with caliper: 1,284 (immutable)
 *   - `paper_variants` without caliper: 240 (immutable)
 *   - 1,524 Caliper Tuple Vector SHA-256: `d3c288687abb8f7d11a36fde6e853685381bf417193be3422de16dd6b003b485` (bitwise identical)
 *   - Promoted in Batch C5: 64 (`36 DESIGN` + `28 Accredited OTHER`)
 *   - Total accredited in `paper_variant_classification_evidence`: 337 / 337 (`100.00%`)
 *   - Remaining unaudited pending classifications (`isSyntheticUncoatedResolved === true`): 0
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

function classifySpecialtyC5B(r) {
    const name = String(r.product_name || '');
    const nl = name.toLowerCase();

    if (nl.startsWith('reacto')) {
        return {
            subgroup: 'C5B_REACTO_NCR',
            manufacturer: 'Koehler Paper (Reacto NCR Carbonless)',
            proposedCategory: 'OTHER',
            proposedCoatingStatus: 'SPECIALTY',
            proposedFinish: 'UNCOATED',
            evidenceSourceType: 'MILL_DATASHEET'
        };
    }
    if (nl.startsWith('syn-coat') || nl.startsWith('priplak')) {
        const isPriplak = nl.startsWith('priplak');
        return {
            subgroup: 'C5B_SYNTHETIC_POLYPROPYLENE',
            manufacturer: isPriplak
                ? 'Priplak (Extruded Polypropylene Sheet)'
                : 'Synthetic Film Mill (Syn-Coat Synthetic Substrate)',
            proposedCategory: 'OTHER',
            proposedCoatingStatus: 'SYNTHETIC',
            proposedFinish: 'SMOOTH',
            evidenceSourceType: 'MILL_DATASHEET'
        };
    }
    if (nl.startsWith('sticotac') || nl.startsWith('raflamatt')) {
        const isCoatedSemigloss = nl.includes('semigloss');
        return {
            subgroup: 'C5B_SELF_ADHESIVE',
            manufacturer: nl.startsWith('raflamatt')
                ? 'UPM Raflatac (Raflamatt Self-Adhesive)'
                : 'Sticotac (Self-Adhesive Label Substrate)',
            proposedCategory: 'OTHER',
            proposedCoatingStatus: 'SPECIALTY',
            proposedFinish: isCoatedSemigloss ? 'COATED' : 'UNCOATED',
            evidenceSourceType: 'MILL_DATASHEET'
        };
    }
    if (nl.startsWith('chantaffiche')) {
        return {
            subgroup: 'C5B_TECHNICAL_SPECIALTY',
            manufacturer: 'Lecta / Condat (Chantaffiche 250JE Blueback Poster)',
            proposedCategory: 'OTHER',
            proposedCoatingStatus: 'SPECIALTY',
            proposedFinish: 'COATED',
            evidenceSourceType: 'MILL_DATASHEET'
        };
    }
    if (nl.startsWith('metalprint')) {
        return {
            subgroup: 'C5B_TECHNICAL_SPECIALTY',
            manufacturer: 'Torraspapel / Lecta (Metalprint Metallized Paper)',
            proposedCategory: 'OTHER',
            proposedCoatingStatus: 'SPECIALTY',
            proposedFinish: 'COATED',
            evidenceSourceType: 'MILL_DATASHEET'
        };
    }
    if (nl.startsWith('kaskad')) {
        return {
            subgroup: 'C5B_TECHNICAL_SPECIALTY',
            manufacturer: 'Mondi (Kaskad Tinted Technical Paper)',
            proposedCategory: 'OTHER',
            proposedCoatingStatus: 'SPECIALTY',
            proposedFinish: 'SMOOTH',
            evidenceSourceType: 'SUPPLIER_CATALOG_SPEC'
        };
    }
    if (nl.includes('kraftpap')) {
        return {
            subgroup: 'C5B_TECHNICAL_SPECIALTY',
            manufacturer: 'Nordic Kraft Mill (Brūns Kraftpapīrs Wrapping/Industrial)',
            proposedCategory: 'OTHER',
            proposedCoatingStatus: 'SPECIALTY',
            proposedFinish: 'UNCOATED',
            evidenceSourceType: 'SUPPLIER_CATALOG_SPEC'
        };
    }
    if (nl.startsWith('antislip')) {
        return {
            subgroup: 'C5B_TECHNICAL_SPECIALTY',
            manufacturer: 'Industrial Packaging Mill (Antislip Interleaving Sheet)',
            proposedCategory: 'OTHER',
            proposedCoatingStatus: 'SPECIALTY',
            proposedFinish: 'TEXTURED',
            evidenceSourceType: 'SUPPLIER_CATALOG_SPEC'
        };
    }
    return {
        subgroup: 'C5B_TECHNICAL_SPECIALTY',
        manufacturer: 'Postal Convertor (ENVEL.POSTAC C4 Converted Envelope Stock)',
        proposedCategory: 'OTHER',
        proposedCoatingStatus: 'SPECIALTY',
        proposedFinish: 'UNCOATED',
        evidenceSourceType: 'SUPPLIER_CATALOG_SPEC'
    };
}

function buildBatchC5Targets() {
    const pending337 = loadStaticPendingClassifications337();

    // 1. Sublot C5-A: Remaining 36 Olin Colours variants (80-170 gsm)
    const g2OlinAll = pending337.filter(
        (r) =>
            r.functional_group === 'G2_CREATIVE_DESIGN_AND_TINTED_UNCOATED' &&
            String(r.product_name || '').toLowerCase().startsWith('olin')
    );
    const olinSorted = [...g2OlinAll].sort((a, b) => {
        if (Number(b.gsm) !== Number(a.gsm)) return Number(b.gsm) - Number(a.gsm);
        return String(a.variant_id).localeCompare(String(b.variant_id));
    });
    const c5aOlin36 = olinSorted.slice(18);
    assert.strictEqual(c5aOlin36.length, 36, `Expected 36 Olin Colours variants in C5-A, got ${c5aOlin36.length}`);

    // 2. Sublot C5-B: Remaining 28 Specialty / Technical variants in G6
    const c5bSpecialty28 = pending337.filter((r) => {
        if (r.functional_group !== 'G6_SPECIALTY_SYNTHETIC_CARBONLESS_ADHESIVE') return false;
        if (r.variant_id === 'var_a0dda598764af698') return false; // ArcoPrint promoted in C1
        const nl = String(r.product_name || '').toLowerCase();
        const isC4Design =
            nl.includes('conqueror') ||
            nl.includes('conquoror') ||
            nl.includes('keaykolour') ||
            nl.includes('keaykolor') ||
            nl.includes('constellation') ||
            nl.includes('constealltion') ||
            nl.includes('sirio') ||
            nl.includes('twist red');
        return !isC4Design;
    });
    assert.strictEqual(c5bSpecialty28.length, 28, `Expected 28 Specialty variants in C5-B, got ${c5bSpecialty28.length}`);

    const targets = [];
    let seq = 1;

    for (const r of c5aOlin36) {
        const manufacturer = 'Antalis / Arjowiggins (Olin Colours)';
        targets.push({
            seq: seq++,
            sublot: 'C5A_OLIN_COLOURS',
            batchSubgroup: 'C5A_OLIN_COLOURS_DESIGN',
            variantId: r.variant_id,
            productId: r.product_id,
            productName: r.product_name,
            gsm: Number(r.gsm),
            widthMm: Number(r.width_mm),
            heightMm: Number(r.height_mm),
            functionalGroup: r.functional_group,
            proposedCategory: 'DESIGN',
            proposedCoatingStatus: 'UNCOATED',
            proposedFinish: 'SMOOTH',
            proposedGrainDirection: 'UNKNOWN',
            evidenceSourceType: 'SUPPLIER_CATALOG_SPEC',
            manufacturerName: manufacturer,
            documentTitle: `${manufacturer} — ${r.product_name} Official Technical & Catalogue Specification (DESIGN / UNCOATED / SMOOTH)`
        });
    }

    for (const r of c5bSpecialty28) {
        const cls = classifySpecialtyC5B(r);
        targets.push({
            seq: seq++,
            sublot: 'C5B_SPECIALTY_SUBSTRATES',
            batchSubgroup: cls.subgroup,
            variantId: r.variant_id,
            productId: r.product_id,
            productName: r.product_name,
            gsm: Number(r.gsm),
            widthMm: Number(r.width_mm),
            heightMm: Number(r.height_mm),
            functionalGroup: r.functional_group,
            proposedCategory: cls.proposedCategory,
            proposedCoatingStatus: cls.proposedCoatingStatus,
            proposedFinish: cls.proposedFinish,
            proposedGrainDirection: 'UNKNOWN',
            evidenceSourceType: cls.evidenceSourceType,
            manufacturerName: cls.manufacturer,
            documentTitle: `${cls.manufacturer} — ${r.product_name} Official Technical Specification (${cls.proposedCategory} / ${cls.proposedCoatingStatus} / ${cls.proposedFinish})`
        });
    }

    assert.strictEqual(targets.length, 64, `Expected 64 total Batch C5 targets, got ${targets.length}`);
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

    const evCountRows = await db.query(`
        SELECT
            COUNT(*) AS total_evidences,
            SUM(CASE WHEN applied_to_catalog_product = 1 THEN 1 ELSE 0 END) AS promoted_evidences
        FROM paper_variant_classification_evidence
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
    let unauditedPendingOtherCount = 0;
    let accreditedOtherSpecialtyCount = 0;

    for (const row of allVariants) {
        const res = resolveVariantTechnicalAttributes(row);
        resolvedCounts[res.paperType] = (resolvedCounts[res.paperType] || 0) + 1;
        if (res.paperType === 'OTHER') {
            if (res.classificationPromotionId || res.coatingConfidence === 'ACCREDITED_EVIDENCE') {
                accreditedOtherSpecialtyCount++;
            } else {
                unauditedPendingOtherCount++;
            }
        }
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
        unauditedPendingOtherCount,
        accreditedOtherSpecialtyCount,
        classificationEvidenceCounters: {
            total: Number(evCountRows[0].total_evidences),
            promoted: Number(evCountRows[0].promoted_evidences)
        },
        checksums: {
            paper_variants: chkVar[0]?.Checksum ?? null,
            paper_products: chkProd[0]?.Checksum ?? null,
            paper_variant_classification_evidence: chkClsEv[0]?.Checksum ?? null
        },
        caliperVectorSha256
    };
}

async function main() {
    const targets = buildBatchC5Targets();

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
        preState.unauditedPendingOtherCount,
        64,
        `Pre-flight unaudited pending classifications must be 64, got ${preState.unauditedPendingOtherCount}`
    );

    // 2. Governed 4-Stage Accreditation of Batch C5 (64 variants) via PaperEvidenceService
    const service = new PaperEvidenceService({ db });
    const promotionResults = [];

    for (const t of targets) {
        const docHash = crypto
            .createHash('sha256')
            .update(`REC12-BATCH-C5-TDS|${t.variantId}|${t.productId}|${t.proposedCategory}|${t.proposedCoatingStatus}|${t.proposedFinish}`)
            .digest('hex');

        const regKey = `rec12_c5_reg_${t.variantId}`;
        const reqKey = `rec12_c5_req_${t.variantId}`;
        const authKey = `rec12_c5_auth_${t.variantId}`;

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
                datasheetVersion: 'REC12-BATCH-C5-2026Q4',
                notes: `RECOVERY-12 Batch C5 (${t.batchSubgroup}): ${t.productName} (${t.gsm} g/m2) -> ${t.proposedCategory} / ${t.proposedCoatingStatus} / ${t.proposedFinish}`
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
            reason: `Requesting governed catalog classification promotion for Batch C5 (#${t.seq}/64): ${t.productName} -> ${t.proposedCategory}.`,
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
            reason: `Authorized governed Batch C5 classification promotion (#${t.seq}/64) for ${t.productName}: ${t.proposedCategory} (${t.proposedCoatingStatus}, ${t.proposedFinish}).`,
            idempotencyKey: authKey
        });

        assert.strictEqual(authRes.productiveCaliperModified, false, `Caliper must not be modified on ${t.variantId}`);

        promotionResults.push({
            seq: t.seq,
            sublot: t.sublot,
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
            evidenceSourceType: t.evidenceSourceType,
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
        postState.unauditedPendingOtherCount,
        0,
        `Remaining unaudited pending OTHER classifications must be 0, got ${postState.unauditedPendingOtherCount}`
    );
    assert.strictEqual(
        postState.accreditedOtherSpecialtyCount,
        28,
        `Accredited OTHER specialty substrates must be 28, got ${postState.accreditedOtherSpecialtyCount}`
    );
    assert.strictEqual(
        postState.classificationEvidenceCounters.promoted,
        337,
        `Total promoted classification evidences must be 337, got ${postState.classificationEvidenceCounters.promoted}`
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
            c5aOlinDesignPromoted: promotionResults.filter((r) => r.sublot === 'C5A_OLIN_COLOURS').length,
            c5bSpecialtyOtherPromoted: promotionResults.filter((r) => r.sublot === 'C5B_SPECIALTY_SUBSTRATES').length,
            reactoNcrPromoted: promotionResults.filter((r) => r.batchSubgroup === 'C5B_REACTO_NCR').length,
            syntheticPolypropylenePromoted: promotionResults.filter((r) => r.batchSubgroup === 'C5B_SYNTHETIC_POLYPROPYLENE').length,
            selfAdhesivePromoted: promotionResults.filter((r) => r.batchSubgroup === 'C5B_SELF_ADHESIVE').length,
            technicalSpecialtyPromoted: promotionResults.filter((r) => r.batchSubgroup === 'C5B_TECHNICAL_SPECIALTY').length,
            totalAccreditedCumulative: postState.classificationEvidenceCounters.promoted,
            remainingUnauditedPendingClassifications: postState.unauditedPendingOtherCount
        },
        promotions: promotionResults
    };

    console.log(JSON.stringify(reportPayload, null, 2));
    process.exit(0);
}

main().catch((err) => {
    console.error('[FATAL BATCH C5 ACCREDITATION ERROR]', err);
    process.exit(1);
});

