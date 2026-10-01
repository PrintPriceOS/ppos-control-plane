/**
 * src/api/services/productionRouteSelectionService.js
 *
 * Phase 195C — Governed Production Route Selection & Press Comparison (SHADOW Mode)
 *
 * Responsibilities:
 * 1. Evaluates physical & capability eligibility of active machines for a job.
 * 2. Computes deterministic manufacturing cost per eligible machine route using
 *    versioned machine pricing profiles (printhouse_machine_pricing_profiles).
 * 3. Discovers economic route crossovers (e.g. Digital vs Offset) dynamically from
 *    intersecting cost curves without hardcoding arbitrary quantity thresholds.
 * 4. Ranks eligible routes by manufacturing cost or respects operator-pinned machines.
 * 5. Executes in SHADOW_COMPARISON mode: legacy node rates_json remains 100% authoritative.
 * 6. ZERO rates_json mutations and ZERO pricing revision activations.
 */

const machineService = require('./printhouseMachineService');
const machinePricingService = require('./printhouseMachinePricingService');
const adapter = require('./buildPriceCalibrationAdapter');
const telemetry = require('./phase194TelemetryService');
const logger = require('./logger').child('production-route-selection');
const db = require('./mysqlClient');

const ROUTE_SELECTION_MODES = Object.freeze({
  SHADOW: 'SHADOW_COMPARISON',
  ACTIVE: 'ACTIVE_ROUTING' // Not used in 195C!
});

const INELIGIBILITY_REASONS = Object.freeze({
  FORMAT_UNSUPPORTED: 'FORMAT_UNSUPPORTED',
  COLOUR_CONFIGURATION_UNSUPPORTED: 'COLOUR_CONFIGURATION_UNSUPPORTED',
  BINDING_METHOD_UNSUPPORTED: 'BINDING_METHOD_UNSUPPORTED',
  QUANTITY_BELOW_MIN: 'QUANTITY_BELOW_MIN',
  QUANTITY_ABOVE_MAX: 'QUANTITY_ABOVE_MAX',
  MACHINE_PROFILE_NOT_READY: 'MACHINE_PROFILE_NOT_READY',
  CROSS_TENANT_MISMATCH: 'CROSS_TENANT_MISMATCH',
  MAINTENANCE_STATUS: 'MAINTENANCE_STATUS'
});

function _isDbFallbackAllowed() {
  return process.env.NODE_ENV === 'test' ||
    Boolean(process.env.ALLOW_DB_FALLBACK_FOR_SMOKE) ||
    !process.env.MYSQL_HOST ||
    process.env.MYSQL_HOST === 'NOT_SET';
}

class ProductionRouteSelectionService {

  constructor() {
    this.MODES = ROUTE_SELECTION_MODES;
    this.REASONS = INELIGIBILITY_REASONS;
  }

  /**
   * Evaluates capability eligibility for a given machine against job specifications.
   */
  evaluateMachineEligibility(machine, profile, bookSpec, quantity) {
    const reasons = [];

    if (!machine || machine.status === 'MAINTENANCE' || machine.status === 'DECOMMISSIONED') {
      reasons.push(INELIGIBILITY_REASONS.MAINTENANCE_STATUS);
    }

    // Check pricing profile readiness
    if (!profile || profile.status !== 'VALIDATED') {
      reasons.push(INELIGIBILITY_REASONS.MACHINE_PROFILE_NOT_READY);
    } else {
      const readiness = machinePricingService.evaluateReadiness(profile);
      if (readiness.status !== 'READY') {
        reasons.push(INELIGIBILITY_REASONS.MACHINE_PROFILE_NOT_READY);
      }
    }

    // Dimension Check
    const width = Number(bookSpec.book_width_mm) || 148;
    const height = Number(bookSpec.book_height_mm) || 210;

    if (machine) {
      if (machine.max_sheet_width_mm && width > machine.max_sheet_width_mm) {
        reasons.push(INELIGIBILITY_REASONS.FORMAT_UNSUPPORTED);
      }
      if (machine.max_sheet_height_mm && height > machine.max_sheet_height_mm) {
        reasons.push(INELIGIBILITY_REASONS.FORMAT_UNSUPPORTED);
      }
      if (machine.min_sheet_width_mm && width < machine.min_sheet_width_mm) {
        reasons.push(INELIGIBILITY_REASONS.FORMAT_UNSUPPORTED);
      }
      if (machine.min_sheet_height_mm && height < machine.min_sheet_height_mm) {
        reasons.push(INELIGIBILITY_REASONS.FORMAT_UNSUPPORTED);
      }
    }

    // Binding Capability Check
    const binding = String(bookSpec.binding_method || '').toLowerCase();
    if (machine && binding) {
      if (binding.includes('hardcover') && machine.supports_hardcover === false && machine.machine_type === 'BINDER') {
        reasons.push(INELIGIBILITY_REASONS.BINDING_METHOD_UNSUPPORTED);
      }
      if (binding.includes('softcover') && machine.supports_softcover === false && machine.machine_type === 'BINDER') {
        reasons.push(INELIGIBILITY_REASONS.BINDING_METHOD_UNSUPPORTED);
      }
    }

    // Quantity Viability Check
    if (profile && profile.viability) {
      const q = Number(quantity);
      if (typeof profile.viability.minQuantity === 'number' && q < profile.viability.minQuantity) {
        reasons.push(INELIGIBILITY_REASONS.QUANTITY_BELOW_MIN);
      }
      if (typeof profile.viability.maxQuantity === 'number' && q > profile.viability.maxQuantity) {
        reasons.push(INELIGIBILITY_REASONS.QUANTITY_ABOVE_MAX);
      }
    }

    return {
      eligible: reasons.length === 0,
      reasons
    };
  }

