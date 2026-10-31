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
        name: "A. CONVERT_CMYK applied",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                production_certified: true,
                review_required: false,
                color_governance: {
                    color_conversion_applied: true,
                    destructive_color_fix_applied: true,
                    certified_pdf_allowed: false,
                    production_certified: false
                },
                fix_summary: { applied_count: 1 },
                applied_fixes: ['CONVERT_CMYK']
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
            if (!opSum.includes('Color conversion to CMYK was applied')) throw new Error('Missing CMYK wording');
            const custSum = res.report.copy_blocks.customer;
            if (!custSum.includes('The PDF contains color conditions')) throw new Error('Missing customer wording');
            
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
        name: "B. INJECT_OUTPUT_INTENT only",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                production_certified: true,
                review_required: false,
                color_governance: {
                    color_conversion_applied: false,
                    destructive_color_fix_applied: false,
                    certified_pdf_allowed: true,
                    production_certified: true
                },
                fix_summary: { applied_count: 1 },
                applied_fixes: ['INJECT_OUTPUT_INTENT']
            },
            artifacts: [
                { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 100, production_certified: true, customer_visible: true, artifact_role: 'PRODUCTION_READY' }
            ]
        },
        assert: (res) => {
            if (res.report.outcome !== 'CERTIFIED_READY') throw new Error('Outcome should be CERTIFIED_READY');
            if (res.report.fix_summary.production_certified !== true) throw new Error('production_certified should be true');
            const fixes = res.report.fix_summary.applied_fixes;
            if (!fixes.some(f => f.includes('No color values were rewritten'))) throw new Error('Missing safe OutputIntent wording');
            const certArtifact = res.report.artifact_recommendations.find(a => a.type === 'certified_pdf');
            if (!certArtifact.is_primary) throw new Error('certified_pdf should be primary');
        }
    },
    {
        name: "C. INJECT_OUTPUT_INTENT + ICC risk",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'FIXED_READY',
                production_certified: false,
                review_required: false,
                color_governance: {
                    review_required_color_reasons: ['ICC_MISMATCH']
                },
                fix_summary: { applied_count: 1 },
                applied_fixes: ['INJECT_OUTPUT_INTENT']
            },
            artifacts: [
                { type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 100, downloadable: true }
            ]
        },
        assert: (res) => {
            if (!res.report.outcome.includes('REVIEW_REQUIRED')) throw new Error('Outcome should require review');
            const opSum = res.report.copy_blocks.operator;
            if (!opSum.includes('color profile conflicts or color risks remain')) throw new Error('Missing risky OutputIntent wording');
            if (!opSum.includes('ICC/profile inconsistencies')) throw new Error('Missing ICC mismatch wording');
        }
    },
    {
        name: "D. REDUCE_TAC unsupported",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                color_governance: {
                    review_required_color_reasons: ['EXCESSIVE_TAC']
                },
                skipped_fixes: ['REDUCE_TAC']
            },
            artifacts: []
        },
        assert: (res) => {
            if (!res.report.outcome.includes('REVIEW_REQUIRED')) throw new Error('Outcome should require review');
            const opSum = res.report.copy_blocks.operator;
            if (!opSum.includes('Total ink coverage reduction is not currently implemented')) throw new Error('Missing unsupported TAC wording');
            if (!opSum.includes('may exceed total ink coverage limits')) throw new Error('Missing excessive TAC finding wording');
        }
    },
    {
        name: "E. MAP_RICH_BLACK_TEXT_TO_K_ONLY unsupported",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                color_governance: {
                    review_required_color_reasons: ['RICH_BLACK_TEXT']
                },
                skipped_fixes: ['MAP_RICH_BLACK_TEXT_TO_K_ONLY']
            },
            artifacts: []
        },
        assert: (res) => {
            if (!res.report.outcome.includes('REVIEW_REQUIRED')) throw new Error('Outcome should require review');
            const opSum = res.report.copy_blocks.operator;
            if (!opSum.includes('Rich black text remapping is not currently implemented')) throw new Error('Missing unsupported rich black wording');
        }
    },
    {
        name: "F. MAP_REGISTRATION_COLOR_TO_BLACK unsupported",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                color_governance: {
                    review_required_color_reasons: ['REGISTRATION_COLOR_MISUSE']
                },
                skipped_fixes: ['MAP_REGISTRATION_COLOR_TO_BLACK']
            },
            artifacts: []
        },
        assert: (res) => {
            if (!res.report.outcome.includes('REVIEW_REQUIRED')) throw new Error('Outcome should require review');
            const opSum = res.report.copy_blocks.operator;
            if (!opSum.includes('Registration color remapping is not currently implemented')) throw new Error('Missing unsupported registration color wording');
        }
    },
    {
        name: "G. Public report sanitation",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'CERTIFIED_READY',
                color_governance: {
                    destructive_color_fix_applied: true
                },
                applied_fixes: ['CONVERT_CMYK']
            },
            artifacts: [
                { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 100, production_certified: true, customer_visible: true, artifact_role: 'PRODUCTION_READY' },
                { type: 'review_pdf', filename: 'review.pdf', size_bytes: 100, downloadable: true }
            ]
        },
        assert: (res) => {
            const certArtifact = res.report.artifact_recommendations.find(a => a.type === 'certified_pdf');
            if (certArtifact && certArtifact.is_customer_safe) throw new Error('certified_pdf must not be customer safe if destructive color fix applied');
            
            // Check leak
            const stringified = JSON.stringify(res.report);
            if (stringified.includes('obj_id') || stringified.includes('forensic')) {
                throw new Error('Public report leaks internal details');
            }
        }
    },
    {
        name: "H. Readiness / invoice gate simulation",
        input: {
            job: {
                status: 'COMPLETED',
                certification_level: 'FIXED_REVIEW_REQUIRED',
                review_required: true,
                color_governance: {
                    review_required_color_reasons: ['MIXED_RGB_CMYK']
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
    console.log("Running Phase 52D Control Plane Color Human Report Smoke Tests...\n");
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
                input_governance_evidence: scenario.input.job.color_governance,
                outcome: res.report.outcome,
                severity: res.report.severity,
                production_certified: res.report.fix_summary.production_certified,
                review_required: res.report.fix_summary.review_required,
                primary_artifact_type: res.report.recommended_next_action.primary_artifact_type,
                certified_pdf_downgraded: res.report.artifact_recommendations.some(a => (a.type === 'certified_pdf' || a.alias === 'certified_pdf') && !a.production_certified),
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

    fs.writeFileSync(path.join(reportDir, 'phase52d_control_plane_color_human_report.json'), JSON.stringify(reportData, null, 2));
    
    let md = `# Phase 52D Control Plane Color Human Report Smoke Test\n\n`;
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
            md += `- **Customer Wording:** "${item.customer_wording}"\n`;
            md += `- **Operator Wording:** "${item.operator_wording}"\n`;
        } else {
            md += `- **Error:** ${item.error}\n`;
        }
        md += `\n`;
    }

    fs.writeFileSync(path.join(reportDir, 'phase52d_control_plane_color_human_report.md'), md);

    if (passed < scenarios.length) {
        process.exit(1);
    }
}

run();
