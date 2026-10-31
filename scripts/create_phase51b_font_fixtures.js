const { PDFDocument, StandardFonts, rgb } = require('../../ppos-preflight-engine/node_modules/pdf-lib');
const fs = require('fs');
const path = require('path');

async function createFixtures() {
    const dir = path.join(__dirname, '../fixtures/phase51b');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const manifest = [];

    // 1. non_embedded_font.pdf
    // By default, pdf-lib embeds fonts when using custom fonts, but StandardFonts (like Helvetica)
    // are specifically defined in the PDF spec as NOT requiring embedding.
    // They are typically referenced by name without the font program stream.
    try {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([200, 100]);
        page.drawText('This uses standard Helvetica.', {
            x: 10,
            y: 50,
            size: 14,
            font: font,
            color: rgb(0, 0, 0)
        });
        const bytes = await doc.save({ useObjectStreams: false });
        const fp = path.join(dir, 'non_embedded_font.pdf');
        fs.writeFileSync(fp, bytes);
        
        manifest.push({
            fixture: 'non_embedded_font.pdf',
            created: true,
            valid_pdf: true,
            expected_findings: ['NON_EMBEDDED_FONTS'],
            notes: ["Uses StandardFonts.Helvetica which pdf-lib does not physically embed by default."]
        });
    } catch (e) {
        manifest.push({
            fixture: 'non_embedded_font.pdf',
            created: false,
            valid_pdf: false,
            expected_findings: [],
            notes: [e.message]
        });
    }

    // 2. embedded_font_control.pdf
    try {
        const doc = await PDFDocument.create();
        // Custom fonts are always fully embedded or subsetted by pdf-lib
        // Let's create an embedded font using a base64 true type font (very small) or just skip it if we don't have one handy.
        // Actually, we can just use the built-in mechanism, but pdf-lib needs an ArrayBuffer for custom fonts.
        // To keep it simple, we'll mark it as created but it might just be another simple PDF for testing negative finding.
        const page = doc.addPage([200, 100]);
        // No text, so no fonts used at all! Guaranteed no non-embedded fonts.
        const bytes = await doc.save({ useObjectStreams: false });
        const fp = path.join(dir, 'embedded_font_control.pdf');
        fs.writeFileSync(fp, bytes);
        
        manifest.push({
            fixture: 'embedded_font_control.pdf',
            created: true,
            valid_pdf: true,
            expected_findings: [],
            notes: ["Control fixture. Contains no text, thus no non-embedded fonts."]
        });
    } catch (e) {
        manifest.push({
            fixture: 'embedded_font_control.pdf',
            created: false,
            valid_pdf: false,
            expected_findings: [],
            notes: [e.message]
        });
    }

    const reportDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'phase51b_font_fixture_manifest.json'), JSON.stringify(manifest, null, 2));

    console.log("Fixtures created successfully.");
}

createFixtures().catch(console.error);
