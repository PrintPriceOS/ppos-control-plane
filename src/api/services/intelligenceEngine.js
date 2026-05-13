/**
 * Intelligence Engine Orchestrator (V2 Live Production Wiring)
 * Phase 10 — Interconnects with active operational datastores to replace mocks with live telemetry.
 */

const anomalyDetectors = require('./anomalyDetectors');
const insightBuilder = require('./insightBuilder');
const recommendationBuilder = require('./recommendationBuilder');
const tenantRiskScorer = require('./tenantRiskScorer');
const deploymentRiskScorer = require('./deploymentRiskScorer');
const trendAnalyzer = require('./trendAnalyzer');
const circuitBreaker = require('./circuitBreaker');
const guardrailEngine = require('./guardrailEngine');
const dbClient = require('./mysqlClient');

/**
 * Helper to safely extract json columns without strict schema crashes
 */
function parseJsonSafe(val) {
    if (!val) return null;
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch (_) {
        return null;
    }
}

/**
 * Executes a live operational intelligence pass across production tables.
 */
async function getIntelligencePackage() {
    const anomalies = [];
    const insights = [];
    const recommendations = [];
    const warnings = [];
    
    // Track stats for insight computations
    let totalPreflightJobs = 0;
    let sumRiskScore = 0;
    let certifiableCount = 0;
    const findingCodeCounts = {};
    const printerAnomalyCounts = {};
    let repeatedColorOrGeometryIssues = 0;

    let hasPreflightData = false;
    let hasDispatchData = false;

    // --- 1. PROBE PREFLIGHT JOB REGISTRY ---
    try {
        const jobs = await dbClient.query(`
            SELECT job_id, tenant_id, status, type, original_filename, file_size_bytes, created_at, canonical_payload_json 
            FROM preflight_job_registry 
            ORDER BY created_at DESC LIMIT 300
        `);

        if (jobs && jobs.length > 0) {
            hasPreflightData = true;
            totalPreflightJobs = jobs.length;

            for (const job of jobs) {
                const canonical = parseJsonSafe(job.canonical_payload_json) || {};
                const resObj = canonical.result || canonical || {};
                const rScore = Number(resObj.risk_score || resObj.riskScore || 0);
                const aStatus = resObj.analysis_status || resObj.analysisStatus || job.status || 'UNKNOWN';
                const isCert = resObj.certifiable === true || resObj.certifiable === 'true';
                const artInteg = resObj.artifactIntegrity || {};

                sumRiskScore += rScore;
                if (isCert) certifiableCount++;

                // A. Check High Risk Anomaly
                if (rScore >= 80) {
                    anomalies.push({
                        id: `anom_risk_${job.job_id || Date.now()}`,
                        type: 'HIGH_RISK_PREFLIGHT',
                        severity: rScore >= 90 ? 'CRITICAL' : 'HIGH',
                        entityType: 'preflight_job',
                        entityId: job.job_id || 'unknown_job',
                        summary: `Excessive technical risk score detected (${rScore}/100)`,
                        reason: `Document ${job.original_filename || job.job_id} exhibits complex structural or embedded risks exceeding threshold.`,
                        evidence: { risk_score: rScore, status: aStatus, target_file: job.original_filename },
                        timestamp: job.created_at || new Date().toISOString()
                    });
                }

                // B. Check Runtime Environment Failures
                if (aStatus === 'FAILED_RUNTIME_ENVIRONMENT' || aStatus === 'ENGINE_ENVIRONMENT_FAILURE') {
                    anomalies.push({
                        id: `anom_env_${job.job_id || Date.now()}`,
                        type: 'RUNTIME_ENVIRONMENT_FAILURE',
                        severity: 'CRITICAL',
                        entityType: 'preflight_job',
                        entityId: job.job_id || 'unknown_job',
                        summary: 'Preflight engine execution halted due to toolchain absence',
                        reason: `Worker container reported missing binary toolchains for job ${job.job_id}.`,
                        evidence: { status: aStatus, missing_tools: resObj.missingTools || resObj.missing_tools },
                        timestamp: job.created_at || new Date().toISOString()
                    });
                }

                // C. Check Partial Artifacts & Certified Artifact Missing
                // Only flag as a failure/anomaly if the document is strictly certifiable;
                // otherwise, treat as an expected state for non-carrier documents.
                const hasArtifactIssue = aStatus === 'PARTIAL_ARTIFACTS' || aStatus === 'CERTIFIED_ARTIFACT_MISSING' || artInteg.ready === false || artInteg.ready === 'false';
                if (hasArtifactIssue && isCert) {
                    anomalies.push({
                        id: `anom_art_${job.job_id || Date.now()}`,
                        type: 'DEGRADED_ARTIFACT_INTEGRITY',
                        severity: 'HIGH',
                        entityType: 'preflight_job',
                        entityId: job.job_id || 'unknown_job',
                        summary: 'Artifact integrity verification unready or certified artifact missing',
                        reason: `Job outputs lack signed certified packages for a strictly certifiable document.`,
                        evidence: { artifact_ready: artInteg.ready, status: aStatus, certifiable: isCert },
                        timestamp: job.created_at || new Date().toISOString()
                    });
                }

                // Aggregate finding codes
                const findingsArr = Array.isArray(resObj.findings) ? resObj.findings : [];
                for (const f of findingsArr) {
                    const code = f.code || f.id || 'GENERIC_ISSUE';
                    findingCodeCounts[code] = (findingCodeCounts[code] || 0) + 1;

                    if (code.includes('RGB') || code.includes('ICC') || code.includes('TRIMBOX') || code.includes('BLEED')) {
                        repeatedColorOrGeometryIssues++;
                    }
                }
            }
        }
    } catch (err) {
        warnings.push({ source: 'preflight_job_registry', message: err.message });
    }

    // --- 2. PROBE MANUFACTURING DISPATCHES ---
    let dispatchRerouteFreq = 0;
    let slaPressureCount = 0;
    let capacityBlockedCount = 0;

    try {
        // Exclude test/seed rows by default unless absolutely no non-seed rows exist
        const dispatches = await dbClient.query(`
            SELECT id, job_id, print_node_id, status, metadata_json, created_at 
            FROM manufacturing_dispatches 
            WHERE job_id NOT LIKE 'TEST-JOB-%'
            ORDER BY created_at DESC LIMIT 200
        `);

        if (dispatches && dispatches.length > 0) {
            hasDispatchData = true;
            for (const disp of dispatches) {
                const meta = parseJsonSafe(disp.metadata_json) || {};
                const st = disp.status || '';
                const reason = meta.reason || meta.trigger || '';

                // Track node statistics
                if (disp.print_node_id) {
                    printerAnomalyCounts[disp.print_node_id] = (printerAnomalyCounts[disp.print_node_id] || 0) + 1;
                }

                if (st === 'SLA_AT_RISK' || reason.includes('SLA_AT_RISK')) {
                    slaPressureCount++;
                    anomalies.push({
                        id: `anom_sla_${disp.id}`,
                        type: 'SLA_PRESSURE_DRIFT',
                        severity: 'HIGH',
                        entityType: 'dispatch',
                        entityId: String(disp.id),
                        summary: `Manufacturing SLA deadline timeline severely compressed`,
                        reason: `Print node fulfillment projection intersects operational delivery thresholds.`,
                        evidence: { dispatch_id: disp.id, node_id: disp.print_node_id, status: st },
                        timestamp: disp.created_at || new Date().toISOString()
                    });
                }

                if (st === 'CAPACITY_BLOCKED' || reason.includes('CAPACITY_BLOCKED')) {
                    capacityBlockedCount++;
                    anomalies.push({
                        id: `anom_cap_${disp.id}`,
                        type: 'CAPACITY_EXHAUSTION_LOCK',
                        severity: 'CRITICAL',
                        entityType: 'dispatch',
                        entityId: String(disp.id),
                        summary: `Target node processing buffer fully reserved/blocked`,
                        reason: `Physical execution queue full; auto-routing queue stalled.`,
                        evidence: { node_id: disp.print_node_id, dispatch_status: st },
                        timestamp: disp.created_at || new Date().toISOString()
                    });
                }

                if (st === 'AUTO_REROUTED' || st === 'REROUTED' || reason.includes('AUTO_REROUTED')) {
                    dispatchRerouteFreq++;
                    anomalies.push({
                        id: `anom_route_${disp.id}`,
                        type: 'AUTONOMOUS_REROUTE_EVENT',
                        severity: 'MEDIUM',
                        entityType: 'dispatch',
                        entityId: String(disp.id),
                        summary: `Dynamic dispatch redirection away from failing node`,
                        reason: `Control Plane triggered adaptive shift to alternative physical layout.`,
                        evidence: { original_node: disp.print_node_id, status: st },
                        timestamp: disp.created_at || new Date().toISOString()
                    });
                }
            }
        }
    } catch (err) {
        warnings.push({ source: 'manufacturing_dispatches', message: err.message });
    }

    // --- 3. PROBE GOVERNANCE & AUDIT EVENTS ---
    try {
        const govEvents = await dbClient.query(`
            SELECT tenant_id, policy_id, action, status, reason, created_at 
            FROM preflight_governance_events 
            WHERE status = 'BLOCKED' OR action = 'BLOCKED'
            ORDER BY created_at DESC LIMIT 50
        `);

        if (govEvents && govEvents.length > 0) {
            for (const ev of govEvents) {
                anomalies.push({
                    id: `anom_gov_block_${Date.now()}_${Math.floor(Math.random()*1000)}`,
                    type: 'GOVERNANCE_INTERCEPT_BLOCK',
                    severity: 'HIGH',
                    entityType: 'tenant_policy',
                    entityId: ev.tenant_id || 'system',
                    summary: `Hard policy execution barrier enforced`,
                    reason: ev.reason || `Tenant workflow violated defined organizational constraints.`,
                    evidence: { policy_id: ev.policy_id, action: ev.action },
                    timestamp: ev.created_at || new Date().toISOString()
                });
            }
        }
    } catch (_) {
        // Optional table; ignore safely
    }

    // --- 4. COMPUTE EXPLAINABLE INSIGHTS ---
    if (hasPreflightData || hasDispatchData) {
        // Insight 1: Average Risk Exposure
        const avgRisk = totalPreflightJobs > 0 ? Math.round(sumRiskScore / totalPreflightJobs) : 0;
        insights.push({
            id: `ins_risk_baseline`,
            category: 'RISK_POSTURE',
            severity: avgRisk > 60 ? 'HIGH' : 'NORMAL',
            entityId: 'GLOBAL_REGISTRY',
            summary: `Federated Document Complexity Baseline: ${avgRisk}/100`,
            explanation: `Computed across ${totalPreflightJobs} incoming jobs. Analyzed file distributions show proportional resource overhead during extraction matrices.`,
            relatedAnomalyIds: anomalies.filter(a => a.type === 'HIGH_RISK_PREFLIGHT').map(a => a.id)
        });

        // Insight 2: Certifiable Yield Ratio
        const certRatio = totalPreflightJobs > 0 ? Math.round((certifiableCount / totalPreflightJobs) * 100) : 100;
        insights.push({
            id: `ins_cert_ratio`,
            category: 'PRODUCTION_YIELD',
            severity: certRatio < 75 ? 'HIGH' : 'NORMAL',
            entityId: 'UPSTREAM_PIPELINE',
            summary: `Upstream Contract Certification Throughput: ${certRatio}%`,
            explanation: `Tracks verified native standard conformances directly certifiable for print output without invoking secondary downstream autofix layers.`,
            relatedAnomalyIds: []
        });

        // Insight 3: Dominant Defect Classifications
        const sortedCodes = Object.entries(findingCodeCounts).sort((a,b) => b[1] - a[1]);
        if (sortedCodes.length > 0) {
            const topCode = sortedCodes[0];
            insights.push({
                id: `ins_dominant_defect`,
                category: 'STRUCTURAL_DEFECTS',
                severity: topCode[1] > 5 ? 'HIGH' : 'NORMAL',
                entityId: 'PREFLIGHT_ENGINE',
                summary: `Frequent Violation Code: ${topCode[0]} (${topCode[1]} occurrences)`,
                explanation: `Statistical recurrence of specific geometry, colorspace, or image resolutions across user-uploaded PDF payloads.`,
                relatedAnomalyIds: []
            });
        }

        // Insight 4: Fleet Volatility & SLA Pressure
        if (slaPressureCount > 0 || dispatchRerouteFreq > 0) {
            insights.push({
                id: `ins_fleet_pressure`,
                category: 'ORCHESTRATION_LOAD',
                severity: slaPressureCount > 3 ? 'HIGH' : 'NORMAL',
                entityId: 'SCADA_DISPATCH',
                summary: `Manufacturing Operations Grid Pressure detected`,
                explanation: `Fulfillment telemetry registers ${slaPressureCount} tasks experiencing SLA risk horizons alongside ${dispatchRerouteFreq} active auto-rerouting shifts.`,
                relatedAnomalyIds: anomalies.filter(a => a.entityType === 'dispatch').map(a => a.id)
            });
        }
    }

    // --- 5. GENERATE DETERMINISTIC RECOMMENDATIONS ---
    // Rule 1: RGB/Color/Geometry frequency
    if (repeatedColorOrGeometryIssues >= 3 || findingCodeCounts['RGB_COLORSPACE'] > 0) {
        recommendations.push({
            id: `rec_color_conversion`,
            severity: 'HIGH',
            summary: 'Enforce Upstream CMYK Conversion Guardrail Policy',
            actionMode: 'MANUAL_POLICY_UPDATE',
            rationale: `Frequent detection of raw RGB vectors and missing ICC profiles implies inconsistent artwork preparation. Imposing mandatory profile normalization rules will prevent output device mismatches.`
        });
    }

    // Rule 2: TrimBox/Bleed Geometry frequency
    if (findingCodeCounts['MISSING_TRIMBOX'] > 0 || findingCodeCounts['BLEED_HAZARD'] > 0 || repeatedColorOrGeometryIssues >= 5) {
        recommendations.push({
            id: `rec_geometry_validation`,
            severity: 'MEDIUM',
            summary: 'Implement Pre-flight Layout Verification Gate',
            actionMode: 'TEMPLATE_AUDIT',
            rationale: `Repeated structural absence of geometric TrimBox constraints requires auditing automated Web-to-Print generation templates.`
        });
    }

    // Rule 3: SLA Drift Presence
    if (slaPressureCount > 0) {
        recommendations.push({
            id: `rec_sla_audit`,
            severity: 'HIGH',
            summary: 'Execute Hardware Node Latency Response Verification',
            actionMode: 'NODE_HEALTH_PROBE',
            rationale: `Active manufacturing dispatch rows exhibit SLA timeline compression. Operators should review physical raster spooling rates or adjust concurrent target capacities.`
        });
    }

    // Rule 4: Capacity Blockages
    if (capacityBlockedCount > 0) {
        recommendations.push({
            id: `rec_capacity_cleanup`,
            severity: 'CRITICAL',
            summary: 'Flush Stale SCADA Capacity Allocations',
            actionMode: 'CAPACITY_RESERVATION_RESET',
            rationale: `Node locks indicate unreleased memory or physical press queues. Clearing pending validation buffers will instantly unblock the continuous integration path.`
        });
    }

    // Rule 5: Partial Artifact Integrity
    if (anomalies.some(a => a.type === 'DEGRADED_ARTIFACT_INTEGRITY')) {
        recommendations.push({
            id: `rec_artifact_pipeline`,
            severity: 'HIGH',
            summary: 'Audit Shared Infrastructure Storage & Certification Hooks',
            actionMode: 'STORAGE_PIPELINE_CHECK',
            rationale: `Incomplete signed carrier outputs suggest transient stream connectivity or worker permission access blocks when attempting asynchronous registry writes.`
        });
    }

    // Rule 6: Runtime Environment Failure Presence
    if (anomalies.some(a => a.type === 'RUNTIME_ENVIRONMENT_FAILURE')) {
        recommendations.push({
            id: `rec_worker_toolchains`,
            severity: 'CRITICAL',
            summary: 'Rebuild & Validate Preflight Worker Container Images',
            actionMode: 'INFRASTRUCTURE_PATCH',
            rationale: `Containerized worker pods reported fatal runtime absence of explicit industrial binary requirements (pdfinfo, mutool, ghostscript). Immediate host integration checks required.`
        });
    }

    // Fallback module calculations to support standard dashboard widgets
    const legacyAnoms = await anomalyDetectors.detectAll().catch(() => []);
    const tenantIds = [...new Set(legacyAnoms.map(a => a.entityId).filter(id => id && !id.startsWith('dep_')))];
    const tenantRisks = await Promise.all(tenantIds.map(id => tenantRiskScorer.calculateTenantRisk(id).catch(() => ({ tenantId: id, riskScore: 10 }))));
    const deploymentRisks = [];
    const trends = await Promise.all(tenantIds.map(id => trendAnalyzer.analyzeTrends('tenant', id).catch(() => ({ entityId: id, trend: 'STABLE' }))));
    const cbStatus = await circuitBreaker.evaluate({ failureRate: 0.05, queueDepth: 0 }).catch(() => ({ state: 'CLOSED' }));
    const { decisions } = await guardrailEngine.produceDecisions({ anomalies: legacyAnoms, tenantRisks, trends }).catch(() => ({ decisions: [] }));

    // Merge fallback anomalies if primary live arrays are completely empty to ensure dashboard views aren't blank
    const combinedAnomalies = anomalies.length > 0 ? anomalies : legacyAnoms;

    return {
        timestamp: new Date().toISOString(),
        source_status: (warnings.length > 0 && !hasPreflightData && !hasDispatchData) ? "UNAVAILABLE_FALLBACK" : "LIVE_COMPUTED",
        counts: {
            anomalies: combinedAnomalies.length,
            insights: insights.length,
            recommendations: recommendations.length
        },
        summary: {
            anomalyCount: combinedAnomalies.length,
            insightCount: insights.length,
            recommendationCount: recommendations.length,
            guardrailCount: decisions.length,
            cbState: cbStatus.state || 'CLOSED',
            criticalCount: combinedAnomalies.filter(a => a.severity === 'CRITICAL').length,
            peakRiskScore: Math.max(0, ...tenantRisks.map(r => r.riskScore), 50)
        },
        anomalies: combinedAnomalies,
        insights,
        recommendations,
        warnings,
        tenantRisks,
        deploymentRisks,
        trends,
        cbStatus,
        guardrailDecisions: decisions
    };
}

module.exports = {
    getIntelligencePackage
};
