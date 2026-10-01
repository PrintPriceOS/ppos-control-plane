/**
 * src/api/services/commercialKnobService.js
 *
 * Phase 195F — Commercial Pricing Knobs & Quote Calibration Preview Service.
 *
 * Core Principles:
 * 1. OVERLAY & ADJUSTMENT LAYER: Commercial controls do not destructively overwrite
 *    rates_json lookup tables. They act as governed DELTA and MULTIPLIER adjustments.
 * 2. INTERNAL STRUCTURE PRESERVATION: Adjustments maintain relative proportions
 *    between 16p/8p signatures, black/full-colour, hardcover/softcover, etc.
 * 3. NEUTRAL BASELINE INVARIANT: When deltas = 0 and multipliers = 1.0, output rates
 *    and prices strictly equal baseline rates and prices.
 * 4. PURE IN-MEMORY PREVIEW: Zero database mutations, zero active rates modifications.
 * 5. SEPARATION OF CONCERNS: Commercial Fixed/Marginal components are observable
 *    commercial abstractions, not claimed physical machine setup/run costs.
 */

const adapter = require('./buildPriceCalibrationAdapter');
const db = require('./mysqlClient');
const logger = require('./logger').child('commercial-knobs');

// Conservative Safe Bounds
const KNOB_BOUNDS = {
    printingSetupAdjustment: { min: -500, max: 500, step: 5, unit: '€' },
    printingRunMultiplier: { min: 0.75, max: 1.25, step: 0.01, unit: '×' },
    paperCostMultiplier: { min: 0.80, max: 1.20, step: 0.01, unit: '×' },
    bindingSetupAdjustment: { min: -300, max: 300, step: 5, unit: '€' },
    bindingRunMultiplier: { min: 0.75, max: 1.25, step: 0.01, unit: '×' },
    laminationSetupAdjustment: { min: -150, max: 150, step: 5, unit: '€' },
    laminationRunMultiplier: { min: 0.75, max: 1.25, step: 0.01, unit: '×' }
};

// Default Neutral Adjustments
function getNeutralAdjustments() {
    return {
        printingSetupAdjustment: { type: 'DELTA', amount: 0 },
        printingRunMultiplier: { type: 'MULTIPLIER', value: 1.0 },
        paperCostMultiplier: { type: 'MULTIPLIER', value: 1.0 },
        bindingSetupAdjustment: { type: 'DELTA', amount: 0 },
        bindingRunMultiplier: { type: 'MULTIPLIER', value: 1.0 },
        laminationSetupAdjustment: { type: 'DELTA', amount: 0 },
        laminationRunMultiplier: { type: 'MULTIPLIER', value: 1.0 }
    };
}

// Deep clone utility
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    return JSON.parse(JSON.stringify(obj));
}

class CommercialKnobService {