  /**
   * Deterministically calculates manufacturing route cost using machine economic primitives.
   */
  calculateRouteCost(machine, profile, bookSpec, quantity) {
    const q = Number(quantity) || 1;
    const pages = Number(bookSpec.interior_pages) || 1;

    // Use adapter for canonical signature / section derivations
    const adapted = adapter.adaptBookSpec({ ...bookSpec, copies: q });
    const signatureSize = adapted.signatureSize || 16;
    const sections = adapted.sectionsCount || Math.max(1, Math.ceil(pages / signatureSize));

    // Derive sheet counts & plate counts cleanly without duplicate imposition formulas
    const totalSheets = Math.ceil((pages / 2) * q);
    const plateCount = sections * 4; // Standard 4-color plates per section

    const costs = profile.costs || {};
    const tech = profile.technology || 'DIGITAL_SHEETFED';

    let fixedSetupCost = 0.0;
    let makereadyCost = 0.0;
    let plateCost = 0.0;
    let startupWasteCost = 0.0;
    let runCost = 0.0;
    let clickCost = 0.0;
    let hourlyCost = 0.0;

    // Fixed setup
    if (costs.fixedSetup && typeof costs.fixedSetup.amount === 'number') {
      fixedSetupCost = costs.fixedSetup.amount;
    }

    // Makeready
    if (costs.makeready && typeof costs.makeready.amount === 'number') {
      makereadyCost = costs.makeready.amount;
    }

    // Plate Cost
    if (costs.plateCost && typeof costs.plateCost.amount === 'number') {
      plateCost = costs.plateCost.amount * plateCount;
    }

    // Click Cost (Digital)
    if (costs.clickCost && typeof costs.clickCost.amount === 'number') {
      const impressionsPerCopy = Math.ceil(pages / 2) * 2; // duplex
      clickCost = costs.clickCost.amount * impressionsPerCopy * q;
    }

    // Run Cost
    if (costs.runCost && typeof costs.runCost.amount === 'number') {
      const basis = costs.runCost.basis || 'PER_1000_SHEETS';
      if (basis === 'PER_1000_SHEETS') {
        runCost = (totalSheets / 1000) * costs.runCost.amount;
      } else if (basis === 'PER_SHEET') {
        runCost = totalSheets * costs.runCost.amount;
      } else if (basis === 'PER_COPY') {
        runCost = q * costs.runCost.amount;
      }
    }

    // Startup Waste
    if (costs.startupWaste && typeof costs.startupWaste.quantity === 'number') {
      const paperUnitCost = 0.05; // 0.05 EUR / sheet baseline estimate for waste
      startupWasteCost = costs.startupWaste.quantity * paperUnitCost;
    }

    const totalManufacturingCost = Number(
      (fixedSetupCost + makereadyCost + plateCost + startupWasteCost + runCost + clickCost + hourlyCost).toFixed(4)
    );
    const unitManufacturingCost = Number((totalManufacturingCost / q).toFixed(6));

    return {
      machineId: machine.id,
      machineName: machine.machine_name || machine.id,
      technology: tech,
      pricingProfileId: profile.id,
      profileVersion: profile.version,
      profileChecksum: profile.checksum,
      currency: profile.currency || 'EUR',
      breakdown: {
        fixedSetup: Number(fixedSetupCost.toFixed(2)),
        makeready: Number(makereadyCost.toFixed(2)),
        plateCost: Number(plateCost.toFixed(2)),
        startupWasteCost: Number(startupWasteCost.toFixed(2)),
        runCost: Number(runCost.toFixed(2)),
        clickCost: Number(clickCost.toFixed(2)),
        hourlyCost: Number(hourlyCost.toFixed(2))
      },
      manufacturingCost: totalManufacturingCost,
      unitManufacturingCost
    };
  }

