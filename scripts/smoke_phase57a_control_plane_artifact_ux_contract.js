const fs = require('fs');
const path = require('path');
const { getHumanReport } = require('../src/api/services/preflightHumanReportService');

const outJsonPath = path.resolve(__dirname, '../reports/phase57a_control_plane_artifact_ux_contract.json');
const outMdPath = path.resolve(__dirname, '../reports/phase57a_control_plane_artifact_ux_contract.md');

// Ensure reports directory exists
if (!fs.existsSync(path.dirname(outJsonPath))) {
    fs.mkdirSync(path.dirname(outJsonPath), { recursive: true });
}

const scenarios = [
    {
        id: 1,
        name: "Customer review_pdf with review_required=true",
        setup: () => ({
            job: {
                certificationLevel: "REVIEW_REQUIRED",
                artifact_trust: { primary_artifact_type: "review_pdf", review_required: true }
            },
            artifacts: [
                { type: 'review_pdf', alias: 'review_pdf', filename: 'review.pdf', size_bytes: 1000 }
            ]
        }),
        validate: (res) => {
            const ux = res.report.artifact_ux.customer_labels.find(l => l.artifact_type === 'review_pdf');
            if (!ux) throw new Error("Missing customer UX label for review_pdf");
            if (ux.display_label !== "Review file") throw new Error("Incorrect label: " + ux.display_label);
            if (ux.status_badge !== "Needs review") throw new Error("Incorrect badge: " + ux.status_badge);
            if (ux.tooltip.indexOf("review") === -1) throw new Error("Tooltip missing review wording");
            if (ux.allowed_claims.includes("Production approved")) throw new Error("Claims production ready");
        }
    },
    {
        id: 2,
        name: "Customer fixed_pdf not production-certified",
        setup: () => ({
            job: {
                certificationLevel: "FIXED_READY",
                artifact_trust: { primary_artifact_type: "fixed_pdf", production_certified: false }
            },
            artifacts: [
                { type: 'fixed_pdf', alias: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1000 }
            ]
        }),
        validate: (res) => {
            const ux = res.report.artifact_ux.customer_labels.find(l => l.artifact_type === 'fixed_pdf');
            if (ux.display_label !== "Corrected file") throw new Error("Incorrect label: " + ux.display_label);
            if (ux.display_label.toLowerCase().includes("certified")) throw new Error("Includes certified");
            if (ux.display_label.toLowerCase().includes("print-ready")) throw new Error("Includes print-ready");
        }
    },
    {
        id: 3,
        name: "Customer certified_pdf without artifact_trust approval",
        setup: () => ({
            job: {
                certificationLevel: "CERTIFIED_READY",
                artifact_trust: { production_certified: false }
            },
            artifacts: [
                { type: 'certified_pdf', alias: 'certified_pdf', filename: 'certified.pdf', size_bytes: 1000 }
            ]
        }),
        validate: (res) => {
            const ux = res.report.artifact_ux.customer_labels.find(l => l.artifact_type === 'certified_pdf');
            if (ux.customer_visible !== false) throw new Error("Should not be customer visible");
            if (ux.display_label.includes("Certified PDF")) throw new Error("Contains Certified PDF");
        }
    },
    {
        id: 4,
        name: "Customer production-certified but not standard-certified",
        setup: () => ({
            job: {
                certificationLevel: "CERTIFIED_READY",
                artifact_trust: { production_certified: true, standard_certified: false }
            },
            artifacts: [
                { type: 'certified_pdf', alias: 'certified_pdf', filename: 'certified.pdf', size_bytes: 1000, production_certified: true, customer_visible: true }
            ]
        }),
        validate: (res) => {
            const ux = res.report.artifact_ux.customer_labels.find(l => l.artifact_type === 'certified_pdf');
            if (ux.display_label !== "Production-approved file") throw new Error("Incorrect label: " + ux.display_label);
            if (!ux.tooltip.includes("Not independently validated") && !ux.tooltip.includes("not been independently validated")) throw new Error("Missing standards warning in tooltip");
        }
    },
    {
        id: 5,
        name: "Customer standard-certified with PDF/X evidence",
        setup: () => ({
            job: {
                certificationLevel: "CERTIFIED_READY",
                standards_certification_governance: {
                    validation_performed: true,
                    validation_passed: true,
                    validator_name: "verapdf",
                    validator_version: "1.24",
                    standard_detected: "PDF/X-4",
                    validation_report_available: true,
                    standard_certified: true
                },
                artifact_trust: {
                    production_certified: true, standard_certified: true,
                    evidence: {
                        validation_performed: true,
                        validation_passed: true,
                        validator_name: "v", validator_version: "1", standard_detected: "PDF/X-4",
                        validation_report_available: true
                    }
                }
            },
            artifacts: [
                { type: 'certified_pdf', alias: 'certified_pdf', filename: 'certified.pdf', size_bytes: 1000, production_certified: true, standard_certified: true, customer_visible: true }
            ]
        }),
        validate: (res) => {
            const ux = res.report.artifact_ux.customer_labels.find(l => l.artifact_type === 'certified_pdf');
            if (ux.display_label !== "Standards-validated file") throw new Error("Incorrect label: " + ux.display_label);
            if (!ux.status_badge.includes("PDF/X")) throw new Error("Missing PDF/X badge");
        }
    },
    {
        id: 6,
        name: "Operator review_pdf",
        setup: () => ({
            job: {
                certificationLevel: "REVIEW_REQUIRED",
                artifact_trust: { review_required: true }
            },
            artifacts: [
                { type: 'review_pdf', alias: 'review_pdf', filename: 'review.pdf', size_bytes: 1000 }
            ]
        }),
        validate: (res) => {
            const ux = res.report.artifact_ux.operator_labels.find(l => l.artifact_type === 'review_pdf');
            if (ux.display_label !== "Review PDF") throw new Error("Incorrect operator label");
            if (ux.status_badge !== "Human review required") throw new Error("Incorrect badge");
            if (!ux.tooltip.includes("inspect visual or governance-sensitive changes")) throw new Error("Missing technical tooltip");
        }
    },
    {
        id: 7,
        name: "Operator certified_pdf not production-certified",
        setup: () => ({
            job: {
                certificationLevel: "CERTIFIED_READY",
                artifact_trust: { production_certified: false }
            },
            artifacts: [
                { type: 'certified_pdf', alias: 'certified_pdf', filename: 'certified.pdf', size_bytes: 1000 }
            ]
        }),
        validate: (res) => {
            const ux = res.report.artifact_ux.operator_labels.find(l => l.artifact_type === 'certified_pdf');
            if (!ux.display_label.includes("artifact") && !ux.display_label.includes("Artifact")) throw new Error("Should mention artifact exists");
            if (ux.status_badge !== "Not production certified") throw new Error("Incorrect badge");
        }
    },
    {
        id: 8,
        name: "OutputIntent warning",
        setup: () => ({
            job: {
                certificationLevel: "CERTIFIED_READY",
                artifact_trust: { production_certified: true, standard_certified: true, outputintent_changed: true, outputintent_does_not_prove_pdfx: false }
            },
            artifacts: [
                { type: 'certified_pdf', alias: 'certified_pdf', filename: 'certified.pdf', size_bytes: 1000 }
            ]
        }),
        validate: (res) => {
            const ux = res.report.artifact_ux.operator_labels.find(l => l.artifact_type === 'certified_pdf');
            if (!ux.warning || !ux.warning.includes("OutputIntent does not prove PDF/X")) throw new Error("Missing OutputIntent warning");
        }
    },
    {
        id: 9,
        name: "Audit JSON / Delta Report / Human Report buttons",
        setup: () => ({
            job: { certificationLevel: "CERTIFIED_READY" },
            artifacts: [
                { type: 'audit_json', filename: 'audit.json', size_bytes: 100 },
                { type: 'delta_report', filename: 'delta.json', size_bytes: 100 },
                { type: 'human_report', filename: 'report.json', size_bytes: 100 }
            ]
        }),
        validate: (res) => {
            const opUx = res.report.artifact_ux.operator_labels;
            const custUx = res.report.artifact_ux.customer_labels;
            
            ['audit_json', 'delta_report', 'human_report'].forEach(type => {
                const o = opUx.find(l => l.artifact_type === type);
                const c = custUx.find(l => l.artifact_type === type);
                if (!o.tooltip) throw new Error(`Missing tooltip for ${type}`);
                if (!o.operator_visible) throw new Error(`${type} not operator visible`);
                if (c.customer_visible) throw new Error(`${type} is customer visible when it shouldn't be`);
            });
        }
    },
    {
        id: 10,
        name: "Public report sanitation",
        setup: () => ({
            job: {
                certificationLevel: "CERTIFIED_READY",
                artifact_trust: {
                    production_certified: true,
                    evidence: {
                        raw_command: "verapdf /some/path",
                        local_path: "/tmp/foo",
                        internal_id: "123"
                    }
                }
            },
            artifacts: []
        }),
        validate: (res) => {
            const ev = res.report.artifact_trust.evidence || {};
            if (ev.raw_command || ev.local_path || ev.internal_id) throw new Error("Sanitation failed");
        }
    },
    {
        id: 11,
        name: "Primary artifact UX",
        setup: () => ({
            job: {
                certificationLevel: "REVIEW_REQUIRED",
                artifact_trust: { primary_artifact_type: "review_pdf", review_required: true }
            },
            artifacts: [
                { type: 'certified_pdf', alias: 'certified_pdf', filename: 'certified.pdf', size_bytes: 1000 },
                { type: 'review_pdf', alias: 'review_pdf', filename: 'review.pdf', size_bytes: 1000 }
            ]
        }),
        validate: (res) => {
            const prim = res.report.artifact_ux.primary;
            if (!prim || prim.type !== 'review_pdf') throw new Error("Primary artifact is not review_pdf");
        }
    },
    {
        id: 12,
        name: "Forbidden labels regression",
        setup: () => ({
            job: { certificationLevel: "CERTIFIED_READY" },
            artifacts: [
                { type: 'certified_pdf', label: 'Certified PDF Print-ready', filename: 'certified.pdf', size_bytes: 1000, customer_visible: true }
            ]
        }),
        validate: (res) => {
            const ux = res.report.artifact_ux.customer_labels.find(l => l.artifact_type === 'certified_pdf');
            const str = ux.display_label + " " + ux.tooltip + " " + ux.button_label;
            const forbidden = ["Certified PDF", "Print-ready", "PDF/X certified", "PDF/A certified", "Standards certified", "Guaranteed fixed"];
            forbidden.forEach(f => {
                if (new RegExp(f, 'gi').test(str)) throw new Error(`Forbidden claim found: ${f}`);
            });
            if (!res.report.artifact_ux.forbidden_claims_removed.includes("Certified PDF")) throw new Error("Did not track forbidden claim removal");
        }
    }
];

