const adapter = require('../src/api/services/buildPriceCalibrationAdapter');
const liveRates = require('../live_node_rates.json');

console.log('================================================================================');
console.log('  COMPARATIVA DE COSTES CORREGIDA (DOCUMENTOS A Y B) - CANDIDATO MOTOR v1.9.5');
console.log('================================================================================\n');

const testCases = [
  {
    id: 'A',
    doc: 'Documento A: Hardcover 640p (170×240 mm, Offset 170g 0/0, Cartón 2.0 mm, Mate)',
    spec: {
      interior_pages: 640,
      book_width_mm: 170,
      book_height_mm: 240,
      interior_print: '4/4',
      cover_print: '4/0',
      paper_type_interior: 'mc',
      paper_weight_interior: 115,
      paper_type_cover: 'mc',
      paper_weight_cover: 130,
      family: 'HARDCOVER',
      product_family: 'HARDCOVER',
      construction: 'hardcover',
      block_binding_method: 'thread sewn',
      binding_method: 'hardcover',
      board_thickness_mm: 2.0,
      lamination: 'matt',
      endpapers: true,
      endpaper_provenance: 'document_extracted',
      paper_type_endpaper: 'offset',
      paper_weight_endpapers: 170,
      endpapers_print: '0/0',
      delivery_country: 'DE'
    },
    runs: [
      { copies: 200, targetMfg: 4399.00 },
      { copies: 300, targetMfg: 4765.00 },
      { copies: 500, targetMfg: 5493.00 }
    ]
  },
  {
    id: 'B',
    doc: 'Documento B: Bildband 200p (210×270 mm, Matt 130g 4/4, Silk 115g 4/0, Cartón 2.4 mm, Brillo)',
    spec: {
      interior_pages: 200,
      book_width_mm: 210,
      book_height_mm: 270,
      interior_print: '4/4',
      cover_print: '4/0',
      paper_type_interior: 'mc',
      paper_weight_interior: 130,
      paper_type_cover: 'mc',
      paper_weight_cover: 115,
      family: 'HARDCOVER',
      product_family: 'HARDCOVER',
      construction: 'hardcover',
      block_binding_method: 'thread sewn',
      binding_method: 'hardcover',
      board_thickness_mm: 2.4,
      lamination: 'gloss',
      endpapers: true,
      endpaper_provenance: 'user_supplied',
      paper_type_endpaper: 'offset',
      paper_weight_endpapers: 140,
      endpapers_print: '0/0',
      delivery_country: 'DE'
    },
    runs: [
      { copies: 1500, targetMfg: 5799.00 },
      { copies: 2000, targetMfg: 6886.00 },
      { copies: 2500, targetMfg: 8042.00 }
    ]
  }
];

const results = [];

for (const tc of testCases) {
  for (const r of tc.runs) {
    const s = { ...tc.spec, copies: r.copies };

    // 1. Unchanged production rates snapshot evaluation
    const prodEval = adapter.evaluateForwardPrice(s, liveRates, {}, { signatureSize: 16 });

    // 2. Controlled test scenario with hypothetical 2.5577 €/kg endpaper paper rate
    const controlledEval = adapter.evaluateForwardPrice(s, liveRates, {
      paper_price_endpaper_by_kilo: { offset: 2.5577 }
    }, { signatureSize: 16 });

    results.push({
      docId: tc.id,
      docName: tc.doc,
      copies: r.copies,
      targetMfg: r.targetMfg,
      prod: {
        price: prodEval.predictedManufacturingPrice,
        isComplete: prodEval.isCompleteEstimate,
        missing: prodEval.missingComponents,
        sewing: prodEval.debug.components.cost_sewing || 0,
        casing: prodEval.debug.components.cost_casing || 0,
        bindingTotal: prodEval.debug.components.cost_binding || 0,
        lines: prodEval.lines
      },
      controlled: {
        price: controlledEval.predictedManufacturingPrice,
        isComplete: controlledEval.isCompleteEstimate,
        missing: controlledEval.missingComponents,
        sewing: controlledEval.debug.components.cost_sewing || 0,
        casing: controlledEval.debug.components.cost_casing || 0,
        bindingTotal: controlledEval.debug.components.cost_binding || 0,
        lines: controlledEval.lines,
        sections: controlledEval.sections,
        signature: controlledEval.signature
      }
    });
  }
}

