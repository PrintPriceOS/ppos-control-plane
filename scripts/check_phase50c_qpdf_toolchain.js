const { execSync } = require('child_process');

function checkQpdf() {
    let result = {
        qpdf_available_local: false,
        qpdf_path_local: "",
        qpdf_version_local: "",
        qpdf_available_worker_runtime: false,
        qpdf_path_worker_runtime: "",
        qpdf_version_worker_runtime: "",
        runtime_checked: "host",
        notes: []
    };

    try {
        let localPath = "";
        try {
            localPath = execSync('where qpdf').toString().trim().split('\n')[0];
        } catch(e) {
            const fs = require('fs');
            const p = 'C:\\Program Files\\qpdf 12.3.2\\bin\\qpdf.exe';
            if (fs.existsSync(p)) localPath = p;
            else throw e;
        }
        result.qpdf_available_local = true;
        result.qpdf_path_local = localPath;
        const localVersion = execSync(`"${localPath}" --version`).toString().trim().split('\n')[0];
        result.qpdf_version_local = localVersion;
    } catch (e) {
        result.notes.push("qpdf not available on local host via PATH.");
    }

    try {
        const dockerTest = execSync('docker ps').toString();
        result.runtime_checked = "docker";
        try {
            const workerPath = execSync('docker exec ppos-preflight-worker sh -lc "which qpdf"').toString().trim();
            result.qpdf_available_worker_runtime = true;
            result.qpdf_path_worker_runtime = workerPath;
            const workerVersion = execSync('docker exec ppos-preflight-worker sh -lc "qpdf --version"').toString().trim().split('\n')[0];
            result.qpdf_version_worker_runtime = workerVersion;
        } catch (e) {
            result.notes.push("qpdf not available in worker runtime, or worker container is not running.");
            result.notes.push("To install in Debian/Ubuntu worker: apt-get update && apt-get install -y --no-install-recommends qpdf");
        }
    } catch (e) {
        result.notes.push("Docker access is unavailable from this script.");
        result.notes.push("Run manually: docker exec ppos-preflight-worker sh -lc 'which qpdf && qpdf --version'");
    }

    console.log(JSON.stringify(result, null, 2));
}

checkQpdf();
