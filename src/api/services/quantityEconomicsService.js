/**
 * src/api/services/quantityEconomicsService.js
 *
 * Phase 194B — Quantity Economics Domain Layer
 *
 * Responsibilities:
 * 1. Defines an additive piecewise marginal economics domain model for quantity-dependent
 *    manufacturing cost structure (fixed setup + marginal per copy + discrete breakpoints).
 * 2. Executes 100% deterministic model validation and segment resolution (zero LLM decision).
 * 3. Enforces strict separation between manufacturing price and logistics (transport is excluded).
 * 4. Supports discrete route changes (e.g. DIGITAL -> OFFSET) and declared discontinuity metadata.
 * 5. Reuses canonical pricing engine architecture (@ppos/pricing-engine & buildPriceCalibrationAdapter.js)
 *    without replacing canonical formulas or mutating printer_nodes.rates_json.
 */

const logger = require('./logger').child('quantity-economics-service');

// ── Governed Breakpoint Reasons (Canonical Phase 194B) ─────────────────────────
const VALID_BREAKPOINT_REASONS = [
    'DIGITAL_TO_OFFSET',
    'PRESS_ROUTE_CHANGE',
    'PAPER_PURCHASE_TIER',
    'BINDING_ROUTE_CHANGE',
    'FINISHING_ROUTE_CHANGE',
    'PACKAGING_TIER',
    'COMMERCIAL_TIER',
    'CAPACITY_THRESHOLD',
    'OTHER_GOVERNED_REASON'
];

const SUPPORTED_MODEL_TYPES = ['PIECEWISE_MARGINAL'];
const SUPPORTED_VERSIONS = [1];

/**
 * Validates a Quantity Economics Model structure deterministically.
 *
 * @param {Object} model - Quantity economics model DTO
 * @returns {{ valid: boolean, errors: Array<{ code: string, message: string }> }}
 */
