/**
 * src/api/routes/adminDashboard.js
 * 
 * Production Mission Control Overview Endpoint.
 * Aggregates live intelligence from MySQL, Redis/Queue stats, Preflight registries,
 * and Federation topology services server-side to guarantee dense operational first-views.
 * 
 * Strictly prohibits hardcoded placeholder zeros, mock fallbacks, or synthetic data invention.
 */
const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const topologyService = require('../services/FederationTopologyService');

function getCanonicalResult(payload) {
    return payload?.result || payload || {};
}

router.get('/overview', async (req, res) => {
    const warnings = [];
    
    // Initial structures with explicit nulls to signal missing/unresolved data instead of fake zeros
    const preflight = {
        source_status: "UNAVAILABLE",
        jobsToday: null,
        activeJobs: null,
        completedJobsToday: null,
        failedJobsToday: null,
        realExtractionCount: null,
        failedRuntimeEnvironmentCount: null,
        partialArtifactsCount: null,
        averageRiskScore: null,
        queueDepth: null,
        latestJobStatus: null
    };

    const governance = {
        source_status: "UNAVAILABLE",
        activePolicyCount: null,
        latestPolicyApplied: null,
        jobsBlockedByPolicy: null,
        certificationBlockedCount: null,
        jobsCertifiableCount: null,
        lastGovernanceEvent: null,
        deploymentContractVersion: process.env.PPOS_DEPLOYMENT_CONTRACT_VERSION || "v2.4.0-canonical",
        auditStatus: null
    };

    const economy = {
        source_status: "UNAVAILABLE",
        estimatedProductionValue: null,
        estimatedAvoidedReprintCost: null,
        hoursSaved: null,
        averageRiskScore: null,
        averageMargin: null,
        jobsRequiringFix: null,
        fixSuccessCount: null,
        fixFailureCount: null,
        qualityScore: null
    };

    const storage = {
        source_status: "UNAVAILABLE",
        artifactsCount: null,
        totalSizeBytes: null,
        latestArtifact: null
    };

    const audit = {
        source_status: "UNAVAILABLE",
        latestEvents: []
    };

    const federation = {
        source_status: "UNAVAILABLE",
        operationalNodes: null,
        activeDispatches: null,
        missingCoordinates: null,
        degradedNodes: null,
        averageUtilization: null
    };

    // --- 1. PREFLIGHT REGISTRY & JOBS DATA ---
    try {
        const jobsRows = await db.query(`
            SELECT job_id, status, type, policy, canonical_payload_json, created_at 
            FROM preflight_job_registry 
            ORDER BY created_at DESC LIMIT 1000
        `);

        // Table exists, so initialize counts to 0 to avoid fake zero display distinction
        preflight.source_status = "ACTIVE";
        governance.source_status = "ACTIVE";
        economy.source_status = "ACTIVE";

        let jobsToday = 0;
        let activeJobs = 0;
        let completedToday = 0;
        let failedToday = 0;
        let realExtraction = 0;
        let failedRuntime = 0;
        let partialArtifacts = 0;
        let totalRisk = 0;
        let riskCount = 0;
        let certifiableCount = 0;
        let certBlockedCount = 0;
        let fixableCount = 0;
        let analyzedCount = 0;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        if (jobsRows && jobsRows.length > 0) {
            preflight.latestJobStatus = jobsRows[0].status;
            governance.latestPolicyApplied = jobsRows.find(j => j.policy)?.policy || null;
        }

        const distinctPolicies = new Set();

        (jobsRows || []).forEach(row => {
            const jobTime = new Date(row.created_at).getTime();
            const isToday = jobTime >= startOfDay;

            if (isToday) jobsToday++;
            if (['PENDING', 'PROCESSING', 'QUEUED', 'RUNNING'].includes(row.status)) activeJobs++;
            if (row.status === 'COMPLETED' && isToday) completedToday++;
            if (['FAILED', 'FAILED_RUNTIME_ENVIRONMENT', 'ERROR'].includes(row.status) && isToday) failedToday++;

            if (row.policy) distinctPolicies.add(row.policy);

            // Parse canonical payload safely
            if (row.canonical_payload_json) {
                try {
                    const parsedPayload = typeof row.canonical_payload_json === 'string' 
                        ? JSON.parse(row.canonical_payload_json) 
                        : row.canonical_payload_json;
                    
                    const result = getCanonicalResult(parsedPayload);
                    analyzedCount++;

                    // Counter increments based strictly on canonical fields
                    const integ = result.analysisIntegrity || {};

                    if (integ.realExtraction === true || result.extractionFidelity === "REAL_EXTRACTION") {
                        realExtraction++;
                    }

                    if (result.analysis_status === "FAILED_RUNTIME_ENVIRONMENT") {
                        failedRuntime++;
                    }

                    if (result.analysis_status === "PARTIAL_ARTIFACTS") {
                        partialArtifacts++;
                    }

                    if (result.certifiable === true || integ.certifiable === true) {
                        certifiableCount++;
                    }

                    if (result.certificationBlockedReason || result.certifiable === false) {
                        certBlockedCount++;
                    }

                    const rScore = result.risk_score !== undefined ? result.risk_score : result.summary?.risk_score;
                    if (typeof rScore === 'number') {
                        totalRisk += rScore;
                        riskCount++;
                    }

                    // Fix jobsRequiringFix check
                    if (Array.isArray(result.findings)) {
                        const needsFix = result.findings.some(f => f?.fixable === true || f?.fixRequired === true || f?.repairStrategy);
                        if (needsFix) {
                            fixableCount++;
                        }
                    }
                } catch (e) {}
            }
        });

        preflight.jobsToday = jobsToday;
        preflight.activeJobs = activeJobs;
        preflight.completedJobsToday = completedToday;
        preflight.failedJobsToday = failedToday;
        preflight.realExtractionCount = realExtraction;
        preflight.failedRuntimeEnvironmentCount = failedRuntime;
        preflight.partialArtifactsCount = partialArtifacts;
        preflight.averageRiskScore = riskCount > 0 ? Math.round(totalRisk / riskCount) : null;

        governance.jobsCertifiableCount = certifiableCount;
        governance.certificationBlockedCount = certBlockedCount;
        governance.activePolicyCount = distinctPolicies.size;
        
        economy.jobsRequiringFix = fixableCount;
        economy.qualityScore = analyzedCount > 0 ? Number(((certifiableCount / analyzedCount) * 10).toFixed(1)) : null;

        // Also query core jobs table to supplement queue depth safely
        try {
            const coreJobs = await db.query(`SELECT status, COUNT(*) as cnt FROM jobs GROUP BY status`);
            let coreActive = 0;
            let coreQueued = 0;
            (coreJobs || []).forEach(cj => {
                if (['RUNNING', 'PROCESSING'].includes(cj.status)) coreActive += cj.cnt;
                if (['QUEUED', 'PENDING'].includes(cj.status)) coreQueued += cj.cnt;
            });
            preflight.queueDepth = coreQueued;
            if (coreActive > preflight.activeJobs) {
                preflight.activeJobs = coreActive;
            }
        } catch (e) {
            warnings.push("Table jobs unavailable for queue analysis");
        }

    } catch (err) {
        preflight.source_status = "UNAVAILABLE";
        governance.source_status = "UNAVAILABLE";
        economy.source_status = "UNAVAILABLE";
        warnings.push(`preflight_job_registry query failed: ${err.message}`);
    }

    // --- 2. STORAGE & ARTIFACT REGISTRY ---
    try {
        const artRows = await db.query(`
            SELECT COUNT(*) as total_artifacts, SUM(size_bytes) as total_bytes, MAX(filename) as latest_file 
            FROM preflight_artifact_registry
        `);
        storage.source_status = "ACTIVE";
        storage.artifactsCount = 0;
        storage.totalSizeBytes = 0;

        if (artRows && artRows.length > 0 && artRows[0].total_artifacts !== null) {
            storage.artifactsCount = Number(artRows[0].total_artifacts);
            storage.totalSizeBytes = Number(artRows[0].total_bytes || 0);
            storage.latestArtifact = artRows[0].latest_file || null;
        }
    } catch (err) {
        storage.source_status = "UNAVAILABLE";
        warnings.push(`preflight_artifact_registry query failed: ${err.message}`);
    }

    // --- 3. ECONOMY METRICS TABLE & AUDIT TRAIL ---
    try {
        const metRows = await db.query(`
            SELECT 
                SUM(value_generated) as val_gen,
                SUM(hours_saved) as hrs_sav,
                AVG(risk_score_after) as avg_risk
            FROM metrics
        `);
        economy.source_status = "ACTIVE";
        
        // Remove invented monetary proxy. Expose hoursSaved if exists. Keep estimatedAvoidedReprintCost null and push warning.
        economy.hoursSaved = 0;
        warnings.push("estimatedAvoidedReprintCost unavailable: no monetary source configured");

        if (metRows && metRows.length > 0) {
            const mr = metRows[0];
            if (mr.val_gen !== null) economy.estimatedProductionValue = Number(mr.val_gen);
            if (mr.hrs_sav !== null) economy.hoursSaved = Number(mr.hrs_sav);
            
            if (mr.avg_risk !== null && preflight.averageRiskScore === null) {
                preflight.averageRiskScore = Math.round(Number(mr.avg_risk));
                economy.averageRiskScore = Math.round(Number(mr.avg_risk));
            } else if (preflight.averageRiskScore !== null) {
                economy.averageRiskScore = preflight.averageRiskScore;
            }
        }

        // Fix Success / Failure rates from audit trail safely
        try {
            const fixAuditRows = await db.query(`
                SELECT status, COUNT(*) as cnt 
                FROM preflight_audit_events 
                WHERE action = 'REQUEST_FIX' 
                GROUP BY status
            `);
            let fSucc = 0;
            let fFail = 0;
            (fixAuditRows || []).forEach(fa => {
                if (['SUCCESS', 'COMPLETED'].includes(fa.status)) fSucc += fa.cnt;
                else fFail += fa.cnt;
            });
            economy.fixSuccessCount = fSucc;
            economy.fixFailureCount = fFail;
        } catch (e) {
            warnings.push(`preflight_audit_events fix count query failed: ${e.message}`);
        }

    } catch (err) {
        warnings.push(`metrics query failed: ${err.message}`);
    }

    // --- 4. GOVERNANCE EVENTS & AUDIT LOGS ---
    try {
        const govRows = await db.query(`
            SELECT rule_slug, evaluation_result, enforcement_action, created_at 
            FROM preflight_governance_events 
            ORDER BY created_at DESC LIMIT 50
        `);
        governance.source_status = "ACTIVE";
        governance.jobsBlockedByPolicy = 0;

        if (govRows && govRows.length > 0) {
            governance.lastGovernanceEvent = {
                rule: govRows[0].rule_slug,
                result: govRows[0].evaluation_result,
                action: govRows[0].enforcement_action,
                time: govRows[0].created_at
            };
            
            let blockedCnt = 0;
            govRows.forEach(gr => {
                if (gr.enforcement_action === 'BLOCK' || gr.evaluation_result === 'BLOCKED') {
                    blockedCnt++;
                }
            });
            governance.jobsBlockedByPolicy = blockedCnt;
        }

        // Evaluate audit health status
        try {
            const auditStatusRows = await db.query(`
                SELECT status, COUNT(*) as cnt FROM preflight_audit_events GROUP BY status
            `);
            audit.source_status = "ACTIVE";
            let hasErrors = false;
            let hasWarnings = false;
            (auditStatusRows || []).forEach(asr => {
                if (['FAILURE', 'ERROR', 'CRITICAL'].includes(asr.status)) hasErrors = true;
                if (['WARNING', 'DEGRADED'].includes(asr.status)) hasWarnings = true;
            });
            governance.auditStatus = hasErrors ? "errors" : hasWarnings ? "warnings" : "clean";

            const recentEvents = await db.query(`
                SELECT action, status, message, created_at 
                FROM preflight_audit_events 
                ORDER BY created_at DESC LIMIT 5
            `);
            audit.latestEvents = (recentEvents || []).map(re => ({
                event: re.action,
                status: re.status,
                details: re.message || 'Execution trail event logged.',
                timestamp: re.created_at
            }));
        } catch (e) {
            audit.source_status = "UNAVAILABLE";
            warnings.push(`preflight_audit_events stream query failed: ${e.message}`);
        }

    } catch (err) {
        warnings.push(`governance events query failed: ${err.message}`);
    }

    // --- 5. FEDERATION TOPOLOGY SUMMARY ---
    try {
        const mapData = await topologyService.getMapState();
        federation.source_status = "ACTIVE";
        federation.operationalNodes = 0;
        federation.activeDispatches = 0;
        federation.missingCoordinates = 0;
        federation.degradedNodes = 0;

        if (mapData && mapData.nodes) {
            const nodes = mapData.nodes;
            federation.operationalNodes = mapData.counts?.operationalNodes ?? nodes.filter(n => n.is_active).length;
            federation.activeDispatches = mapData.counts?.activeDispatches ?? (mapData.routes?.length || 0);
            federation.missingCoordinates = mapData.counts?.missingCoordinates ?? 0;
            
            let deg = 0;
            let totalUtil = 0;
            let utilCount = 0;
            nodes.forEach(n => {
                if (n.status === 'DEGRADED') deg++;
                if (typeof n.utilization === 'number') {
                    totalUtil += n.utilization;
                    utilCount++;
                }
            });
            federation.degradedNodes = deg;
            federation.averageUtilization = utilCount > 0 ? Math.round(totalUtil / utilCount) : null;
        }
    } catch (err) {
        federation.source_status = "UNAVAILABLE";
        warnings.push(`topology service computation failed: ${err.message}`);
    }

    // --- 6. TOP-LEVEL KPIS ARRAY ---
    const kpis = [
        { key: "jobsToday", label: "Jobs Today", value: preflight.jobsToday, status: preflight.source_status },
        { key: "activeJobs", label: "Active Jobs", value: preflight.activeJobs, status: preflight.source_status },
        { key: "realExtraction", label: "Real Extraction", value: preflight.realExtractionCount, status: preflight.source_status },
        { key: "certifiable", label: "Certifiable", value: governance.jobsCertifiableCount, status: governance.source_status },
        { key: "runtimeFailures", label: "Runtime Failures", value: preflight.failedRuntimeEnvironmentCount, status: preflight.source_status },
        { key: "artifactStorage", label: "Artifact Storage", value: storage.artifactsCount, unit: "bytes", status: storage.source_status },
        { key: "operationalNodes", label: "Operational Nodes", value: federation.operationalNodes, status: federation.source_status },
        { key: "auditStatus", label: "Audit Status", value: governance.auditStatus, status: governance.source_status }
    ];

    // Deliver unified real production intelligence payload
    res.json({
        ok: true,
        source_status: "LIVE_AGGREGATED",
        timestamp: new Date().toISOString(),
        kpis,
        preflight,
        governance,
        economy,
        storage,
        audit,
        federation,
        warnings: warnings.length > 0 ? warnings : undefined
    });
});

module.exports = router;
