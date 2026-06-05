const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PdfFixEngine = require('../../ppos-preflight-engine/execution/PdfFixEngine');
const FixAuditNormalizer = require('../../ppos-preflight-service/services/FixAuditNormalizer');
const { getHumanReport } = require('../src/api/services/preflightHumanReportService');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase50c');
const REPORTS_DIR = path.join(__dirname, '../reports');

function getQpdfCommand() {
    try {
        execSync('qpdf --version', { stdio: 'ignore' });
        return 'qpdf';
    } catch(e) {
        // Try common install paths
        const paths = [
            'C:\\Program Files\\qpdf 12.3.2\\bin\\qpdf.exe',
            'C:\\Program Files\\qpdf-12.3.2\\bin\\qpdf.exe',
            'C:\\qpdf\\bin\\qpdf.exe'
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return `"${p}"`;
        }
    }
    return null;
}

async function createBrokenXref(inputPath) {
    if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    
    // Start with a valid minimal PDF
    const { PDFDocument } = require('../../ppos-preflight-engine/node_modules/pdf-lib');
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const bytes = await doc.save();
    
    // Corrupt it manually: break the xref table
    let str = Buffer.from(bytes).toString('binary');
    str = str.replace('startxref', 'startxrf_'); // Breaks the trailer pointer
    
    fs.writeFileSync(inputPath, Buffer.from(str, 'binary'));
    return fs.existsSync(inputPath);
}

