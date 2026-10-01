/**
 * src/api/services/productionRouteSelectionService.js
 *
 * Phase 195D — Governed Route Boundaries & Machine Breakpoints (SHADOW Mode)
 *
 * SCIENTIFIC INVARIANT & CLARIFICATION:
 * Shadow route selection evaluations represent model evidence based on current
 * configured machine economic profiles. They DO NOT state or prove what physical
 * machine a real supplier (e.g. Dardedze for Natur) actually used during production.
 *
 * Responsibilities:
 * 1. Formally distinguishes Boundary Taxonomy: CAPABILITY_LIMIT, ECONOMIC_CROSSOVER,
 *    OPERATOR_RULE, COMMERCIAL_TIER, CAPACITY_CONSTRAINT, MAINTENANCE_CONSTRAINT, GOVERNED_ROUTE_OVERRIDE.
 * 2. Enforces deterministic Rule Precedence: Tenant Isolation -> Physical Capability ->
 *    Maintenance/Availability -> Operator Governed Constraint -> Economic Comparison -> Tie-Break Policy.
 * 3. Derives Economic Crossovers analytically without hardcoded quantity thresholds.
 * 4. Provides Crossover Tolerance & Tie-Zone logic to prevent route flapping/thrashing.
 * 5. Evaluates Boundary Probes (q-1, q, q+1) and derives Route Intervals over quantity ranges.
 * 6. Executes strictly in SHADOW_COMPARISON mode: legacy node rates_json remains 100% authoritative.
 */

const machinePricingService = require('./printhouseMachinePricingService');
const routeRuleService = require('./printhouseRouteRuleService');
const adapter = require('./buildPriceCalibrationAdapter');
const telemetry = require('./phase194TelemetryService');
const logger = require('./logger').child('production-route-selection');
const db = require('./mysqlClient');

const ROUTE_SELECTION_MODES = Object.freeze({
  SHADOW: 'SHADOW_COMPARISON',
  ACTIVE: 'ACTIVE_ROUTING' // Not used in 195D!
});

const BOUNDARY_TYPES = Object.freeze({
  CAPABILITY_LIMIT: 'CAPABILITY_LIMIT',
  ECONOMIC_CROSSOVER: 'ECONOMIC_CROSSOVER',
  OPERATOR_RULE: 'OPERATOR_RULE',
  COMMERCIAL_TIER: 'COMMERCIAL_TIER',
  CAPACITY_CONSTRAINT: 'CAPACITY_CONSTRAINT',
  MAINTENANCE_CONSTRAINT: 'MAINTENANCE_CONSTRAINT',
  GOVERNED_ROUTE_OVERRIDE: 'GOVERNED_ROUTE_OVERRIDE',
  ECONOMIC_TIE_ZONE: 'ECONOMIC_TIE_ZONE',
  UNSTABLE_ROUTE_BOUNDARY: 'UNSTABLE_ROUTE_BOUNDARY'
});

const INELIGIBILITY_REASONS = Object.freeze({
  FORMAT_UNSUPPORTED: 'FORMAT_UNSUPPORTED',
  COLOUR_CONFIGURATION_UNSUPPORTED: 'COLOUR_CONFIGURATION_UNSUPPORTED',
  BINDING_METHOD_UNSUPPORTED: 'BINDING_METHOD_UNSUPPORTED',
  QUANTITY_BELOW_MIN: 'QUANTITY_BELOW_MIN',
  QUANTITY_ABOVE_MAX: 'QUANTITY_ABOVE_MAX',
  MACHINE_PROFILE_NOT_READY: 'MACHINE_PROFILE_NOT_READY',
  CROSS_TENANT_MISMATCH: 'CROSS_TENANT_MISMATCH',
  MAINTENANCE_STATUS: 'MAINTENANCE_STATUS',
  OPERATOR_RULE_PROHIBITED: 'OPERATOR_RULE_PROHIBITED'
});

