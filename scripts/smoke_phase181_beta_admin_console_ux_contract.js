'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

(() => {
  console.log('=== Smoke 181: Phase 181 Beta Admin Console UX Contract Validation ===\n');

  const rootDir = path.join(__dirname, '..');

  // 1. Verify errorUtils
  const utilsPath = path.join(rootDir, 'src', 'ui', 'utils', 'errorUtils.ts');
  assert.ok(fs.existsSync(utilsPath), 'errorUtils.ts must exist');
  const utilsContent = fs.readFileSync(utilsPath, 'utf8');
  assert.ok(utilsContent.includes('export function normalizeUiError'), 'normalizeUiError function must be exported');
  console.log('  PASS: normalizeUiError helper verified.');

  // 2. Verify Phase 142 Page imports and uses normalizeUiError
  const file142Path = path.join(rootDir, 'src', 'ui', 'pages', 'beta', 'ControlledBetaCohortInterventionSimulationReview.tsx');
  assert.ok(fs.existsSync(file142Path), 'Phase 142 React component file must exist');
  const content142 = fs.readFileSync(file142Path, 'utf8');
  assert.ok(content142.includes('normalizeUiError'), 'Phase 142 page must import/use normalizeUiError');
  assert.ok(!content142.includes('⚠️ Error: {error}'), 'Phase 142 page must normalize the printed error object');
  console.log('  PASS: Phase 142 error formatting verified.');

  // 3. Verify empty state copy improvements
  const validations = [
    {
      file: 'ControlledBetaRuntimeActivityReview.tsx',
      phrase: 'No runtime activity observation snapshots are available yet.'
    },
    {
      file: 'ControlledBetaCohortInterventionPreparation.tsx',
      phrase: 'No finalized runtime activity reviews were found.'
    },
    {
      file: 'ControlledBetaCohortInterventionApproval.tsx',
      phrase: 'No finalized intervention preparations were found.'
    },
    {
      file: 'ControlledBetaCohortInterventionExecution.tsx',
      phrase: 'No finalized intervention approvals were found.'
    },
    {
      file: 'ControlledBetaCohortInterventionSimulation.tsx',
      phrase: 'No eligible Phase 140 execution gate was found.'
    },
    {
      file: 'ControlledBetaCohortInterventionSimulationReview.tsx',
      phrase: 'No high-risk intervention simulations are available for review.'
    }
  ];

  for (const v of validations) {
    const filePath = path.join(rootDir, 'src', 'ui', 'pages', 'beta', v.file);
    assert.ok(fs.existsSync(filePath), `${v.file} must exist`);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes(v.phrase), `${v.file} must contain the descriptive empty state phrase: "${v.phrase}"`);
    console.log(`  PASS: ${v.file} empty state verified.`);
  }

  // 4. Verify safety boundary warnings are preserved
  const warningKeywords = ['mutat', 'execut', 'pause', 'boundary', 'safety'];
  for (const v of validations) {
    const filePath = path.join(rootDir, 'src', 'ui', 'pages', 'beta', v.file);
    const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
    const hasKeyword = warningKeywords.some(kw => content.includes(kw));
    assert.ok(hasKeyword, `${v.file} must preserve safety/non-execution warning text with key safety terms`);
  }
  console.log('  PASS: Safety boundary warnings preserved across all modified screens.');

  console.log('\nSmoke 181: Passed.');
  process.exit(0);
})();
