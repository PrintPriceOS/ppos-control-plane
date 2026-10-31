const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFDict, PDFString, PDFNumber, PDFArray, PDFHexString } = require('../../ppos-preflight-engine/node_modules/pdf-lib');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/phase50b');
const REPORTS_DIR = path.join(__dirname, '../reports');

async function createFixtures() {
    if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

    const manifest = {
        generated_at: new Date().toISOString(),
        fixtures: []
    };

    const addFixture = (name, desc, path, success) => {
        manifest.fixtures.push({
            name,
            description: desc,
            path: path,
            created: success,
            valid_pdf: success
        });
    };

    // 1. missing_trimbox.pdf (Page with no TrimBox)
    try {
        const doc = await PDFDocument.create();
        const page = doc.addPage([500, 500]);
        // pdf-lib adds MediaBox by default. We won't add TrimBox.
        const bytes = await doc.save();
        const p = path.join(FIXTURES_DIR, 'missing_trimbox.pdf');
        fs.writeFileSync(p, bytes);
        addFixture('missing_trimbox.pdf', 'Page with no TrimBox', p, true);
    } catch (e) {
        addFixture('missing_trimbox.pdf', 'Page with no TrimBox', null, false);
    }

    // 2. missing_outputintent.pdf (No OutputIntent)
    try {
        const doc = await PDFDocument.create();
        doc.addPage([500, 500]);
        const bytes = await doc.save();
        const p = path.join(FIXTURES_DIR, 'missing_outputintent.pdf');
        fs.writeFileSync(p, bytes);
        addFixture('missing_outputintent.pdf', 'No OutputIntent', p, true);
    } catch (e) {
        addFixture('missing_outputintent.pdf', 'No OutputIntent', null, false);
    }

    // 3. javascript_action.pdf
    try {
        const doc = await PDFDocument.create();
        const page = doc.addPage([500, 500]);
        // Add a simple JS action to catalog
        const jsAction = doc.context.obj({
            Type: 'Action',
            S: 'JavaScript',
            JS: PDFString.of('app.alert("Hello");')
        });
        const jsActionRef = doc.context.register(jsAction);
        doc.catalog.set(PDFName.of('OpenAction'), jsActionRef);
        
        const bytes = await doc.save();
        const p = path.join(FIXTURES_DIR, 'javascript_action.pdf');
        fs.writeFileSync(p, bytes);
        addFixture('javascript_action.pdf', 'Contains OpenAction JS', p, true);
    } catch (e) {
        addFixture('javascript_action.pdf', 'Contains OpenAction JS', null, false);
    }

    // 4. annotations.pdf
    try {
        const doc = await PDFDocument.create();
        const page = doc.addPage([500, 500]);
        // Add an empty annotation
        const annot = doc.context.obj({
            Type: 'Annot',
            Subtype: 'Text',
            Rect: [50, 50, 100, 100],
            Contents: PDFString.of('Test Note')
        });
        const annotRef = doc.context.register(annot);
        const annotsArray = doc.context.obj([annotRef]);
        page.node.set(PDFName.of('Annots'), annotsArray);
        
        const bytes = await doc.save();
        const p = path.join(FIXTURES_DIR, 'annotations.pdf');
        fs.writeFileSync(p, bytes);
        addFixture('annotations.pdf', 'Contains Text Annotation', p, true);
    } catch (e) {
        addFixture('annotations.pdf', 'Contains Text Annotation', null, false);
    }

    // 5. acroform.pdf
    try {
        const doc = await PDFDocument.create();
        const page = doc.addPage([500, 500]);
        const form = doc.getForm();
        const textField = form.createTextField('test.field');
        textField.setText('Hello Form');
        textField.addToPage(page, { x: 50, y: 50, width: 200, height: 50 });
        
        const bytes = await doc.save();
        const p = path.join(FIXTURES_DIR, 'acroform.pdf');
        fs.writeFileSync(p, bytes);
        addFixture('acroform.pdf', 'Contains AcroForm field', p, true);
    } catch (e) {
        addFixture('acroform.pdf', 'Contains AcroForm field', null, false);
    }

    // 6. broken_xref.pdf
    try {
        const doc = await PDFDocument.create();
        doc.addPage([500, 500]);
        let bytes = await doc.save();
        // Corrupt it slightly by removing the end of the file or replacing startxref
        let str = Buffer.from(bytes).toString('binary');
        str = str.replace('startxref', 'startxrf_');
        
        const p = path.join(FIXTURES_DIR, 'broken_xref.pdf');
        fs.writeFileSync(p, Buffer.from(str, 'binary'));
        addFixture('broken_xref.pdf', 'Broken XREF', p, true);
    } catch (e) {
        addFixture('broken_xref.pdf', 'Broken XREF', null, false);
    }

    // 7. missing_bleed.pdf
    try {
        const doc = await PDFDocument.create();
        const page = doc.addPage([500, 500]); // MediaBox 500x500
        page.node.set(PDFName.of('TrimBox'), doc.context.obj([20, 20, 480, 480]));
        page.node.set(PDFName.of('BleedBox'), doc.context.obj([20, 20, 480, 480])); // Same as TrimBox, no bleed
        
        const bytes = await doc.save();
        const p = path.join(FIXTURES_DIR, 'missing_bleed.pdf');
        fs.writeFileSync(p, bytes);
        addFixture('missing_bleed.pdf', 'BleedBox equals TrimBox', p, true);
    } catch (e) {
        addFixture('missing_bleed.pdf', 'BleedBox equals TrimBox', null, false);
    }

    fs.writeFileSync(path.join(REPORTS_DIR, 'phase50b_fixture_manifest.json'), JSON.stringify(manifest, null, 2));
    console.log("Fixtures created successfully.");
    console.log(JSON.stringify(manifest, null, 2));
}

run();

async function run() {
    try {
        await createFixtures();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