const PRECEDENCE_LEVELS = Object.freeze({
  LEVEL_1_TENANT: 1,
  LEVEL_2_PHYSICAL_CAPABILITY: 2,
  LEVEL_3_MAINTENANCE: 3,
  LEVEL_4_OPERATOR_GOVERNED_RULE: 4,
  LEVEL_5_ECONOMIC_COMPARISON: 5,
  LEVEL_6_TIE_BREAK_POLICY: 6
});

// Tolerances for tie-zone classification
const CROSSOVER_TOLERANCE_ABS = 1.00; // €1.00 absolute cost difference
const CROSSOVER_TOLERANCE_PCT = 0.005; // 0.5% relative cost difference

function _isDbFallbackAllowed() {
  return process.env.NODE_ENV === 'test' ||
    Boolean(process.env.ALLOW_DB_FALLBACK_FOR_SMOKE) ||
    !process.env.MYSQL_HOST ||
    process.env.MYSQL_HOST === 'NOT_SET';
}

class ProductionRouteSelectionService {

  constructor() {
    this.MODES = ROUTE_SELECTION_MODES;
    this.BOUNDARIES = BOUNDARY_TYPES;
    this.REASONS = INELIGIBILITY_REASONS;
    this.PRECEDENCE = PRECEDENCE_LEVELS;
  }

  /**
   * Evaluates physical capability eligibility for a given machine against job specifications.
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
   * Evaluates Operator Route Rules against job specification and candidate machine.
   */
  evaluateOperatorRuleForMachine(rule, machine, bookSpec, quantity) {
    if (!rule || rule.status !== 'VALIDATED') return { matches: false };

    const cond = rule.conditions_json || rule.conditions || {};
    const act = rule.action_json || rule.action || {};
    const q = Number(quantity);

    let match = true;

    if (typeof cond.minQuantity === 'number' && q < cond.minQuantity) match = false;
    if (typeof cond.maxQuantity === 'number' && q > cond.maxQuantity) match = false;
    if (cond.machineId && cond.machineId !== machine.id) match = false;
    if (cond.paperWeightGsmMin && (bookSpec.interior_paper_weight_gsm || 0) < cond.paperWeightGsmMin) match = false;

    if (!match) return { matches: false };

    return {
      matches: true,
      ruleId: rule.id,
      ruleName: rule.rule_name,
      ruleType: rule.rule_type,
      ruleChecksum: rule.checksum,
      action: act.actionType || act.type || 'PROHIBIT',
      forcedMachineId: act.targetMachineId || act.forcedMachineId || null
    };
  }