async function runSmokeTests() {
    console.log("Running Phase 57A Control Plane Artifact UX Contract Smoke Tests");
    let passed = 0;
    let failed = 0;
    const results = [];

    for (const scenario of scenarios) {
        try {
            const { job, artifacts } = scenario.setup();
            const res = await getHumanReport("TEST_JOB", {}, job, artifacts);
            scenario.validate(res);
            results.push({ id: scenario.id, name: scenario.name, status: "PASS", error: null });
            passed++;
        } catch (e) {
            results.push({ id: scenario.id, name: scenario.name, status: "FAIL", error: e.message });
            failed++;
        }
    }

    const report = {
        timestamp: new Date().toISOString(),
        total: scenarios.length,
        passed,
        failed,
        results
    };

    fs.writeFileSync(outJsonPath, JSON.stringify(report, null, 2));

    let md = `# Phase 57A Control Plane Artifact UX Contract Report\n\n`;
    md += `**Date:** ${report.timestamp}\n\n`;
    md += `## Summary\n`;
    md += `- Total: ${report.total}\n`;
    md += `- Passed: ${report.passed}\n`;
    md += `- Failed: ${report.failed}\n\n`;
    md += `## Scenarios\n`;
    report.results.forEach(r => {
        md += `### ${r.id}. ${r.name}\n`;
        md += `- Status: ${r.status}\n`;
        if (r.error) {
            md += `- Error: ${r.error}\n`;
        }
        md += `\n`;
    });

    fs.writeFileSync(outMdPath, md);

    if (failed > 0) {
        console.error("Smoke tests failed.");
        process.exit(1);
    } else {
        console.log("All smoke tests passed.");
    }
}

runSmokeTests();
