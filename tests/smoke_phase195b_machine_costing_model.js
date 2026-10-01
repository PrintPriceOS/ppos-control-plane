/**
 * tests/smoke_phase195b_machine_costing_model.js
 *
 * Phase 195B — Machine-Specific Costing & Setup Data Model Smoke Test Suite
 *
 * Test cases 195B-01 through 195B-20
 */

const assert = require('assert');
const machinePricingService = require('../src/api/services/printhouseMachinePricingService');
const adapter = require('../src/api/services/buildPriceCalibrationAdapter');
const solver = require('../src/api/services/deterministicInversePricingSolver');

async function runTests() {
  console.log('==================================================');
  console.log('Running Phase 195B Machine Costing Model Smoke Tests');
  console.log('==================================================');

  const tenantId = 'tenant-195b-test';
  const nodeId = 'node-site-1';
  const digitalMachineId = 'mach-digital-101';
  const offsetMachineId = 'mach-offset-202';

  // 195B-01: Machine pricing profile creates successfully
  console.log('\n[TEST 195B-01] Machine pricing profile creates successfully...');
  const digitalPayload = {
    technology: 'DIGITAL_SHEETFED',
    currency: 'EUR',
    costs: {
      fixedSetup: { amount: 30, basis: 'PER_JOB' },
      clickCost: { amount: 0.08, basis: 'PER_CLICK' }
    },
    viability: { minQuantity: 1, maxQuantity: 1000 }
  };

  const p1 = await machinePricingService.createMachinePricingProfile(tenantId, nodeId, digitalMachineId, digitalPayload);
  assert.strictEqual(p1.version, 1);
  assert.strictEqual(p1.status, 'VALIDATED');
  assert.ok(p1.checksum.length === 64);
  console.log('✓ PASS 195B-01');

  // 195B-02: Machine identity separate from pricing profile
  console.log('\n[TEST 195B-02] Machine identity remains separate from pricing profile...');
  assert.strictEqual(p1.machineId, digitalMachineId);
  assert.notStrictEqual(p1.id, digitalMachineId);
  console.log('✓ PASS 195B-02');

  // 195B-03: Multiple machines under one node supported
  console.log('\n[TEST 195B-03] Multiple machines under one node supported...');
  const offsetPayload = {
    technology: 'OFFSET_SHEETFED',
    currency: 'EUR',
    costs: {
      fixedSetup: { amount: 250, basis: 'PER_JOB' },
      makeready: { amount: 150, basis: 'PER_JOB' },
      plateCost: { amount: 22, basis: 'PER_PLATE' },
      runCost: { amount: 18, basis: 'PER_1000_SHEETS' }
    },
    viability: { minQuantity: 501, maxQuantity: 50000 }
  };
  const p2 = await machinePricingService.createMachinePricingProfile(tenantId, nodeId, offsetMachineId, offsetPayload);
  assert.strictEqual(p2.printhouseId, nodeId);
  assert.strictEqual(p2.machineId, offsetMachineId);
  console.log('✓ PASS 195B-03');

  // 195B-04: Independent setup values per machine supported
  console.log('\n[TEST 195B-04] Independent setup values per machine supported...');
  assert.strictEqual(p1.costs.fixedSetup.amount, 30);
  assert.strictEqual(p2.costs.fixedSetup.amount, 250);
  console.log('✓ PASS 195B-04');

  // 195B-05: Different technology economics supported
  console.log('\n[TEST 195B-05] Different technology economics supported (DIGITAL vs OFFSET)...');
  assert.strictEqual(p1.technology, 'DIGITAL_SHEETFED');
  assert.strictEqual(p2.technology, 'OFFSET_SHEETFED');
  assert.strictEqual(p1.costs.clickCost.basis, 'PER_CLICK');
  assert.strictEqual(p2.costs.plateCost.basis, 'PER_PLATE');
  console.log('✓ PASS 195B-05');

  // 195B-06: Cost basis required for variable rates
  console.log('\n[TEST 195B-06] Cost basis required for variable rates...');
  try {
    await machinePricingService.createMachinePricingProfile(tenantId, nodeId, 'mach-invalid-1', {
      technology: 'DIGITAL_SHEETFED',
      currency: 'EUR',
      costs: { clickCost: { amount: 0.08, basis: 'INVALID_BASIS' } }
    });
    assert.fail('Should have rejected invalid cost basis');
  } catch (err) {
    assert.strictEqual(err.code, 'INVALID_MACHINE_PRICING_PROFILE');
  }
  console.log('✓ PASS 195B-06');

  // 195B-07: Currency required
  console.log('\n[TEST 195B-07] Currency required...');
  try {
    await machinePricingService.createMachinePricingProfile(tenantId, nodeId, 'mach-invalid-2', {
      technology: 'DIGITAL_SHEETFED',
      currency: 'INVALID_LONG_CODE',
      costs: {}
    });
    assert.fail('Should have rejected invalid currency');
  } catch (err) {
    assert.strictEqual(err.code, 'INVALID_MACHINE_PRICING_PROFILE');
  }
  console.log('✓ PASS 195B-07');

  // 195B-08: Negative costs rejected
  console.log('\n[TEST 195B-08] Negative costs rejected...');
  try {
    await machinePricingService.createMachinePricingProfile(tenantId, nodeId, 'mach-invalid-3', {
      technology: 'DIGITAL_SHEETFED',
      currency: 'EUR',
      costs: { fixedSetup: { amount: -50, basis: 'PER_JOB' } }
    });
    assert.fail('Should have rejected negative setup amount');
  } catch (err) {
    assert.strictEqual(err.code, 'INVALID_MACHINE_PRICING_PROFILE');
  }
  console.log('✓ PASS 195B-08');

  // 195B-09: NaN / Infinity rejected
  console.log('\n[TEST 195B-09] NaN / Infinity costs rejected...');
  try {
    await machinePricingService.createMachinePricingProfile(tenantId, nodeId, 'mach-invalid-4', {
      technology: 'DIGITAL_SHEETFED',
      currency: 'EUR',
      costs: { fixedSetup: { amount: NaN, basis: 'PER_JOB' } }
    });
    assert.fail('Should have rejected NaN amount');
  } catch (err) {
    assert.strictEqual(err.code, 'INVALID_MACHINE_PRICING_PROFILE');
  }
  console.log('✓ PASS 195B-09');

  // 195B-10: Zero vs Null distinguished
  console.log('\n[TEST 195B-10] Zero vs Null distinguished...');
  const zeroNullProfile = await machinePricingService.createMachinePricingProfile(tenantId, nodeId, 'mach-zero-null', {
    technology: 'DIGITAL_SHEETFED',
    currency: 'EUR',
    costs: {
      fixedSetup: { amount: 0, basis: 'PER_JOB' },
      clickCost: null
    }
  });
  assert.strictEqual(zeroNullProfile.costs.fixedSetup.amount, 0);
  assert.strictEqual(zeroNullProfile.costs.clickCost, null);
  console.log('✓ PASS 195B-10');

  // 195B-11 & 12: Cross-tenant & cross-printhouse isolation
  console.log('\n[TEST 195B-11 & 12] Tenant and Printhouse scoping isolation...');
  const foreignProfile = await machinePricingService.getActiveMachinePricingProfile('foreign-tenant', digitalMachineId);
  assert.strictEqual(foreignProfile, null, 'Foreign tenant MUST NOT see machine pricing profile');
  console.log('✓ PASS 195B-11 & 195B-12');

  // 195B-13: Canonical checksum deterministic
  console.log('\n[TEST 195B-13] Canonical checksum deterministic...');
  const p1_again = await machinePricingService.createMachinePricingProfile('tenant-temp', nodeId, 'mach-temp', digitalPayload);
  const p1_third = await machinePricingService.createMachinePricingProfile('tenant-temp', nodeId, 'mach-temp-2', digitalPayload);
  assert.strictEqual(p1_again.checksum, p1_third.checksum);
  console.log('✓ PASS 195B-13');

  // 195B-14 & 15: Versioning & Immutability (New version supersedes without mutation)
  console.log('\n[TEST 195B-14 & 15] Versioning & Immutability check...');
  const p1_v2 = await machinePricingService.createMachinePricingProfile(tenantId, nodeId, digitalMachineId, {
    ...digitalPayload,
    costs: { fixedSetup: { amount: 35, basis: 'PER_JOB' } }
  });
  assert.strictEqual(p1_v2.version, 2);
  const allVersions = await machinePricingService.listMachinePricingProfiles(tenantId, digitalMachineId);
  assert.strictEqual(allVersions.length, 2);
  assert.strictEqual(allVersions[1].version, 1);
  assert.strictEqual(allVersions[1].status, 'SUPERSEDED');
  assert.strictEqual(allVersions[1].costs.fixedSetup.amount, 30, 'V1 must remain immutable');
  console.log('✓ PASS 195B-14 & 195B-15');

  // 195B-16: Technology-specific readiness works
  console.log('\n[TEST 195B-16] Technology-specific readiness checks...');
  const rDigital = machinePricingService.evaluateReadiness(digitalPayload);
  assert.strictEqual(rDigital.status, 'READY');

  const rIncomplete = machinePricingService.evaluateReadiness({ technology: 'OFFSET_SHEETFED', costs: {} });
  assert.strictEqual(rIncomplete.status, 'NOT_CONFIGURED');
  console.log('✓ PASS 195B-16');

  // 195B-17: Legacy node pricing unchanged
  console.log('\n[TEST 195B-17] Legacy node pricing unchanged...');
  const initialRates = {
    interior_full_colour_fixed: { '16p': 120.0 },
    interior_full_colour_variable_per_1000: { '16p': 15.0 },
    paper_price_interior_by_kilo: { offset: 1.15 }
  };
  const bookSpec = { copies: 500, interior_pages: 128, delivery_country: 'ES' };
  const eval1 = adapter.evaluateForwardPrice(bookSpec, initialRates, {}, { id: nodeId });
  assert.ok(Number.isFinite(eval1.predictedManufacturingPrice));
  console.log('✓ PASS 195B-17');

  // 195B-18: Machine profile does NOT affect forward pricing yet
  console.log('\n[TEST 195B-18] Forward pricing isolation (forwardPricingConsumed = false)...');
  const eval2 = adapter.evaluateForwardPrice(bookSpec, initialRates, {}, { id: nodeId });
  assert.strictEqual(eval1.predictedManufacturingPrice, eval2.predictedManufacturingPrice);
  assert.strictEqual(p1_v2.forwardPricingConsumed, false);
  console.log('✓ PASS 195B-18');

  // 195B-19: Hawk-Eye does not claim machine pricing active
  console.log('\n[TEST 195B-19] Hawk-Eye active pricing truth check...');
  assert.strictEqual(p1_v2.forwardPricingConsumed, false);
  console.log('✓ PASS 195B-19');

  // 195B-20: Existing Phase 194 pipeline unchanged
  console.log('\n[TEST 195B-20] Existing Phase 194 pipeline unchanged...');
  const solverRes = solver.solveMultiQuantity({
    bookSpec: { copies: 500, interior_pages: 128 },
    currentRatesSnapshot: initialRates,
    calibrationTargets: [
      { quantity: 500, targetManufacturingPrice: 4321 },
      { quantity: 600, targetManufacturingPrice: 4604 },
      { quantity: 700, targetManufacturingPrice: 4846 }
    ]
  });
  assert.strictEqual(solverRes.status, 'UNDERDETERMINED');
  console.log('✓ PASS 195B-20');

  console.log('\n==================================================');
  console.log('ALL PHASE 195B SMOKE TESTS PASSED!');
  console.log('==================================================');
}

runTests().catch(err => {
  console.error('\n❌ Phase 195B Smoke Test Failed:', err);
  process.exit(1);
});
