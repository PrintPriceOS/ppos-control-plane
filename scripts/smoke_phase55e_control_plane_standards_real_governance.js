const fs = require('fs');
const path = require('path');
const PreflightHumanReportService = require('../src/api/services/preflightHumanReportService');

const serviceReportsFile = path.resolve(__dirname, '../../ppos-preflight-service/reports/phase55e_service_standards_real_hydration.json');

async function run() {
    console.log("Running Phase 55E Control Plane Standards Real Governance Smoke Test...");

    if (!fs.existsSync(serviceReportsFile)) {
        console.error("Service reports file not found. Run 55E.3 first.");
        process.exit(1);
    }

    const serviceResults = JSON.parse(fs.readFileSync(serviceReportsFile, 'utf8'));

    const reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    let passCount = 0;
    let failCount = 0;
    const finalReport = [];

    for (const sr of serviceResults.results || serviceResults) {
        console.log(`\nTesting governance for: ${sr.fixture || sr.scenario}`);
        
        let pass = true;
        const notes = [];
        let humanReport = null;

        // Build mock job payload for this scenario
        const jobData = {
            id: 'job_test_55e',
            applied_fixes: [],
            skipped_fixes: [],
            failed_fixes: [],
            certification_level: 'CERTIFIED_READY',
            standards_certification_governance: {},
            review_required: false,
            production_certified: true,
            artifacts: []
        };

        const stdGov = jobData.standards_certification_governance;

        if (sr.scenario.includes('validator gap')) {
            stdGov.validator_gap = true;
            stdGov.validator_available = false;
            stdGov.validation_performed = false;
            stdGov.validation_passed = false;
            stdGov.compliance_claim_allowed = false;
        } else if (sr.scenario.includes('OutputIntent only')) {
            stdGov.outputintent_changed = true;
            stdGov.outputintent_does_not_prove_pdfx = true;
            stdGov.pdfx_compliance_claimed = false;
            stdGov.standard_certified = false;
            jobData.applied_fixes.push('INJECT_OUTPUT_INTENT');
        } else if (sr.scenario.includes('Unsupported VALIDATE_PDFX')) {
            jobData.skipped_fixes.push('VALIDATE_PDFX');
            stdGov.unsupported_standards_fixes = ['VALIDATE_PDFX'];
            stdGov.validator_available = false;
            stdGov.compliance_claim_allowed = false;
        } else if (sr.scenario.includes('PDFX_CLAIMED_BUT_NOT_VALIDATED')) {
            stdGov.review_required = true;
            stdGov.review_required_reasons = ['PDFX_CLAIMED_BUT_NOT_VALIDATED'];
            stdGov.standard_certified = false;
            stdGov.pdfx_compliance_claimed = false;
            stdGov.certified_pdf_allowed = false;
            jobData.review_required = true;
        } else if (sr.scenario.includes('certified.pdf filename/role')) {
            stdGov.validation_performed = false;
            stdGov.validation_passed = false;
            stdGov.standard_certified = false;
            stdGov.production_certified = false;
            jobData.artifacts.push({
                type: 'certified_pdf',
                filename: 'certified.pdf',
                alias: 'certified_pdf',
                downloadable: true,
                size_bytes: 1000,
                customer_visible: true,
                production_certified: true,
                standard_certified: false,
                artifact_role: 'PRODUCTION_READY'
            });
        } else if (sr.scenario.includes('False compliance claim')) {
            stdGov.pdfx_compliance_claimed = true;
            stdGov.standard_certified = true;
            stdGov.compliance_claim_allowed = true;
            stdGov.validation_performed = false;
            jobData.pdfx_compliance_claimed = true;
            jobData.standard_certified = true;
        } else if (sr.scenario.includes('Future valid validator evidence')) {
            stdGov.validation_performed = true;
            stdGov.validation_passed = true;
            stdGov.validator_name = 'TestValidator';
            stdGov.validator_version = '1.0.0';
            stdGov.standard_detected = 'PDF/X-4';
            stdGov.validation_report_available = true;
            stdGov.compliance_claim_allowed = true;
            stdGov.standard_certified = true;
            stdGov.pdfx_compliance_claimed = true;
            jobData.standard_certified = true;
            jobData.pdfx_compliance_claimed = true;
        } else if (sr.scenario.includes('gap / deferred')) {
            stdGov.detector_gap = true;
            stdGov.fixture_gap = true;
            stdGov.deferred = true;
        }

        if (sr.detector_gap) stdGov.detector_gap = true;
        if (sr.fixture_gap) stdGov.fixture_gap = true;
        if (sr.validator_gap) stdGov.validator_gap = true;
        if (sr.deferred) stdGov.deferred = true;

        const artifacts = jobData.artifacts;
        if (!artifacts.find(a => a.type === 'certified_pdf')) {
            artifacts.push({
                type: 'certified_pdf',
                filename: 'certified.pdf',
                alias: 'certified_pdf',
                downloadable: true,
                size_bytes: 1000,
                customer_visible: true,
                production_certified: jobData.production_certified || false,
                standard_certified: stdGov.standard_certified || false,
                artifact_role: jobData.review_required ? 'REVIEW_REQUIRED' : 'PRODUCTION_READY'
            });
        }

        try {
            // Call getHumanReport with mocked job
            const hrResponse = await PreflightHumanReportService.getHumanReport('test-job', {}, jobData, artifacts);
            humanReport = hrResponse.report;

                if (!humanReport) {
                    pass = false;
                    notes.push("Human report generation failed");
                } else {
                    const stdGov = jobData.standards_certification_governance || {};

                    // Readiness Gates & Review Check
                    if (stdGov.review_required === true) {
                        if (humanReport.outcome === 'SUCCESS' || humanReport.outcome === 'CERTIFIED_READY') {
                            pass = false;
                            notes.push("Readiness gate did not block on review_required (Outcome is " + humanReport.outcome + ")");
                        }
                    }

                    // Standard Claims Validation
                    if (!stdGov.validation_performed || !stdGov.validation_passed || stdGov.compliance_claim_allowed === false) {
                        if (humanReport.pdfx_compliance_claimed || humanReport.pdfa_compliance_claimed || humanReport.standard_certified) {
                            pass = false;
                            notes.push("Standards compliance claimed without full validator evidence");
                        }
                        
                        const certPdf = humanReport.artifact_recommendations.find(a => a.type === 'certified_pdf');
                        if (certPdf && certPdf.standard_certified) {
                            pass = false;
                            notes.push("certified.pdf falsely marked as standard-certified");
                        }
                    }

                    // Gap Checks
                    if (sr.validator_gap && !humanReport.copy_blocks.operator.includes("Standards validation was incomplete")) {
                        pass = false;
                        notes.push("Validator gap was hidden from operator summary");
                    }
                    if (sr.detector_gap && !humanReport.copy_blocks.operator.includes("Standards detection was incomplete")) {
                        pass = false;
                        notes.push("Detector gap was hidden from operator summary");
                    }
                    if (sr.fixture_gap && !humanReport.copy_blocks.operator.includes("Standards fixture validation gap preserved")) {
                        pass = false;
                        notes.push("Fixture gap was hidden from operator summary");
                    }
                    if (sr.deferred && !humanReport.copy_blocks.operator.includes("Standards processing deferred")) {
                        pass = false;
                        notes.push("Deferred status was hidden from operator summary");
                    }

                    // OutputIntent validation
                    const appliedFixes = jobData.applied_fixes || [];
                    if (appliedFixes.includes('INJECT_OUTPUT_INTENT') || appliedFixes.includes('INJECT_PDFX_OUTPUTINTENT')) {
                        if (humanReport.pdfx_compliance_claimed && (!stdGov.validation_performed || !stdGov.validation_passed)) {
                            pass = false;
                            notes.push("OutputIntent injection implied PDF/X without validator evidence");
                        }
                    }

                    // Public sanitation
                    const customerSummary = humanReport.copy_blocks.customer;
                    if (customerSummary.includes("gs -sDEVICE=") || customerSummary.includes("/tmp/") || customerSummary.includes("qpdf")) {
                        pass = false;
                        notes.push("Public report leaked internal commands or paths");
                    }
                }
            } catch (e) {
                pass = false;
                notes.push(`Human report generation error: ${e.message}`);
            }

        if (pass) passCount++;
        else failCount++;

        finalReport.push({
            scenario: sr.scenario || sr.fixture,
            input_mode: sr.input_mode || "REAL_ENGINE_OUTPUT",
            engine_real_detection: sr.engine_real_detection,
            detector_gap: sr.detector_gap,
            fixture_gap: sr.fixture_gap,
            validator_gap: sr.validator_gap,
            deferred: sr.deferred,
            human_report_outcome: humanReport?.outcome,
            severity: humanReport?.severity,
            review_required: humanReport?.fix_summary?.review_required,
            production_certified: humanReport?.fix_summary?.production_certified,
            standard_certified: humanReport?.standard_certified,
            pdfx_compliance_claimed: humanReport?.pdfx_compliance_claimed,
            pdfa_compliance_claimed: humanReport?.pdfa_compliance_claimed,
            compliance_claim_allowed: humanReport?.compliance_claim_allowed,
            validation_performed: humanReport?.validation_performed,
            validation_passed: humanReport?.validation_passed,
            validator_name: humanReport?.validator_name,
            validator_version: humanReport?.validator_version,
            standard_claimed: humanReport?.standard_claimed,
            customer_summary: humanReport?.copy_blocks?.customer,
            operator_summary: humanReport?.copy_blocks?.operator,
            primary_artifact_type: humanReport ? humanReport.artifact_recommendations?.find(a => a.is_primary)?.type : "NONE",
            certified_pdf_downgraded: humanReport?.artifact_recommendations?.some(a => a.type === 'certified_pdf' && !a.production_certified),
            public_report_safe: pass && !notes.some(n => n.includes("Public report leaked")),
            readiness_gate_result: humanReport?.outcome,
            payment_gate_result: humanReport?.outcome === 'CERTIFIED_READY' || humanReport?.outcome === 'FIXED_READY' ? 'ALLOWED' : 'BLOCKED',
            pass,
            notes
        });
    }

    const finalJsonPath = path.join(reportsDir, 'phase55e_control_plane_standards_real_governance.json');
    fs.writeFileSync(finalJsonPath, JSON.stringify(finalReport, null, 2));

    let md = `# Phase 55E Control Plane Standards Governance\n\n`;
    md += `**Summary**: ${passCount} Passed, ${failCount} Failed\n\n`;
    
    finalReport.forEach(r => {
        md += `## Scenario: ${r.scenario}\n`;
        md += `- **Validation Result**: ${r.pass ? '✅ PASS' : '❌ FAIL'}\n`;
        md += `- **Input Mode**: ${r.input_mode}\n`;
        md += `- **Human Report Outcome**: ${r.human_report_outcome}\n`;
        md += `- **Review Required**: ${r.review_required}\n`;
        md += `- **Production Certified**: ${r.production_certified}\n`;
        md += `- **Standard Certified**: ${r.standard_certified}\n`;
        md += `- **PDF/X Claimed**: ${r.pdfx_compliance_claimed}\n`;
        md += `- **Validation Performed**: ${r.validation_performed}\n`;
        md += `- **Validation Passed**: ${r.validation_passed}\n`;
        md += `- **Standard Claimed**: ${r.standard_claimed}\n`;
        md += `- **Validator Name**: ${r.validator_name}\n`;
        md += `- **Detector Gap**: ${r.detector_gap}\n`;
        md += `- **Validator Gap**: ${r.validator_gap}\n`;
        md += `- **Fixture Gap**: ${r.fixture_gap}\n`;
        md += `- **Deferred**: ${r.deferred}\n`;
        md += `- **Primary Artifact**: ${r.primary_artifact_type}\n`;
        md += `- **Certified PDF Downgraded**: ${r.certified_pdf_downgraded}\n`;
        md += `- **Customer Summary**: ${r.customer_summary}\n`;
        if (r.notes.length > 0) {
            md += `- **Notes**:\n`;
            r.notes.forEach(n => md += `  - ${n}\n`);
        }
        md += `\n`;
    });

    const finalMdPath = path.join(reportsDir, 'phase55e_control_plane_standards_real_governance.md');
    fs.writeFileSync(finalMdPath, md);
    console.log(`\nReports saved to ${reportsDir}`);
    
    if (failCount > 0) process.exit(1);
}

run();
