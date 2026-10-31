const fs = require('fs');

function buildAnonymousPdf(textLines) {
    const streamLines = textLines.map(l => {
        const clean = l.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        return `(${clean}) '`;
    });
    const streamContent = 'BT\n/F1 10 Tf\n50 750 Td\n14 TL\n' + streamLines.join('\n') + '\nET';
    const streamLen = Buffer.byteLength(streamContent, 'utf-8');

    const objects = [
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
        '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
        `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj`,
        '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj'
    ];

    let pdf = '%PDF-1.4\n';
    const xref = [0];
    for (const obj of objects) {
        xref.push(Buffer.byteLength(pdf, 'utf-8'));
        pdf += obj + '\n';
    }
    const xrefStart = Buffer.byteLength(pdf, 'utf-8');
    pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i++) {
        pdf += String(xref[i]).padStart(10, '0') + ' 00000 n \n';
    }
    pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF\n';
    return Buffer.from(pdf, 'utf-8');
}

// 1. Hardcover 640p - strictly anonymous structure and specs
const textA = [
    'OFFER / COMMERCIAL QUOTATION',
    'Date: 19.10.2026',
    'Produkt \tHardcover 640 Seiten',
    'Format \t170 x 240 mm',
    'Inhalt \t640 Seiten + Umschlag',
    'Papier',
    'Farbe',
    'Angaben \tFesteinband, Fadenheftung, runder Ruecken, kratzfest matt laminiert, Kapitalband 96, Leseband 702 red',
    'Lieferadresse Industriestrasse 1, Koeln, Germany',
    '200 copies \t4399 Euro + 350 Euro (Transport) = 4749 Euro / 23.75 Euro per copy',
    '300 copies \t4765 Euro + 350 Euro (Transport) = 5115 Euro / 17.05 Euro per copy',
    '500 copies \t5493 Euro + 450 Euro (Transport) = 5943 Euro / 11.89 Euro per copy',
    'Inhalt',
    'G-Print 115 g',
    'Vorsatz/Nachsatz',
    'Offset 170 g',
    'Umschlag',
    'Silk 130 g',
    'MGP',
    '2 mm',
    'Inhalt',
    '4+4',
    'Vorsatz/Nachsatz',
    '0+0 (unbedruckt)',
    'Umschlag',
    '4+0'
];

const bufA = buildAnonymousPdf(textA);
fs.writeFileSync('./tests/fixtures/sample_hardcover_640p_quote.pdf', bufA);

// 2. Bildband 200p - strictly anonymous structure and specs with Handcover typo
const textB = [
    'OFFER / COMMERCIAL QUOTATION',
    'Date: 16.10.2026',
    'Produkt \tBildband',
    'Format \t210 x 270 mm',
    'Inhalt \t200 Seiten + Umschlag',
    'Papier',
    'Farbe',
    'Angaben \tHandcover, Fadenheftung, gerader Ruecken, glanz laminiert, weiss kapitalt',
    'Lieferadresse Bahnhofstrasse 10, Hannover, Germany',
    '2 Muster an Verlag',
    '1500 copies \t5799 Euro + 535 Euro (Transport) = 6334 Euro / 4.22 Euro per copy',
    '2000 copies \t6886 Euro + 535 Euro (Transport) = 7421 Euro / 3.71 Euro per copy',
    '2500 copies \t8042 Euro + 635 Euro (Transport) = 8677 Euro / 3.47 Euro per copy',
    'Inhalt',
    'Matt 130 g',
    'Umschlag',
    'Silk 115 g',
    'MGP',
    '2,4 mm',
    'Inhalt',
    '4+4',
    'Umschlag',
    '4+0'
];

const bufB = buildAnonymousPdf(textB);
fs.writeFileSync('./tests/fixtures/sample_bildband_200p_quote.pdf', bufB);

console.log('Clean anonymous PDFs created successfully.');