  /**
   * Evaluates all candidate machine routes for a given job and quantity.
   */
  async evaluateRoutesForQuantity(tenantId, printhouseId, bookSpec, quantity, options = {}) {
    const q = Number(quantity);

    // Fetch active machines
    let machines = [];
    try {
      const pool = db.getPool();
      const [rows] = await pool.query(
        'SELECT * FROM printhouse_machines WHERE tenant_id = ? AND printhouse_id = ? AND status = "ACTIVE"',
        [tenantId, printhouseId]
      );
      machines = rows || [];
    } catch (e) {
      logger.warn(`DB machine lookup skipped/failed: ${e.message}`);
    }

    // Support mock machines in test mode
    if (machines.length === 0 && Array.isArray(options.mockMachines)) {
      machines = options.mockMachines.filter(m => m.tenant_id === tenantId);
    }

    const routeResults = [];

    for (const machine of machines) {
      // Fetch active profile or mock profile
      let profile = null;
      if (options.mockProfiles && options.mockProfiles[machine.id]) {
        profile = options.mockProfiles[machine.id];
      } else {
        profile = await machinePricingService.getActiveMachinePricingProfile(tenantId, machine.id);
      }

      const eligibility = this.evaluateMachineEligibility(machine, profile, bookSpec, q);

      if (!eligibility.eligible) {
        routeResults.push({
          machineId: machine.id,
          machineName: machine.machine_name || machine.id,
          technology: machine.machine_type || 'UNKNOWN',
          eligible: false,
          ineligibilityReasons: eligibility.reasons,
          manufacturingCost: null
        });
      } else {
        const costData = this.calculateRouteCost(machine, profile, bookSpec, q);
        routeResults.push({
          eligible: true,
          ineligibilityReasons: [],
          ...costData
        });
      }
    }

    // Rank eligible routes by manufacturingCost ascending
    const eligibleRoutes = routeResults.filter(r => r.eligible).sort((a, b) => a.manufacturingCost - b.manufacturingCost);

    // Operator Pinned Machine Logic
    let recommendedRoute = null;
    let selectionReason = 'NO_ELIGIBLE_ROUTE';

    if (options.pinnedMachineId) {
      const pinned = routeResults.find(r => r.machineId === options.pinnedMachineId);
      if (pinned && pinned.eligible) {
        recommendedRoute = pinned;
        selectionReason = 'OPERATOR_PINNED_MACHINE';
      } else {
        selectionReason = 'PINNED_MACHINE_INELIGIBLE';
      }
    } else if (eligibleRoutes.length === 1) {
      recommendedRoute = eligibleRoutes[0];
      selectionReason = 'ONLY_ELIGIBLE_MACHINE';
    } else if (eligibleRoutes.length > 1) {
      recommendedRoute = eligibleRoutes[0];
      selectionReason = 'LOWEST_VALID_MANUFACTURING_COST';
    }

    return {
      quantity: q,
      selectionReason,
      recommendedRoute,
      allRoutes: routeResults,
      eligibleRouteCount: eligibleRoutes.length,
      totalMachineCount: machines.length
    };
  }