    /**
     * Sanitizes and bounds input adjustments to prevent invalid, negative, or infinite values.
     */
    sanitizeAdjustments(rawAdjustments = {}) {
        const neutral = getNeutralAdjustments();
        const sanitized = {};

        // Printing Setup
        const ps = rawAdjustments.printingSetupAdjustment || {};
        const psAmount = Number(ps.amount !== undefined ? ps.amount : (rawAdjustments.printingSetupDelta || 0));
        sanitized.printingSetupAdjustment = {
            type: 'DELTA',
            amount: isNaN(psAmount) ? 0 : Math.max(KNOB_BOUNDS.printingSetupAdjustment.min, Math.min(KNOB_BOUNDS.printingSetupAdjustment.max, psAmount))
        };

        // Printing Run
        const pr = rawAdjustments.printingRunMultiplier || {};
        const prVal = Number(pr.value !== undefined ? pr.value : (rawAdjustments.printingRunMultiplierVal || 1.0));
        sanitized.printingRunMultiplier = {
            type: 'MULTIPLIER',
            value: isNaN(prVal) ? 1.0 : Math.max(KNOB_BOUNDS.printingRunMultiplier.min, Math.min(KNOB_BOUNDS.printingRunMultiplier.max, prVal))
        };

        // Paper Cost
        const pc = rawAdjustments.paperCostMultiplier || {};
        const pcVal = Number(pc.value !== undefined ? pc.value : (rawAdjustments.paperCostMultiplierVal || 1.0));
        sanitized.paperCostMultiplier = {
            type: 'MULTIPLIER',
            value: isNaN(pcVal) ? 1.0 : Math.max(KNOB_BOUNDS.paperCostMultiplier.min, Math.min(KNOB_BOUNDS.paperCostMultiplier.max, pcVal))
        };

        // Binding Setup
        const bs = rawAdjustments.bindingSetupAdjustment || {};
        const bsAmount = Number(bs.amount !== undefined ? bs.amount : (rawAdjustments.bindingSetupDelta || 0));
        sanitized.bindingSetupAdjustment = {
            type: 'DELTA',
            amount: isNaN(bsAmount) ? 0 : Math.max(KNOB_BOUNDS.bindingSetupAdjustment.min, Math.min(KNOB_BOUNDS.bindingSetupAdjustment.max, bsAmount))
        };

        // Binding Run
        const br = rawAdjustments.bindingRunMultiplier || {};
        const brVal = Number(br.value !== undefined ? br.value : (rawAdjustments.bindingRunMultiplierVal || 1.0));
        sanitized.bindingRunMultiplier = {
            type: 'MULTIPLIER',
            value: isNaN(brVal) ? 1.0 : Math.max(KNOB_BOUNDS.bindingRunMultiplier.min, Math.min(KNOB_BOUNDS.bindingRunMultiplier.max, brVal))
        };

        // Lamination Setup
        const ls = rawAdjustments.laminationSetupAdjustment || {};
        const lsAmount = Number(ls.amount !== undefined ? ls.amount : (rawAdjustments.laminationSetupDelta || 0));
        sanitized.laminationSetupAdjustment = {
            type: 'DELTA',
            amount: isNaN(lsAmount) ? 0 : Math.max(KNOB_BOUNDS.laminationSetupAdjustment.min, Math.min(KNOB_BOUNDS.laminationSetupAdjustment.max, lsAmount))
        };

        // Lamination Run
        const lr = rawAdjustments.laminationRunMultiplier || {};
        const lrVal = Number(lr.value !== undefined ? lr.value : (rawAdjustments.laminationRunMultiplierVal || 1.0));
        sanitized.laminationRunMultiplier = {
            type: 'MULTIPLIER',
            value: isNaN(lrVal) ? 1.0 : Math.max(KNOB_BOUNDS.laminationRunMultiplier.min, Math.min(KNOB_BOUNDS.laminationRunMultiplier.max, lrVal))
        };

        return sanitized;
    }

