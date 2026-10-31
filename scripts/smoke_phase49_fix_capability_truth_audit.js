const fs = require('fs');
const path = require('path');
const assert = require('assert');

const REPORT_PATH = path.join(__dirname, '../reports/phase49_fix_capability_truth_audit.json');

async function runSmokeTests() {
    console.log("--- PHASE 49 SMOKE TESTS START ---");

    if (!fs.existsSync(REPORT_PATH)) {
        console.error(`Report not found at ${REPORT_PATH}`);
        process.exit(1);
    }

    const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));

    function getCap(fid) {
        return report.capabilities.find(c => c.canonical_fix_id === fid);
    }

    // 1. REBUILD_TRIMBOX
    const trimbox = getCap('REBUILD_TRIMBOX');
    assert.ok(trimbox, "REBUILD_TRIMBOX capability missing");
    assert.ok(['REAL_FIX_AVAILABLE', 'PARTIAL_FIX', 'UNKNOWN'].includes(trimbox.truth_status), `REBUILD_TRIMBOX status was ${trimbox.truth_status}`);

    // 2. APPLY_BLEED
    const bleed = getCap('APPLY_BLEED');
    assert.ok(bleed, "APPLY_BLEED capability missing");
    assert.ok(['PARTIAL_FIX', 'UNKNOWN'].includes(bleed.truth_status), `APPLY_BLEED status was ${bleed.truth_status}`);
    if (bleed.truth_status !== 'UNKNOWN') {
        assert.strictEqual(bleed.requires_human_review, true, "APPLY_BLEED must require review");
    }

    // 3. CONVERT_CMYK
    const cmyk = getCap('CONVERT_CMYK');
    assert.ok(cmyk, "CONVERT_CMYK capability missing");
    assert.ok(['REAL_FIX_AVAILABLE', 'PARTIAL_FIX', 'UNKNOWN'].includes(cmyk.truth_status), `CONVERT_CMYK status was ${cmyk.truth_status}`);
    if (cmyk.truth_status !== 'UNKNOWN') {
        assert.strictEqual(cmyk.requires_human_review, true, "CONVERT_CMYK must require review");
        assert.strictEqual(cmyk.production_certifiable, false, "CONVERT_CMYK must not be certifiable without review");
    }

    // 4. INJECT_OUTPUT_INTENT
    const intent = getCap('INJECT_OUTPUT_INTENT');
    assert.ok(intent, "INJECT_OUTPUT_INTENT capability missing");
    assert.ok(['REAL_FIX_AVAILABLE', 'PARTIAL_FIX', 'UNKNOWN'].includes(intent.truth_status));

    // 5. EMBED_FONTS
    const embedFonts = getCap('EMBED_FONTS');
    assert.ok(embedFonts, "EMBED_FONTS capability missing");
    assert.ok(['DECLARED_NOT_IMPLEMENTED', 'UNSUPPORTED', 'UNKNOWN'].includes(embedFonts.truth_status));

    // 6. FLATTEN_TRANSPARENCY
    const trans = getCap('FLATTEN_TRANSPARENCY');
    assert.ok(trans, "FLATTEN_TRANSPARENCY capability missing");
    assert.ok(['DECLARED_NOT_IMPLEMENTED', 'UNSUPPORTED', 'UNKNOWN'].includes(trans.truth_status));

    // 7. STRIP_JAVASCRIPT
    const js = getCap('STRIP_JAVASCRIPT');
    assert.ok(js, "STRIP_JAVASCRIPT capability missing");

    // 10. REBUILD_XREF
    const xref = getCap('REBUILD_XREF');
    assert.ok(xref, "REBUILD_XREF capability missing");
    assert.ok(['PARTIAL_FIX', 'UNKNOWN'].includes(xref.truth_status));

    // 11. PDF/X
    const genPdfx = getCap('GENERATE_PDFX');
    assert.ok(genPdfx, "GENERATE_PDFX capability missing");
    assert.notStrictEqual(genPdfx.truth_status, 'REAL_FIX_AVAILABLE');

    // 12. TAC / Rich Black
    const tac = getCap('DETECT_TOTAL_INK_COVERAGE');
    assert.ok(tac, "DETECT_TOTAL_INK_COVERAGE missing");
    assert.ok(['DIAGNOSTIC_ONLY', 'DECLARED_NOT_IMPLEMENTED', 'UNSUPPORTED', 'UNKNOWN'].includes(tac.truth_status));

    // General Constraints
    for (const cap of report.capabilities) {
        if (cap.truth_status === 'UNSUPPORTED' || cap.truth_status === 'DECLARED_NOT_IMPLEMENTED') {
            assert.strictEqual(cap.production_certifiable, false, `${cap.canonical_fix_id} cannot be certifiable if unsupported`);
        }
    }

    console.log("--- ALL SMOKE TESTS PASSED ---");
}

runSmokeTests().catch(console.error);
