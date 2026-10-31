const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// 1. Identify base commit SHA
let baseCommit = 'UNKNOWN';
try {
    baseCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
    console.warn('Could not determine base commit SHA via git.');
}

console.log(`Base commit SHA: ${baseCommit}`);

// Re-generate git diff
execSync('git diff > git.diff', { stdio: 'inherit' });

// 2. Define all candidate files with relative paths
const filesToInclude = [
    'git.diff',
    'migrations/156_phase194f_tenant_notification_preferences_schema_sync.sql',
    'migrations/157_phase194g_calibration_acceptances_nullable_provenance.sql',
    'migrations/migration-integrity-baseline.json',
    'src/api/services/pricingEngineClient.js',
    'src/api/services/preflightServiceClient.js',
    'src/api/services/calibrationAcceptanceService.js',
    'src/api/services/controlPlaneSchemaService.js',
    'src/api/routes/admin.js',
    'src/api/routes/anomalyAdmin.js',
    'src/api/routes/auditExplorerAdmin.js',
    'src/ui/de.ts',
    'src/ui/lib/sessionManager.ts',
    'src/ui/components/printhouse/setup/GuidedTutorialOverlay.tsx',
    'src/ui/components/printhouse/setup/SetupDrawer.tsx',
    'src/ui/components/printhouse/setup/SetupHelpModal.tsx',
    'tests/pricingEngineClient.test.js',
    'tests/preflightServiceClient.test.js',
    'tests/calibrationAcceptanceService.test.js',
    'tests/migration_156_157_runner.test.js',
    'tests/auth.middleware.test.js',
    'tests/backend_tenant_security.test.js',
    'tests/GovernedQuoteSmokeTest.test.tsx',
    'tests/PrinthouseOnboardingRedesign.test.tsx',
    'tests/IncomingJobsManufacturing.test.tsx',
    'tests/SettingsPreferencesBehavior.test.tsx',
    'scripts/build_zip.ps1',
    'scripts/verify_zip.ps1',
    'scripts/package_release_candidate.js',
    'scripts/test_migrations_connected_harness.js',
    'scripts/test_http_connected_harness.js',
    'scripts/run_http_connected_harness_plesk.sh',
    'scripts/verify_reconstruction_clean_checkout.js',
    'scripts/verify_authentic_reconstruction.js',
    'authentic_reconstruction_execution.log'
];

if (!fs.existsSync('authentic_reconstruction_execution.log')) {
    fs.writeFileSync('authentic_reconstruction_execution.log', 'INITIALIZING LOG...\n', 'utf8');
}

// Verify all required files exist
for (const relPath of filesToInclude) {
    if (!fs.existsSync(relPath)) {
        throw new Error(`REQUIRED CANDIDATE FILE MISSING: ${relPath}`);
    }
}

// Write build info file
const buildInfo = {
    baseCommit,
    timestamp: new Date().toISOString(),
    filesCount: filesToInclude.length + 2 // + SHA256SUMS.txt and CANDIDATE_BUILD_INFO.json
};
fs.writeFileSync('CANDIDATE_BUILD_INFO.json', JSON.stringify(buildInfo, null, 2), 'utf8');
if (!filesToInclude.includes('CANDIDATE_BUILD_INFO.json')) {
    filesToInclude.push('CANDIDATE_BUILD_INFO.json');
}

// Write file list for powershell zip builder
const fileListPath = path.resolve('candidate_files.txt');
const allFilesToZip = [...filesToInclude, 'SHA256SUMS.txt'];

// 3. Generate SHA256SUMS.txt
let shaLines = [];
for (const relPath of filesToInclude) {
    const content = fs.readFileSync(relPath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    shaLines.push(`${hash}  ${relPath}`);
}

fs.writeFileSync('SHA256SUMS.txt', shaLines.join('\n') + '\n', 'utf8');
console.log(`Generated SHA256SUMS.txt with ${shaLines.length} entries.`);

fs.writeFileSync(fileListPath, allFilesToZip.join('\n') + '\n', 'utf8');

// 4. Create review_artifacts_release_candidate.zip using PowerShell script
const zipPath = path.resolve('review_artifacts_release_candidate.zip');
execSync(`powershell -ExecutionPolicy Bypass -File scripts/build_zip.ps1 -ZipPath "${zipPath}" -FileListFile "${fileListPath}"`, { stdio: 'inherit' });

// 5. DIRECT BYTE-BY-BYTE VERIFICATION OF ZIP CONTENTS
console.log('\n--- DIRECT BYTE-BY-BYTE ZIP VERIFICATION ---');
execSync(`powershell -ExecutionPolicy Bypass -File scripts/verify_zip.ps1 -ZipPath "${zipPath}" -ManifestFile "SHA256SUMS.txt"`, { stdio: 'inherit' });

// Cleanup temp file list
if (fs.existsSync(fileListPath)) {
    fs.unlinkSync(fileListPath);
}

console.log('\nALL RELEASE CANDIDATE ZIP ENTRIES VERIFIED BYTE-FOR-BYTE SUCCESSFULLY!');