    /**
     * Applies commercial knob adjustments onto a cloned rates_json object.
     * Preserves relative internal rate distinctions and guarantees non-negative rates.
     */
    applyKnobAdjustments(ratesSnapshot, adjustmentsInput = {}) {
        if (!ratesSnapshot || typeof ratesSnapshot !== 'object') {
            throw new Error('INVALID_RATES_SNAPSHOT');
        }

        const rates = deepClone(ratesSnapshot);
        const adj = this.sanitizeAdjustments(adjustmentsInput);

        // Helper to apply DELTA across a numerical sub-object/map proportionally
        const applyDeltaSubMap = (subMap, deltaAmount) => {
            if (!subMap || typeof subMap !== 'object' || deltaAmount === 0) return;
            const keys = Object.keys(subMap).filter(k => typeof subMap[k] === 'number');
            if (keys.length === 0) return;

            const sum = keys.reduce((acc, k) => acc + subMap[k], 0);
            for (const k of keys) {
                if (sum > 0) {
                    const weight = subMap[k] / sum;
                    subMap[k] = Math.max(0, Number((subMap[k] + deltaAmount * weight).toFixed(4)));
                } else {
                    subMap[k] = Math.max(0, Number((subMap[k] + deltaAmount / keys.length).toFixed(4)));
                }
            }
        };

        // Helper to apply MULTIPLIER across a numerical sub-object/map
        const applyMultiplierSubMap = (subMap, multiplier) => {
            if (!subMap || typeof subMap !== 'object' || multiplier === 1.0) return;
            const keys = Object.keys(subMap).filter(k => typeof subMap[k] === 'number');
            for (const k of keys) {
                subMap[k] = Math.max(0, Number((subMap[k] * multiplier).toFixed(4)));
            }
        };

        // 1. PRINTING SETUP (DELTA)
        const psDelta = adj.printingSetupAdjustment.amount;
        if (psDelta !== 0) {
            const intFixedKeys = ['interior_black_colour_fixed', 'interior_full_colour_fixed', 'interior_one_colour_fixed', 'interior_two_colour_fixed'];
            let totalFixedSum = 0;
            const activeMaps = [];

            for (const k of intFixedKeys) {
                if (rates[k] && typeof rates[k] === 'object') {
                    activeMaps.push(rates[k]);
                    totalFixedSum += Object.values(rates[k]).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
                }
            }
            if (rates.cover_fixed_by_colours && typeof rates.cover_fixed_by_colours === 'object') {
                activeMaps.push(rates.cover_fixed_by_colours);
                totalFixedSum += Object.values(rates.cover_fixed_by_colours).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
            }

            for (const m of activeMaps) {
                const mapSum = Object.values(m).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
                const portion = totalFixedSum > 0 ? (mapSum / totalFixedSum) * psDelta : psDelta / activeMaps.length;
                applyDeltaSubMap(m, portion);
            }
        }

        // 2. PRINTING RUNNING COST (MULTIPLIER)
        const prMult = adj.printingRunMultiplier.value;
        if (prMult !== 1.0) {
            const intVarKeys = ['interior_black_colour_var', 'interior_full_colour_var', 'interior_one_colour_var', 'interior_two_colour_var'];
            for (const k of intVarKeys) {
                if (rates[k]) applyMultiplierSubMap(rates[k], prMult);
            }
            if (rates.cover_var_per_1000_by_colours) {
                applyMultiplierSubMap(rates.cover_var_per_1000_by_colours, prMult);
            }
        }

        // 3. PAPER COST (MULTIPLIER)
        const pcMult = adj.paperCostMultiplier.value;
        if (pcMult !== 1.0) {
            const paperKeys = ['paper_price_interior_by_kilo', 'paper_price_cover_by_kilo', 'paper_price_endpaper_by_kilo'];
            for (const k of paperKeys) {
                if (rates[k]) applyMultiplierSubMap(rates[k], pcMult);
            }
        }

        // 4. BINDING SETUP (DELTA)
        const bsDelta = adj.bindingSetupAdjustment.amount;
        if (bsDelta !== 0) {
            const bindFixedKeys = ['binding_hc_fixed_by_sections', 'binding_pb_fixed_by_sections', 'binding_ss_fixed_by_sections', 'binding_ts_fixed_by_sections', 'binding_wo_fixed_by_sections', 'binding_sp_fixed_by_sections'];
            for (const k of bindFixedKeys) {
                if (rates[k]) applyDeltaSubMap(rates[k], bsDelta);
            }
        }

        // 5. BINDING RUNNING COST (MULTIPLIER)
        const brMult = adj.bindingRunMultiplier.value;
        if (brMult !== 1.0) {
            const bindVarKeys = ['binding_hc_var_per_1000_by_sections', 'binding_pb_var_per_1000_by_sections', 'binding_ss_var_per_1000_by_sections', 'binding_ts_var_per_1000_by_sections', 'binding_wo_var_per_1000_by_sections', 'binding_sp_var_per_1000_by_sections'];
            for (const k of bindVarKeys) {
                if (rates[k]) applyMultiplierSubMap(rates[k], brMult);
            }
        }

        // 6. LAMINATION SETUP (DELTA)
        const lsDelta = adj.laminationSetupAdjustment.amount;
        if (lsDelta !== 0 && rates.lam_fixed) {
            applyDeltaSubMap(rates.lam_fixed, lsDelta);
        }

        // 7. LAMINATION RUNNING COST (MULTIPLIER)
        const lrMult = adj.laminationRunMultiplier.value;
        if (lrMult !== 1.0 && rates.lam_var_per_1000) {
            applyMultiplierSubMap(rates.lam_var_per_1000, lrMult);
        }

        return rates;
    }

