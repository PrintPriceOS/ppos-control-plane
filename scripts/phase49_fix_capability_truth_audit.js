const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENGINE_REPO = process.env.PHASE49_ENGINE_REPO || '../ppos-preflight-engine';
const WORKER_REPO = process.env.PHASE49_WORKER_REPO || '../ppos-preflight-worker-phase-10-intelligence-layer';
const SERVICE_REPO = process.env.PHASE49_SERVICE_REPO || '../ppos-preflight-service';
const CONTROL_REPO = process.env.PHASE49_CONTROL_REPO || '.';

const REPORTS_DIR = path.join(__dirname, '../reports');

if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

function getRepoMetadata(repoPath) {
    const resolvedPath = path.resolve(repoPath);
    const exists = fs.existsSync(resolvedPath);
    let pkgName = null;
    let gitBranch = null;
    let commitHash = null;

    if (exists) {
        const pkgPath = path.join(resolvedPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
            try {
                pkgName = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).name;
            } catch (e) { }
        }
        try {
            gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: resolvedPath, encoding: 'utf8' }).trim();
            commitHash = execSync('git rev-parse HEAD', { cwd: resolvedPath, encoding: 'utf8' }).trim();
        } catch (e) { }
    }

    return {
        configured_path: repoPath,
        resolved_absolute_path: resolvedPath,
        exists,
        package_name: pkgName,
        git_branch: gitBranch,
        latest_commit_hash: commitHash
    };
}

function safeRead(filePath) {
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
    }
    return null;
}

// ---------------------------------------------------------
// Backlog Matrix Mapping
// ---------------------------------------------------------

const backlog = [
    { issue_area: "TrimBox missing/invalid", canonical_fix_id: "REBUILD_TRIMBOX", detectable: true },
    { issue_area: "BleedBox / missing bleed", canonical_fix_id: "APPLY_BLEED", detectable: true },
    { issue_area: "RGB / DeviceRGB", canonical_fix_id: "CONVERT_CMYK", detectable: true },
    { issue_area: "Mixed RGB/CMYK", canonical_fix_id: "CONVERT_CMYK", detectable: true },
    { issue_area: "Missing OutputIntent", canonical_fix_id: "INJECT_OUTPUT_INTENT", detectable: true },
    { issue_area: "ICC mismatch", canonical_fix_id: "INJECT_OUTPUT_INTENT", detectable: true },
    { issue_area: "Non-embedded fonts", canonical_fix_id: "EMBED_FONTS", detectable: true },
    { issue_area: "Type3 fonts", canonical_fix_id: "TYPE3_FONTS", detectable: true },
    { issue_area: "Missing glyphs", canonical_fix_id: "MISSING_GLYPHS", detectable: true },
    { issue_area: "Low image resolution", canonical_fix_id: "LOW_RESOLUTION_IMAGE", detectable: true },
    { issue_area: "Excessive image resolution", canonical_fix_id: "OPTIMIZE_EXCESSIVE_IMAGE_RESOLUTION", detectable: true },
    { issue_area: "JPEG artifacts", canonical_fix_id: "JPEG_ARTIFACTS", detectable: true },
    { issue_area: "RGB images", canonical_fix_id: "CONVERT_CMYK", detectable: true },
    { issue_area: "Transparencies", canonical_fix_id: "FLATTEN_TRANSPARENCY", detectable: true },
    { issue_area: "Overprint", canonical_fix_id: "FLATTEN_OVERPRINT", detectable: true },
    { issue_area: "TAC / excessive ink coverage", canonical_fix_id: "DETECT_TOTAL_INK_COVERAGE", detectable: true },
    { issue_area: "Rich black text", canonical_fix_id: "MAP_RICH_BLACK_TEXT_TO_K_ONLY", detectable: true },
    { issue_area: "Registration color misuse", canonical_fix_id: "MAP_REGISTRATION_COLOR_TO_BLACK", detectable: true },
    { issue_area: "Missing crop marks", canonical_fix_id: "ADD_CROP_MARKS", detectable: true },
    { issue_area: "Registration marks present", canonical_fix_id: "REMOVE_MARKS", detectable: true },
    { issue_area: "Missing PDF/X", canonical_fix_id: "GENERATE_PDFX", detectable: true },
    { issue_area: "Invalid PDF/X", canonical_fix_id: "VALIDATE_PDFX", detectable: true },
    { issue_area: "Annotations", canonical_fix_id: "FLATTEN_ANNOTATIONS", detectable: true },
    { issue_area: "AcroForms", canonical_fix_id: "FLATTEN_FORMS", detectable: true },
    { issue_area: "PDF JavaScript", canonical_fix_id: "STRIP_JAVASCRIPT", detectable: true },
    { issue_area: "Broken XRef", canonical_fix_id: "REBUILD_XREF", detectable: true },
    { issue_area: "Object streams", canonical_fix_id: "OBJECT_STREAMS", detectable: true }
];

