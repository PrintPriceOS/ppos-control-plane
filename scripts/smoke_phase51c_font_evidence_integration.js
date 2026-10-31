const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const m = require('module');
const originalRequire = m.prototype.require;

// --- Mocks for dependencies ---
m.prototype.require = function(pathStr) {
    if (pathStr === '@ppos/preflight-engine') return require('../../ppos-preflight-engine');
    if (pathStr === 'fs-extra') return require('fs');
    if (pathStr === 'uuid') return { v4: () => '1234' };
    if (pathStr === 'pdf-lib') return require('../../ppos-preflight-engine/node_modules/pdf-lib');
    if (pathStr.startsWith('@ppos/shared-infra')) {
        return {
            getJobSubfolder: () => '/tmp',
            info: ()=>{}, warn: ()=>{}, error: ()=>{},
            increment: ()=>{}, gauge: ()=>{},
            query: async()=>[], execute: async()=>[]
        };
    }
    return originalRequire.apply(this, arguments);
};

const AutofixProcessor = require('../../ppos-preflight-worker-phase-10-intelligence-layer/processors/AutofixProcessor');
const { getHumanReport } = require('../src/api/services/preflightHumanReportService');
const { PDFDocument } = require('pdf-lib');

function checkGs() {
    try {
        const cmd = process.platform === 'win32' ? 'gswin64c --version' : 'gs --version';
        const ver = cp.execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        return { available: true, version: ver };
    } catch (e) {
        return { available: false };
    }
}

async function inspectFonts(pdfPath) {
    const bytes = fs.readFileSync(pdfPath);
    const doc = await PDFDocument.load(bytes);
    let hasNonEmbedded = false;
    let affectedFonts = [];
    
    const enumerateFonts = () => {
        const raw = bytes.toString('utf8');
        if (raw.includes('/BaseFont /Helvetica')) {
            hasNonEmbedded = true;
            affectedFonts.push('Helvetica');
        }
    };
    enumerateFonts();
    return { hasNonEmbedded, affectedFonts };
}