    /**
     * Derives knob baseline metadata and current parameter values for UI presentation.
     */
    deriveKnobMetadata(ratesSnapshot, bookSpec = {}) {
        const sanitized = this.sanitizeAdjustments({});
        return [
            {
                id: 'printingSetupAdjustment',
                label: 'Printing Setup',
                description: 'Fixed makeready & prepress setup across interior & cover signatures',
                unit: '€',
                type: 'DELTA',
                baseline: 0,
                current: sanitized.printingSetupAdjustment.amount,
                min: KNOB_BOUNDS.printingSetupAdjustment.min,
                max: KNOB_BOUNDS.printingSetupAdjustment.max,
                step: KNOB_BOUNDS.printingSetupAdjustment.step,
                affectedCanonicalComponents: ['interior_*_fixed', 'cover_fixed_by_colours']
            },
            {
                id: 'printingRunMultiplier',
                label: 'Printing Running Cost',
                description: 'Variable impression run rate per 1,000 sheets/signatures',
                unit: '×',
                type: 'MULTIPLIER',
                baseline: 1.0,
                current: sanitized.printingRunMultiplier.value,
                min: KNOB_BOUNDS.printingRunMultiplier.min,
                max: KNOB_BOUNDS.printingRunMultiplier.max,
                step: KNOB_BOUNDS.printingRunMultiplier.step,
                affectedCanonicalComponents: ['interior_*_var', 'cover_var_per_1000_by_colours']
            },
            {
                id: 'paperCostMultiplier',
                label: 'Paper Cost',
                description: 'Raw paper substrate price per kg across interior & cover',
                unit: '×',
                type: 'MULTIPLIER',
                baseline: 1.0,
                current: sanitized.paperCostMultiplier.value,
                min: KNOB_BOUNDS.paperCostMultiplier.min,
                max: KNOB_BOUNDS.paperCostMultiplier.max,
                step: KNOB_BOUNDS.paperCostMultiplier.step,
                affectedCanonicalComponents: ['paper_price_interior_by_kilo', 'paper_price_cover_by_kilo']
            },
            {
                id: 'bindingSetupAdjustment',
                label: 'Binding Setup',
                description: 'Fixed setup charge for folding, gathering, and cover joining',
                unit: '€',
                type: 'DELTA',
                baseline: 0,
                current: sanitized.bindingSetupAdjustment.amount,
                min: KNOB_BOUNDS.bindingSetupAdjustment.min,
                max: KNOB_BOUNDS.bindingSetupAdjustment.max,
                step: KNOB_BOUNDS.bindingSetupAdjustment.step,
                affectedCanonicalComponents: ['binding_*_fixed_by_sections']
            },
            {
                id: 'bindingRunMultiplier',
                label: 'Binding Per Copy',
                description: 'Variable binding & finishing execution charge per copy',
                unit: '×',
                type: 'MULTIPLIER',
                baseline: 1.0,
                current: sanitized.bindingRunMultiplier.value,
                min: KNOB_BOUNDS.bindingRunMultiplier.min,
                max: KNOB_BOUNDS.bindingRunMultiplier.max,
                step: KNOB_BOUNDS.bindingRunMultiplier.step,
                affectedCanonicalComponents: ['binding_*_var_per_1000_by_sections']
            },
            {
                id: 'laminationSetupAdjustment',
                label: 'Lamination Setup',
                description: 'Fixed setup charge for surface lamination pass',
                unit: '€',
                type: 'DELTA',
                baseline: 0,
                current: sanitized.laminationSetupAdjustment.amount,
                min: KNOB_BOUNDS.laminationSetupAdjustment.min,
                max: KNOB_BOUNDS.laminationSetupAdjustment.max,
                step: KNOB_BOUNDS.laminationSetupAdjustment.step,
                affectedCanonicalComponents: ['lam_fixed']
            },
            {
                id: 'laminationRunMultiplier',
                label: 'Lamination Per Copy',
                description: 'Variable surface finish rate per 1,000 copies',
                unit: '×',
                type: 'MULTIPLIER',
                baseline: 1.0,
                current: sanitized.laminationRunMultiplier.value,
                min: KNOB_BOUNDS.laminationRunMultiplier.min,
                max: KNOB_BOUNDS.laminationRunMultiplier.max,
                step: KNOB_BOUNDS.laminationRunMultiplier.step,
                affectedCanonicalComponents: ['lam_var_per_1000']
            }
        ];
    }

