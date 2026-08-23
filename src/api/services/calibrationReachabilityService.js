/**
 * src/api/services/calibrationReachabilityService.js
 *
 * Phase 193H.8C.6.13.2.5D — Pre-Calibration Reachability Gate Service.
 *
 * Operational Mode: Strictly READ-ONLY (Zero DB mutations).
 *
 * Responsibilities:
 * 1. Validates candidate BookSpec and commercial targets before session creation.
 * 2. Resolves current live rates snapshot, checksum, and active pricing revision.
 * 3. Resolves historically established locked paths via calibrationEstablishedPathsService.
 * 4. Extracts canonical active rate paths and partitions them into locked vs calibratable.
 * 5. Validates zero-anchor status (fails closed on unqualified calibratable zeros).
 * 6. Evaluates forward price at baseline, lower search bound (scaleMin = 0.05), and upper search bound (scaleMax = 10.0).
 * 7. Classifies reachability:
 *    - REACHABLE: minimumReachablePrice <= target <= maximumReachablePrice
 *    - BELOW_REACHABLE_FLOOR: target < minimumReachablePrice
 *    - ABOVE_REACHABLE_CEILING: target > maximumReachablePrice
 *    - BLOCKED: fail-closed on contract, checksum, lineage, or zero-anchor violations.
 */
const db = require('./mysqlClient');
const calibrationSessionService = require('./calibrationSessionService');
const calibrationEstablishedPathsService = require('./calibrationEstablishedPathsService');
const solver = require('./deterministicInversePricingSolver');
const adapter = require('./buildPriceCalibrationAdapter');
const logger = require('./logger').child('calibration-reachability');

const SOLVER_CONFIG = {
    scaleMin: 0.05,
    scaleMax: 10.0,
    toleranceAbsEur: 0.05,
    tolerancePct: 0.01
};

class CalibrationReachabilityService {

