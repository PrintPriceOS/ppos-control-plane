const fs = require('fs');
const path = require('path');
const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');

async function run() {
    console.log("Running Phase 56D Smoke Tests...");
    const reports = [];

    // Scenario 1: certified.pdf filename only
    const job1 = {
        id: 'job1',
        status: 'COMPLETED',
        artifact_trust: {
            production_certified: false,
            standard_certified: false,
            customer_visible: false
        }
    };
    const artifacts1 = [
        { type: 'certified_pdf', alias: 'certified_pdf', filename: 'certified.pdf', size_bytes: 1000 }
    ];
    const rep1 = await preflightHumanReportService.getHumanReport('job1', {}, job1, artifacts1);
    reports.push({ scenario: 'certified.pdf filename only', report: rep1 });

    // Scenario 2: review_pdf primary
    const job2 = {
        id: 'job2',
        status: 'COMPLETED',
        artifact_trust: {
            primary_artifact_type: 'review_pdf',
            review_required: true,
            certified_pdf_allowed: false
        }
    };
    const artifacts2 = [
        { type: 'certified_pdf', alias: 'certified_pdf', filename: 'certified.pdf', size_bytes: 1000 },
        { type: 'review_pdf', alias: 'review_pdf', filename: 'review.pdf', size_bytes: 1200 }
    ];
    const rep2 = await preflightHumanReportService.getHumanReport('job2', {}, job2, artifacts2);
    reports.push({ scenario: 'review_pdf primary', report: rep2 });

    // Scenario 3: fixed_pdf primary
    const job3 = {
        id: 'job3',
        status: 'COMPLETED',
        artifact_trust: {
            primary_artifact_type: 'fixed_pdf',
            trust_level: 'FIXED_READY',
            production_certified: false,
            standard_certified: false
        }
    };
    const artifacts3 = [
        { type: 'fixed_pdf', alias: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1100 }
    ];
    const rep3 = await preflightHumanReportService.getHumanReport('job3', {}, job3, artifacts3);
    reports.push({ scenario: 'fixed_pdf primary', report: rep3 });

    // Scenario 4: production-certified but not standards-certified
    const job4 = {
        id: 'job4',
        status: 'COMPLETED',
        artifact_trust: {
            primary_artifact_type: 'certified_pdf',
            production_certified: true,
            standard_certified: false,
            customer_visible: true,
            certified_pdf_allowed: true
        }
    };
    const artifacts4 = [
        { type: 'certified_pdf', alias: 'certified_pdf', filename: 'certified.pdf', size_bytes: 1000, customer_visible: true, production_certified: true, artifact_role: 'PRODUCTION_READY' }
    ];
    const rep4 = await preflightHumanReportService.getHumanReport('job4', {}, job4, artifacts4);
    reports.push({ scenario: 'production-certified but not standards-certified', report: rep4 });

    // Scenario 5: standards-certified with complete evidence
    const job5 = {
        id: 'job5',
        status: 'COMPLETED',
        artifact_trust: {
            production_certified: true,
            standard_certified: true,
            pdfx_compliance_claimed: true,
            primary_artifact_type: 'certified_pdf',
            customer_visible: true,
            certified_pdf_allowed: true,
            evidence: {
                validation_performed: true,
                validation_passed: true,
                validator_name: 'pdfToolbox',
                validator_version: '13',
                standard_detected: 'PDF/X-4',
                validation_report_available: true,
                compliance_claim_allowed: true
            }
        }
    };
    const rep5 = await preflightHumanReportService.getHumanReport('job5', {}, job5, artifacts4);
    reports.push({ scenario: 'standards-certified with complete evidence', report: rep5 });

    // Scenario 6: standards-certified claim without evidence
    const job6 = {
        id: 'job6',
        status: 'COMPLETED',
        artifact_trust: {
            production_certified: true,
            standard_certified: true,
            pdfx_compliance_claimed: true
        }
    };
    const rep6 = await preflightHumanReportService.getHumanReport('job6', {}, job6, artifacts4);
    reports.push({ scenario: 'standards-certified claim without evidence', report: rep6 });

    // Scenario 7: OutputIntent only
    const job7 = {
        id: 'job7',
        status: 'COMPLETED',
        artifact_trust: {
            warnings: ['OutputIntent does not prove PDF/X'],
            pdfx_compliance_claimed: false
        }
    };
    const rep7 = await preflightHumanReportService.getHumanReport('job7', {}, job7, artifacts4);
    reports.push({ scenario: 'OutputIntent only', report: rep7 });

    // Scenario 8: blocked governance domains
    const job8 = {
        id: 'job8',
        status: 'COMPLETED',
        artifact_trust: {
            blocked_by_governance_domains: ['color', 'fonts'],
            review_required: true,
            primary_artifact_type: 'review_pdf',
            production_certified: false
        }
    };
    const rep8 = await preflightHumanReportService.getHumanReport('job8', {}, job8, artifacts2);
    reports.push({ scenario: 'blocked governance domains', report: rep8 });

    // Scenario 9: customer_visible conflict
    const job9 = {
        id: 'job9',
        status: 'COMPLETED',
        artifact_trust: {
            customer_visible: false
        }
    };
    const artifacts9 = [
        { type: 'certified_pdf', alias: 'certified_pdf', filename: 'certified.pdf', size_bytes: 1000, metadata: { customer_visible: true } }
    ];
    const rep9 = await preflightHumanReportService.getHumanReport('job9', {}, job9, artifacts9);
    reports.push({ scenario: 'customer_visible conflict', report: rep9 });

    // Scenario 10: public report sanitation
    const job10 = {
        id: 'job10',
        status: 'COMPLETED',
        artifact_trust: {
            evidence: {
                raw_command: 'pdfToolbox --profile "PDF/X-4" /local/path/to/file.pdf',
                internal_id: 'obj_12345'
            }
        }
    };
    const rep10 = await preflightHumanReportService.getHumanReport('job10', {}, job10, artifacts1);
    reports.push({ scenario: 'public report sanitation', report: rep10 });

    fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '../reports/phase56d_control_plane_artifact_label_consolidation.json'), JSON.stringify(reports, null, 2));
    
    let md = '# Phase 56D Control Plane Artifact Label Consolidation Report\n\n';
    reports.forEach(r => {
        md += `## Scenario: ${r.scenario}\n`;
        const rep = r.report.report;
        md += `- **Outcome**: ${rep.outcome}\n`;
        md += `- **Customer Summary**: ${rep.customer_summary}\n`;
        md += `- **Operator Summary**: ${rep.operator_summary}\n`;
        
        const primary = rep.artifact_recommendations.find(a => a.is_primary);
        md += `- **Primary Artifact**: ${primary ? primary.filename : 'None'}\n`;
        md += `- **PDF/X Claimed**: ${rep.pdfx_compliance_claimed}\n`;
        md += `- **Standards Certified**: ${rep.standard_certified}\n`;
        md += `- **Warnings**: ${JSON.stringify(rep.artifact_trust?.warnings || [])}\n`;
        md += `\n`;
    });
    fs.writeFileSync(path.join(__dirname, '../reports/phase56d_control_plane_artifact_label_consolidation.md'), md);
    console.log("Done.");
}

run().catch(console.error);