    /**
     * Executes non-mutating preview of commercial adjustments across requested quantities.
     */
    previewCommercialAdjustments(params = {}) {
        const { bookSpec, quantities = [500, 600, 700], baselineRates, adjustments = {}, quoteEvidence = null } = params;

        if (!bookSpec || !baselineRates) {
            throw new Error('MISSING_PREVIEW_PARAMETERS');
        }

        const sanitizedAdj = this.sanitizeAdjustments(adjustments);
        const adjustedRates = this.applyKnobAdjustments(baselineRates, sanitizedAdj);

        const quantityResults = [];
        let sumBaselineRes = 0;
        let sumAdjustedRes = 0;
        let sumBaselinePctErr = 0;
        let sumAdjustedPctErr = 0;
        let maxAbsRes = 0;
        let validQuoteCount = 0;

        // Parse quote evidence points if present
        const quotePointsMap = {};
        if (quoteEvidence && Array.isArray(quoteEvidence.items)) {
            for (const item of quoteEvidence.items) {
                if (item.quantity && item.manufacturingPrice != null) {
                    quotePointsMap[item.quantity] = Number(item.manufacturingPrice);
                }
            }
        } else if (params.quotePoints && typeof params.quotePoints === 'object') {
            for (const q of Object.keys(params.quotePoints)) {
                quotePointsMap[q] = Number(params.quotePoints[q]);
            }
        }

        for (const q of quantities) {
            const specQ = { ...bookSpec, copies: q };
            
            // Baseline prediction
            const baseEval = adapter.evaluateForwardPrice(specQ, baselineRates);
            const baselinePrice = baseEval.predictedManufacturingPrice;

            // Adjusted prediction
            const adjEval = adapter.evaluateForwardPrice(specQ, adjustedRates);
            const adjustedPrice = adjEval.predictedManufacturingPrice;

            const difference = Number((adjustedPrice - baselinePrice).toFixed(4));
            const differencePercent = baselinePrice > 0 ? Number(((difference / baselinePrice) * 100).toFixed(2)) : 0;

            const resObj = {
                quantity: q,
                baselinePrice,
                adjustedPrice,
                difference,
                differencePercent
            };

            // Include Quote Evidence comparison if available
            if (quotePointsMap[q] !== undefined) {
                const quotedMfg = quotePointsMap[q];
                const baseRes = Number((baselinePrice - quotedMfg).toFixed(4));
                const adjRes = Number((adjustedPrice - quotedMfg).toFixed(4));
                const absAdjRes = Math.abs(adjRes);

                resObj.quotedManufacturingPrice = quotedMfg;
                resObj.baselinePredictedPrice = baselinePrice;
                resObj.adjustedPredictedPrice = adjustedPrice;
                resObj.baselineResidual = baseRes;
                resObj.adjustedResidual = adjRes;

                sumBaselineRes += Math.abs(baseRes);
                sumAdjustedRes += absAdjRes;

                if (quotedMfg > 0) {
                    sumBaselinePctErr += (Math.abs(baseRes) / quotedMfg) * 100;
                    sumAdjustedPctErr += (absAdjRes / quotedMfg) * 100;
                }

                if (absAdjRes > maxAbsRes) {
                    maxAbsRes = absAdjRes;
                }
                validQuoteCount++;
            }

            quantityResults.push(resObj);
        }

        const metrics = validQuoteCount > 0 ? {
            validQuoteCount,
            baselineMAE: Number((sumBaselineRes / validQuoteCount).toFixed(4)),
            adjustedMAE: Number((sumAdjustedRes / validQuoteCount).toFixed(4)),
            baselineMAPE: Number((sumBaselinePctErr / validQuoteCount).toFixed(2)),
            adjustedMAPE: Number((sumAdjustedPctErr / validQuoteCount).toFixed(2)),
            maxAbsResidual: Number(maxAbsRes.toFixed(4))
        } : null;

        return {
            quantities: quantityResults,
            metrics,
            knobs: this.deriveKnobMetadata(baselineRates, bookSpec),
            sanitizedAdjustments: sanitizedAdj
        };
    }

