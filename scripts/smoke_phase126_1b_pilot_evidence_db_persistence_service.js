'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 126.1b: DB Persistence Service Verification ===\n');

process.env.NODE_ENV = 'production'; // Set to production to trigger strict fail-closed DB behavior
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'false';

const PilotEvidenceReviewGoNoGoService = require('../src/api/services/pilotEvidenceReviewGoNoGoService');
const svc = new PilotEvidenceReviewGoNoGoService();

(async () => {
  // If DB client is present but DB write fails (e.g. invalid query or disconnected), it should fail closed.
  // We can simulate DB failure or verify the mock behavior.
  // First, verify helper functions are present
  assert(typeof svc._dbWrite === 'function', "Service has _dbWrite method");
  assert(typeof svc._dbRead === 'function', "Service has _dbRead method");
  assert(typeof svc._getPersistenceInfo === 'function', "Service has _getPersistenceInfo method");

  // Let's temporarily override svc._db to simulate a write failure
  const originalDb = svc._db;
  svc._db = {
    query: async () => { throw new Error("Mock DB connection failure"); }
  };

  try {
    await svc.createReviewBoard({ board_name: 'Fail Closed Board' });
    assert(false, "Should have thrown on DB write failure in production mode");
  } catch (err) {
    assert(err.message.includes("Database write failed"), "Threw correct DB write failed error when DB write failed in production mode");
  }

  // Restore DB
  svc._db = originalDb;

  console.log(`\nSmoke 126.1b: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error("FATAL ERROR in 126.1b:", err);
  process.exit(1);
});