  /**
   * Evaluates all candidate machine routes for a given job and quantity with Precedence Hierarchy.
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

    if (machines.length === 0 && Array.isArray(options.mockMachines)) {
      machines = options.mockMachines.filter(m => m.tenant_id === tenantId);
    }

    // Fetch active route rules
    let routeRules = [];
    if (Array.isArray(options.mockRules)) {
      routeRules = options.mockRules.filter(r => r.tenant_id === tenantId && r.status === 'VALIDATED');
    } else {
      routeRules = await routeRuleService.getActiveRouteRules(tenantId, printhouseId);
    }

    const routeResults = [];
    let operatorAppliedRule = null;

    for (const machine of machines) {
      let profile = null;
      if (options.mockProfiles && options.mockProfiles[machine.id]) {
        profile = options.mockProfiles[machine.id];
      } else {
        profile = await machinePricingService.getActiveMachinePricingProfile(tenantId, machine.id);
      }

      // Precedence Level 2 & 3: Physical Capability & Maintenance
      const eligibility = this.evaluateMachineEligibility(machine, profile, bookSpec, q);

      if (!eligibility.eligible) {
        const primaryReason = eligibility.reasons.includes(INELIGIBILITY_REASONS.MAINTENANCE_STATUS)
          ? BOUNDARY_TYPES.MAINTENANCE_CONSTRAINT
          : BOUNDARY_TYPES.CAPABILITY_LIMIT;

        routeResults.push({
          machineId: machine.id,
          machineName: machine.machine_name || machine.id,
          technology: machine.machine_type || 'UNKNOWN',
          eligible: false,
          ineligibilityReasons: eligibility.reasons,
          boundaryType: primaryReason,
          precedenceLevel: eligibility.reasons.includes(INELIGIBILITY_REASONS.MAINTENANCE_STATUS)
            ? PRECEDENCE_LEVELS.LEVEL_3_MAINTENANCE
            : PRECEDENCE_LEVELS.LEVEL_2_PHYSICAL_CAPABILITY,
          manufacturingCost: null
        });
        continue;
      }

      // Precedence Level 4: Operator Governed Rules
      let ruleProhibited = false;
      for (const rule of routeRules) {
        const ruleEval = this.evaluateOperatorRuleForMachine(rule, machine, bookSpec, q);
        if (ruleEval.matches) {
          if (ruleEval.action === 'PROHIBIT') {
            ruleProhibited = true;
            operatorAppliedRule = ruleEval;
            routeResults.push({
              machineId: machine.id,
              machineName: machine.machine_name || machine.id,
              technology: machine.machine_type || 'UNKNOWN',
              eligible: false,
              ineligibilityReasons: [INELIGIBILITY_REASONS.OPERATOR_RULE_PROHIBITED],
              boundaryType: BOUNDARY_TYPES.OPERATOR_RULE,
              precedenceLevel: PRECEDENCE_LEVELS.LEVEL_4_OPERATOR_GOVERNED_RULE,
              appliedRule: ruleEval,
              manufacturingCost: null
            });
            break;
          } else if (ruleEval.action === 'FORCE_MACHINE') {
            operatorAppliedRule = ruleEval;
          }
        }
      }

      if (ruleProhibited) continue;

      const costData = this.calculateRouteCost(machine, profile, bookSpec, q);
      routeResults.push({
        eligible: true,
        ineligibilityReasons: [],
        boundaryType: null,
        precedenceLevel: PRECEDENCE_LEVELS.LEVEL_5_ECONOMIC_COMPARISON,
        ...costData
      });
    }

    // Rank eligible routes by manufacturingCost ascending
    const eligibleRoutes = routeResults.filter(r => r.eligible).sort((a, b) => a.manufacturingCost - b.manufacturingCost);

    let recommendedRoute = null;
    let selectionReason = 'NO_ELIGIBLE_ROUTE';
    let boundaryType = null;
    let isTieZone = false;
    let tieZoneDetails = null;

    // Operator Pinned Machine or Governed Rule Override
    if (options.pinnedMachineId) {
      const pinned = routeResults.find(r => r.machineId === options.pinnedMachineId);
      if (pinned && pinned.eligible) {
        recommendedRoute = pinned;
        selectionReason = 'OPERATOR_PINNED_MACHINE';
        boundaryType = BOUNDARY_TYPES.GOVERNED_ROUTE_OVERRIDE;
      } else {
        selectionReason = 'PINNED_MACHINE_INELIGIBLE';
        boundaryType = BOUNDARY_TYPES.CAPABILITY_LIMIT;
      }
    } else if (operatorAppliedRule && operatorAppliedRule.action === 'FORCE_MACHINE') {
      const forced = routeResults.find(r => r.machineId === operatorAppliedRule.forcedMachineId);
      if (forced && forced.eligible) {
        recommendedRoute = forced;
        selectionReason = 'OPERATOR_GOVERNED_RULE';
        boundaryType = BOUNDARY_TYPES.OPERATOR_RULE;
      }
    }

    // Economic Selection & Tie-Zone Evaluation
    if (!recommendedRoute) {
      if (eligibleRoutes.length === 1) {
        recommendedRoute = eligibleRoutes[0];
        selectionReason = 'ONLY_ELIGIBLE_MACHINE';
        boundaryType = BOUNDARY_TYPES.CAPABILITY_LIMIT;
      } else if (eligibleRoutes.length > 1) {
        const top1 = eligibleRoutes[0];
        const top2 = eligibleRoutes[1];
        const diffAbs = Math.abs(top1.manufacturingCost - top2.manufacturingCost);
        const diffPct = top1.manufacturingCost > 0 ? diffAbs / top1.manufacturingCost : 0;

        if (diffAbs <= CROSSOVER_TOLERANCE_ABS || diffPct <= CROSSOVER_TOLERANCE_PCT) {
          isTieZone = true;
          boundaryType = BOUNDARY_TYPES.ECONOMIC_TIE_ZONE;
          selectionReason = 'ECONOMIC_TIE_ZONE_RESOLVED';

          // Deterministic Governed Tie-Break Policy: LOWER_SETUP -> LOWER_VARIABLE_COST -> STABLE_MACHINE_ID
          const setup1 = top1.breakdown.fixedSetup + top1.breakdown.makeready + top1.breakdown.plateCost;
          const setup2 = top2.breakdown.fixedSetup + top2.breakdown.makeready + top2.breakdown.plateCost;

          if (setup1 !== setup2) {
            recommendedRoute = setup1 < setup2 ? top1 : top2;
          } else if (top1.unitManufacturingCost !== top2.unitManufacturingCost) {
            recommendedRoute = top1.unitManufacturingCost < top2.unitManufacturingCost ? top1 : top2;
          } else {
            recommendedRoute = top1.machineId.localeCompare(top2.machineId) <= 0 ? top1 : top2;
          }

          tieZoneDetails = {
            candidate1: top1.machineId,
            candidate2: top2.machineId,
            costDifferenceAbs: Number(diffAbs.toFixed(4)),
            costDifferencePct: Number(diffPct.toFixed(6)),
            resolvedBy: 'LOWER_SETUP_AND_STABLE_ID'
          };

          telemetry.startTimer('machine_route_tie_zone_detected', { tenantId, printerNodeId: printhouseId })
            .finish('machine_route_tie_zone_detected', { quantity: q, machine1: top1.machineId, machine2: top2.machineId });
        } else {
          recommendedRoute = top1;
          selectionReason = 'LOWEST_VALID_MANUFACTURING_COST';
          boundaryType = BOUNDARY_TYPES.ECONOMIC_CROSSOVER;
        }
      }
    }

    if (operatorAppliedRule) {
      telemetry.startTimer('machine_route_operator_rule_applied', { tenantId, printerNodeId: printhouseId })
        .finish('machine_route_operator_rule_applied', { ruleId: operatorAppliedRule.ruleId, quantity: q });
    }

    return {
      quantity: q,
      selectionReason,
      boundaryType,
      isTieZone,
      tieZoneDetails,
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
          fromProfileChecksum: m1.profileChecksum,
          toProfileChecksum: m2.profileChecksum,
          derivedCrossoverQuantity: derivedCrossoverQ,
          boundaryType: r2.boundaryType || BOUNDARY_TYPES.ECONOMIC_CROSSOVER,
          reason: r2.selectionReason || 'ECONOMIC_ROUTE_CROSSOVER'
        };

        telemetry.startTimer('machine_route_boundary_detected', { tenantId, printerNodeId: printhouseId })
          .finish('machine_route_boundary_detected', {
            fromMachineId: m1.machineId,
            toMachineId: m2.machineId,
            crossoverQuantity: derivedCrossoverQ
          });
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
   * Evaluates Boundary Probes (q-1, q, q+1) around a target quantity to detect route instability or thrashing.
   */
  async evaluateBoundaryProbes(tenantId, printhouseId, bookSpec, targetQuantity, options = {}) {
    const q = Number(targetQuantity);
    const qBefore = Math.max(1, q - 1);
    const qAt = q;
    const qAfter = q + 1;

    const [resBefore, resAt, resAfter] = await Promise.all([
      this.evaluateRoutesForQuantity(tenantId, printhouseId, bookSpec, qBefore, options),
      this.evaluateRoutesForQuantity(tenantId, printhouseId, bookSpec, qAt, options),
      this.evaluateRoutesForQuantity(tenantId, printhouseId, bookSpec, qAfter, options)
    ]);

    const mBefore = resBefore.recommendedRoute ? resBefore.recommendedRoute.machineId : null;
    const mAt = resAt.recommendedRoute ? resAt.recommendedRoute.machineId : null;
    const mAfter = resAfter.recommendedRoute ? resAfter.recommendedRoute.machineId : null;

    // Detect Thrashing: e.g. A -> B -> A
    const isUnstable = (mBefore && mAt && mAfter) && (mBefore === mAfter && mAt !== mBefore);

    if (isUnstable) {
      telemetry.startTimer('machine_route_boundary_unstable', { tenantId, printerNodeId: printhouseId })
        .finish('machine_route_boundary_unstable', { quantity: q, mBefore, mAt, mAfter });
    }

    return {
      quantityProbe: q,
      isUnstable,
      boundaryType: isUnstable ? BOUNDARY_TYPES.UNSTABLE_ROUTE_BOUNDARY : (resAt.boundaryType || BOUNDARY_TYPES.ECONOMIC_CROSSOVER),
      routeBefore: { quantity: qBefore, machineId: mBefore, cost: resBefore.recommendedRoute ? resBefore.recommendedRoute.manufacturingCost : null },
      routeAt: { quantity: qAt, machineId: mAt, cost: resAt.recommendedRoute ? resAt.recommendedRoute.manufacturingCost : null },
      routeAfter: { quantity: qAfter, machineId: mAfter, cost: resAfter.recommendedRoute ? resAfter.recommendedRoute.manufacturingCost : null }
    };
  }