    /**
     * Executes deterministic commercial curve fitting (Price(Q) = Fixed + Q * Marginal)
     * using Least Squares for 3+ points, exact line for 2 points, or underdetermined for 1 point.
     */
    fitCommercialCurve(params = {}) {
        const { quotePoints, quantities = [500, 600, 700], baselineRates, bookSpec } = params;

        let points = [];
        if (Array.isArray(quotePoints)) {
            points = quotePoints.map(p => ({ q: Number(p.quantity || p.q), price: Number(p.manufacturingPrice || p.price) }));
        } else if (quotePoints && typeof quotePoints === 'object') {
            points = Object.keys(quotePoints).map(k => ({ q: Number(k), price: Number(quotePoints[k]) }));
        }

        points = points.filter(p => !isNaN(p.q) && p.q > 0 && !isNaN(p.price) && p.price > 0).sort((a, b) => a.q - b.q);

        const N = points.length;

        if (N === 0) {
            return {
                identifiabilityStatus: 'NO_VALID_QUOTE_POINTS',
                commercialFixed: 0,
                commercialMarginal: 0,
                fitMetrics: null,
                suggestedAdjustments: getNeutralAdjustments()
            };
        }

        if (N === 1) {
            return {
                identifiabilityStatus: 'ONE_POINT_UNDERDETERMINED',
                commercialFixed: 0,
                commercialMarginal: 0,
                fitMetrics: null,
                suggestedAdjustments: getNeutralAdjustments()
            };
        }

        let commercialFixed = 0;
        let commercialMarginal = 0;
        let identifiabilityStatus = 'TWO_POINT_IDENTIFIED_LINEAR';

        if (N === 2) {
            const p1 = points[0];
            const p2 = points[1];
            commercialMarginal = (p2.price - p1.price) / (p2.q - p1.q);
            commercialFixed = p1.price - p1.q * commercialMarginal;
            identifiabilityStatus = 'TWO_POINT_IDENTIFIED_LINEAR';
        } else {
            // N >= 3: Least Squares fit
            identifiabilityStatus = 'MULTI_POINT_LEAST_SQUARES';
            const sumQ = points.reduce((acc, p) => acc + p.q, 0);
            const sumP = points.reduce((acc, p) => acc + p.price, 0);
            const meanQ = sumQ / N;
            const meanP = sumP / N;

            let num = 0;
            let den = 0;
            for (const p of points) {
                num += (p.q - meanQ) * (p.price - meanP);
                den += Math.pow(p.q - meanQ, 2);
            }

            commercialMarginal = den > 0 ? num / den : 0;
            commercialFixed = meanP - commercialMarginal * meanQ;
        }

        // Calculate fit predictions and residuals
        let sumRes = 0;
        let sumPctErr = 0;
        let maxRes = 0;
        let ssTot = 0;
        let ssRes = 0;
        const meanP = points.reduce((acc, p) => acc + p.price, 0) / N;

        const intervalSlopes = [];
        for (let i = 0; i < N - 1; i++) {
            const slope = (points[i + 1].price - points[i].price) / (points[i + 1].q - points[i].q);
            intervalSlopes.push({ from: points[i].q, to: points[i + 1].q, slope: Number(slope.toFixed(4)) });
        }

        // Check curvature / non-linearity across interval slopes
        let curvatureDetected = false;
        if (intervalSlopes.length >= 2) {
            const s1 = intervalSlopes[0].slope;
            const s2 = intervalSlopes[1].slope;
            if (Math.abs(s1 - s2) > 0.05) {
                curvatureDetected = true;
            }
        }

        const predictions = points.map(p => {
            const pred = Number((commercialFixed + p.q * commercialMarginal).toFixed(4));
            const res = Number((p.price - pred).toFixed(4));
            const absRes = Math.abs(res);

            sumRes += absRes;
            sumPctErr += (absRes / p.price) * 100;
            if (absRes > maxRes) maxRes = absRes;

            ssTot += Math.pow(p.price - meanP, 2);
            ssRes += Math.pow(res, 2);

            return {
                quantity: p.q,
                quotedPrice: p.price,
                fittedPrice: pred,
                residual: res
            };
        });

        const r2 = ssTot > 0 ? Math.max(0, 1 - (ssRes / ssTot)) : 1.0;
        const mae = Number((sumRes / N).toFixed(4));
        const mape = Number((sumPctErr / N).toFixed(2));

        if (curvatureDetected && mae > 15) {
            identifiabilityStatus = 'NONLINEAR_RESIDUAL_PRESENT';
        }

        // ── Compare with Baseline Curve Fit to Generate Suggested Adjustments ──
        let suggestedAdjustments = getNeutralAdjustments();

        if (baselineRates && bookSpec) {
            const basePoints = points.map(p => {
                const specQ = { ...bookSpec, copies: p.q };
                const res = adapter.evaluateForwardPrice(specQ, baselineRates);
                return { q: p.q, price: res.predictedManufacturingPrice };
            });

            // Baseline least squares fit
            const baseSumQ = basePoints.reduce((acc, p) => acc + p.q, 0);
            const baseSumP = basePoints.reduce((acc, p) => acc + p.price, 0);
            const baseMeanQ = baseSumQ / N;
            const baseMeanP = baseSumP / N;

            let baseNum = 0;
            let baseDen = 0;
            for (const p of basePoints) {
                baseNum += (p.q - baseMeanQ) * (p.price - baseMeanP);
                baseDen += Math.pow(p.q - baseMeanQ, 2);
            }

            const baseMarginal = baseDen > 0 ? baseNum / baseDen : 0;
            const baseFixed = baseMeanP - baseMarginal * baseMeanQ;

            const fixedGap = commercialFixed - baseFixed;
            const marginalMult = baseMarginal > 0 ? commercialMarginal / baseMarginal : 1.0;

            suggestedAdjustments = this.sanitizeAdjustments({
                printingSetupAdjustment: { type: 'DELTA', amount: Number((fixedGap * 0.70).toFixed(2)) },
                printingRunMultiplier: { type: 'MULTIPLIER', value: Number(marginalMult.toFixed(2)) },
                bindingSetupAdjustment: { type: 'DELTA', amount: Number((fixedGap * 0.30).toFixed(2)) }
            });
        }

        return {
            identifiabilityStatus,
            curvatureDetected,
            intervalSlopes,
            commercialFixed: Number(commercialFixed.toFixed(4)),
            commercialMarginal: Number(commercialMarginal.toFixed(4)),
            fitMetrics: {
                r2: Number(r2.toFixed(4)),
                mae,
                mape,
                maxResidual: Number(maxRes.toFixed(4))
            },
            predictions,
            suggestedAdjustments
        };
    }
}

module.exports = new CommercialKnobService();