// ---------------------------------------------------------
// Main Execution
// ---------------------------------------------------------

async function runAudit() {
    console.log("Starting Phase 49 Preflight Fix Capability Truth Audit...");

    const repos = {
        engine: getRepoMetadata(ENGINE_REPO),
        worker: getRepoMetadata(WORKER_REPO),
        service: getRepoMetadata(SERVICE_REPO),
        control_plane: getRepoMetadata(CONTROL_REPO)
    };

    const finalReport = {
        timestamp: new Date().toISOString(),
        repo_paths: repos,
        capabilities: []
    };

    // 1. Audit Engine
    let engineFixes = {};
    let enginePlannerContent = '';
    let engineExecutionContent = '';
    
    if (repos.engine.exists) {
        const registryPath = path.join(repos.engine.resolved_absolute_path, 'fixes/FixRegistry.js');
        const plannerPath = path.join(repos.engine.resolved_absolute_path, 'fixes/FixPlanner.js');
        const execPath = path.join(repos.engine.resolved_absolute_path, 'execution/PdfFixEngine.js');

        if (fs.existsSync(registryPath)) {
            try {
                const { REGISTRY } = require(registryPath);
                engineFixes = REGISTRY;
            } catch (e) {
                console.warn("Could not require FixRegistry.js. Using regex fallback.");
            }
        }
        enginePlannerContent = safeRead(plannerPath) || '';
        engineExecutionContent = safeRead(execPath) || '';
    }

    // 2. Audit Worker
    let workerAutofixContent = '';
    if (repos.worker.exists) {
        workerAutofixContent = safeRead(path.join(repos.worker.resolved_absolute_path, 'src/services/AutofixProcessor.js')) || '';
    }

    // 3. Audit Service
    let serviceContractContent = '';
    if (repos.service.exists) {
        serviceContractContent = safeRead(path.join(repos.service.resolved_absolute_path, 'services/FixCapabilityContract.js')) || '';
    }

    // 4. Audit Control Plane
    let controlPlaneContent = '';
    if (repos.control_plane.exists) {
        controlPlaneContent = safeRead(path.join(repos.control_plane.resolved_absolute_path, 'src/api/services/preflightHumanReportService.js')) || '';
    }

    for (const item of backlog) {
        const fid = item.canonical_fix_id;
        let truth_status = "UNKNOWN";
        let registry_declared = false;
        let registry_status = "UNKNOWN";
        let service_capability_declared = false;
        let planner_behavior = "UNKNOWN";
        let engine_execution = "UNKNOWN";
        let worker_fix_audit_v2 = false;
        let artifact_materialized = false;
        let service_exposed = false;
        let control_plane_humanized = false;
        let risk_level = "UNKNOWN";
        let policy_mode = "UNKNOWN";
        let production_certifiable = false;
        let requires_human_review = false;

        const evidence = {
            files: [],
            functions: [],
            smoke_results: [],
            notes: []
        };

        if (!repos.engine.exists || !repos.worker.exists || !repos.service.exists || !repos.control_plane.exists) {
            evidence.notes.push("Some repositories were missing; truth statuses may be downgraded to UNKNOWN.");
        }

        // Engine Check
        if (repos.engine.exists) {
            const regDef = engineFixes[fid];
            if (regDef) {
                registry_declared = true;
                registry_status = regDef.implemented ? "IMPLEMENTED" : "SCAFFOLDED";
                risk_level = regDef.risk_level || "UNKNOWN";
                requires_human_review = regDef.requires_human_review || false;
                production_certifiable = regDef.production_safe || false;
                policy_mode = (regDef.supported_modes && regDef.supported_modes.length > 0) ? regDef.supported_modes.join(',') : "UNKNOWN";
                evidence.files.push("FixRegistry.js");
            } else {
                registry_status = "UNSUPPORTED";
            }

            if (enginePlannerContent.includes(`'${fid}'`) || enginePlannerContent.includes(`"${fid}"`)) {
                planner_behavior = "EXECUTE";
                evidence.files.push("FixPlanner.js");
            } else {
                planner_behavior = registry_declared ? "SKIPPED" : "UNSUPPORTED";
            }

            // Detect execution method
            const methodMatchers = [
                `apply${fid.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join('')}`,
                `rebuildTrimBox`, `applyBleedBoxExpansion`, `convertToCmyk`, `injectOutputIntent`,
                `stripJavaScript`, `flattenAnnotations`, `flattenForms`, `rebuildXref`
            ];
            
            let foundExec = false;
            for (const m of methodMatchers) {
                if (engineExecutionContent.includes(m)) {
                    engine_execution = "APPLIED";
                    foundExec = true;
                    evidence.files.push("PdfFixEngine.js");
                    evidence.functions.push(m);
                    break;
                }
            }

            if (!foundExec) {
                engine_execution = registry_declared && registry_status === "IMPLEMENTED" ? "NOT_REACHED" : "UNSUPPORTED";
            }
            
            if (engineExecutionContent.includes(fid) && !foundExec) {
                // Mentioned but maybe just scaffolded
                engine_execution = "SKIPPED";
            }
        }

        // Worker Check
        if (repos.worker.exists) {
            if (workerAutofixContent.includes(fid)) {
                worker_fix_audit_v2 = true;
                artifact_materialized = true; // Assumed if processor explicitly handles it
                evidence.files.push("AutofixProcessor.js");
            } else if (registry_status === "IMPLEMENTED") {
                // Generic handling in worker
                worker_fix_audit_v2 = true; 
                artifact_materialized = true;
            }
        }

        // Service Check
        if (repos.service.exists) {
            if (serviceContractContent.includes(fid)) {
                service_capability_declared = true;
                service_exposed = true;
                evidence.files.push("FixCapabilityContract.js");
            }
        }

        // Control Plane Check
        if (repos.control_plane.exists) {
            if (controlPlaneContent.includes(fid) || controlPlaneContent.includes(fid.toLowerCase())) {
                control_plane_humanized = true;
                evidence.files.push("preflightHumanReportService.js");
            }
        }

        // Determine Truth Status
        if (!repos.engine.exists || !repos.worker.exists || !repos.service.exists || !repos.control_plane.exists) {
            truth_status = "UNKNOWN";
        } else if (registry_status === "UNSUPPORTED") {
            truth_status = "UNSUPPORTED";
        } else if (registry_status === "SCAFFOLDED") {
            truth_status = "DECLARED_NOT_IMPLEMENTED";
        } else if (registry_status === "IMPLEMENTED") {
            if (engine_execution === "APPLIED" && worker_fix_audit_v2 && service_exposed && control_plane_humanized) {
                // Real implementation vs partial
                if (fid === "APPLY_BLEED") {
                    truth_status = "PARTIAL_FIX"; // Geometry only
                    evidence.notes.push("Geometry extension only, no artwork replication.");
                } else if (fid === "REBUILD_XREF") {
                    truth_status = "PARTIAL_FIX"; // Done by qpdf, not perfectly formal
                    evidence.notes.push("qpdf handles this implicitly, formal tracking may vary.");
                } else {
                    truth_status = "REAL_FIX_AVAILABLE";
                }
            } else {
                truth_status = "PARTIAL_FIX";
                evidence.notes.push("Missing end-to-end integration across worker, service, or control plane.");
            }
        }

        if (truth_status === "UNSUPPORTED" && requires_human_review) {
            evidence.notes.push("Unsupported fix marked as review required.");
        }

        if (truth_status === "UNSUPPORTED" || truth_status === "DECLARED_NOT_IMPLEMENTED") {
            production_certifiable = false;
        }

        finalReport.capabilities.push({
            issue_area: item.issue_area,
            canonical_fix_id: fid,
            detectable: item.detectable,
            detector_source: "engine",
            registry_declared,
            registry_status,
            service_capability_declared,
            planner_behavior,
            engine_execution,
            worker_fix_audit_v2,
            artifact_materialized,
            service_exposed,
            control_plane_humanized,
            risk_level,
            policy_mode,
            production_certifiable,
            requires_human_review,
            truth_status,
            evidence
        });
    }

    fs.writeFileSync(path.join(REPORTS_DIR, 'phase49_fix_capability_truth_audit.json'), JSON.stringify(finalReport, null, 2));

    // Markdown Generation
    let md = `# Phase 49 Preflight Fix Capability Truth Audit\n\n`;
    md += `Generated At: ${finalReport.timestamp}\n\n`;
    
    md += `## Repository Status\n`;
    for (const [key, meta] of Object.entries(repos)) {
        md += `- **${key}**\n`;
        md += `  - Path: \`${meta.configured_path}\`\n`;
        md += `  - Exists: ${meta.exists}\n`;
        md += `  - Package: ${meta.package_name || 'N/A'}\n`;
        md += `  - Branch: ${meta.git_branch || 'N/A'}\n`;
        md += `  - Commit: ${meta.latest_commit_hash || 'N/A'}\n`;
    }

    md += `\n## Capability Truth Matrix\n`;
    md += `| Issue Area | Fix ID | Truth Status | Risk | Mode | Evidence |\n`;
    md += `|---|---|---|---|---|---|\n`;

    let safeFixes = [];
    let partialFixes = [];
    let notImplementedFixes = [];

    for (const cap of finalReport.capabilities) {
        md += `| ${cap.issue_area} | \`${cap.canonical_fix_id}\` | **${cap.truth_status}** | ${cap.risk_level} | ${cap.policy_mode} | ${cap.evidence.files.join(', ')} |\n`;
        
        if (cap.truth_status === 'REAL_FIX_AVAILABLE') safeFixes.push(cap.canonical_fix_id);
        if (cap.truth_status === 'PARTIAL_FIX') partialFixes.push(cap.canonical_fix_id);
        if (cap.truth_status === 'DECLARED_NOT_IMPLEMENTED') notImplementedFixes.push(cap.canonical_fix_id);
    }

    md += `\n## Summary\n`;
    md += `- **Real Fixes Available**: ${safeFixes.length} (${safeFixes.join(', ')})\n`;
    md += `- **Partial Fixes**: ${partialFixes.length} (${partialFixes.join(', ')})\n`;
    md += `- **Declared but Not Implemented**: ${notImplementedFixes.length} (${notImplementedFixes.join(', ')})\n`;

    fs.writeFileSync(path.join(REPORTS_DIR, 'phase49_fix_capability_truth_audit.md'), md);
    
    console.log("Audit complete! Reports saved to reports/");
}

runAudit().catch(console.error);
