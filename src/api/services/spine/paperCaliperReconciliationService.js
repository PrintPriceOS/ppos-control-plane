'use strict';

/**
 * src/api/services/spine/paperCaliperReconciliationService.js
 *
 * PrintPrice OS — Phase 197A (SPINE-02): Paper Caliper Reconciliation & Provenance Service
 *
 * Enforces strict separation between:
 * 1. Verified physical caliper on a catalog variant (MEASURED_MICROMETER / MANUFACTURER_DATASHEET / SUPPLIER_IMPORT).
 * 2. Technical reference library rows imported from Livonia Spine Calculator 2.0 (375 pairs across 60 blocks).
 * 3. Reconciliation candidates (SAFE_EXACT_MATCH, AMBIGUOUS_MULTIPLE_BULK, CONFLICT_EXISTING_CALIPER, UNMATCHED_IN_REFERENCE).
 *
 * Invariants:
 * - NEVER automatically assigns Livonia reference values to commercial variants without explicit reconciliation approval.
 * - NEVER overwrites an already verified caliper_um on paper_variants.
 * - NEVER guesses or averages when a family has multiple bulk factors (e.g. Munken Premium Cream 1.3, 1.5, 1.75, 1.95)
 *   or when a single column in Livonia contains non-monotonic mixed bulk tiers (Munken Pure / Munken Lynx/Polar at 100 gsm).
 * - NEVER invents a caliper from gsm alone or from category (OFFSET, COATED, OTHER).
 */

const crypto = require('crypto');
const {
    LIVONIA_PAPER_REFERENCE_SUMMARY,
    LIVONIA_PAPER_REFERENCE_ROWS
} = require('./livoniaPaperReferenceData');

const NON_MONOTONIC_WARNING_FAMILIES = new Set([
    'MUNKEN PURE',
    'MUNKEN LYNX/POLAR'
]);

/**
 * Normalizes a paper product or family name for deterministic token comparison.
 */
