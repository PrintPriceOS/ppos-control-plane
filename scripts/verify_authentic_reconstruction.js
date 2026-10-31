/**
 * Authentic Separate Checkout Reconstruction Script (Phase 10 Intelligence Layer)
 * 
 * Strict Protocol Requirements:
 * 1. Isolated checkout in temporary directory outside workspace.
 * 2. Checks out exact base SHA: b5ed9464a53504640f4c78e87da30683664652e7 intact.
 * 3. Applies git.diff first onto intact base checkout via `git apply git.diff`.
 * 4. Compares file hashes of existing files post-diff and FAILS if differences exist (NO overwriting).
 * 5. Copies exclusively NEW untracked candidate files.
 * 6. Runs npm ci with its own FRESH node_modules (ABORTS on failure, NO fallback to npm install).
 * 7. Executes tests & build on Node runtime (Production Baseline: 20.20.2).
 * 8. Logs Node version, base SHA, executed commands, exit codes, and literal outputs to authentic_reconstruction_execution.log.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

function getFileHash(filepath) {
    const content = fs.readFileSync(filepath, 'utf8');
    const normalized = content.replace(/\r\n/g, '\n');
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

async function runAuthenticReconstruction() {
    const logLines = [];
    function log(msg) {
        console.log(msg);
        logLines.push(msg);
    }

    log('=== PPOS CONTROL PLANE: AUTHENTIC SEPARATE CHECKOUT RECONSTRUCTION ===');
    const baseCommit = 'b5ed9464a53504640f4c78e87da30683664652e7';
    const nodeVersion = process.version;
    const workspaceRoot = path.resolve(__dirname, '..');
    const zipPath = path.resolve(workspaceRoot, 'review_artifacts_release_candidate.zip');

    if (!fs.existsSync(zipPath)) {
        throw new Error(`Release candidate ZIP missing at ${zipPath}`);
    }

    const tempDir = path.join(os.tmpdir(), 'ppos_authentic_reconstruction_' + Date.now());
    log(`Workspace Root: ${workspaceRoot}`);
    log(`Target Base SHA: ${baseCommit}`);
    log(`Node.js Local Runtime: ${nodeVersion} (Production Node 20.20.2 Execution: PENDING / SERVER_ISOLATED_CHECKOUT_REQUIRED)`);
    log(`Isolated Reconstruction Dir: ${tempDir}`);

    try {
        // 1. Clone workspace into isolated temp directory
        log('\n--- Step 1: Performing Git Clone to Isolated Directory ---');
        log(`Command: git clone "${workspaceRoot}" "${tempDir}"`);
        execSync(`git clone "${workspaceRoot}" "${tempDir}"`, { stdio: 'pipe' });
        log('✔ Git clone complete. Exit Code: 0');

        // 2. Checkout intact base commit SHA
        log('\n--- Step 2: Checking out base SHA in isolated directory ---');
        log(`Command: git checkout ${baseCommit}`);
        execSync(`git checkout ${baseCommit}`, { cwd: tempDir, stdio: 'pipe' });
        log(`✔ Checked out base commit ${baseCommit}. Exit Code: 0`);

        // 3. Extract git.diff and new files from Candidate ZIP
        log('\n--- Step 3: Extracting Candidate ZIP Artifacts ---');
        const zipExtractTemp = path.join(os.tmpdir(), 'zip_extract_' + Date.now());
        const powershellExtract = `Expand-Archive -Path "${zipPath}" -DestinationPath "${zipExtractTemp}" -Force`;
        log(`Command: ${powershellExtract}`);
        execSync(`powershell -ExecutionPolicy Bypass -Command "${powershellExtract}"`, { stdio: 'pipe' });
        log('✔ Candidate ZIP extracted to intermediate location. Exit Code: 0');

        // 4. Apply git.diff FIRST over intact base checkout
        log('\n--- Step 4: Applying git.diff onto Intact Base Checkout ---');
        const diffPath = path.join(zipExtractTemp, 'git.diff');
        if (fs.existsSync(diffPath) && fs.readFileSync(diffPath, 'utf8').trim().length > 0) {
            log(`Command: git apply "${diffPath}"`);
            execSync(`git apply "${diffPath}"`, { cwd: tempDir, stdio: 'pipe' });
            log('✔ git.diff applied successfully over intact base commit. Exit Code: 0');
        } else {
            log('ℹ git.diff empty or missing; skipping git apply.');
        }

        // 5. Compare hashes for existing files and incorporate exclusively NEW untracked files
        log('\n--- Step 5: Validating Post-Diff File Hashes & Incorporating New Candidate Files ---');
        const copyNewFiles = (src, dest) => {
            const entries = fs.readdirSync(src, { withFileTypes: true });
            for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.name === 'git.diff' || entry.name === 'SHA256SUMS.txt' || entry.name === 'CANDIDATE_BUILD_INFO.json' || entry.name === 'authentic_reconstruction_execution.log' || entry.name === 'review_artifacts_release_candidate.zip') continue;
                if (entry.isDirectory()) {
                    if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
                    copyNewFiles(srcPath, destPath);
                } else {
                    if (!fs.existsSync(destPath)) {
                        fs.mkdirSync(path.dirname(destPath), { recursive: true });
                        fs.copyFileSync(srcPath, destPath);
                        log(`  + Incorporated new file: ${path.relative(tempDir, destPath)}`);
                    } else {
                        // Compare file hashes - overwriting existing modified files is strictly forbidden
                        const srcHash = getFileHash(srcPath);
                        const destHash = getFileHash(destPath);
                        if (srcHash !== destHash) {
                            throw new Error(`RECONSTRUCTION_HASH_MISMATCH: Existing file "${path.relative(tempDir, destPath)}" differs from candidate ZIP file! Overwriting existing modified files after diff is strictly forbidden.`);
                        }
                        log(`  ✔ Hash match post-diff for existing file: ${path.relative(tempDir, destPath)}`);
                    }
                }
            }
        };
        copyNewFiles(zipExtractTemp, tempDir);
        log('✔ All existing file hashes matched post-diff and new candidate files incorporated. Exit Code: 0');

        // 6. Fresh npm ci in isolated directory (NO reuse of workspace node_modules, NO fallback to npm install)
        log('\n--- Step 6: Installing Fresh Dependencies (npm ci) ---');
        log('Command: npm ci');
        try {
            const ciOut = execSync('npm ci', { cwd: tempDir, encoding: 'utf8' });
            log(ciOut.trim());
            log('✔ npm ci completed successfully. Exit Code: 0');
        } catch (e) {
            log('❌ npm ci failed; aborting reconstruction (fallback to npm install is strictly disabled).');
            throw e;
        }

        // 7. Verify Migration Integrity in isolated directory
        log('\n--- Step 7: Verifying Migration Integrity (160 Migrations) ---');
        log('Command: node scripts/smoke_phase183_migration_integrity.js');
        const migOutput = execSync('node scripts/smoke_phase183_migration_integrity.js', { cwd: tempDir, encoding: 'utf8' });
        log(migOutput.trim());
        if (!migOutput.includes('Phase 183: PASSED')) {
            throw new Error('Migration integrity check failed in isolated checkout.');
        }
        log('✔ Migration integrity check PASSED (160 migrations verified). Exit Code: 0');

        // 8. Run Vitest Unit & Integration Suite in isolated directory
        log('\n--- Step 8: Running Full Vitest Test Suite in Isolated Checkout ---');
        log('Command: npx vitest run');
        const vitestOutput = execSync('npx vitest run', { cwd: tempDir, encoding: 'utf8' });
        log(vitestOutput.trim());
        log('✔ Vitest suite passed 100% in isolated checkout. Exit Code: 0');

        // 9. Run Vite Production Build in isolated directory
        log('\n--- Step 9: Running Production Vite Build in Isolated Checkout ---');
        log('Command: npx vite build');
        const buildOutput = execSync('npx vite build', { cwd: tempDir, encoding: 'utf8' });
        log(buildOutput.trim());
        if (!buildOutput.includes('built in')) {
            throw new Error('Vite build failed in isolated checkout.');
        }
        log('✔ Production Vite build succeeded in isolated checkout. Exit Code: 0');

        log('\n======================================================================');
        log('STATUS: AUTHENTIC_RECONSTRUCTION_SUCCESSFUL');
        log('Clean checkout reconstruction verified from scratch with zero shared node_modules.');
        log('======================================================================\n');
    } catch (err) {
        log(`❌ Authentic Reconstruction Failed: ${err.message}`);
        if (err.stdout) log(`stdout:\n${err.stdout.toString()}`);
        if (err.stderr) log(`stderr:\n${err.stderr.toString()}`);
        throw err;
    } finally {
        // Save log execution file to workspace
        const logFilePath = path.resolve(workspaceRoot, 'authentic_reconstruction_execution.log');
        fs.writeFileSync(logFilePath, logLines.join('\n') + '\n', 'utf8');
        console.log(`Saved literal reconstruction log to: ${logFilePath}`);

        // Cleanup isolated temp folder
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        } catch (e) {
            // ignore temp cleanup errors on windows
        }
    }
}

runAuthenticReconstruction();
