const fs = require('fs');
const path = require('path');
const { getHumanReport } = require('../src/api/services/preflightHumanReportService');

// Stub for governance ledger
jest = { fn: () => {} };
try {
    const govLedger = require('../src/api/services/preflightGovernanceLedgerService');
    govLedger.getGovernanceLedger = async () => ({ events: [] });
} catch(e) {}

const scenarios = [
    {
        name: "1. TRANSPARENCY_PRESENT finding",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                production_certified: true,
                review_required: false,
                transparency_overprint_governance: {
                    transparency_present: true
                },
                fix_summary: { applied_count: 0 },
                applied_fixes: []
            },
            artifacts: [
                { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 100, production_certified: true, customer_visible: true, artifact_role: 'PRODUCTION_READY' },
                { type: 'review_pdf', filename: 'review.pdf', size_bytes: 100, downloadable: true }
            ]
        },
        assert: (res) => {
            if (!res.report.outcome.includes('REVIEW_REQUIRED')) throw new Error('Outcome should require review');
            if (res.report.fix_summary.production_certified !== false) throw new Error('production_certified should be false');
            const opSum = res.report.copy_blocks.operator;
            if (!opSum.includes('The PDF contains transparency. Transparency may render differently across print workflows and requires review.')) throw new Error('Missing operator wording');
            const custSum = res.report.copy_blocks.customer;
            if (!custSum.includes('The PDF contains transparency or overprint conditions that may affect print appearance. A human review is required before production.')) throw new Error('Missing customer wording');
            
            const certArtifact = res.report.artifact_recommendations.find(a => a.type === 'certified_pdf');
            if (certArtifact.is_primary) throw new Error('certified_pdf should not be primary');
            if (certArtifact.production_certified) throw new Error('certified_pdf should be downgraded');
            
            const primary = res.report.recommended_next_action;
            if (primary.primary_artifact_type !== 'review_pdf' && primary.primary_artifact_type !== 'fixed_pdf') {
                throw new Error('Primary artifact must be review_pdf or fixed_pdf');
            }
        }
    },
    {
        name: "2. SOFT_MASK_PRESENT + BLEND_MODE_PRESENT",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                transparency_overprint_governance: {
                    soft_masks_present: true,
                    blend_modes_present: true
                }
            },
            artifacts: []
        },
        assert: (res) => {
            if (!res.report.outcome.includes('REVIEW_REQUIRED')) throw new Error('Outcome should require review');
            if (res.report.fix_summary.production_certified !== false) throw new Error('production_certified should be false');
            const opSum = res.report.copy_blocks.operator;
            if (!opSum.includes('The PDF contains soft masks')) throw new Error('Missing soft masks wording');
            if (!opSum.includes('The PDF uses blend modes')) throw new Error('Missing blend modes wording');
        }
    },
    {
        name: "3. OVERPRINT_PRESENT",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                transparency_overprint_governance: {
                    overprint_present: true
                }
            },
            artifacts: []
        },
        assert: (res) => {
            if (!res.report.outcome.includes('REVIEW_REQUIRED')) throw new Error('Outcome should require review');
            if (res.report.fix_summary.production_certified !== false) throw new Error('production_certified should be false');
            const opSum = res.report.copy_blocks.operator;
            if (!opSum.includes('The PDF contains overprint settings')) throw new Error('Missing overprint wording');
        }
    },
    {
        name: "4. RASTERIZATION_RISK",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                transparency_overprint_governance: {
                    rasterization_risk: true,
                    highest_transparency_overprint_risk: 'critical'
                }
            },
            artifacts: []
        },
        assert: (res) => {
            if (!res.report.outcome.includes('REVIEW_REQUIRED')) throw new Error('Outcome should require review');
            if (res.report.severity !== 'critical') throw new Error('Severity should be critical');
            const opSum = res.report.copy_blocks.operator;
            if (!opSum.includes('The PDF may require rasterization or flattening, which can alter visual appearance')) throw new Error('Missing rasterization wording');
        }
    },
    {
        name: "5. Unsupported FLATTEN_TRANSPARENCY",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                transparency_overprint_governance: {
                    transparency_present: true,
                    unsupported_transparency_overprint_fixes: ['FLATTEN_TRANSPARENCY']
                },
                skipped_fixes: ['FLATTEN_TRANSPARENCY']
            },
            artifacts: []
        },
        assert: (res) => {
            const opSum = res.report.copy_blocks.operator;
            if (!opSum.includes('Transparency flattening is not currently implemented. A print operator must review this file.')) throw new Error('Missing unsupported flatten transparency wording');
            if (res.report.fix_summary.applied_fixes.some(f => f.includes('FLATTEN_TRANSPARENCY'))) throw new Error('Should not be described as applied');
        }
    },
    {
        name: "6. Unsupported FLATTEN_OVERPRINT",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                transparency_overprint_governance: {
                    overprint_present: true,
                    unsupported_transparency_overprint_fixes: ['FLATTEN_OVERPRINT']
                },
                skipped_fixes: ['FLATTEN_OVERPRINT']
            },
            artifacts: []
        },
        assert: (res) => {
            if (!res.report.outcome.includes('REVIEW_REQUIRED')) throw new Error('Outcome should require review');
            const opSum = res.report.copy_blocks.operator;
            if (!opSum.includes('Overprint flattening is not currently implemented. A print operator must review this file.')) throw new Error('Missing unsupported flatten overprint wording');
        }
    },
    {
        name: "7. Unsupported CONVERT_TO_PDFX_TRANSPARENCY_SAFE",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                pdfx_compliance_claimed: true,
                pdfx_generation_performed: true,
                transparency_overprint_governance: {
                    transparency_present: true,
                    unsupported_transparency_overprint_fixes: ['CONVERT_TO_PDFX_TRANSPARENCY_SAFE']
                },
                skipped_fixes: ['CONVERT_TO_PDFX_TRANSPARENCY_SAFE']
            },
            artifacts: []
        },
        assert: (res) => {
            if (res.report.pdfx_compliance_claimed !== false) throw new Error('PDF/X compliance should not be claimed');
            if (res.report.pdfx_generation_performed !== false) throw new Error('PDF/X generation should not be performed');
            const opSum = res.report.copy_blocks.operator;
            if (!opSum.includes('PDF/X transparency-safe conversion is not implemented or validated. PDF/X compliance was not claimed.')) throw new Error('Missing PDF/X overclaim protection wording');
        }
    },
    {
        name: "8. Future applied visual rewrite fix",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                transparency_overprint_governance: {
                    visual_rewrite_fix_applied: true,
                    certified_pdf_allowed: false
                },
                applied_fixes: ['FLATTEN_PDF']
            },
            artifacts: [
                { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 100, production_certified: true, customer_visible: true, artifact_role: 'PRODUCTION_READY' },
                { type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 100, downloadable: true }
            ]
        },
        assert: (res) => {
            if (res.report.outcome !== 'FIXED_REVIEW_REQUIRED') throw new Error('Outcome should be FIXED_REVIEW_REQUIRED');
            if (res.report.fix_summary.production_certified !== false) throw new Error('production_certified should be false');
            const opSum = res.report.copy_blocks.operator;
            if (!opSum.includes('Visual rewrite fix was applied. This can significantly alter appearance.')) throw new Error('Missing visual rewrite warning');
            
            const certArtifact = res.report.artifact_recommendations.find(a => a.type === 'certified_pdf');
            if (certArtifact.is_primary) throw new Error('certified_pdf should not be primary when certified_pdf_allowed=false');
        }
    },
    {
        name: "9. Public report sanitation",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                transparency_overprint_governance: {
                    transparency_present: true
                }
            },
            artifacts: [
                { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 100, production_certified: true, customer_visible: true, artifact_role: 'PRODUCTION_READY' }
            ]
        },
        assert: (res) => {
            const certArtifact = res.report.artifact_recommendations.find(a => a.type === 'certified_pdf');
            if (certArtifact && certArtifact.is_customer_safe) throw new Error('certified_pdf must not be customer safe if transparency requires review');
            
            // Check leak
            const stringified = JSON.stringify(res.report);
            if (stringified.includes('obj_id') || stringified.includes('forensic')) {
                throw new Error('Public report leaks internal details');
            }
        }
    },
    {
        name: "10. Readiness / invoice gate simulation",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'FIXED_REVIEW_REQUIRED',
                review_required: true,
                transparency_overprint_governance: {
                    review_required_reasons: ['TRANSPARENCY_PRESENT', 'OVERPRINT_PRESENT']
                }
            },
            artifacts: []
        },
        assert: (res) => {
            if (res.report.outcome !== 'FIXED_REVIEW_REQUIRED' && res.report.outcome !== 'REVIEW_REQUIRED') throw new Error('Outcome should be REVIEW_REQUIRED');
            // Simulate gate
            const isReady = !res.report.fix_summary.review_required;
            if (isReady) throw new Error('Should not be ready for invoice/payment if review required');
        }
    }
];