  /**
   * Evaluates production route selection across multiple quantities to discover economic crossovers dynamically.
   */
  async evaluateProductionRoutes(tenantId, printhouseId, bookSpec, quantities = [500, 600, 700], options = {}) {
    const timer = telemetry.startTimer('machine_route_evaluation', { tenantId, printerNodeId: printhouseId });
    const sortedQuantities = [...quantities].sort((a, b) => Number(a) - Number(b));

    const quantityResults = [];
    for (const q of sortedQuantities) {
      const res = await this.evaluateRoutesForQuantity(tenantId, printhouseId, bookSpec, q, options);
      quantityResults.push(res);
    }

    // Detect Crossovers Dynamically
    let crossoverDetected = false;
    let crossoverDetails = null;

    for (let i = 0; i < quantityResults.length - 1; i++) {
      const r1 = quantityResults[i];
      const r2 = quantityResults[i + 1];

      if (r1.recommendedRoute && r2.recommendedRoute && r1.recommendedRoute.machineId !== r2.recommendedRoute.machineId) {
        crossoverDetected = true;

        // Calculate analytical crossover point where C_A(Q) = C_B(Q)
        const m1 = r1.recommendedRoute;
        const m2 = r2.recommendedRoute;

        const setup1 = m1.breakdown.fixedSetup + m1.breakdown.makeready + m1.breakdown.plateCost;
        const setup2 = m2.breakdown.fixedSetup + m2.breakdown.makeready + m2.breakdown.plateCost;
        const unit1 = (m1.manufacturingCost - setup1) / r1.quantity;
        const unit2 = (m2.manufacturingCost - setup2) / r2.quantity;

        let derivedCrossoverQ = null;
        if (Math.abs(unit1 - unit2) > 1e-6) {
          derivedCrossoverQ = Math.round((setup2 - setup1) / (unit1 - unit2));
        }

        crossoverDetails = {
          fromQuantity: r1.quantity,
          toQuantity: r2.quantity,
          fromMachineId: m1.machineId,
          toMachineId: m2.machineId,
          fromTechnology: m1.technology,
          toTechnology: m2.technology,
          derivedCrossoverQuantity: derivedCrossoverQ,
          reason: 'ECONOMIC_ROUTE_CROSSOVER'
        };
        break;
      }
    }

    timer.finish('machine_route_candidate_evaluated', {
      crossoverDetected,
      quantityCount: sortedQuantities.length
    });

    return {
      tenantId,
      printhouseId,
      mode: ROUTE_SELECTION_MODES.SHADOW,
      crossoverDetected,
      crossoverDetails,
      quantityResults
    };
  }

  /**
   * Executes SHADOW comparison between legacy node-level rates_json pricing and diagnostic machine route selection.
   */
  async evaluateShadowRouting(tenantId, printhouseId, bookSpec, nodeRatesSnapshot, options = {}) {
    // 1. Calculate Canonical Legacy Node Price
    const legacyEval = adapter.evaluateForwardPrice(bookSpec, nodeRatesSnapshot, {}, { id: printhouseId });

    // 2. Calculate Diagnostic Machine Route Selection
    const quantities = options.quantities || [Number(bookSpec.copies || 500)];
    const routeEval = await this.evaluateProductionRoutes(tenantId, printhouseId, bookSpec, quantities, options);

    const firstQtyResult = routeEval.quantityResults[0] || {};
    const recommended = firstQtyResult.recommendedRoute;

    const costDiff = recommended && recommended.manufacturingCost !== null
      ? Number((recommended.manufacturingCost - legacyEval.predictedManufacturingPrice).toFixed(4))
      : null;

    return {
      mode: ROUTE_SELECTION_MODES.SHADOW,
      forwardPricingAuthority: 'LEGACY_NODE_RATES_JSON',
      legacyManufacturingPrice: legacyEval.predictedManufacturingPrice,
      recommendedMachineRoute: recommended || null,
      costDifference: costDiff,
      crossoverAnalysis: {
        crossoverDetected: routeEval.crossoverDetected,
        crossoverDetails: routeEval.crossoverDetails
      },
      allEvaluatedRoutes: firstQtyResult.allRoutes || [],
      ratesJsonMutated: false,
      revisionCreated: false,
      forwardPricingConsumed: false
    };
  }
}

module.exports = new ProductionRouteSelectionService();
module.exports.ROUTE_SELECTION_MODES = ROUTE_SELECTION_MODES;
module.exports.INELIGIBILITY_REASONS = INELIGIBILITY_REASONS;