async function run() {
    console.log("Starting Phase 50C Smoke Test (QPDF XREF REBUILD)...");

    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

    const finalReport = {
        fix_id: "REBUILD_XREF",
        validation_mode: "REAL_PDF",
        real_pdf_execution_verified: false,
        qpdf_available: false,
        qpdf_version: null,
        qpdf_invoked: false,
        qpdf_exit_code: null,
        qpdf_repair_performed: false,
        input_fixture: "broken_xref_qpdf.pdf",
        output_artifact: "broken_xref_qpdf_output.pdf",
        output_artifact_non_empty: false,
        fix_audit_status: "MISSING",
        evidence_present: false,
        human_report_translated: false,
        production_certified: false,
        review_required: false,
        pass: true,
        notes: []
    };

    const qpdfCmd = getQpdfCommand();
    if (!qpdfCmd) {
        finalReport.notes.push("qpdf is not available locally.");
        finalReport.pass = false;
    } else {
        finalReport.qpdf_available = true;
        try {
            finalReport.qpdf_version = execSync(`${qpdfCmd} --version`).toString().trim().split('\n')[0];
            if (qpdfCmd.includes('Program Files')) {
                // Add to PATH so execFileAsync('qpdf') inside engine resolves
                process.env.PATH = path.dirname(qpdfCmd.replace(/"/g, '')) + path.delimiter + process.env.PATH;
            }
        } catch(e) {}
    }

    const fixturePath = path.join(FIXTURES_DIR, finalReport.input_fixture);
    const outputPath = path.join(FIXTURES_DIR, finalReport.output_artifact);
    
    await createBrokenXref(fixturePath);

    const engine = new PdfFixEngine();

    let engineResult = null;
    try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        
        engineResult = await engine.rebuildXref(fixturePath, outputPath, {});
        
        if (engineResult.success || engineResult.status) {
            finalReport.fix_audit_status = engineResult.status;
            finalReport.evidence_present = !!engineResult.evidence;
            if (engineResult.evidence && engineResult.evidence.tool === 'qpdf') {
                finalReport.qpdf_invoked = true;
                finalReport.qpdf_repair_performed = engineResult.evidence.repair_applied || false;
            }
            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                finalReport.output_artifact_non_empty = true;
            }
        } else {
            finalReport.notes.push(`Engine failed: ${engineResult.error}`);
            finalReport.pass = false;
        }
    } catch (e) {
        finalReport.notes.push(`Engine threw: ${e.message}`);
        finalReport.pass = false;
    }

    let auditData = null;
    let humanReport = null;

    if (engineResult && engineResult.status) {
        auditData = {
            version: "2.0",
            applied_fixes: engineResult.status === 'APPLIED' ? [engineResult] : [],
            skipped_fixes: engineResult.status === 'SKIPPED' ? [engineResult] : [],
            failed_fixes: engineResult.status === 'FAILED' ? [engineResult] : [],
            review_required: engineResult.requires_human_review,
            production_certified: !engineResult.requires_human_review && engineResult.production_safe
        };
        
        finalReport.production_certified = auditData.production_certified;
        finalReport.review_required = auditData.review_required;

        humanReport = await getHumanReport('job_xref', { tenantId: 't1' }, {
            status: 'COMPLETED',
            fix_audit: auditData,
            fix_summary: { applied_count: auditData.applied_fixes.length, skipped_count: auditData.skipped_fixes.length },
            review_required: auditData.review_required,
            production_certified: auditData.production_certified,
            certification_level: auditData.review_required ? "FIXED_REVIEW_REQUIRED" : "CERTIFIED_READY"
        }, [
            { id: '3', type: 'fixed_pdf', downloadable: true, filename: 'fixed.pdf' }
        ]);

        const appliedStrings = auditData.applied_fixes.length > 0 ? humanReport.report.fix_summary.applied_fixes : humanReport.report.fix_summary.skipped_fixes;
        if (appliedStrings && appliedStrings.length > 0) {
            finalReport.human_report_translated = true;
            const txt = appliedStrings[0];
            
            if (engineResult.status === 'APPLIED') {
                if (!txt.includes('Structural sanitization applied via qpdf')) {
                    finalReport.pass = false;
                    finalReport.notes.push("Human report didn't explicitly say qpdf applied sanitization.");
                }
            } else if (engineResult.status === 'SKIPPED') {
                if (!txt.includes('No structural repair was necessary')) {
                    finalReport.pass = false;
                    finalReport.notes.push("Human report didn't explicitly say no repair was necessary.");
                }
            }
        } else {
            finalReport.pass = false;
            finalReport.notes.push("Human report missing translation.");
        }
    }

    if (finalReport.qpdf_invoked && finalReport.fix_audit_status === 'APPLIED' && finalReport.output_artifact_non_empty) {
        finalReport.real_pdf_execution_verified = true;
    }

    if (!finalReport.real_pdf_execution_verified) {
        finalReport.pass = false;
        finalReport.notes.push("Did not achieve real_pdf_execution_verified.");
    }

    fs.writeFileSync(path.join(REPORTS_DIR, 'phase50c_qpdf_rebuild_xref_validation.json'), JSON.stringify(finalReport, null, 2));

    let md = `# Phase 50C Validation Report (qpdf XREF Rebuild)\n\n`;
    md += `| Fix ID | Pass | Real Exec | QPDF Available | Invoked | Status | Repaired | Output Non-Empty | Wording |\n`;
    md += `|---|---|---|---|---|---|---|---|---|\n`;
    md += `| ${finalReport.fix_id} | ${finalReport.pass ? '✅' : '❌'} | ${finalReport.real_pdf_execution_verified} | ${finalReport.qpdf_available} | ${finalReport.qpdf_invoked} | ${finalReport.fix_audit_status} | ${finalReport.qpdf_repair_performed} | ${finalReport.output_artifact_non_empty} | ${finalReport.human_report_translated} |\n\n`;
    md += `### Notes:\n`;
    finalReport.notes.forEach(n => md += `- ${n}\n`);

    fs.writeFileSync(path.join(REPORTS_DIR, 'phase50c_qpdf_rebuild_xref_validation.md'), md);

    if (!finalReport.pass) {
        console.error("Phase 50C Smoke Test FAILED.");
        process.exit(1);
    } else {
        console.log("Phase 50C Smoke Test PASSED!");
    }
}

run().catch(console.error);