    /**
     * Deterministic, side-effect free reachability analysis for a candidate calibration.
     * @param {Object} input
     * @param {string} input.tenantId - Tenant identifier
     * @param {string} input.printerNodeId - Printer node identifier
     * @param {Object} input.bookSpec - Physical book specification
     * @param {number} input.targetManufacturingPrice - Commercial target manufacturing price
     * @param {string} input.currency - Currency code (e.g. 'EUR')
     * @param {number} [input.transportPricePerKg] - Optional transport reference
     * @param {Object} [input.commercialFlags] - Optional inclusion flags
     * @param {Object} [input.overrideRates] - Optional in-memory rates snapshot (for offline tests)
     * @param {Object} [input.overrideNodeConfig] - Optional node configuration (for offline tests)
     * @param {Array<string>} [input.overrideLockedPaths] - Optional locked paths (for offline tests)
     * @returns {Promise<Object>} Reachability report
     */
    async analyzeReachability(input) {
        const {
            tenantId,
            printerNodeId,
            bookSpec,
            targetManufacturingPrice,
            currency,
            overrideRates,
            overrideNodeConfig,
            overrideLockedPaths
        } = input || {};

        // 1. Fail-closed contract validation
        if (!tenantId || !printerNodeId || !bookSpec || targetManufacturingPrice === undefined || targetManufacturingPrice === null) {
            return this.buildBlockedResult('MISSING_REQUIRED_INPUT_FIELDS', 'tenantId, printerNodeId, bookSpec, and targetManufacturingPrice are required', input);
        }

        const targetPriceNum = Number(targetManufacturingPrice);
        if (!Number.isFinite(targetPriceNum) || targetPriceNum <= 0) {
            return this.buildBlockedResult('INVALID_TARGET_PRICE', 'Target manufacturing price must be a finite positive number', input);
        }

        const bookSpecValidation = calibrationSessionService.validateBookSpec(bookSpec);
        if (!bookSpecValidation.valid) {
            return this.buildBlockedResult('INVALID_BOOK_SPEC', bookSpecValidation.errors.join('; '), input);
        }

        try {
            // 2. Resolve live rates snapshot and node configuration
            let liveRates = overrideRates || null;
            let nodeConfig = overrideNodeConfig || null;
            let activeRevisionId = null;

            if (!liveRates || !nodeConfig) {
                const nodeRows = await db.query(
                    `SELECT id, name, tenant_id, signatures, limits, production_lead_days, delivery_time, rates_json
                     FROM printer_nodes
                     WHERE id = ? AND tenant_id = ?`,
                    [printerNodeId, tenantId]
                );

                if (!nodeRows || nodeRows.length === 0) {
                    return this.buildBlockedResult('PRINTER_NODE_NOT_FOUND', `Printer node ${printerNodeId} not found for tenant ${tenantId}`, input);
                }

                const nodeRow = nodeRows[0];
                liveRates = typeof nodeRow.rates_json === 'string' ? JSON.parse(nodeRow.rates_json) : nodeRow.rates_json;
                nodeConfig = {
                    id: nodeRow.id,
                    name: nodeRow.name,
                    signatures: nodeRow.signatures ? (typeof nodeRow.signatures === 'string' ? JSON.parse(nodeRow.signatures) : nodeRow.signatures) : [16],
                    production_lead_days: nodeRow.production_lead_days || 7,
                    shipping_days: nodeRow.delivery_time || 2
                };

                // Fetch latest active revision ID for metadata
                const revRows = await db.query(
                    `SELECT id FROM printhouse_pricing_revisions
                     WHERE tenant_id = ? AND printer_node_id = ?
                     ORDER BY created_at DESC, id DESC LIMIT 1`,
                    [tenantId, printerNodeId]
                );
                if (revRows && revRows.length > 0) {
                    activeRevisionId = revRows[0].id;
                }
            }

            if (!liveRates || typeof liveRates !== 'object' || Object.keys(liveRates).length === 0) {
                return this.buildBlockedResult('NO_RATES_AVAILABLE', 'Node rates_json is empty or not configured', input);
            }

            // 3. Checksum verification
            const currentRatesChecksum = calibrationSessionService.computeRatesChecksum(liveRates);

            // 4. Resolve historically established locked paths
            let lockedRatePaths = [];
            if (Array.isArray(overrideLockedPaths)) {
                lockedRatePaths = overrideLockedPaths;
            } else {
                try {
                    lockedRatePaths = await calibrationEstablishedPathsService.resolveLockedPaths(
                        tenantId,
                        printerNodeId,
                        currentRatesChecksum
                    );
                } catch (lineageErr) {
                    return this.buildBlockedResult('REVISION_LINEAGE_FAILED', lineageErr.message, input, { currentRatesChecksum });
                }
            }

            // 5. Initial Forward Price & Active Paths Extraction
            let initialForward;
            try {
                initialForward = adapter.evaluateForwardPrice(bookSpec, liveRates, {}, nodeConfig);
            } catch (fwdErr) {
                return this.buildBlockedResult('FORWARD_EVALUATION_FAILED', fwdErr.message, input, { currentRatesChecksum });
            }

            const sigOptions = {
                signatureSize: initialForward.signature,
                sectionsCount: initialForward.sections
            };

            const activeRatePaths = solver.extractActiveRatePaths(bookSpec, sigOptions);
            const lockedActiveRatePaths = activeRatePaths.filter(path => lockedRatePaths.includes(path)).sort();
            const calibratableRatePaths = activeRatePaths.filter(path => !lockedRatePaths.includes(path)).sort();

            // 6. Base active rates derivation & Zero-Anchor Governance Validation
            const p = adapter.adaptBookSpec(bookSpec, sigOptions);
            const sigKey = `${p.signatureSize}p`;
            const secKey = String(Math.min(24, Math.max(1, p.sectionsCount)));

            const intFixedKey = `interior_${p.interiorColorKey}_colour_fixed`;
            const intVarKey = `interior_${p.interiorColorKey}_colour_var`;
            const bindFixedKey = `binding_${p.bindingCode}_fixed_by_sections`;
            const bindVarKey = `binding_${p.bindingCode}_var_per_1000_by_sections`;

            let bindFixedPrior = null;
            let bindVarPrior = null;
            if (p.bindingCode === 'pb') {
                bindFixedPrior = 0.164;
                bindVarPrior = 14.7;
            }

            const unqualifiedZeroAnchors = [];
            const baseActive = {};

            const checkAndResolveRate = (pathKey, subKey, safePrior, isEssential = false) => {
                const pathString = `${pathKey}.${subKey}`;
                const isPathLocked = lockedActiveRatePaths.includes(pathString);
                const container = liveRates[pathKey];
                const hasExplicitValue = container !== undefined && container[subKey] !== undefined;
                const numericVal = hasExplicitValue ? Number(container[subKey]) : undefined;

                if (isPathLocked) {
                    if (!hasExplicitValue || !Number.isFinite(numericVal)) {
                        throw new Error(`LOCKED_RATE_MISSING_OR_INVALID: ${pathString}`);
                    }
                    return numericVal;
                }

                // Calibratable path checks
                if (hasExplicitValue && numericVal === 0 && isEssential) {
                    if (safePrior !== undefined && safePrior !== null && safePrior > 0) {
                        return safePrior; // Zero anchor promoted via safe prior
                    }
                    unqualifiedZeroAnchors.push(pathString);
                    return 0;
                }

                if (hasExplicitValue) {
                    return numericVal;
                }

                if (safePrior !== undefined && safePrior !== null) {
                    return safePrior;
                }

                throw new Error(`MISSING_ACTIVE_RATE_NO_SAFE_PRIOR: ${pathString}`);
            };

            try {
                baseActive[intFixedKey] = checkAndResolveRate(intFixedKey, sigKey, 80.31, true);
                baseActive[intVarKey] = checkAndResolveRate(intVarKey, sigKey, 8.12, true);
                baseActive.cover_fixed_by_colours = checkAndResolveRate('cover_fixed_by_colours', p.coverColorKey, 40.0, true);
                baseActive.cover_var_per_1000_by_colours = checkAndResolveRate('cover_var_per_1000_by_colours', p.coverColorKey, 800.0, true);
                baseActive[bindFixedKey] = checkAndResolveRate(bindFixedKey, secKey, bindFixedPrior, true);
                baseActive[bindVarKey] = checkAndResolveRate(bindVarKey, secKey, bindVarPrior, true);
                baseActive.paper_price_interior_by_kilo = checkAndResolveRate('paper_price_interior_by_kilo', p.paperTypeInterior, 1.252, true);
                baseActive.paper_price_cover_by_kilo = checkAndResolveRate('paper_price_cover_by_kilo', p.paperTypeCover, 2.515, true);

                if (p.laminationType) {
                    baseActive.lam_fixed = checkAndResolveRate('lam_fixed', p.laminationType, 6.0, true);
                    baseActive.lam_var_per_1000 = checkAndResolveRate('lam_var_per_1000', p.laminationType, 25.0, true);
                }
                if (p.uvVarnishActive) {
                    baseActive.uv_fixed = checkAndResolveRate('uv_varnish', 'fixed', 0.0, false);
                    baseActive.uv_var = checkAndResolveRate('uv_varnish', 'var', 0.0, false);
                }
                if (p.endpapers && p.endpapers !== 'none') {
                    const epPrint = String(p.endpapersPrint || '4/0');
                    const hasSlash = epPrint.includes('/');
                    const frontCols = hasSlash ? parseInt(epPrint.split('/')[0] || '0', 10) : 0;
                    const revCols = hasSlash ? parseInt(epPrint.split('/')[1] || '0', 10) : 0;

                    if (frontCols >= 1 && frontCols <= 5) {
                        baseActive[`endpaper_fixed_by_colours.${frontCols}`] = checkAndResolveRate('endpaper_fixed_by_colours', frontCols, null, true);
                        baseActive[`endpaper_var_per_1000_by_colours.${frontCols}`] = checkAndResolveRate('endpaper_var_per_1000_by_colours', frontCols, null, true);
                    }
                    if (revCols >= 1 && revCols <= 5) {
                        baseActive[`endpaper_fixed_by_colours.${revCols}`] = checkAndResolveRate('endpaper_fixed_by_colours', revCols, null, true);
                        baseActive[`endpaper_var_per_1000_by_colours.${revCols}`] = checkAndResolveRate('endpaper_var_per_1000_by_colours', revCols, null, true);
                    }

                    let printMode = 'one';
                    if (frontCols === 1) printMode = 'two';
                    else if ([2, 3, 4].includes(frontCols)) printMode = 'full';
                    else if (frontCols === 0) printMode = 'one';

                    baseActive.paper_endpapers_fixed_by_colours = checkAndResolveRate('paper_endpapers_fixed_by_colours', printMode, null, true);
                    baseActive.paper_endpapers_var_per_1000_by_colours = checkAndResolveRate('paper_endpapers_var_per_1000_by_colours', printMode, null, true);
                    baseActive.paper_price_endpaper_by_kilo = checkAndResolveRate('paper_price_endpaper_by_kilo', p.paperTypeEndpaper || 'offset', null, true);
                }
            } catch (rateResolveErr) {
                return this.buildBlockedResult('ACTIVE_RATE_RESOLUTION_FAILED', rateResolveErr.message, input, {
                    currentRatesChecksum,
                    activeRatePaths,
                    lockedRatePaths: lockedActiveRatePaths,
                    calibratableRatePaths
                });
            }

            // 7. Fail-closed if there are unqualified zero anchors on calibratable paths
            if (unqualifiedZeroAnchors.length > 0) {
                return this.buildBlockedResult('UNQUALIFIED_ZERO_ANCHOR', `Calibratable rate paths contain unqualified zero anchors: ${unqualifiedZeroAnchors.join(', ')}`, input, {
                    currentRatesChecksum,
                    unqualifiedZeroAnchors,
                    activeRatePaths,
                    lockedRatePaths: lockedActiveRatePaths,
                    calibratableRatePaths
                });
            }

            const activeRateKeyToPath = {
                [intFixedKey]: `${intFixedKey}.${sigKey}`,
                [intVarKey]: `${intVarKey}.${sigKey}`,
                cover_fixed_by_colours: `cover_fixed_by_colours.${p.coverColorKey}`,
                cover_var_per_1000_by_colours: `cover_var_per_1000_by_colours.${p.coverColorKey}`,
                [bindFixedKey]: `${bindFixedKey}.${secKey}`,
                [bindVarKey]: `${bindVarKey}.${secKey}`,
                paper_price_interior_by_kilo: `paper_price_interior_by_kilo.${p.paperTypeInterior}`,
                paper_price_cover_by_kilo: `paper_price_cover_by_kilo.${p.paperTypeCover}`
            };
            if (p.laminationType) {
                activeRateKeyToPath.lam_fixed = `lam_fixed.${p.laminationType}`;
                activeRateKeyToPath.lam_var_per_1000 = `lam_var_per_1000.${p.laminationType}`;
            }
            if (p.uvVarnishActive) {
                activeRateKeyToPath.uv_fixed = 'uv_varnish.fixed';
                activeRateKeyToPath.uv_var = 'uv_varnish.var';
            }
            if (p.endpapers && p.endpapers !== 'none') {
                const epPrint = String(p.endpapersPrint || '4/0');
                const hasSlash = epPrint.includes('/');
                const frontCols = hasSlash ? parseInt(epPrint.split('/')[0] || '0', 10) : 0;
                const revCols = hasSlash ? parseInt(epPrint.split('/')[1] || '0', 10) : 0;

                if (frontCols >= 1 && frontCols <= 5) {
                    activeRateKeyToPath[`endpaper_fixed_by_colours.${frontCols}`] = `endpaper_fixed_by_colours.${frontCols}`;
                    activeRateKeyToPath[`endpaper_var_per_1000_by_colours.${frontCols}`] = `endpaper_var_per_1000_by_colours.${frontCols}`;
                }
                if (revCols >= 1 && revCols <= 5) {
                    activeRateKeyToPath[`endpaper_fixed_by_colours.${revCols}`] = `endpaper_fixed_by_colours.${revCols}`;
                    activeRateKeyToPath[`endpaper_var_per_1000_by_colours.${revCols}`] = `endpaper_var_per_1000_by_colours.${revCols}`;
                }

                let printMode = 'one';
                if (frontCols === 1) printMode = 'two';
                else if ([2, 3, 4].includes(frontCols)) printMode = 'full';
                else if (frontCols === 0) printMode = 'one';

                activeRateKeyToPath.paper_endpapers_fixed_by_colours = `paper_endpapers_fixed_by_colours.${printMode}`;
                activeRateKeyToPath.paper_endpapers_var_per_1000_by_colours = `paper_endpapers_var_per_1000_by_colours.${printMode}`;
                activeRateKeyToPath.paper_price_endpaper_by_kilo = `paper_price_endpaper_by_kilo.${p.paperTypeEndpaper || 'offset'}`;
            }

            const isLockedActiveKey = key => lockedActiveRatePaths.includes(activeRateKeyToPath[key]);

            // 8. Reachable Boundary Calculations
            const currentPrice = initialForward.predictedManufacturingPrice;

            let minimumReachablePrice = currentPrice;
            let maximumReachablePrice = currentPrice;

            if (calibratableRatePaths.length > 0) {
                // Construct patch at scaleMin (0.05)
                const minCandidateActive = {};
                for (const [k, v] of Object.entries(baseActive)) {
                    minCandidateActive[k] = isLockedActiveKey(k) ? v : Number((v * SOLVER_CONFIG.scaleMin).toFixed(4));
                }
                const minPatch = solver.buildPatchFromActiveRates(bookSpec, minCandidateActive, sigOptions);
                for (const lockedPath of lockedActiveRatePaths) {
                    const dot = lockedPath.lastIndexOf('.');
                    const parentKey = lockedPath.slice(0, dot);
                    const leafKey = lockedPath.slice(dot + 1);
                    if (minPatch[parentKey] && typeof minPatch[parentKey] === 'object') {
                        delete minPatch[parentKey][leafKey];
                        if (Object.keys(minPatch[parentKey]).length === 0) delete minPatch[parentKey];
                    }
                }
                const minForward = adapter.evaluateForwardPrice(bookSpec, liveRates, minPatch, nodeConfig);
                minimumReachablePrice = minForward.predictedManufacturingPrice;

                // Construct patch at scaleMax (10.0)
                const maxCandidateActive = {};
                for (const [k, v] of Object.entries(baseActive)) {
                    maxCandidateActive[k] = isLockedActiveKey(k) ? v : Number((v * SOLVER_CONFIG.scaleMax).toFixed(4));
                }
                const maxPatch = solver.buildPatchFromActiveRates(bookSpec, maxCandidateActive, sigOptions);
                for (const lockedPath of lockedActiveRatePaths) {
                    const dot = lockedPath.lastIndexOf('.');
                    const parentKey = lockedPath.slice(0, dot);
                    const leafKey = lockedPath.slice(dot + 1);
                    if (maxPatch[parentKey] && typeof maxPatch[parentKey] === 'object') {
                        delete maxPatch[parentKey][leafKey];
                        if (Object.keys(maxPatch[parentKey]).length === 0) delete maxPatch[parentKey];
                    }
                }
                const maxForward = adapter.evaluateForwardPrice(bookSpec, liveRates, maxPatch, nodeConfig);
                maximumReachablePrice = maxForward.predictedManufacturingPrice;
            }

            // 9. Reachability Classification
            let status = 'REACHABLE';
            let absoluteDistanceToReachableRange = 0.0;

            if (targetPriceNum < minimumReachablePrice) {
                status = 'BELOW_REACHABLE_FLOOR';
                absoluteDistanceToReachableRange = Number((minimumReachablePrice - targetPriceNum).toFixed(4));
            } else if (targetPriceNum > maximumReachablePrice) {
                status = 'ABOVE_REACHABLE_CEILING';
                absoluteDistanceToReachableRange = Number((targetPriceNum - maximumReachablePrice).toFixed(4));
            } else {
                status = 'REACHABLE';
                absoluteDistanceToReachableRange = 0.0;
            }

            return {
                status,
                targetPrice: targetPriceNum,
                currency: currency || 'EUR',
                currentPrice: Number(currentPrice.toFixed(4)),
                minimumReachablePrice: Number(minimumReachablePrice.toFixed(4)),
                maximumReachablePrice: Number(maximumReachablePrice.toFixed(4)),
                absoluteDistanceToReachableRange,
                activeRatePaths,
                lockedRatePaths: lockedActiveRatePaths,
                calibratableRatePaths,
                activePathCount: activeRatePaths.length,
                lockedPathCount: lockedActiveRatePaths.length,
                calibratablePathCount: calibratableRatePaths.length,
                unqualifiedZeroAnchors: [],
                currentRatesChecksum,
                activeRevisionId,
                solverBounds: {
                    scaleMin: SOLVER_CONFIG.scaleMin,
                    scaleMax: SOLVER_CONFIG.scaleMax
                },
                diagnostics: {
                    allPathsLocked: calibratableRatePaths.length === 0,
                    degreesOfFreedom: calibratableRatePaths.length,
                    signature: sigOptions.signatureSize,
                    sections: sigOptions.sectionsCount
                }
            };
        } catch (err) {
            logger.error({
                event: 'calibration_reachability_unexpected_error',
                error: err.message,
                stack: err.stack,
                tenantId,
                printerNodeId
            });
            return this.buildBlockedResult('UNEXPECTED_ANALYSIS_ERROR', err.message, input);
        }
    }