function normalizePaperFamilyName(rawName) {
    if (!rawName || typeof rawName !== 'string') return '';
    return rawName
        .toUpperCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\b\d+\s*(G\/M2|GSM|G)\b/g, ' ')
        .replace(/\b\d+\s*[X×]\s*\d+(\s*MM|\s*CM)?\b/g, ' ')
        .replace(/\b(SRA3|SRA2|B1|B2|A4|A3|LONG\s*GRAIN|SHORT\s*GRAIN|LG|SG|BB|SB)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extracts explicit bulk factor (e.g. "1.75", "bulk 1.5", "vol 1.8") from a product name or metadata if present.
 */
function extractDeclaredBulkFromVariant(variant = {}) {
    if (variant.bulk_factor !== undefined && variant.bulk_factor !== null && Number.isFinite(Number(variant.bulk_factor))) {
        return Number(Number(variant.bulk_factor).toFixed(3));
    }
    if (variant.bulkFactor !== undefined && variant.bulkFactor !== null && Number.isFinite(Number(variant.bulkFactor))) {
        return Number(Number(variant.bulkFactor).toFixed(3));
    }
    const meta = typeof variant.metadata_json === 'string'
        ? (() => { try { return JSON.parse(variant.metadata_json); } catch (_) { return {}; } })()
        : (variant.metadata_json || {});
    if (meta.bulk_factor !== undefined && Number.isFinite(Number(meta.bulk_factor))) {
        return Number(Number(meta.bulk_factor).toFixed(3));
    }
    const text = `${variant.product_name || variant.productName || variant.name || ''} ${variant.description || ''}`;
    const match = text.match(/\b(?:bulk|vol\.?|volume)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\b/i);
    if (match) {
        const parsed = parseFloat(match[1].replace(',', '.'));
        if (Number.isFinite(parsed) && parsed >= 0.5 && parsed <= 4.0) {
            return Number(parsed.toFixed(3));
        }
    }
    return null;
}

/**
 * Classifies a catalog paper variant against the 375 Livonia technical reference pairs.
 * Pure, deterministic function suitable for both offline batch auditing and transactional staging.
 */
function evaluateVariantCaliperReconciliation(variant, referenceRows = LIVONIA_PAPER_REFERENCE_ROWS) {
    const variantId = variant.id || variant.variantId || variant.variant_id;
    const productId = variant.product_id || variant.productId || null;
    const rawProductName = variant.product_name || variant.productName || variant.name || '';
    const brand = variant.brand || '';
    const gsm = Number(variant.gsm || 0);
    const existingCaliperUm = (variant.caliper_um !== undefined && variant.caliper_um !== null && Number(variant.caliper_um) > 0)
        ? Number(variant.caliper_um)
        : ((variant.caliperUm !== undefined && variant.caliperUm !== null && Number(variant.caliperUm) > 0) ? Number(variant.caliperUm) : null);

    const existingSource = variant.caliper_source || variant.caliperSource || (existingCaliperUm ? 'SUPPLIER_IMPORT' : 'NONE');
    const declaredBulk = extractDeclaredBulkFromVariant(variant);

    const normalizedProduct = normalizePaperFamilyName(rawProductName);
    const normalizedBrand = normalizePaperFamilyName(brand);

    // Find matching reference rows by family name and exact gsm
    const matchingRefs = referenceRows.filter(ref => {
        if (ref.gsm !== gsm) return false;
        const refKey = normalizePaperFamilyName(ref.normalizedFamilyKey || ref.familyName);
        if (!refKey) return false;
        if (normalizedProduct === refKey || normalizedBrand === refKey) return true;
        // Word-boundary substring match for product names that include format/supplier suffixes
        const escapedKey = refKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|\\s)${escapedKey}(?:$|\\s)`, 'i');
        return regex.test(normalizedProduct) || regex.test(`${normalizedBrand} ${normalizedProduct}`);
    });

    if (matchingRefs.length === 0) {
        return {
            variantId,
            productId,
            productName: rawProductName,
            gsm,
            existingCaliperUm,
            existingSource,
            reconciliationStatus: 'UNMATCHED_IN_REFERENCE',
            reviewDecision: 'PENDING_REVIEW',
            canAutoApplyOnApproval: false,
            proposedCaliperUm: null,
            proposedBulkFactor: declaredBulk,
            matchedReferenceId: null,
            candidateReferences: [],
            notes: 'No matching (family, gsm) entry found in Livonia technical reference library.'
        };
    }

    // If declaredBulk is present on the variant, filter matchingRefs by declaredBulk
    let filteredRefs = matchingRefs;
    if (declaredBulk !== null && matchingRefs.length > 1) {
        const bulkFiltered = matchingRefs.filter(
            r => r.declaredBulk !== null && Math.abs(r.declaredBulk - declaredBulk) < 0.005
        );
        if (bulkFiltered.length > 0) {
            filteredRefs = bulkFiltered;
        }
    }

    // Check if multiple distinct caliper values remain (e.g., Munken Premium Cream without bulk specified)
    const distinctCalipers = Array.from(new Set(filteredRefs.map(r => r.caliperUm)));
    if (distinctCalipers.length > 1) {
        return {
            variantId,
            productId,
            productName: rawProductName,
            gsm,
            existingCaliperUm,
            existingSource,
            reconciliationStatus: 'AMBIGUOUS_MULTIPLE_BULK',
            reviewDecision: 'PENDING_REVIEW',
            canAutoApplyOnApproval: false,
            proposedCaliperUm: null,
            proposedBulkFactor: null,
            matchedReferenceId: null,
            candidateReferences: filteredRefs.map(r => ({
                referenceId: r.id,
                familyName: r.familyName,
                declaredBulk: r.declaredBulk,
                caliperUm: r.caliperUm,
                excelCoord: `${r.excelGsmCoord}/${r.excelMicronsCoord}`
            })),
            notes: `Ambiguous multi-bulk family (${filteredRefs[0].familyName} at ${gsm} gsm has ${distinctCalipers.length} different calipers: ${distinctCalipers.join(', ')} µm). Explicit bulk factor selection required.`
        };
    }

    const matchedRef = filteredRefs[0];

    // Check if the family has known non-monotonic anomaly in Livonia (Munken Pure / Munken Lynx/Polar at 100 gsm)
    const hasNonMonotonicAnomaly = NON_MONOTONIC_WARNING_FAMILIES.has(matchedRef.normalizedFamilyKey) && gsm === 100;

    // If the variant already has a verified caliper, never overwrite it; check for conflict
    if (existingCaliperUm !== null) {
        const deltaUm = Math.abs(existingCaliperUm - matchedRef.caliperUm);
        if (deltaUm > 0.01) {
            return {
                variantId,
                productId,
                productName: rawProductName,
                gsm,
                existingCaliperUm,
                existingSource,
                reconciliationStatus: 'CONFLICT_EXISTING_CALIPER',
                reviewDecision: 'PENDING_REVIEW',
                canAutoApplyOnApproval: false,
                proposedCaliperUm: matchedRef.caliperUm,
                proposedBulkFactor: matchedRef.declaredBulk,
                matchedReferenceId: matchedRef.id,
                candidateReferences: [{
                    referenceId: matchedRef.id,
                    familyName: matchedRef.familyName,
                    declaredBulk: matchedRef.declaredBulk,
                    caliperUm: matchedRef.caliperUm,
                    excelCoord: `${matchedRef.excelGsmCoord}/${matchedRef.excelMicronsCoord}`
                }],
                notes: `Variant already has existing caliper (${existingCaliperUm} µm from ${existingSource}) which differs from Livonia reference (${matchedRef.caliperUm} µm) by ${deltaUm.toFixed(2)} µm. Existing value is preserved.`
            };
        }
    }

    if (hasNonMonotonicAnomaly) {
        return {
            variantId,
            productId,
            productName: rawProductName,
            gsm,
            existingCaliperUm,
            existingSource,
            reconciliationStatus: 'AMBIGUOUS_MULTIPLE_BULK',
            reviewDecision: 'PENDING_REVIEW',
            canAutoApplyOnApproval: false,
            proposedCaliperUm: matchedRef.caliperUm,
            proposedBulkFactor: matchedRef.declaredBulk,
            matchedReferenceId: matchedRef.id,
            candidateReferences: [{
                referenceId: matchedRef.id,
                familyName: matchedRef.familyName,
                declaredBulk: matchedRef.declaredBulk,
                caliperUm: matchedRef.caliperUm,
                excelCoord: `${matchedRef.excelGsmCoord}/${matchedRef.excelMicronsCoord}`
            }],
            notes: `Livonia sheet has a non-monotonic bulk transition for ${matchedRef.familyName} at 100 gsm (80g=105µm, 90g=118µm [bulk 1.3], 100g=113µm [bulk 1.13]). Technologist confirmation required.`
        };
    }

    return {
        variantId,
        productId,
        productName: rawProductName,
        gsm,
        existingCaliperUm,
        existingSource,
        reconciliationStatus: 'SAFE_EXACT_MATCH',
        reviewDecision: 'PENDING_REVIEW',
        canAutoApplyOnApproval: existingCaliperUm === null,
        proposedCaliperUm: matchedRef.caliperUm,
        proposedBulkFactor: matchedRef.declaredBulk,
        matchedReferenceId: matchedRef.id,
        candidateReferences: [{
            referenceId: matchedRef.id,
            familyName: matchedRef.familyName,
            declaredBulk: matchedRef.declaredBulk,
            caliperUm: matchedRef.caliperUm,
            excelCoord: `${matchedRef.excelGsmCoord}/${matchedRef.excelMicronsCoord}`
        }],
        notes: existingCaliperUm !== null
            ? `Existing caliper (${existingCaliperUm} µm) matches Livonia reference (${matchedRef.excelGsmCoord}/${matchedRef.excelMicronsCoord}).`
            : `Exact unambiguous match to Livonia reference ${matchedRef.familyName} ${gsm} gsm = ${matchedRef.caliperUm} µm (${matchedRef.excelGsmCoord}/${matchedRef.excelMicronsCoord}). Staged for reconciliation approval.`
    };
}

/**
 * Resolves the effective caliper and epistemic provenance of a variant or segment input.
 * Never invents a caliper from gsm or category.
 */
function resolveVariantCaliperProvenance(variantOrSegment = {}) {
    const rawCaliperUm = variantOrSegment.caliper_um !== undefined && variantOrSegment.caliper_um !== null
        ? variantOrSegment.caliper_um
        : variantOrSegment.caliperUm;

    const rawCaliperMm = variantOrSegment.caliper_mm !== undefined && variantOrSegment.caliper_mm !== null
        ? variantOrSegment.caliper_mm
        : variantOrSegment.caliperMm;

    let caliperUm = null;
    if (rawCaliperUm !== undefined && rawCaliperUm !== null && Number(rawCaliperUm) > 0) {
        caliperUm = Number(rawCaliperUm);
    } else if (rawCaliperMm !== undefined && rawCaliperMm !== null && Number(rawCaliperMm) > 0) {
        caliperUm = Number((Number(rawCaliperMm) * 1000).toFixed(2));
    }

    const explicitSource = variantOrSegment.caliper_source || variantOrSegment.caliperSource || null;
    const explicitConfidence = variantOrSegment.caliper_confidence_status || variantOrSegment.caliperConfidenceStatus || null;
    const bulkFactor = extractDeclaredBulkFromVariant(variantOrSegment);

    if (caliperUm === null || !Number.isFinite(caliperUm) || caliperUm <= 0) {
        return {
            caliperUm: null,
            caliperMm: null,
            bulkFactor,
            caliperSource: 'NONE',
            caliperConfidenceStatus: 'MISSING',
            caliperRevision: Number(variantOrSegment.caliper_revision || variantOrSegment.caliperRevision || 1)
        };
    }

    const resolvedSource = explicitSource && explicitSource !== 'NONE'
        ? explicitSource
        : 'NONE';

    let resolvedConfidence = explicitConfidence;
    if (!resolvedConfidence || resolvedConfidence === 'MISSING') {
        if (resolvedSource === 'MEASURED_MICROMETER' || resolvedSource === 'MANUFACTURER_DATASHEET') {
            resolvedConfidence = 'VERIFIED';
        } else if (resolvedSource === 'LIVONIA_REFERENCE_IMPORT' || resolvedSource === 'SUPPLIER_IMPORT') {
            resolvedConfidence = 'REFERENCE_IMPORTED';
        } else {
            resolvedConfidence = 'PROVISIONAL_ESTIMATED';
        }
    } else if (
        resolvedConfidence === 'VERIFIED' &&
        resolvedSource !== 'MEASURED_MICROMETER' &&
        resolvedSource !== 'MANUFACTURER_DATASHEET'
    ) {
        // Security invariant: VERIFIED confidence requires physical micrometer or manufacturer datasheet source
        resolvedConfidence = (resolvedSource === 'LIVONIA_REFERENCE_IMPORT' || resolvedSource === 'SUPPLIER_IMPORT')
            ? 'REFERENCE_IMPORTED'
            : 'PROVISIONAL_ESTIMATED';
    }

    return {
        caliperUm: Number(caliperUm.toFixed(2)),
        caliperMm: Number((caliperUm / 1000).toFixed(4)),
        bulkFactor,
        caliperSource: resolvedSource,
        caliperConfidenceStatus: resolvedConfidence,
        caliperRevision: Number(variantOrSegment.caliper_revision || variantOrSegment.caliperRevision || 1)
    };
}

module.exports = {
    LIVONIA_PAPER_REFERENCE_SUMMARY,
    LIVONIA_PAPER_REFERENCE_ROWS,
    normalizePaperFamilyName,
    extractDeclaredBulkFromVariant,
    evaluateVariantCaliperReconciliation,
    resolveVariantCaliperProvenance
};
