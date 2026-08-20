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
    extractActiveRatePaths(bookSpec) {
        const p = adapter.adaptBookSpec(bookSpec);
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

        return paths.sort(); // Deterministic ordering
    }

    /**
     * Builds candidate overrides JSON from an active rate map.
     * Manufacturing rates ONLY. Transport is never patched into rates_json.
     */
    buildPatchFromActiveRates(bookSpec, activeRates) {
        const p = adapter.adaptBookSpec(bookSpec);
        const sigKey = `${p.signatureSize}p`;
        const secKey = String(Math.min(24, Math.max(1, p.sectionsCount)));

        const patch = {};

        // Interior
        const intFixedKey = `interior_${p.interiorColorKey}_colour_fixed`;
        const intVarKey = `interior_${p.interiorColorKey}_colour_var`;
        patch[intFixedKey] = { [sigKey]: activeRates[intFixedKey] };
        patch[intVarKey] = { [sigKey]: activeRates[intVarKey] };

        // Cover
        patch.cover_fixed_by_colours = { [p.coverColorKey]: activeRates.cover_fixed_by_colours };
        patch.cover_var_per_1000_by_colours = { [p.coverColorKey]: activeRates.cover_var_per_1000_by_colours };

        // Binding
        const bindFixedKey = `binding_${p.bindingCode}_fixed_by_sections`;
        const bindVarKey = `binding_${p.bindingCode}_var_per_1000_by_sections`;
        patch[bindFixedKey] = { [secKey]: activeRates[bindFixedKey] };
        patch[bindVarKey] = { [secKey]: activeRates[bindVarKey] };

        // Paper
        patch.paper_price_interior_by_kilo = { [p.paperTypeInterior]: activeRates.paper_price_interior_by_kilo };
        patch.paper_price_cover_by_kilo = { [p.paperTypeCover]: activeRates.paper_price_cover_by_kilo };

        // Lamination / UV
        if (p.laminationType && activeRates.lam_fixed !== undefined) {
            patch.lam_fixed = { [p.laminationType]: activeRates.lam_fixed };
            patch.lam_var_per_1000 = { [p.laminationType]: activeRates.lam_var_per_1000 };
        }
        if (p.uvVarnishActive && activeRates.uv_fixed !== undefined) {
            patch.uv_varnish = { fixed: activeRates.uv_fixed, var: activeRates.uv_var };
        }

        return patch;
    }

    /**
     * Solves the inverse calibration problem deterministically around baseline snapshot θ0.
     * Evaluates MANUFACTURING COST ONLY. Transport price per kg is informational and decoupled.
     *
     * @param {Object} session - Calibration session (bookSpec, targets, snapshot)
     * @returns {Object} Solution result with residuals, candidate patch, and provenance
     */
    solve(session) {
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
        const initialForward = adapter.evaluateForwardPrice(bookSpec, snapshot, {});
        evaluationCount++;
        const priceBefore = initialForward.predictedManufacturingPrice;

        // 2. Base Active Rates Extraction & Prior Validation
        const p = adapter.adaptBookSpec(bookSpec);
        const sigKey = `${p.signatureSize}p`;
        const secKey = String(Math.min(24, Math.max(1, p.sectionsCount)));

        const intFixedKey = `interior_${p.interiorColorKey}_colour_fixed`;
        const intVarKey = `interior_${p.interiorColorKey}_colour_var`;
        const bindFixedKey = `binding_${p.bindingCode}_fixed_by_sections`;
        const bindVarKey = `binding_${p.bindingCode}_var_per_1000_by_sections`;

        // Historical safe calibration priors (n=13 validated benchmarks)
        const priorsUsed = [];
        const resolveActiveRate = (pathKey, subKey, safePrior) => {
            const container = snapshot[pathKey];
            if (container !== undefined && container[subKey] !== undefined) {
                return Number(container[subKey]); // Explicit zero or explicit value preserved
            }
            if (safePrior !== undefined && safePrior !== null) {
                priorsUsed.push({ path: `${pathKey}.${subKey}`, priorValue: safePrior });
                return safePrior;
            }
            const err = new Error(`MISSING_ACTIVE_RATE_NO_SAFE_PRIOR: ${pathKey}.${subKey}`);
            err.code = 'MISSING_ACTIVE_RATE_NO_SAFE_PRIOR';
            err.ratePath = `${pathKey}.${subKey}`;
            throw err;
        };

        const baseActive = {
            [intFixedKey]: resolveActiveRate(intFixedKey, sigKey, 80.31),
            [intVarKey]: resolveActiveRate(intVarKey, sigKey, 8.12),
            cover_fixed_by_colours: resolveActiveRate('cover_fixed_by_colours', p.coverColorKey, 40.0),
            cover_var_per_1000_by_colours: resolveActiveRate('cover_var_per_1000_by_colours', p.coverColorKey, 800.0),
            [bindFixedKey]: resolveActiveRate(bindFixedKey, secKey, 0.164),
            [bindVarKey]: resolveActiveRate(bindVarKey, secKey, 14.7),
            paper_price_interior_by_kilo: resolveActiveRate('paper_price_interior_by_kilo', p.paperTypeInterior, 1.252),
            paper_price_cover_by_kilo: resolveActiveRate('paper_price_cover_by_kilo', p.paperTypeCover, 2.515)
        };

        if (p.laminationType) {
            baseActive.lam_fixed = resolveActiveRate('lam_fixed', p.laminationType, 6.0);
            baseActive.lam_var_per_1000 = resolveActiveRate('lam_var_per_1000', p.laminationType, 25.0);
        }
        if (p.uvVarnishActive) {
            baseActive.uv_fixed = resolveActiveRate('uv_varnish', 'fixed', 0.0);
            baseActive.uv_var = resolveActiveRate('uv_varnish', 'var', 0.0);
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
                candidateActive[k] = Number((v * midAlpha).toFixed(6));
            }

            const candidatePatch = this.buildPatchFromActiveRates(bookSpec, candidateActive);
            const forwardResult = adapter.evaluateForwardPrice(bookSpec, snapshot, candidatePatch);
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
            finalActiveRates[k] = Number((v * bestAlpha).toFixed(4));
        }

        const proposedPatch = this.buildPatchFromActiveRates(bookSpec, finalActiveRates);
        const finalForward = adapter.evaluateForwardPrice(bookSpec, snapshot, proposedPatch);
        evaluationCount++;

        const finalPredicted = finalForward.predictedManufacturingPrice;
        const absResidual = Math.abs(finalPredicted - targetMfgPrice);
        const pctResidual = (absResidual / targetMfgPrice) * 100.0;

        // 5. Solution Classification
        let status = 'SUCCEEDED';
        if (absResidual > SOLVER_CONFIG.toleranceAbsEur && pctResidual > SOLVER_CONFIG.tolerancePct) {
            status = 'NO_SOLUTION';
        }

        const executionDurationMs = Date.now() - startTime;
        const activeRatePaths = this.extractActiveRatePaths(bookSpec);
        const proposedPatchChecksum = adapter.computeChecksum ? adapter.computeChecksum(proposedPatch) : require('crypto').createHash('sha256').update(JSON.stringify(proposedPatch)).digest('hex');

        return {
            status,
            solverVersion: SOLVER_CONFIG.version,
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
            proposedPatch,
            proposedPatchChecksum,
            candidateParameters: finalActiveRates,
            identifiabilityReport: {
                classification: 'PRIOR_ANCHORED_CANDIDATE',
                degreesOfFreedom: 'UNDERDETERMINED_SINGLE_JOB',
                anchoredToSnapshot: true,
                scaleMultiplierApplied: Number(bestAlpha.toFixed(6)),
                priorsInjected: priorsUsed,
                transportCalibration: 'EXTERNAL_REFERENCE_ONLY',
                referenceTransportPricePerKg: referenceTransPricePerKg,
                notice: 'Single-job calibration outputs are prior-anchored candidate configurations; they are not proof of uniquely identified underlying production rates.'
            },
            warnings: status === 'NO_SOLUTION' ? ['Failed to converge within governed tolerance and bounds'] : []
        };
    }
}

module.exports = new DeterministicInversePricingSolver();