    buildBlockedResult(reasonCode, message, input, extra = {}) {
        return {
            status: 'BLOCKED',
            reasonCode,
            message,
            targetPrice: input?.targetManufacturingPrice ? Number(input.targetManufacturingPrice) : null,
            currency: input?.currency || 'EUR',
            currentPrice: null,
            minimumReachablePrice: null,
            maximumReachablePrice: null,
            absoluteDistanceToReachableRange: null,
            activeRatePaths: extra.activeRatePaths || [],
            lockedRatePaths: extra.lockedRatePaths || [],
            calibratableRatePaths: extra.calibratableRatePaths || [],
            activePathCount: extra.activeRatePaths ? extra.activeRatePaths.length : 0,
            lockedPathCount: extra.lockedRatePaths ? extra.lockedRatePaths.length : 0,
            calibratablePathCount: extra.calibratableRatePaths ? extra.calibratableRatePaths.length : 0,
            unqualifiedZeroAnchors: extra.unqualifiedZeroAnchors || [],
            currentRatesChecksum: extra.currentRatesChecksum || null,
            activeRevisionId: null,
            solverBounds: {
                scaleMin: SOLVER_CONFIG.scaleMin,
                scaleMax: SOLVER_CONFIG.scaleMax
            },
            diagnostics: {
                blocked: true,
                reasonCode
            }
        };
    }
}

module.exports = new CalibrationReachabilityService();