  /**
   * Derives Route Intervals [minQuantity, maxQuantity] across a bounded quantity range.
   */
  async deriveRouteIntervals(tenantId, printhouseId, bookSpec, minQuantity = 10, maxQuantity = 2000, options = {}) {
    const minQ = Number(minQuantity);
    const maxQ = Number(maxQuantity);
    const step = options.step || 50;

    const sampleQuantities = [];
    for (let q = minQ; q <= maxQ; q += step) {
      sampleQuantities.push(q);
    }
    if (sampleQuantities[sampleQuantities.length - 1] !== maxQ) {
      sampleQuantities.push(maxQ);
    }

    const evalRes = await this.evaluateProductionRoutes(tenantId, printhouseId, bookSpec, sampleQuantities, options);
    const intervals = [];

    let currentInterval = null;

    for (const qRes of evalRes.quantityResults) {
      const rec = qRes.recommendedRoute;
      const recId = rec ? rec.machineId : 'NONE';

      if (!currentInterval) {
        currentInterval = {
          minQuantity: qRes.quantity,
          maxQuantity: qRes.quantity,
          recommendedMachineId: recId,
          recommendedMachineName: rec ? rec.machineName : 'NONE',
          profileChecksum: rec ? rec.profileChecksum : null,
          boundaryType: qRes.boundaryType,
          reason: qRes.selectionReason
        };
      } else if (currentInterval.recommendedMachineId === recId) {
        currentInterval.maxQuantity = qRes.quantity;
      } else {
        intervals.push({ ...currentInterval });
        currentInterval = {
          minQuantity: qRes.quantity,
          maxQuantity: qRes.quantity,
          recommendedMachineId: recId,
          recommendedMachineName: rec ? rec.machineName : 'NONE',
          profileChecksum: rec ? rec.profileChecksum : null,
          boundaryType: qRes.boundaryType,
          reason: qRes.selectionReason
        };
      }
    }

    if (currentInterval) {
      intervals.push(currentInterval);
    }

    return {
      minQuantity: minQ,
      maxQuantity: maxQ,
      intervalCount: intervals.length,
      intervals
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
module.exports.BOUNDARY_TYPES = BOUNDARY_TYPES;
module.exports.INELIGIBILITY_REASONS = INELIGIBILITY_REASONS;
module.exports.PRECEDENCE_LEVELS = PRECEDENCE_LEVELS;