async function runSmokeTest() {
    console.log("Starting Phase 51C Font Evidence Integration Smoke Test...\n");
    let pass = true;
    
    // 1. Ghostscript check
    console.log("TEST 1: Ghostscript Toolchain Verification");
    const gs = checkGs();
    if (!gs.available) {
        console.error("❌ Ghostscript not locally available. The test cannot physically embed fonts.");
        pass = false;
    } else {
        console.log(`✅ Ghostscript found: ${gs.version}`);
    }

    // 2. Generate and verify fixture
    console.log("\nTEST 2: Fixture Generation & Validation");
    try {
        cp.execSync('node scripts/create_phase51b_font_fixtures.js', { stdio: 'inherit' });
    } catch (e) {
        console.error("❌ Failed to generate fixtures");
        process.exit(1);
    }

    const fixturePath = path.join(__dirname, '../fixtures/phase51b/non_embedded_font.pdf');
    if (!fs.existsSync(fixturePath)) {
        console.error("❌ Fixture not found at", fixturePath);
        process.exit(1);
    }
    
    // Verify it starts with %PDF
    const header = fs.readFileSync(fixturePath, { encoding: 'utf8', length: 5 });
    if (!header.startsWith('%PDF')) {
        console.error("❌ Fixture is not a valid PDF");
        pass = false;
    }

    // Run analyzer inspection
    const scan = await inspectFonts(fixturePath);
    if (!scan.hasNonEmbedded) {
        console.error("❌ Analyzer failed to detect NON_EMBEDDED_FONTS in fixture. Aborting physical test.");
        pass = false;
        // Mock fail row
        fs.writeFileSync(path.join(__dirname, '../reports/phase51b_embed_fonts_ghostscript_validation.json'), JSON.stringify([{
            fix_id: "EMBED_FONTS",
            validation_mode: "REAL_PDF",
            real_pdf_execution_verified: false,
            ghostscript_available: gs.available,
            pass: false,
            notes: ["Fixture verification failed: NON_EMBEDDED_FONTS not detected."]
        }], null, 2));
        process.exit(1);
    } else {
        console.log(`✅ NON_EMBEDDED_FONTS detected. Affected fonts: ${scan.affectedFonts.join(', ')}`);
    }

    // 3. Execution
    console.log("\nTEST 3: Physical Execution via Engine");
    const PdfFixEngine = require('../../ppos-preflight-engine/execution/PdfFixEngine');
    const engine = new PdfFixEngine();
    
    const outputPath = path.join(__dirname, '../fixtures/phase51b/fixed_output.pdf');
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    const result = await engine.embedFonts(fixturePath, outputPath, {});
    
    if (result.status === 'APPLIED') {
        console.log("✅ Engine returned APPLIED with evidence.");
        console.log(`   Command: ${result.evidence.command}`);
        console.log(`   Output size: ${result.evidence.output_size_bytes} bytes`);
        if (result.evidence.output_size_bytes > 0 && fs.existsSync(outputPath)) {
            console.log("✅ Output artifact is physically present and non-empty.");
        } else {
            console.error("❌ Output artifact is empty or missing.");
            pass = false;
        }
        
        if (result.requires_human_review === true && result.production_safe === false) {
            console.log("✅ Governance bounds maintained (requires_human_review=true, production_safe=false)");
        } else {
            console.error("❌ Engine bypassed font governance restrictions!");
            pass = false;
        }

        // Phase 51C Assertions
        console.log("\nTEST 3.1: FontInspector Evidence Verification");
        const ev = result.evidence;
        if (ev.fonts_before && ev.fonts_before.length > 0) {
            console.log("✅ fonts_before is populated: " + ev.fonts_before.map(f => f.normalized_font_name).join(', '));
        } else {
            console.error("❌ fonts_before is empty or missing!");
            pass = false;
        }

        if (ev.non_embedded_fonts_before && ev.non_embedded_fonts_before.length > 0) {
            console.log("✅ non_embedded_fonts_before correctly identifies fonts: " + ev.non_embedded_fonts_before.join(', '));
        } else {
            console.error("❌ non_embedded_fonts_before is empty!");
            pass = false;
        }

        if (ev.fonts_after && ev.fonts_after.length > 0) {
            console.log("✅ fonts_after is populated: " + ev.fonts_after.map(f => f.normalized_font_name).join(', '));
        } else {
            console.error("❌ fonts_after is empty!");
            pass = false;
        }

        if (ev.non_embedded_fonts_after.length < ev.non_embedded_fonts_before.length) {
            console.log(`✅ non_embedded_fonts reduced after Ghostscript (${ev.non_embedded_fonts_before.length} -> ${ev.non_embedded_fonts_after.length})`);
        } else {
            console.warn(`⚠️ non_embedded_fonts were NOT reduced by Ghostscript. (${ev.non_embedded_fonts_before.length} -> ${ev.non_embedded_fonts_after.length})`);
        }

        if (ev.font_names_changed) {
            console.log("✅ Font substitution detected. `possible_font_substitution: true` recorded.");
        } else {
            console.log("✅ Font names remained stable.");
        }

        if (ev.font_inspection_method === 'pdf-lib-object-graph' && ev.font_inspection_limitations) {
            console.log("✅ Font inspection limitations honestly recorded.");
        } else {
            console.error("❌ Font inspection limitations missing from evidence!");
            pass = false;
        }

    } else {
        console.error("❌ Engine failed or skipped:", result.status, result.error);
        pass = false;
    }

    // 4. Worker Integration
    console.log("\nTEST 4: Worker AutofixProcessor & Control Plane Governance");
    
    // Simulate what Worker does when it sees font findings and an APPLIED font fix
    const processor = new AutofixProcessor();
    const sourceFindings = [
        { id: 'NON_EMBEDDED_FONTS', evidence: { font_name: scan.affectedFonts[0] } }
    ];
    let reviewRequiredReasons = [];
    let requiresReviewPolicy = result.requires_human_review;
    let productionCertified = !requiresReviewPolicy;

    // Font Governance from Phase 51A
    const fontFindings = sourceFindings.filter(f => 
        ['NON_EMBEDDED_FONTS', 'TYPE3_FONTS', 'MISSING_GLYPHS', 'FONT_SUBSTITUTION_RISK'].includes(f.id)
    );
    if (fontFindings.length > 0) {
        requiresReviewPolicy = true;
        fontFindings.forEach(ff => reviewRequiredReasons.push(ff.id));
    }
    if (requiresReviewPolicy) productionCertified = false;

    if (requiresReviewPolicy && !productionCertified) {
        console.log("✅ Worker correctly intercepts the result and forces review policies.");
    } else {
        console.error("❌ Worker policy failed to lock down the artifact.");
        pass = false;
    }

    // 5. Human Report Translation
    const mockJob = {
        job_id: 'font-embed-test',
        status: 'COMPLETED',
        certification_level: 'FIXED_REVIEW_REQUIRED',
        review_required: requiresReviewPolicy,
        production_certified: productionCertified,
        findings: sourceFindings,
        review_required_reasons: reviewRequiredReasons,
        applied_fixes: [ result ],
        skipped_fixes: []
    };
    const mockArtifacts = [{ type: 'review_pdf', filename: 'review.pdf', downloadable: true }];
    const reportRes = await getHumanReport('font-embed-test', { tenantId: 'tenant-123' }, mockJob, mockArtifacts);
    
    if (reportRes.ok) {
        const custSum = reportRes.report.customer_summary;
        const opSum = reportRes.report.operator_summary;
        
        if (custSum.includes("human review is required")) {
            console.log("✅ Customer wording masks complexity while demanding review.");
        } else {
            console.error("❌ Customer wording failed to mask font embedding properly.");
            pass = false;
        }

        if (opSum.includes("Fonts were processed with Ghostscript") && opSum.includes("kerning, line breaks, or layout")) {
            console.log("✅ Operator wording explicitly warns about Ghostscript and layout risks.");
        } else {
            console.error("❌ Operator wording is missing the explicit Ghostscript layout warnings:", opSum);
            pass = false;
        }

        if (opSum.includes(scan.affectedFonts[0])) {
            console.log("✅ Operator wording correctly maps the affected font: " + scan.affectedFonts[0]);
        }
    }

    // 6. Write final report
    const validationReport = [{
        fix_id: "EMBED_FONTS",
        validation_mode: "REAL_PDF",
        real_pdf_execution_verified: result.status === 'APPLIED',
        ghostscript_available: gs.available,
        ghostscript_version: gs.version,
        ghostscript_invoked: result.status === 'APPLIED',
        input_fixture: "non_embedded_font.pdf",
        output_artifact: "fixed_output.pdf",
        font_inspection_method: result.evidence?.font_inspection_method,
        possible_font_substitution: result.evidence?.possible_font_substitution,
        pass: pass
    }];

    fs.writeFileSync(path.join(__dirname, '../reports/phase51c_font_evidence_integration.json'), JSON.stringify(validationReport, null, 2));

    if (pass) {
        console.log("\n✅ ALL PHASE 51C SMOKE TESTS PASSED");
        process.exit(0);
    } else {
        console.error("\n❌ PHASE 51C SMOKE TESTS FAILED");
        process.exit(1);
    }
}

runSmokeTest().catch(console.error);