async function run() {
    console.log("Running Phase 53D Control Plane Transparency / Overprint Human Report Smoke Tests...\n");
    const reportData = [];
    let passed = 0;

    for (const scenario of scenarios) {
        try {
            const res = await getHumanReport('job-123', { tenantId: 'tenant-1' }, scenario.input.job, scenario.input.artifacts);
            scenario.assert(res);
            console.log(`✅ ${scenario.name}`);
            passed++;
            
            reportData.push({
                scenario: scenario.name,
                input_governance_evidence: scenario.input.job.transparency_overprint_governance,
                outcome: res.report.outcome,
                severity: res.report.severity,
                production_certified: res.report.fix_summary.production_certified,
                review_required: res.report.fix_summary.review_required,
                primary_artifact_type: res.report.recommended_next_action.primary_artifact_type,
                certified_pdf_downgraded: res.report.artifact_recommendations.some(a => (a.type === 'certified_pdf' || a.alias === 'certified_pdf') && !a.production_certified),
                pdfx_compliance_claimed: res.report.pdfx_compliance_claimed,
                pdfx_generation_performed: res.report.pdfx_generation_performed,
                customer_wording: res.report.copy_blocks.customer,
                operator_wording: res.report.copy_blocks.operator,
                pass: true
            });
        } catch (err) {
            console.error(`❌ ${scenario.name} FAILED: ${err.message}`);
            reportData.push({
                scenario: scenario.name,
                pass: false,
                error: err.message
            });
        }
    }

    console.log(`\nResults: ${passed} / ${scenarios.length} passed.`);

    // Write reports
    const reportDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    fs.writeFileSync(path.join(reportDir, 'phase53d_control_plane_transparency_overprint_human_report.json'), JSON.stringify(reportData, null, 2));
    
    let md = `# Phase 53D Control Plane Transparency / Overprint Human Report Smoke Test\n\n`;
    md += `**Results:** ${passed} / ${scenarios.length} passed.\n\n`;
    for (const item of reportData) {
        md += `## ${item.scenario}\n`;
        md += `- **Pass:** ${item.pass ? '✅' : '❌'}\n`;
        if (item.pass) {
            md += `- **Outcome:** ${item.outcome}\n`;
            md += `- **Severity:** ${item.severity}\n`;
            md += `- **Production Certified:** ${item.production_certified}\n`;
            md += `- **Review Required:** ${item.review_required}\n`;
            md += `- **Primary Artifact:** ${item.primary_artifact_type}\n`;
            md += `- **Certified PDF Downgraded:** ${item.certified_pdf_downgraded}\n`;
            md += `- **PDF/X Compliance Claimed:** ${item.pdfx_compliance_claimed}\n`;
            md += `- **Customer Wording:** "${item.customer_wording}"\n`;
            md += `- **Operator Wording:** "${item.operator_wording}"\n`;
        } else {
            md += `- **Error:** ${item.error}\n`;
        }
        md += `\n`;
    }

    fs.writeFileSync(path.join(reportDir, 'phase53d_control_plane_transparency_overprint_human_report.md'), md);

    if (passed < scenarios.length) {
        process.exit(1);
    }
}

run();