function validateQuantityEconomicsModel(model) {
    const errors = [];

    if (!model || typeof model !== 'object') {
        return {
            valid: false,
            errors: [{ code: 'INVALID_MODEL_OBJECT', message: 'Model must be a valid non-null object' }]
        };
    }

    // 1. Model Type & Version Checks
    if (!SUPPORTED_MODEL_TYPES.includes(model.model)) {
        errors.push({
            code: 'UNSUPPORTED_MODEL_TYPE',
            message: `Model type '${model.model}' is not supported. Must be one of: ${SUPPORTED_MODEL_TYPES.join(', ')}`
        });
    }

    if (!SUPPORTED_VERSIONS.includes(Number(model.version))) {
        errors.push({
            code: 'UNSUPPORTED_MODEL_VERSION',
            message: `Model version '${model.version}' is not supported. Must be one of: ${SUPPORTED_VERSIONS.join(', ')}`
        });
    }

    // 2. Segments Existence Check
    if (!Array.isArray(model.segments) || model.segments.length === 0) {
        errors.push({
            code: 'EMPTY_SEGMENTS_LIST',
            message: 'Model must contain a non-empty array of quantity segments'
        });
        return { valid: false, errors };
    }

    // 3. Validate Each Segment & Check Continuity
    let previousSegment = null;

    for (let i = 0; i < model.segments.length; i++) {
        const seg = model.segments[i];
        const segIdx = i;

        if (!seg || typeof seg !== 'object') {
            errors.push({
                code: 'INVALID_SEGMENT_OBJECT',
                message: `Segment at index ${segIdx} must be a valid object`
            });
            continue;
        }

        const minQty = seg.minQuantity;
        const maxQty = seg.maxQuantity;
        const fixedComp = seg.fixedComponent;
        const marginalComp = seg.marginalPerCopy;
        const adjComp = seg.adjustmentComponent !== undefined ? seg.adjustmentComponent : 0;

        // Check Quantity Bounds
        if (!Number.isInteger(minQty) || minQty < 1) {
            errors.push({
                code: 'INVALID_MIN_QUANTITY',
                message: `Segment ${segIdx}: minQuantity must be an integer >= 1, got ${minQty}`
            });
        }

        if (maxQty !== null && (!Number.isInteger(maxQty) || maxQty < minQty)) {
            errors.push({
                code: 'INVALID_MAX_QUANTITY',
                message: `Segment ${segIdx}: maxQuantity (${maxQty}) must be null or an integer >= minQuantity (${minQty})`
            });
        }

        if (maxQty === null && segIdx < model.segments.length - 1) {
            errors.push({
                code: 'UNBOUNDED_INTERMEDIATE_SEGMENT',
                message: `Segment ${segIdx}: maxQuantity can only be null for the final segment`
            });
        }

        // Check Monetary Components
        if (typeof fixedComp !== 'number' || !Number.isFinite(fixedComp) || fixedComp < 0) {
            errors.push({
                code: 'INVALID_FIXED_COMPONENT',
                message: `Segment ${segIdx}: fixedComponent must be a finite non-negative number, got ${fixedComp}`
            });
        }

        if (typeof marginalComp !== 'number' || !Number.isFinite(marginalComp) || marginalComp < 0) {
            errors.push({
                code: 'INVALID_MARGINAL_COMPONENT',
                message: `Segment ${segIdx}: marginalPerCopy must be a finite non-negative number, got ${marginalComp}`
            });
        }

        if (typeof adjComp !== 'number' || !Number.isFinite(adjComp)) {
            errors.push({
                code: 'INVALID_ADJUSTMENT_COMPONENT',
                message: `Segment ${segIdx}: adjustmentComponent must be a finite number, got ${adjComp}`
            });
        }

        // Check Breakpoint Reason Metadata (if specified)
        if (seg.reason !== null && seg.reason !== undefined && !VALID_BREAKPOINT_REASONS.includes(seg.reason)) {
            errors.push({
                code: 'UNKNOWN_BREAKPOINT_REASON',
                message: `Segment ${segIdx}: reason '${seg.reason}' is not a valid governed breakpoint reason`
            });
        }

        // Check Range Continuity against Previous Segment
        if (previousSegment !== null && Number.isInteger(minQty) && Number.isInteger(previousSegment.maxQuantity)) {
            const expectedMin = previousSegment.maxQuantity + 1;

            if (minQty <= previousSegment.maxQuantity) {
                errors.push({
                    code: 'OVERLAPPING_QUANTITY_SEGMENTS',
                    message: `Segment ${segIdx} (minQuantity: ${minQty}) overlaps with Segment ${segIdx - 1} (maxQuantity: ${previousSegment.maxQuantity})`
                });
            } else if (minQty > expectedMin) {
                errors.push({
                    code: 'UNPRICED_RANGE_GAP',
                    message: `Segment ${segIdx} (minQuantity: ${minQty}) leaves an unpriced gap after Segment ${segIdx - 1} (maxQuantity: ${previousSegment.maxQuantity})`
                });
            }

            // Check Discontinuity Declaration Requirements
            const isRouteChanged = seg.route && previousSegment.route && seg.route !== previousSegment.route;
            const isStructureChanged = seg.fixedComponent !== previousSegment.fixedComponent || seg.marginalPerCopy !== previousSegment.marginalPerCopy;

            if ((isRouteChanged || isStructureChanged) && seg.continuity === 'DECLARED_DISCONTINUITY' && !seg.reason) {
                errors.push({
                    code: 'UNDECLARED_DISCONTINUITY',
                    message: `Segment ${segIdx} declares a discontinuity or route change (${previousSegment.route || 'default'} -> ${seg.route || 'default'}) but is missing explicit breakpoint reason metadata`
                });
            }
        }

        previousSegment = seg;
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Resolves the matching segment for a given target quantity.
 *
 * @param {Object} model - Quantity economics model
 * @param {number} quantity - Positive integer target quantity
 * @returns {Object|null} Matching segment object or null if out of bounds / unpriced
 */
function resolveQuantitySegment(model, quantity) {
    if (!model || !Array.isArray(model.segments) || !Number.isInteger(quantity) || quantity < 1) {
        return null;
    }

    for (const seg of model.segments) {
        const min = seg.minQuantity;
        const max = seg.maxQuantity;

        if (quantity >= min && (max === null || quantity <= max)) {
            return seg;
        }
    }

    return null;
}

/**
 * Evaluates manufacturing economics deterministically for a single target quantity.
 *
 * @param {Object} model - Valid quantity economics model
 * @param {number} quantity - Target quantity (positive integer)
 * @returns {Object} Evaluated economics summary or error object
 */
function evaluateQuantityEconomics(model, quantity) {
    const q = Number(quantity);

    if (!Number.isInteger(q) || q < 1 || !Number.isFinite(q)) {
        return {
            error: 'INVALID_QUANTITY',
            message: 'Target quantity must be a positive integer >= 1',
            quantity: q
        };
    }

    const validation = validateQuantityEconomicsModel(model);
    if (!validation.valid) {
        return {
            error: 'INVALID_QUANTITY_ECONOMICS_MODEL',
            validationErrors: validation.errors,
            quantity: q
        };
    }

    const segment = resolveQuantitySegment(model, q);
    if (!segment) {
        return {
            error: 'UNPRICED_QUANTITY_RANGE',
            message: `Target quantity ${q} does not fall within any configured segment range`,
            quantity: q
        };
    }

    const fixedComponent = Number(segment.fixedComponent) || 0;
    const marginalRate = Number(segment.marginalPerCopy) || 0;
    const adjustmentComponent = Number(segment.adjustmentComponent) || 0;

    const marginalComponent = Number((marginalRate * q).toFixed(4));
    const manufacturingPrice = Number((fixedComponent + marginalComponent + adjustmentComponent).toFixed(4));
    const averageUnitManufacturingPrice = Number((manufacturingPrice / q).toFixed(6));

    return {
        quantity: q,
        segmentId: segment.segmentId || `seg-${segment.minQuantity}`,
        fixedComponent,
        marginalComponent,
        adjustmentComponent,
        manufacturingPrice,
        averageUnitManufacturingPrice,
        breakpointReason: segment.reason || null,
        productionRoute: segment.route || 'DEFAULT',
        continuity: segment.continuity || 'CONTINUOUS'
    };
}

/**
 * Evaluates a series of target quantities deterministically.
 *
 * @param {Object} model - Valid quantity economics model
 * @param {Array<number>} quantities - Array of positive integer target quantities
 * @returns {Array<Object>} Evaluated economics results ordered by quantity
 */
function evaluateQuantitySeries(model, quantities) {
    if (!Array.isArray(quantities) || quantities.length === 0) {
        return [];
    }

    const sortedQtys = [...quantities].sort((a, b) => Number(a) - Number(b));
    return sortedQtys.map(q => evaluateQuantityEconomics(model, q));
}

class QuantityEconomicsService {

    constructor() {
        this.VALID_BREAKPOINT_REASONS = VALID_BREAKPOINT_REASONS;
    }

    validateQuantityEconomicsModel(model) {
        return validateQuantityEconomicsModel(model);
    }

    resolveQuantitySegment(model, quantity) {
        return resolveQuantitySegment(model, quantity);
    }

    evaluateQuantityEconomics(model, quantity) {
        return evaluateQuantityEconomics(model, quantity);
    }

    evaluateQuantitySeries(model, quantities) {
        return evaluateQuantitySeries(model, quantities);
    }
}

module.exports = new QuantityEconomicsService();
