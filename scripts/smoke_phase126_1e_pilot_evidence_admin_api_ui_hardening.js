'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

process.env.JWT_SECRET = 'smoketestsecret';
const router = require('../src/api/routes/pilotEvidenceReviewGoNoGoAdmin');

// Verify that the router exports a router function/middleware
assert(typeof router === 'function', "Router is exported correctly");

// Verify that the routes are registered
const routes = router.stack.map(layer => layer.route && layer.route.path).filter(Boolean);
assert(routes.includes('/readiness'), "Route /readiness is registered");
assert(routes.includes('/create'), "Route /create is registered");
assert(routes.includes('/aggregate'), "Route /aggregate is registered");
assert(routes.includes('/decision'), "Route /decision is registered");
assert(routes.includes('/evidence-pack'), "Route /evidence-pack is registered");

console.log(`\nSmoke 126.1e: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