// Print structured report
console.log('================================================================================');
console.log('1. EVALUACIÓN CON TARIFA DE PRODUCCIÓN INALTERADA (SNAPSHOT LIVE)');
console.log('   (Demuestra detección fail-closed de tarifas ausentes; precio parcial)');
console.log('================================================================================');
console.log('Doc | Tirada | Target Mfg | Motor Prod | Completa? | Bloqueos / Faltantes  | Cosido (ts) | Tapa (hc) | Encuadernación');
console.log('----+--------+------------+------------+-----------+-----------------------+-------------+-----------+---------------');
for (const res of results) {
  const missingStr = res.prod.missing.length > 0 ? res.prod.missing.join(', ') : 'Ninguno';
  console.log(
    `${res.docId.padEnd(3)} | ` +
    `${String(res.copies).padStart(6)} | ` +
    `${res.targetMfg.toFixed(2).padStart(10)} € | ` +
    `${res.prod.price.toFixed(2).padStart(10)} € | ` +
    `${String(res.prod.isComplete).padEnd(9)} | ` +
    `${missingStr.padEnd(21)} | ` +
    `${res.prod.sewing.toFixed(2).padStart(11)} € | ` +
    `${res.prod.casing.toFixed(2).padStart(9)} € | ` +
    `${res.prod.bindingTotal.toFixed(2).padStart(13)} €`
  );
}

console.log('\n================================================================================');
console.log('2. ESCENARIO DE PRUEBA CONTROLADO (CON TARIFA CONTROLADA DE GUARDAS: 2.5577 €/kg)');
console.log('   (Evaluación completa con todas las operaciones requeridas)');
console.log('================================================================================');
console.log('Doc | Tirada | Target Mfg | Motor Ctrl | Completa? | Bloqueos | Cosido (ts) | Tapa (hc) | Encuadernación | Desviación');
console.log('----+--------+------------+------------+-----------+----------+-------------+-----------+----------------+-----------');
for (const res of results) {
  const missingStr = res.controlled.missing.length > 0 ? res.controlled.missing.join(', ') : 'Ninguno';
  const diff = res.controlled.price - res.targetMfg;
  const diffPct = ((diff / res.targetMfg) * 100).toFixed(1);
  const diffStr = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} € (${diffPct}%)`;
  console.log(
    `${res.docId.padEnd(3)} | ` +
    `${String(res.copies).padStart(6)} | ` +
    `${res.targetMfg.toFixed(2).padStart(10)} € | ` +
    `${res.controlled.price.toFixed(2).padStart(10)} € | ` +
    `${String(res.controlled.isComplete).padEnd(9)} | ` +
    `${missingStr.padEnd(8)} | ` +
    `${res.controlled.sewing.toFixed(2).padStart(11)} € | ` +
    `${res.controlled.casing.toFixed(2).padStart(9)} € | ` +
    `${res.controlled.bindingTotal.toFixed(2).padStart(14)} € | ` +
    `${diffStr.padStart(16)}`
  );
}

console.log('\n================================================================================');
console.log('3. DESGLOSE DETALLADO POR PARTIDAS (ESCENARIO CONTROLADO)');
console.log('================================================================================');
for (const res of results) {
  console.log(`\n--- Documento ${res.docId} | Tirada: ${res.copies} ejemplares ---`);
  console.log(`    Target Comercial de Fabricación: ${res.targetMfg.toFixed(2)} €`);
  console.log(`    Resultado Motor:                 ${res.controlled.price.toFixed(2)} €`);
  console.log(`    Signatura: ${res.controlled.signature}p | Secciones: ${res.controlled.sections}`);
  console.log('    Líneas de coste:');
  for (const l of res.controlled.lines) {
    if (l.line_total !== undefined) {
      console.log(`      * ${l.item.padEnd(32)}: ${l.line_total.toFixed(2).padStart(10)} €`);
    }
  }
}
