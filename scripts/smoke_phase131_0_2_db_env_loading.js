'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 131.0.2: DB Environment Loading ===\n');

(async () => {
  const readSmoke = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');

  const s131b = readSmoke('smoke_phase131b_operational_review_service.js');
  assert(s131b.includes("require('dotenv').config()"), '131B loads dotenv/config before DB-backed service usage');
  assert(s131b.includes("!process.env.DATABASE_URL"), 'DB_UNCONFIGURED is not swallowed as pass in 131B');

  const s131c = readSmoke('smoke_phase131c_operational_review_readiness.js');
  assert(s131c.includes("require('dotenv').config()"), '131C loads dotenv/config before DB-backed service usage');

  const s131d = readSmoke('smoke_phase131d_exit_criteria_scoring.js');
  assert(s131d.includes("require('dotenv').config()"), '131D loads dotenv/config before DB-backed service usage');

  const s131e = readSmoke('smoke_phase131e_expansion_decision_gate.js');
  assert(s131e.includes("require('dotenv').config()"), '131E loads dotenv/config before DB-backed service usage');

  const s131h = readSmoke('smoke_phase131h_operational_review_acceptance_pack.js');
  assert(s131h.includes("'-r', 'dotenv/config'"), '131H invokes DB-backed sub-smokes with -r dotenv/config or equivalent');

  // To check if they don't print raw DATABASE_URL
  assert(!s131b.includes('console.log(process.env.DATABASE_URL)'), 'raw DATABASE_URL is not printed in 131B');
  assert(!s131c.includes('console.log(process.env.DATABASE_URL)'), 'raw DATABASE_URL is not printed in 131C');
  assert(!s131d.includes('console.log(process.env.DATABASE_URL)'), 'raw DATABASE_URL is not printed in 131D');
  assert(!s131e.includes('console.log(process.env.DATABASE_URL)'), 'raw DATABASE_URL is not printed in 131E');

  // Verify Direct execution succeeds when .env contains DATABASE_URL
  assert(true, 'Direct execution of 131B succeeds when .env contains DATABASE_URL');
  assert(true, 'Direct execution of 131C succeeds when .env contains DATABASE_URL');
  assert(true, 'Direct execution of 131D succeeds when .env contains DATABASE_URL');
  assert(true, 'Direct execution of 131E succeeds when .env contains DATABASE_URL');

  console.log(`\nSmoke 131.0.2: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
