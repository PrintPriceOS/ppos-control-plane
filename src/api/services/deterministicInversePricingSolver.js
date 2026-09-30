/**
 * src/api/services/deterministicInversePricingSolver.js
 *
 * Phase 193C — Deterministic Inverse Pricing Solver.
 *
 * Mathematical Properties & Domain Invariants:
 * 1. UNDERDETERMINED SYSTEM: A single reference book does NOT uniquely identify
 *    underlying setup vs variable rates.
 * 2. PRIOR-ANCHORED CALIBRATION: The output is an explicitly anchored candidate
 *    configuration around the immutable snapshot θ0.
 * 3. DETERMINISM: Uses strictly monotonic binary search for proportional scale α*,
 *    followed by bounded coordinate refinement.
 * 4. ISOLATION: Operates entirely in memory via BuildPriceCalibrationAdapter.
 * 5. NO RANDOMNESS: Zero Math.random(), zero stochastic iterations.
 */
const adapter = require('./buildPriceCalibrationAdapter');
const calibrationSessionService = require('./calibrationSessionService');
const { computeGovernanceTolerance } = require('./calibrationGovernanceTolerances');

// Governed Search Bounds & Convergence Tolerances
const SOLVER_CONFIG = {
    version: '193C_v1_deterministic',
    scaleMin: 0.05,
    scaleMax: 10.0,
    binarySearchMaxIter: 30,
    toleranceAbsEur: 0.05,        // 5 cents absolute error tolerance
    tolerancePct: 0.01,           // 0.01% relative error tolerance
    maxTotalEvaluations: 100,
    priorRegularizationLambda: 0.001
};

class DeterministicInversePricingSolver {

    /**
     * Identifies the active rate card paths participating in the reference book job.
     * Transport is strictly excluded from manufacturing active paths.
     */
    /**
     * Identifies the active rate card paths participating in the reference book job.
     * Transport is strictly excluded from manufacturing active paths.
     */
    extractActiveRatePaths(bookSpec, options = {}) {
        const p = adapter.adaptBookSpec(bookSpec, options);
        const sigKey = `${p.signatureSize}p`;
        const secKey = String(Math.min(24, Math.max(1, p.sectionsCount)));

        const paths = [
            `interior_${p.interiorColorKey}_colour_fixed.${sigKey}`,
            `interior_${p.interiorColorKey}_colour_var.${sigKey}`,
            `cover_fixed_by_colours.${p.coverColorKey}`,
            `cover_var_per_1000_by_colours.${p.coverColorKey}`,
            `binding_${p.bindingCode}_fixed_by_sections.${secKey}`,
            `binding_${p.bindingCode}_var_per_1000_by_sections.${secKey}`,
            `paper_price_interior_by_kilo.${p.paperTypeInterior}`,
            `paper_price_cover_by_kilo.${p.paperTypeCover}`
        ];

        if (p.laminationType) {
            paths.push(`lam_fixed.${p.laminationType}`);
            paths.push(`lam_var_per_1000.${p.laminationType}`);
        }
        if (p.uvVarnishActive) {
            paths.push('uv_varnish.fixed');
            paths.push('uv_varnish.var');
        }

        // Endpapers (active only when endpapers is not 'none')
        if (p.endpapers && p.endpapers !== 'none') {
            const epPrint = String(p.endpapersPrint || '4/0');
            const hasSlash = epPrint.includes('/');
            const frontCols = hasSlash ? parseInt(epPrint.split('/')[0] || '0', 10) : 0;
            const revCols = hasSlash ? parseInt(epPrint.split('/')[1] || '0', 10) : 0;

            // Endpaper print colors (front & reverse if > 0)
            if (frontCols >= 1 && frontCols <= 5) {
                paths.push(`endpaper_fixed_by_colours.${frontCols}`);
                paths.push(`endpaper_var_per_1000_by_colours.${frontCols}`);
            }
            if (revCols >= 1 && revCols <= 5) {
                paths.push(`endpaper_fixed_by_colours.${revCols}`);
                paths.push(`endpaper_var_per_1000_by_colours.${revCols}`);
            }

            // Paper sheets print mode for endpaper paper waste
            let printMode = 'one';
            if (frontCols === 1) printMode = 'two';
            else if ([2, 3, 4].includes(frontCols)) printMode = 'full';
            else if (frontCols === 0) printMode = 'one';

            paths.push(`paper_endpapers_fixed_by_colours.${printMode}`);
            paths.push(`paper_endpapers_var_per_1000_by_colours.${printMode}`);
            paths.push(`paper_price_endpaper_by_kilo.${p.paperTypeEndpaper || 'offset'}`);
        }

        return Array.from(new Set(paths)).sort(); // Deterministic deduplicated ordering
    }

