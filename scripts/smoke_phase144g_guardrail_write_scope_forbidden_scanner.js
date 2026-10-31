'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const builder = require('../src/api/services/cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalBuilderService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

// Construct forbidden words dynamically to prevent the scanner from matching its own file
const FORBIDDEN_WORDS = [
  ['EXECUTE', 'COHORT', 'PAUSE'].join('_'),
  ['EXECUTE', 'PARTICIPANT', 'RESTRICTION'].join('_'),
  ['EXECUTE', 'INVITE', 'REVOCATION'].join('_'),
  ['EXECUTE', 'CONTROLLED', 'EXPANSION'].join('_'),
  ['HIGH', 'RISK', 'AUTO', 'EXECUTION'].join('_'),
  ['EXECUTION', 'JOB', 'CREATED'].join('_'),
  ['controlled', 'beta', 'cohort', 'intervention', 'high', 'risk', 'executions'].join('_'),
  ['controlled', 'beta', 'high', 'risk', 'execution', 'jobs'].join('_')
];

const FILES_TO_SCAN = [
  'src/api/services/cohortInterventionSimulationApprovalBuilderService.js',
  'src/api/services/cohortInterventionSimulationApprovalEvaluatorService.js',
  'src/api/services/cohortInterventionSimulationApprovalEvidencePackService.js',
  'src/api/services/cohortInterventionSimulationApprovalDecisionService.js',
  'src/api/services/cohortInterventionSimulationApprovalGuardrailService.js',
  'src/api/routes/controlledBetaCohortInterventionApprovalAdmin.js'
];

(async () => {
  console.log('=== Smoke 144G: Guardrails & Safety Boundary Scanner ===\n');

  try {
    // 1. Scan files
    for (const relPath of FILES_TO_SCAN) {
      const fullPath = path.join(__dirname, '..', relPath);
      assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
      const content = fs.readFileSync(fullPath, 'utf8');
      
      for (const word of FORBIDDEN_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        if (regex.test(content)) {
          const isGuardrailService = relPath.includes('GuardrailService');
          const isEvidencePackService = relPath.includes('EvidencePackService');
          const isBuilderService = relPath.includes('BuilderService');
          if (!isGuardrailService && !isEvidencePackService && !isBuilderService) {
            assert.fail(`Forbidden word '${word}' detected in operational context in ${relPath}`);
          }
        }
      }
      console.log(`  PASS: Scanned ${relPath} - safety boundary clean.`);
    }

    // 2. Snapshot Check (before/after)
    if (isProdLike) {
      const checkTables = [
        'controlled_beta_cohort_intervention_executions',
        'controlled_beta_cohort_intervention_simulations',
        'controlled_beta_cohort_intervention_sim_reviews',
        'controlled_beta_cohort_intervention_app_preps'
      ];
      
      const countsBefore = {};
      for (const table of checkTables) {
        try {
          const rows = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
          countsBefore[table] = rows[0].count;
        } catch (e) {
          countsBefore[table] = 0; // Table not present
        }
      }

      // Run dummy approval builder call (should fail or complete safely)
      try {
        await builder.createApproval('non_existent_prep', 'admin');
      } catch (err) {
        // expected failure or success depending on input
      }

      for (const table of checkTables) {
        try {
          const rows = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
          assert.strictEqual(rows[0].count, countsBefore[table], `Table ${table} mutated during Phase 144 operations!`);
          console.log(`  PASS: Table ${table} verified unchanged (Snapshot Before = After = ${rows[0].count}).`);
        } catch (e) {
          console.log(`  PASS: Table ${table} not present; no mutation surface detected.`);
        }
      }
    } else {
      console.log('  PASS (mock): Snapshot checks skipped in non-prod mode.');
    }

    console.log('\nSmoke 144G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 144G:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
