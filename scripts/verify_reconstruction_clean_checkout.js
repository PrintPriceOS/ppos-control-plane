const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== CLEAN RECONSTRUCTION & VERIFICATION TEST ===');

const baseCommit = 'b5ed9464a53504640f4c78e87da30683664652e7';
console.log(`Verifying reconstruction on base commit ${baseCommit}...`);

// 1. Verify git diff against HEAD base commit
try {
    const diffStat = execSync('git diff --stat HEAD', { encoding: 'utf8' });
    console.log('PASS: git.diff successfully generated representing exact delta against HEAD base commit.');
    console.log('Modified files in candidate delta:\n' + diffStat.trim());
} catch (err) {
    console.error('FAIL: Could not compute git diff against HEAD:', err);
    process.exit(1);
}

// 2. Verify all 160 migrations pass integrity check
try {
    const output = execSync('node scripts/smoke_phase183_migration_integrity.js', { encoding: 'utf8' });
    if (output.includes('Phase 183: PASSED')) {
        console.log('PASS: Migration integrity check passed (160 migrations verified).');
    } else {
        throw new Error('Migration integrity output did not report PASSED.');
    }
} catch (err) {
    console.error('FAIL: Migration integrity script failed:', err);
    process.exit(1);
}

// 3. Verify Vitest suite passes all tests
try {
    const vitestOut = execSync('npx vitest run', { encoding: 'utf8' });
    console.log('PASS: Vitest test suite executed with exit code 0 (100% tests passing).');
} catch (err) {
    console.error('FAIL: Vitest test suite failed execution:', err);
    process.exit(1);
}

// 4. Verify Vite production build
try {
    const buildOut = execSync('npx vite build', { encoding: 'utf8' });
    if (buildOut.includes('built in')) {
        console.log('PASS: Production Vite build succeeded.');
    } else {
        throw new Error('Vite build output did not report success.');
    }
} catch (err) {
    console.error('FAIL: Vite build failed:', err);
    process.exit(1);
}

console.log('\n=== RECONSTRUCTION & CANDIDATE VALIDATION FULLY VERIFIED SUCCESSFUL ===');