    /**
     * Builds candidate overrides JSON from an active rate map.
     * Manufacturing rates ONLY. Transport is never patched into rates_json.
     */
    buildPatchFromActiveRates(bookSpec, activeRates, options = {}) {
        const p = adapter.adaptBookSpec(bookSpec, options);
        const sigKey = `${p.signatureSize}p`;
        const secKey = String(Math.min(24, Math.max(1, p.sectionsCount)));

        const patch = {};

        // Interior
        const intFixedKey = `interior_${p.interiorColorKey}_colour_fixed`;
        const intVarKey = `interior_${p.interiorColorKey}_colour_var`;
        if (activeRates[intFixedKey] !== undefined) patch[intFixedKey] = { [sigKey]: activeRates[intFixedKey] };
        if (activeRates[intVarKey] !== undefined) patch[intVarKey] = { [sigKey]: activeRates[intVarKey] };

        // Cover
        if (activeRates.cover_fixed_by_colours !== undefined) patch.cover_fixed_by_colours = { [p.coverColorKey]: activeRates.cover_fixed_by_colours };
        if (activeRates.cover_var_per_1000_by_colours !== undefined) patch.cover_var_per_1000_by_colours = { [p.coverColorKey]: activeRates.cover_var_per_1000_by_colours };

        // Binding
        const bindFixedKey = `binding_${p.bindingCode}_fixed_by_sections`;
        const bindVarKey = `binding_${p.bindingCode}_var_per_1000_by_sections`;
        if (activeRates[bindFixedKey] !== undefined) patch[bindFixedKey] = { [secKey]: activeRates[bindFixedKey] };
        if (activeRates[bindVarKey] !== undefined) patch[bindVarKey] = { [secKey]: activeRates[bindVarKey] };

        // Paper
        if (activeRates.paper_price_interior_by_kilo !== undefined) patch.paper_price_interior_by_kilo = { [p.paperTypeInterior]: activeRates.paper_price_interior_by_kilo };
        if (activeRates.paper_price_cover_by_kilo !== undefined) patch.paper_price_cover_by_kilo = { [p.paperTypeCover]: activeRates.paper_price_cover_by_kilo };

        // Lamination / UV
        if (p.laminationType && activeRates.lam_fixed !== undefined) {
            patch.lam_fixed = { [p.laminationType]: activeRates.lam_fixed };
            patch.lam_var_per_1000 = { [p.laminationType]: activeRates.lam_var_per_1000 };
        }
        if (p.uvVarnishActive && activeRates.uv_fixed !== undefined) {
            patch.uv_varnish = { fixed: activeRates.uv_fixed, var: activeRates.uv_var };
        }

        // Endpapers
        if (p.endpapers && p.endpapers !== 'none') {
            const epPrint = String(p.endpapersPrint || '4/0');
            const hasSlash = epPrint.includes('/');
            const frontCols = hasSlash ? parseInt(epPrint.split('/')[0] || '0', 10) : 0;
            const revCols = hasSlash ? parseInt(epPrint.split('/')[1] || '0', 10) : 0;

            if (frontCols >= 1 && frontCols <= 5) {
                if (activeRates[`endpaper_fixed_by_colours.${frontCols}`] !== undefined) {
                    patch.endpaper_fixed_by_colours = Object.assign(patch.endpaper_fixed_by_colours || {}, { [frontCols]: activeRates[`endpaper_fixed_by_colours.${frontCols}`] });
                }
                if (activeRates[`endpaper_var_per_1000_by_colours.${frontCols}`] !== undefined) {
                    patch.endpaper_var_per_1000_by_colours = Object.assign(patch.endpaper_var_per_1000_by_colours || {}, { [frontCols]: activeRates[`endpaper_var_per_1000_by_colours.${frontCols}`] });
                }
            }
            if (revCols >= 1 && revCols <= 5) {
                if (activeRates[`endpaper_fixed_by_colours.${revCols}`] !== undefined) {
                    patch.endpaper_fixed_by_colours = Object.assign(patch.endpaper_fixed_by_colours || {}, { [revCols]: activeRates[`endpaper_fixed_by_colours.${revCols}`] });
                }
                if (activeRates[`endpaper_var_per_1000_by_colours.${revCols}`] !== undefined) {
                    patch.endpaper_var_per_1000_by_colours = Object.assign(patch.endpaper_var_per_1000_by_colours || {}, { [revCols]: activeRates[`endpaper_var_per_1000_by_colours.${revCols}`] });
                }
            }

            let printMode = 'one';
            if (frontCols === 1) printMode = 'two';
            else if ([2, 3, 4].includes(frontCols)) printMode = 'full';
            else if (frontCols === 0) printMode = 'one';

            if (activeRates.paper_endpapers_fixed_by_colours !== undefined) {
                patch.paper_endpapers_fixed_by_colours = { [printMode]: activeRates.paper_endpapers_fixed_by_colours };
            }
            if (activeRates.paper_endpapers_var_per_1000_by_colours !== undefined) {
                patch.paper_endpapers_var_per_1000_by_colours = { [printMode]: activeRates.paper_endpapers_var_per_1000_by_colours };
            }
            if (activeRates.paper_price_endpaper_by_kilo !== undefined) {
                patch.paper_price_endpaper_by_kilo = { [p.paperTypeEndpaper || 'offset']: activeRates.paper_price_endpaper_by_kilo };
            }
        }

        return patch;
    }

