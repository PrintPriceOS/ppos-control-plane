const fs = require('fs');
const cp = require('child_process');
const path = require('path');

function execSyncQuiet(cmd) {
    try {
        return cp.execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    } catch (e) {
        return null;
    }
}

function checkToolchain() {
    const report = {
        ghostscript_available_local: false,
        ghostscript_path_local: null,
        ghostscript_version_local: null,
        ghostscript_available_worker_runtime: false,
        ghostscript_path_worker_runtime: null,
        ghostscript_version_worker_runtime: null,
        ghostscript_available_service_runtime: false,
        ghostscript_path_service_runtime: null,
        ghostscript_version_service_runtime: null,
        runtime_checked: "host",
        runtime_verified: false,
        production_runtime_pending: true,
        notes: []
    };

    // Check Local
    let localGsCmd = process.platform === 'win32' ? 'gswin64c' : 'gs';
    const localWhich = process.platform === 'win32' ? `where ${localGsCmd}` : `which ${localGsCmd}`;
    
    const localPath = execSyncQuiet(localWhich);
    if (localPath) {
        report.ghostscript_available_local = true;
        report.ghostscript_path_local = localPath.split('\n')[0].trim();
        const ver = execSyncQuiet(`${localGsCmd} --version`);
        report.ghostscript_version_local = ver ? ver.split('\n')[0] : null;
        report.notes.push(`Local Ghostscript found: ${report.ghostscript_version_local}`);
    } else {
        report.notes.push("Local Ghostscript not found in PATH.");
    }

    // Check Worker (Docker)
    try {
        const workerOut = execSyncQuiet('docker exec ppos-preflight-worker sh -lc "which gs && gs --version"');
        if (workerOut) {
            const lines = workerOut.split('\n');
            report.ghostscript_available_worker_runtime = true;
            report.ghostscript_path_worker_runtime = lines[0].trim();
            if (lines.length > 1) {
                report.ghostscript_version_worker_runtime = lines[lines.length - 1].trim();
            }
            report.notes.push(`Worker runtime Ghostscript found: ${report.ghostscript_version_worker_runtime}`);
            report.runtime_checked = "docker";
        }
    } catch (e) {
        report.notes.push("Docker worker container 'ppos-preflight-worker' not running or unavailable.");
    }

    // Check Service (Docker)
    try {
        const serviceOut = execSyncQuiet('docker exec ppos-preflight-service sh -lc "which gs && gs --version"');
        if (serviceOut) {
            const lines = serviceOut.split('\n');
            report.ghostscript_available_service_runtime = true;
            report.ghostscript_path_service_runtime = lines[0].trim();
            if (lines.length > 1) {
                report.ghostscript_version_service_runtime = lines[lines.length - 1].trim();
            }
            report.notes.push(`Service runtime Ghostscript found: ${report.ghostscript_version_service_runtime}`);
        }
    } catch (e) {
        report.notes.push("Docker service container 'ppos-preflight-service' not running or unavailable.");
    }

    if (report.ghostscript_available_worker_runtime && report.ghostscript_available_service_runtime) {
        report.runtime_verified = true;
        report.production_runtime_pending = false;
    } else {
        report.runtime_verified = false;
        report.production_runtime_pending = true;
    }

    console.log(JSON.stringify(report, null, 2));
    
    // Save to report
    const dir = path.join(__dirname, '../reports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'phase51b_ghostscript_toolchain.json'), JSON.stringify(report, null, 2));
}

checkToolchain();