    /**
     * Solves the inverse calibration problem deterministically around baseline snapshot θ0.
     * Evaluates MANUFACTURING COST ONLY. Transport price per kg is informational and decoupled.
     *
     * @param {Object} session - Calibration session (bookSpec, targets, snapshot)
     * @param {Object} [nodeConfig] - Optional printer node configuration
     * @param {Object} [options] - Calibration solver options
     * @returns {Object} Solution result with residuals, candidate patch, and provenance
     */
    solve(session, nodeConfig = {}, options = {}) {
        const rawTargets = options.calibrationTargets || session.calibrationTargets || session.multiTargets;
        if (Array.isArray(rawTargets) && rawTargets.length >= 2) {
            return this.solveMultiQuantity(session, nodeConfig, options);
        }

        const startTime = Date.now();
        const bookSpec = session.bookSpec;
        const snapshot = session.currentRatesSnapshot || {};
        const targetMfgPrice = Number(session.targetManufacturingPrice);
        const referenceTransPricePerKg = session.transportPricePerKg !== null && session.transportPricePerKg !== undefined
            ? Number(session.transportPricePerKg) : null;

        if (!bookSpec || isNaN(targetMfgPrice) || targetMfgPrice <= 0) {
            throw new Error('INVALID_CALIBRATION_INPUTS');
        }

        let evaluationCount = 0;

        // 1. Initial Evaluation at baseline θ0 (before calibration)
        const initialForward = adapter.evaluateForwardPrice(bookSpec, snapshot, {}, nodeConfig);
        evaluationCount++;
        const priceBefore = initialForward.predictedManufacturingPrice;

        // Derived signature and section options from canonical BPE forward evaluation
        const sigOptions = {
            signatureSize: initialForward.signature,
            sectionsCount: initialForward.sections
        };

        const activeRatePaths = this.extractActiveRatePaths(bookSpec, sigOptions);
        const requestedLockedPaths = Array.isArray(options.lockedRatePaths) ? options.lockedRatePaths : [];
        const lockedRatePaths = activeRatePaths.filter(path => requestedLockedPaths.includes(path)).sort();
        const calibratableRatePaths = activeRatePaths.filter(path => lockedRatePaths.indexOf(path) === -1).sort();

        // 2. Base Active Rates Extraction & Prior Validation
        const p = adapter.adaptBookSpec(bookSpec, sigOptions);
        const sigKey = `${p.signatureSize}p`;
        const secKey = String(Math.min(24, Math.max(1, p.sectionsCount)));

        const intFixedKey = `interior_${p.interiorColorKey}_colour_fixed`;
        const intVarKey = `interior_${p.interiorColorKey}_colour_var`;
        const bindFixedKey = `binding_${p.bindingCode}_fixed_by_sections`;
        const bindVarKey = `binding_${p.bindingCode}_var_per_1000_by_sections`;

        // Family-specific binding priors: PB is historically governed (0.164, 14.7). Other families do NOT inherit PB priors.
        let bindFixedPrior = null;
        let bindVarPrior = null;
        if (p.bindingCode === 'pb') {
            bindFixedPrior = 0.164;
            bindVarPrior = 14.7;
        }

        const priorsUsed = [];
        const resolveActiveRate = (pathKey, subKey, safePrior, isEssential = false) => {
            const pathString = `${pathKey}.${subKey}`;
            const isPathLocked = lockedRatePaths.includes(pathString);
            const container = snapshot[pathKey];
            const hasExplicitValue = container !== undefined && container[subKey] !== undefined;
            const numericVal = hasExplicitValue ? Number(container[subKey]) : undefined;

            // If historically locked, preserve exact baseline value without injecting priors or failing on 0
            if (isPathLocked) {
                if (!hasExplicitValue || !Number.isFinite(numericVal)) {
                    const err = new Error(`LOCKED_RATE_MISSING_OR_INVALID: ${pathString}`);
                    err.code = 'LOCKED_RATE_MISSING_OR_INVALID';
                    err.ratePath = pathString;
                    throw err;
                }
                return numericVal;
            }

            // For calibratable rates:
            // Check if rate is explicitly 0 for an essential physical component
            if (hasExplicitValue && numericVal === 0 && isEssential) {
                if (safePrior !== undefined && safePrior !== null && safePrior > 0) {
                    priorsUsed.push({
                        path: pathString,
                        originalValue: 0,
                        priorValue: safePrior,
                        reason: 'ZERO_ANCHOR_PROMOTION'
                    });
                    return safePrior;
                }
                // Fail-closed if an essential calibratable path is zero with no governed prior
                const err = new Error(`UNQUALIFIED_ZERO_ANCHOR: ${pathString}`);
                err.code = 'UNQUALIFIED_ZERO_ANCHOR';
                err.ratePath = pathString;
                throw err;
            }

            if (hasExplicitValue) {
                return numericVal;
            }

            if (safePrior !== undefined && safePrior !== null) {
                priorsUsed.push({
                    path: pathString,
                    originalValue: null,
                    priorValue: safePrior,
                    reason: 'MISSING_RATE_PRIOR'
                });
                return safePrior;
            }

            const err = new Error(`MISSING_ACTIVE_RATE_NO_SAFE_PRIOR: ${pathString}`);
            err.code = 'MISSING_ACTIVE_RATE_NO_SAFE_PRIOR';
            err.ratePath = pathString;
            throw err;
        };

        const baseActive = {
            [intFixedKey]: resolveActiveRate(intFixedKey, sigKey, 80.31, true),
            [intVarKey]: resolveActiveRate(intVarKey, sigKey, 8.12, true),
            cover_fixed_by_colours: resolveActiveRate('cover_fixed_by_colours', p.coverColorKey, 40.0, true),
            cover_var_per_1000_by_colours: resolveActiveRate('cover_var_per_1000_by_colours', p.coverColorKey, 800.0, true),
            [bindFixedKey]: resolveActiveRate(bindFixedKey, secKey, bindFixedPrior, true),
            [bindVarKey]: resolveActiveRate(bindVarKey, secKey, bindVarPrior, true),
            paper_price_interior_by_kilo: resolveActiveRate('paper_price_interior_by_kilo', p.paperTypeInterior, 1.252, true),
            paper_price_cover_by_kilo: resolveActiveRate('paper_price_cover_by_kilo', p.paperTypeCover, 2.515, true)
        };

        if (p.laminationType) {
            baseActive.lam_fixed = resolveActiveRate('lam_fixed', p.laminationType, 6.0, true);
            baseActive.lam_var_per_1000 = resolveActiveRate('lam_var_per_1000', p.laminationType, 25.0, true);
        }
        if (p.uvVarnishActive) {
            baseActive.uv_fixed = resolveActiveRate('uv_varnish', 'fixed', 0.0, false);
            baseActive.uv_var = resolveActiveRate('uv_varnish', 'var', 0.0, false);
        }

        // Endpaper active rates
        if (p.endpapers && p.endpapers !== 'none') {
            const epPrint = String(p.endpapersPrint || '4/0');
            const hasSlash = epPrint.includes('/');
            const frontCols = hasSlash ? parseInt(epPrint.split('/')[0] || '0', 10) : 0;
            const revCols = hasSlash ? parseInt(epPrint.split('/')[1] || '0', 10) : 0;

            if (frontCols >= 1 && frontCols <= 5) {
                baseActive[`endpaper_fixed_by_colours.${frontCols}`] = resolveActiveRate('endpaper_fixed_by_colours', frontCols, null, true);
                baseActive[`endpaper_var_per_1000_by_colours.${frontCols}`] = resolveActiveRate('endpaper_var_per_1000_by_colours', frontCols, null, true);
            }
            if (revCols >= 1 && revCols <= 5) {
                baseActive[`endpaper_fixed_by_colours.${revCols}`] = resolveActiveRate('endpaper_fixed_by_colours', revCols, null, true);
                baseActive[`endpaper_var_per_1000_by_colours.${revCols}`] = resolveActiveRate('endpaper_var_per_1000_by_colours', revCols, null, true);
            }

            let printMode = 'one';
            if (frontCols === 1) printMode = 'two';
            else if ([2, 3, 4].includes(frontCols)) printMode = 'full';
            else if (frontCols === 0) printMode = 'one';

            baseActive.paper_endpapers_fixed_by_colours = resolveActiveRate('paper_endpapers_fixed_by_colours', printMode, null, true);
            baseActive.paper_endpapers_var_per_1000_by_colours = resolveActiveRate('paper_endpapers_var_per_1000_by_colours', printMode, null, true);
            baseActive.paper_price_endpaper_by_kilo = resolveActiveRate('paper_price_endpaper_by_kilo', p.paperTypeEndpaper || 'offset', null, true);
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
        const isLockedActiveKey = key => lockedRatePaths.includes(activeRateKeyToPath[key]);
        for (const [key, path] of Object.entries(activeRateKeyToPath)) {
            if (!lockedRatePaths.includes(path)) continue;

            const dot = path.lastIndexOf('.');
            const parentKey = path.slice(0, dot);
            const leafKey = path.slice(dot + 1);
            const lockedValue = Number(snapshot[parentKey]?.[leafKey]);

            if (!Number.isFinite(lockedValue)) {
                const err = new Error(`LOCKED_RATE_MISSING_OR_INVALID: ${path}`);
                err.code = 'LOCKED_RATE_MISSING_OR_INVALID';
                err.ratePath = path;
                throw err;
            }

            baseActive[key] = lockedValue;
        }

        for (let i = priorsUsed.length - 1; i >= 0; i--) {
            if (lockedRatePaths.includes(priorsUsed[i].path)) {
                priorsUsed.splice(i, 1);
            }
        }
        // 3. Regularized Proportional Search (Binary Search for Scale Factor alpha*)
        let lowAlpha = SOLVER_CONFIG.scaleMin;
        let highAlpha = SOLVER_CONFIG.scaleMax;
        let bestAlpha = 1.0;
        let bestPredictedPrice = priceBefore;
        let bestResidual = Math.abs(priceBefore - targetMfgPrice);

        for (let iter = 0; iter < SOLVER_CONFIG.binarySearchMaxIter; iter++) {
            if (evaluationCount >= SOLVER_CONFIG.maxTotalEvaluations) break;

            const midAlpha = (lowAlpha + highAlpha) / 2.0;

            // Generate candidate rates scaled by alpha
            const candidateActive = {};
            for (const [k, v] of Object.entries(baseActive)) {
                candidateActive[k] = isLockedActiveKey(k) ? v : Number((v * midAlpha).toFixed(6));
            }

            const candidatePatch = this.buildPatchFromActiveRates(bookSpec, candidateActive, sigOptions);
            const forwardResult = adapter.evaluateForwardPrice(bookSpec, snapshot, candidatePatch, nodeConfig);
            evaluationCount++;

            const currentPredicted = forwardResult.predictedManufacturingPrice;
            const currentResidual = Math.abs(currentPredicted - targetMfgPrice);

            if (currentResidual < bestResidual) {
                bestResidual = currentResidual;
                bestAlpha = midAlpha;
                bestPredictedPrice = currentPredicted;
            }

            if (currentResidual <= SOLVER_CONFIG.toleranceAbsEur) {
                break; // Converged
            }

            // Monotonic step
            if (currentPredicted < targetMfgPrice) {
                lowAlpha = midAlpha;
            } else {
                highAlpha = midAlpha;
            }
        }

        // 4. Construct Final Prior-Anchored Solution Patch
        const finalActiveRates = {};
        for (const [k, v] of Object.entries(baseActive)) {
            finalActiveRates[k] = isLockedActiveKey(k) ? v : Number((v * bestAlpha).toFixed(4));
        }

        const proposedPatch = this.buildPatchFromActiveRates(bookSpec, finalActiveRates, sigOptions);
        for (const lockedPath of lockedRatePaths) {
            const dot = lockedPath.lastIndexOf('.');
            const parentKey = lockedPath.slice(0, dot);
            const leafKey = lockedPath.slice(dot + 1);
            if (proposedPatch[parentKey] && typeof proposedPatch[parentKey] === 'object') {
                delete proposedPatch[parentKey][leafKey];
                if (Object.keys(proposedPatch[parentKey]).length === 0) delete proposedPatch[parentKey];
            }
        }
        const finalForward = adapter.evaluateForwardPrice(bookSpec, snapshot, proposedPatch, nodeConfig);
        evaluationCount++;

        const finalPredicted = finalForward.predictedManufacturingPrice;
        const absResidual = Math.abs(finalPredicted - targetMfgPrice);
        const pctResidual = (absResidual / targetMfgPrice) * 100.0;

        // 5. Solution Classification
        const isFinitePrice = Number.isFinite(finalPredicted) && finalPredicted > 0;
        const isFiniteResidual = Number.isFinite(absResidual);
        const governanceTolerance = computeGovernanceTolerance(targetMfgPrice);

        let status = 'SUCCEEDED';
        if (!isFinitePrice || !isFiniteResidual) {
            status = 'NO_SOLUTION';
        } else if (absResidual <= SOLVER_CONFIG.toleranceAbsEur && pctResidual <= SOLVER_CONFIG.tolerancePct) {
            // Strict numerical convergence requires satisfying BOTH absolute (0.05 EUR) and relative (0.01%) thresholds
            status = 'SUCCEEDED';
        } else if (absResidual <= governanceTolerance) {
            // Governed acceptance candidate (satisfies governance threshold without claiming strict numerical equivalence)
            status = 'ACCEPTABLE_CANDIDATE';
        } else {
            status = 'NO_SOLUTION';
        }

        const executionDurationMs = Date.now() - startTime;
        const proposedPatchChecksum = calibrationSessionService.computeRatesChecksum(proposedPatch);

        return {
            status,
            solverVersion: SOLVER_CONFIG.version,
            selectedSignature: sigOptions.signatureSize || initialForward.signature,
            selectedSections: sigOptions.sectionsCount || initialForward.sections,
            solverConfig: {
                ...SOLVER_CONFIG,
                optimalScaleFactor: Number(bestAlpha.toFixed(6)),
                priorsUsedCount: priorsUsed.length
            },
            evaluationsCount: evaluationCount,
            executionDurationMs,
            enginePriceBefore: priceBefore,
            enginePriceAfter: finalPredicted,
            targetPrice: targetMfgPrice,
            absoluteResidual: Number(absResidual.toFixed(6)),
            percentResidual: Number(pctResidual.toFixed(4)),
            activeRatePaths,
            lockedRatePaths,
            calibratableRatePaths,
            proposedPatch,
            proposedPatchChecksum,
            candidateParameters: finalActiveRates,
            identifiabilityReport: {
                classification: 'PRIOR_ANCHORED_CANDIDATE',
                degreesOfFreedom: 'UNDERDETERMINED_SINGLE_JOB',
                anchoredToSnapshot: true,
                scaleMultiplierApplied: Number(bestAlpha.toFixed(6)),
                priorsInjected: priorsUsed,
                lockedRatePaths,
                calibratableRatePaths,
                transportCalibration: 'EXTERNAL_REFERENCE_ONLY',
                referenceTransportPricePerKg: referenceTransPricePerKg,
                notice: 'Single-job calibration outputs are prior-anchored candidate configurations; they are not proof of uniquely identified underlying production rates.'
            },
            warnings: status === 'NO_SOLUTION' ? ['Failed to converge within governed tolerance and bounds'] : []
        };
    }

    /**
     * Executes multi-quantity calibration curve solving deterministically.
     */
    solveMultiQuantity(session, nodeConfig = {}, options = {}) {
        const startTime = Date.now();
        const bookSpec = session.bookSpec;
        const snapshot = session.currentRatesSnapshot || {};
        const rawTargets = options.calibrationTargets || session.calibrationTargets || session.multiTargets || [];

        if (!bookSpec || !Array.isArray(rawTargets) || rawTargets.length < 2) {
            const err = new Error('INVALID_MULTI_TARGET_INPUTS');
            err.code = 'INVALID_MULTI_TARGET_INPUTS';
            throw err;
        }

        const seenQtys = new Set();
        const validatedTargets = [];

        for (let i = 0; i < rawTargets.length; i++) {
            const t = rawTargets[i];
            const qty = Number(t.quantity);
            const price = Number(t.targetManufacturingPrice || t.targetPrice);
            const basis = t.targetBasis || 'MANUFACTURING_PRICE';

            if (!Number.isInteger(qty) || qty < 1) {
                const err = new Error(`INVALID_TARGET_QUANTITY_AT_INDEX_${i}`);
                err.code = 'INVALID_TARGET_QUANTITY';
                throw err;
            }
            if (seenQtys.has(qty)) {
                const err = new Error(`DUPLICATE_TARGET_QUANTITY: ${qty}`);
                err.code = 'DUPLICATE_TARGET_QUANTITY';
                throw err;
            }
            seenQtys.add(qty);

            if (!Number.isFinite(price) || price <= 0) {
                const err = new Error(`INVALID_TARGET_MANUFACTURING_PRICE_AT_INDEX_${i}`);
                err.code = 'INVALID_TARGET_MANUFACTURING_PRICE';
                throw err;
            }

            if (basis !== 'MANUFACTURING_PRICE') {
                const err = new Error(`INVALID_TARGET_BASIS: ${basis}. Only MANUFACTURING_PRICE is permitted.`);
                err.code = 'INVALID_TARGET_BASIS';
                throw err;
            }

            validatedTargets.push({
                quantity: qty,
                targetManufacturingPrice: price,
                currency: t.currency || session.currency || 'EUR',
                targetBasis: 'MANUFACTURING_PRICE',
                sourceEvidenceId: t.sourceEvidenceId || null,
                sourceOfferIndex: t.sourceOfferIndex !== undefined ? t.sourceOfferIndex : null,
                eligibility: t.eligibility || 'ELIGIBLE'
            });
        }

        validatedTargets.sort((a, b) => a.quantity - b.quantity);

        let evaluationCount = 0;
        const initialPointResults = [];

        for (const t of validatedTargets) {
            const initialForward = adapter.evaluateForwardPrice({ ...bookSpec, copies: t.quantity }, snapshot, {}, nodeConfig);
            evaluationCount++;
            const pBefore = initialForward.predictedManufacturingPrice;
            const absRes = Math.abs(pBefore - t.targetManufacturingPrice);
            const pctRes = absRes / Math.max(t.targetManufacturingPrice, 0.01);
            initialPointResults.push({
                quantity: t.quantity,
                targetManufacturingPrice: t.targetManufacturingPrice,
                predictedManufacturingPrice: pBefore,
                absoluteResidual: Number(absRes.toFixed(4)),
                percentageResidual: Number(pctRes.toFixed(6)),
                withinTolerance: absRes <= SOLVER_CONFIG.toleranceAbsEur || pctRes <= SOLVER_CONFIG.tolerancePct
            });
        }

        const repForward = adapter.evaluateForwardPrice({ ...bookSpec, copies: validatedTargets[0].quantity }, snapshot, {}, nodeConfig);
        const sigOptions = {
            signatureSize: repForward.signature,
            sectionsCount: repForward.sections
        };
        const activeRatePaths = this.extractActiveRatePaths(bookSpec, sigOptions);
        const requestedLockedPaths = Array.isArray(options.lockedRatePaths) ? options.lockedRatePaths : [];
        const lockedRatePaths = activeRatePaths.filter(path => requestedLockedPaths.includes(path)).sort();
        const calibratableRatePaths = activeRatePaths.filter(path => lockedRatePaths.indexOf(path) === -1).sort();

        const p = adapter.adaptBookSpec(bookSpec, sigOptions);
        const sigKey = `${p.signatureSize}p`;
        const secKey = String(Math.min(24, Math.max(1, p.sectionsCount)));
        const intFixedKey = `interior_${p.interiorColorKey}_colour_fixed`;
        const intVarKey = `interior_${p.interiorColorKey}_colour_var`;
        const bindFixedKey = `binding_${p.bindingCode}_fixed_by_sections`;
        const bindVarKey = `binding_${p.bindingCode}_var_per_1000_by_sections`;

        let bindFixedPrior = p.bindingCode === 'pb' ? 0.164 : null;
        let bindVarPrior = p.bindingCode === 'pb' ? 14.7 : null;

        const priorsUsed = [];
        const resolveActiveRate = (pathKey, subKey, safePrior, isEssential = false) => {
            const pathString = `${pathKey}.${subKey}`;
            const isPathLocked = lockedRatePaths.includes(pathString);
            const container = snapshot[pathKey];
            const hasExplicitValue = container !== undefined && container[subKey] !== undefined;
            const numericVal = hasExplicitValue ? Number(container[subKey]) : undefined;

            if (isPathLocked) {
                if (!hasExplicitValue || !Number.isFinite(numericVal)) {
                    const err = new Error(`LOCKED_RATE_MISSING_OR_INVALID: ${pathString}`);
                    err.code = 'LOCKED_RATE_MISSING_OR_INVALID';
                    err.ratePath = pathString;
                    throw err;
                }
                return numericVal;
            }
            if (hasExplicitValue && numericVal === 0 && isEssential) {
                if (safePrior !== undefined && safePrior !== null && safePrior > 0) {
                    priorsUsed.push({ path: pathString, originalValue: 0, priorValue: safePrior, reason: 'ZERO_ANCHOR_PROMOTION' });
                    return safePrior;
                }
                const err = new Error(`UNQUALIFIED_ZERO_ANCHOR: ${pathString}`);
                err.code = 'UNQUALIFIED_ZERO_ANCHOR';
                err.ratePath = pathString;
                throw err;
            }
            if (hasExplicitValue) return numericVal;
            if (safePrior !== undefined && safePrior !== null) {
                priorsUsed.push({ path: pathString, originalValue: null, priorValue: safePrior, reason: 'MISSING_RATE_PRIOR' });
                return safePrior;
            }
            const err = new Error(`MISSING_ACTIVE_RATE_NO_SAFE_PRIOR: ${pathString}`);
            err.code = 'MISSING_ACTIVE_RATE_NO_SAFE_PRIOR';
            err.ratePath = pathString;
            throw err;
        };

        const baseActive = {
            [intFixedKey]: resolveActiveRate(intFixedKey, sigKey, 80.31, true),
            [intVarKey]: resolveActiveRate(intVarKey, sigKey, 8.12, true),
            cover_fixed_by_colours: resolveActiveRate('cover_fixed_by_colours', p.coverColorKey, 40.0, true),
            cover_var_per_1000_by_colours: resolveActiveRate('cover_var_per_1000_by_colours', p.coverColorKey, 800.0, true),
            [bindFixedKey]: resolveActiveRate(bindFixedKey, secKey, bindFixedPrior, true),
            [bindVarKey]: resolveActiveRate(bindVarKey, secKey, bindVarPrior, true),
            paper_price_interior_by_kilo: resolveActiveRate('paper_price_interior_by_kilo', p.paperTypeInterior, 1.252, true),
            paper_price_cover_by_kilo: resolveActiveRate('paper_price_cover_by_kilo', p.paperTypeCover, 2.515, true)
        };

        if (p.laminationType) {
            baseActive.lam_fixed = resolveActiveRate('lam_fixed', p.laminationType, 6.0, true);
            baseActive.lam_var_per_1000 = resolveActiveRate('lam_var_per_1000', p.laminationType, 25.0, true);
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

        const isLockedActiveKey = key => lockedRatePaths.includes(activeRateKeyToPath[key]);

        const evaluateMultiObjective = (alpha) => {
            const candidateActive = {};
            for (const [k, v] of Object.entries(baseActive)) {
                candidateActive[k] = isLockedActiveKey(k) ? v : Number((v * alpha).toFixed(6));
            }
            const candidatePatch = this.buildPatchFromActiveRates(bookSpec, candidateActive, sigOptions);

            let sumSquareRelResidual = 0;
            const evalPoints = [];

            for (const t of validatedTargets) {
                const fwd = adapter.evaluateForwardPrice({ ...bookSpec, copies: t.quantity }, snapshot, candidatePatch, nodeConfig);
                evaluationCount++;
                const pred = fwd.predictedManufacturingPrice;
                const absRes = Math.abs(pred - t.targetManufacturingPrice);
                const pctRes = absRes / Math.max(t.targetManufacturingPrice, 0.01);
                const normRes = (pred - t.targetManufacturingPrice) / Math.max(t.targetManufacturingPrice, 0.01);
                sumSquareRelResidual += normRes * normRes;

                evalPoints.push({
                    quantity: t.quantity,
                    targetManufacturingPrice: t.targetManufacturingPrice,
                    predictedManufacturingPrice: pred,
                    absoluteResidual: Number(absRes.toFixed(4)),
                    percentageResidual: Number(pctRes.toFixed(6)),
                    withinTolerance: absRes <= SOLVER_CONFIG.toleranceAbsEur || pctRes <= SOLVER_CONFIG.tolerancePct
                });
            }

            return {
                alpha,
                candidatePatch,
                candidateActive,
                evalPoints,
                objectiveValue: sumSquareRelResidual
            };
        };

        let a = SOLVER_CONFIG.scaleMin;
        let b = SOLVER_CONFIG.scaleMax;
        const phi = (1 + Math.sqrt(5)) / 2;
        const resphi = 2 - phi;

        let c = a + resphi * (b - a);
        let d = b - resphi * (b - a);
        let evalC = evaluateMultiObjective(c);
        let evalD = evaluateMultiObjective(d);

        for (let iter = 0; iter < SOLVER_CONFIG.binarySearchMaxIter; iter++) {
            if (evaluationCount >= SOLVER_CONFIG.maxTotalEvaluations) break;

            if (evalC.objectiveValue < evalD.objectiveValue) {
                b = d;
                d = c;
                evalD = evalC;
                c = a + resphi * (b - a);
                evalC = evaluateMultiObjective(c);
            } else {
                a = c;
                c = d;
                evalC = evalD;
                d = b - resphi * (b - a);
                evalD = evaluateMultiObjective(d);
            }
        }

        const bestEval = evalC.objectiveValue < evalD.objectiveValue ? evalC : evalD;

        const pointResults = bestEval.evalPoints;
        const absResiduals = pointResults.map(p => p.absoluteResidual);
        const pctResiduals = pointResults.map(p => p.percentageResidual);
        const meanAbsRes = Number((absResiduals.reduce((sum, v) => sum + v, 0) / pointResults.length).toFixed(4));
        const maxAbsRes = Number(Math.max(...absResiduals).toFixed(4));
        const meanPctRes = Number((pctResiduals.reduce((sum, v) => sum + v, 0) / pointResults.length).toFixed(6));
        const maxPctRes = Number(Math.max(...pctResiduals).toFixed(6));

        const curveMetrics = {
            pointCount: pointResults.length,
            meanAbsoluteResidual: meanAbsRes,
            maxAbsoluteResidual: maxAbsRes,
            meanPercentageResidual: meanPctRes,
            maxPercentageResidual: maxPctRes,
            objectiveValue: Number(bestEval.objectiveValue.toFixed(8))
        };

        const targetPointCount = validatedTargets.length;
        const freeParameterCount = calibratableRatePaths.length;
        const degreesOfFreedom = targetPointCount - freeParameterCount;

        let identStatus = 'IDENTIFIED';
        if (freeParameterCount > targetPointCount) {
            identStatus = 'UNDERDETERMINED';
        } else if (freeParameterCount === targetPointCount) {
            identStatus = 'EXACTLY_DETERMINED';
        } else if (maxPctRes > SOLVER_CONFIG.tolerancePct && maxAbsRes > SOLVER_CONFIG.toleranceAbsEur) {
            identStatus = 'OVERDETERMINED';
        }

        const identifiabilityReport = {
            targetPointCount,
            freeParameterCount,
            degreesOfFreedom,
            status: identStatus,
            notice: identStatus === 'UNDERDETERMINED'
                ? 'Free parameters exceed calibration target points. Solution is anchored around theta0 prior.'
                : (identStatus === 'OVERDETERMINED'
                    ? 'Target points exceed free parameters. Solution is a multi-point best-fit approximation.'
                    : 'System is determined for multi-point curve fitting.')
        };

        let solverStatus = 'CONVERGED';
        if (identStatus === 'UNDERDETERMINED') {
            solverStatus = 'UNDERDETERMINED';
        } else if (maxPctRes <= SOLVER_CONFIG.tolerancePct || maxAbsRes <= SOLVER_CONFIG.toleranceAbsEur) {
            solverStatus = 'ACCEPTABLE_CANDIDATE';
        } else {
            solverStatus = 'SUCCEEDED';
        }

        const proposedPatchChecksum = calibrationSessionService.computeRatesChecksum(bestEval.candidatePatch);
        const durationMs = Date.now() - startTime;

        return {
            mode: 'MULTI_QUANTITY',
            solverVersion: SOLVER_CONFIG.version,
            solverConfig: {
                ...SOLVER_CONFIG,
                optimalScaleFactor: Number(bestEval.alpha.toFixed(6))
            },
            status: solverStatus,
            targets: validatedTargets,
            pointResults,
            curveMetrics,
            identifiabilityReport,
            activeRatePaths,
            lockedRatePaths,
            calibratableRatePaths,
            enginePriceBefore: initialPointResults[0].predictedManufacturingPrice,
            enginePriceAfter: pointResults[0].predictedManufacturingPrice,
            targetPrice: validatedTargets[0].targetManufacturingPrice,
            absoluteResidual: maxAbsRes,
            percentResidual: maxPctRes,
            proposedPatch: bestEval.candidatePatch,
            proposedPatchChecksum,
            candidateParameters: bestEval.candidateActive,
            warnings: priorsUsed.length > 0 ? priorsUsed : [],
            evaluationsCount: evaluationCount,
            executionDurationMs: durationMs
        };
    }
}

module.exports = new DeterministicInversePricingSolver();
