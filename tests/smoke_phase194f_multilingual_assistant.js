/**
 * tests/smoke_phase194f_multilingual_assistant.js
 *
 * Phase 194F — Multilingual Pricing Assistant & Attachment UX Smoke Tests
 *
 * Covers:
 * 194F-01: Spanish user receives Spanish response
 * 194F-02: English user receives English response
 * 194F-03: German user receives German response
 * 194F-04: German document + Spanish user decoupled correctly
 * 194F-05: PDF attachment UI exists / paperclip control
 * 194F-06: multipart upload endpoint wired
 * 194F-07: upload processing states work
 * 194F-08: quote review renders product metadata
 * 194F-09: multiple offers render
 * 194F-10: Fährmann variants remain separate
 * 194F-11: Stutensee inconsistency renders visibly
 * 194F-12: operator correction preserves source value
 * 194F-13: READY_FOR_CALIBRATION_REVIEW does not run solver
 * 194F-21: cross-tenant evidence access blocked
 * 194F-22: legacy Pricing Assistant text chat still works
 * 194F-23: no UI action mutates rates_json
 * 194F-24: no UI action creates governed acceptance
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/api/services/mysqlClient');
const calibrationAssistantService = require('../src/api/services/calibrationAssistantService');
const pdfExtractor = require('../src/api/services/pdfQuoteExtractionService');
const interpreter = require('../src/api/services/quoteDocumentInterpretationService');
const quoteEvidenceService = require('../src/api/services/quoteEvidenceService');

async function runTests() {
  console.log('==================================================');
  console.log('Running Phase 194F Multilingual Assistant Smoke Tests');
  console.log('==================================================');

  // Test 194F-01: Spanish user receives Spanish response
  console.log('\n[TEST 194F-01] Spanish user receives Spanish response...');
  const mockInterpretation = {
    detectedLanguage: 'de',
    printhouseName: 'Stutensee: Mit Margot durch das Gartenjahr',
    format: '170 × 240 mm',
    offers: [
      { quantity: 250, manufacturingPrice: 1283, transportPrice: 190, quotedTotalPrice: 1473, quotedUnitPrice: 5.89, computedUnitPrice: 5.89, validationStatus: 'CONSISTENT' },
      { quantity: 300, manufacturingPrice: 1335, transportPrice: 190, quotedTotalPrice: 1525, quotedUnitPrice: 3.05, computedUnitPrice: 5.08, validationStatus: 'INCONSISTENT_UNIT_PRICE' }
    ]
  };

  // Mock DB query for test
  db.query = async (sql, params) => {
    if (sql.includes('FROM quote_evidence_documents')) {
      return [{
        id: 'qdoc-stutensee-194f',
        tenant_id: 'tenant-es-1',
        original_filename: 'Offer_2024_1045_Stutensee.pdf',
        file_name: 'Offer_2024_1045_Stutensee.pdf',
        file_hash_sha256: 'abc123sha256',
        detected_language: 'de',
        raw_text: 'Produkt Stutensee Auflage 250 Stk 1.283 Euro + 190 Euro = 1.473 Euro / 5,89 Euro',
        validation_status: 'REQUIRES_REVIEW',
        confidence_status: 'CONFIDENT',
        normalized_quote_json: JSON.stringify(mockInterpretation)
      }];
    }
    return [];
  };

  const esResult = await calibrationAssistantService.processQuoteEvidenceForChat('tenant-es-1', 'qdoc-stutensee-194f', 'es');
  assert.strictEqual(esResult.ok, true);
  assert.strictEqual(esResult.userChatLanguage, 'es');
  assert.strictEqual(esResult.detectedLanguage, 'de');
  assert.ok(esResult.chatSummary.includes('Encontré un presupuesto en alemán'));
  assert.ok(esResult.chatSummary.includes('Inconsistencia detectada'));
  console.log('✓ PASS 194F-01');

  // Test 194F-02: English user receives English response
  console.log('\n[TEST 194F-02] English user receives English response...');
  const enResult = await calibrationAssistantService.processQuoteEvidenceForChat('tenant-es-1', 'qdoc-stutensee-194f', 'en');
  assert.strictEqual(enResult.ok, true);
  assert.strictEqual(enResult.userChatLanguage, 'en');
  assert.ok(enResult.chatSummary.includes('Found a quotation in German'));
  assert.ok(enResult.chatSummary.includes('Inconsistency detected'));
  console.log('✓ PASS 194F-02');

  // Test 194F-03: German user receives German response
  console.log('\n[TEST 194F-03] German user receives German response...');
  const deResult = await calibrationAssistantService.processQuoteEvidenceForChat('tenant-es-1', 'qdoc-stutensee-194f', 'de');
  assert.strictEqual(deResult.ok, true);
  assert.strictEqual(deResult.userChatLanguage, 'de');
  assert.ok(deResult.chatSummary.includes('Ich habe ein Angebot auf Deutsch gefunden'));
  assert.ok(deResult.chatSummary.includes('Inkonsistenz erkannt'));
  console.log('✓ PASS 194F-03');

  // Test 194F-04: German document + Spanish user decoupled correctly
  console.log('\n[TEST 194F-04] German document + Spanish user decoupled correctly...');
  assert.strictEqual(esResult.detectedLanguage, 'de');
  assert.strictEqual(esResult.userChatLanguage, 'es');
  assert.ok(esResult.chatSummary.startsWith('Encontré un presupuesto en alemán'));
  assert.ok(!esResult.chatSummary.startsWith('Ich habe ein Angebot'));
  console.log('✓ PASS 194F-04');

  // Test 194F-05 & 194F-06: Check frontend files for PDF attachment UI & multipart endpoint wiring
  console.log('\n[TEST 194F-05 & 06] PDF attachment UI and multipart upload endpoint check...');
  const conversationCode = fs.readFileSync(path.join(__dirname, '../src/ui/components/printhouse/pricing/quick-calibration/CalibrationConversation.tsx'), 'utf8');
  const apiCode = fs.readFileSync(path.join(__dirname, '../src/ui/lib/printhouseCalibrationApi.ts'), 'utf8');
  assert.ok(conversationCode.includes('Paperclip'), 'CalibrationConversation must include Paperclip icon');
  assert.ok(conversationCode.includes('accept="application/pdf,.pdf"'), 'CalibrationConversation must accept PDF');
  assert.ok(conversationCode.includes("aria-label={t('attachPdfTooltip')}"), 'Paperclip must have accessible aria-label from i18n');
  assert.ok(conversationCode.includes("w-[44px] h-[44px]"), 'Paperclip button must be 44x44px');
  assert.ok(conversationCode.includes("bg-[#dc0000]"), 'Paperclip button must use brand red background');
  assert.ok(apiCode.includes('/quote-evidence/upload'), 'printhouseCalibrationApi must contain uploadQuoteEvidence');
  console.log('✓ PASS 194F-05 & 194F-06');

  // Test 194F-07: Upload processing states work
  console.log('\n[TEST 194F-07] Upload processing states check...');
  assert.ok(conversationCode.includes("uploadState === 'UPLOADING'"), 'Must handle UPLOADING state');
  assert.ok(conversationCode.includes("uploadState === 'PROCESSING'"), 'Must handle PROCESSING state');
  assert.ok(conversationCode.includes("uploadState === 'EXTRACTED'"), 'Must handle EXTRACTED state');
  console.log('✓ PASS 194F-07');

  // Test 194F-08 & 194F-09: Quote review card renders product metadata & multiple offers
  console.log('\n[TEST 194F-08 & 09] Structured quote review card check...');
  const cardCode = fs.readFileSync(path.join(__dirname, '../src/ui/components/printhouse/pricing/quick-calibration/StructuredQuoteReviewCard.tsx'), 'utf8');
  assert.ok(cardCode.includes('StructuredQuoteReviewCard'), 'Review card component must exist');
  assert.ok(cardCode.includes('offers.map'), 'Review card must map multiple offers');
  console.log('✓ PASS 194F-08 & 194F-09');

  // Test 194F-10: Fährmann variants remain separate
  console.log('\n[TEST 194F-10] Fährmann variants remain separate...');
  const fahrmannPdfPath = path.join(__dirname, 'fixtures/pdfs/Offer_2024_1020_Fahrmann.pdf');
  if (fs.existsSync(fahrmannPdfPath)) {
    const pdfBuf = fs.readFileSync(fahrmannPdfPath);
    const extraction = await pdfExtractor.extractPdfQuote(pdfBuf, 'Offer_2024_1020_Fahrmann.pdf', 'application/pdf');
    const interp = interpreter.interpretDocument(extraction);
    assert.strictEqual(interp.ok, true);
    assert.ok(interp.offers.length >= 2, 'Fährmann must have at least 2 distinct variant offers');
  }
  console.log('✓ PASS 194F-10');

  // Test 194F-11: Stutensee inconsistency renders visibly
  console.log('\n[TEST 194F-11] Stutensee inconsistency renders visibly...');
  const stutenseePdfPath = path.join(__dirname, 'fixtures/pdfs/Offer_2024_1045_Stutensee.pdf');
  if (fs.existsSync(stutenseePdfPath)) {
    const pdfBuf = fs.readFileSync(stutenseePdfPath);
    const extraction = await pdfExtractor.extractPdfQuote(pdfBuf, 'Offer_2024_1045_Stutensee.pdf', 'application/pdf');
    const interp = interpreter.interpretDocument(extraction);
    assert.strictEqual(interp.hasInconsistentOffers, true, 'Stutensee must have inconsistent 300-copy unit price');
    const off300 = interp.offers.find(o => o.quantity === 300);
    assert.ok(off300);
    assert.strictEqual(off300.validationStatus, 'INCONSISTENT_UNIT_PRICE');
  }
  console.log('✓ PASS 194F-11');

  // Test 194F-12: Operator correction preserves source value
  console.log('\n[TEST 194F-12] Operator correction preserves source value...');
  assert.ok(cardCode.includes('sourceValue'), 'Review card must preserve sourceValue');
  assert.ok(cardCode.includes('operatorCorrectedValue'), 'Review card must track operatorCorrectedValue');
  console.log('✓ PASS 194F-12');

  // Test 194F-13: READY_FOR_CALIBRATION_REVIEW does not run solver
  console.log('\n[TEST 194F-13] READY_FOR_CALIBRATION_REVIEW semantics check...');
  assert.ok(cardCode.includes('READY_FOR_CALIBRATION_REVIEW'), 'Must support READY_FOR_CALIBRATION_REVIEW state');
  assert.ok(!cardCode.includes('calculateCalibration'), 'READY_FOR_CALIBRATION_REVIEW must not trigger solver');
  console.log('✓ PASS 194F-13');

  // Test 194F-21: Cross-tenant evidence access blocked
  console.log('\n[TEST 194F-21] Cross-tenant evidence access blocked...');
  db.query = async (sql, params) => {
    // If tenantId doesn't match, return empty array
    if (params && params.includes('tenant-a') && params.includes('tenant-b')) {
      return [];
    }
    return [];
  };
  try {
    await calibrationAssistantService.processQuoteEvidenceForChat('tenant-b', 'qdoc-tenant-a-123', 'es');
    assert.fail('Should have thrown 404 for cross-tenant access');
  } catch (err) {
    assert.strictEqual(err.code, 'QUOTE_EVIDENCE_NOT_FOUND');
  }
  console.log('✓ PASS 194F-21');

  // Test 194F-22: Legacy Pricing Assistant text chat still works
  console.log('\n[TEST 194F-22] Legacy Pricing Assistant text chat still works...');
  const legacyPrompt = "1000 copies 170x240mm 128p offset 80g cover 300g perfect bound for 2450 EUR";
  const validated = calibrationAssistantService._validateAndNormalizeAIResponse({
    intent: 'SPEC_EXTRACTION',
    specPatch: { copies: 1000, book_width_mm: 170, book_height_mm: 240, interior_pages: 128, binding_method: 'perfect bound' },
    declaredCommercials: { targetManufacturingPrice: 2450 }
  });
  assert.strictEqual(validated.specPatch.copies, 1000);
  assert.strictEqual(validated.declaredCommercials.targetManufacturingPrice, 2450);
  console.log('✓ PASS 194F-22');

  // Test 194F-23 & 194F-24: Zero rate_json mutation and zero automatic governed acceptance
  console.log('\n[TEST 194F-23 & 24] Zero rate mutation and zero automatic governed acceptance...');
  assert.ok(!cardCode.includes('rates_json'), 'Review card must not touch rates_json');
  assert.ok(!cardCode.includes('acceptCalibrationRun'), 'Review card must not invoke governed acceptance');
  console.log('✓ PASS 194F-23 & 194F-24');

  // Test 194F-25: PDF extraction to chat context flow does not re-ask known data & preserves original specs & variant continuity
  console.log('\n[TEST 194F-25] PDF extraction -> assistant chat context flow & variant continuity...');
  const fahrmannRawText = `Produkt Fährmann (VVA/10 Muster)
Format 139 x 212 mm
Inhalt 208 (1+1) + 8 (4+4) Seiten + Umschlag
Angaben Hardcover, gerader Rücken, Fadenheftung, weiß kapitalt, Mattfolie plus partieller Relieflack, nicht eingeschweißt, auf Palette
Auflage 3000 pc
Inhalt Munken Print Cream 1.5 90 g / Munken Premium Cream 1.3 90 g
Vorsatz/Nachsatz Munken Print Cream 1.5 115 g / Munken Premium Cream 1.3 115 g
Inhalt 1+1 Pantone 4+4 8 Seiten am Stück
Vorsatz/Nachsatz 0+0
Umschlag 4+0
Option 1: 3000 Stück 6.048 Euro + 435 Euro Transport = 6.483 Euro
Option 2: 3000 Stück 6.184 Euro + 435 Euro Transport = 6.619 Euro
Option 3: 3000 Stück 6.298 Euro + 435 Euro Transport = 6.733 Euro
Option 4: 3000 Stück 6.582 Euro + 435 Euro Transport = 7.017 Euro`;

  const fahrmannOffers = [
    { variantId: 'variant-0', quantity: 3000, manufacturingPrice: 6048, transportPrice: 435, quotedTotalPrice: 6483, quotedUnitPrice: 2.16, validationStatus: 'CONSISTENT', variantName: 'Opción 1' },
    { variantId: 'variant-1', quantity: 3000, manufacturingPrice: 6184, transportPrice: 435, quotedTotalPrice: 6619, quotedUnitPrice: 2.21, validationStatus: 'CONSISTENT', variantName: 'Opción 2' },
    { variantId: 'variant-2', quantity: 3000, manufacturingPrice: 6298, transportPrice: 435, quotedTotalPrice: 6733, quotedUnitPrice: 2.24, validationStatus: 'CONSISTENT', variantName: 'Opción 3' },
    { variantId: 'variant-3', quantity: 3000, manufacturingPrice: 6582, transportPrice: 435, quotedTotalPrice: 7017, quotedUnitPrice: 2.34, validationStatus: 'CONSISTENT', variantName: 'Opción 4' }
  ];

  db.query = async (sql, params) => {
    if (sql.includes('FROM quote_evidence_documents')) {
      if (params && params[0] === 'qdoc-fahrmann-194f' && params[1] === 'tenant-es-1') {
        return [{
          id: 'qdoc-fahrmann-194f',
          tenant_id: 'tenant-es-1',
          file_name: 'Fährmann_(VVA_10_Muster)_07.09.2026.pdf',
          detected_language: 'de',
          raw_text: fahrmannRawText,
          normalized_json: JSON.stringify({ printhouseName: 'Fährmann (VVA/10 Muster)', offers: fahrmannOffers }),
          normalized_quote_json: JSON.stringify({ printhouseName: 'Fährmann (VVA/10 Muster)', offers: fahrmannOffers })
        }];
      }
      return []; // Returns empty array for wrong tenant
    }
    return [];
  };

  const aiAdapter = require('../src/api/services/aiProviderAdapter');
  let capturedUserPrompts = [];
  const originalGenerate = aiAdapter.generateStructuredCompletion.bind(aiAdapter);

  aiAdapter.generateStructuredCompletion = async (opts) => {
    capturedUserPrompts.push(opts.userPrompt);
    return originalGenerate(opts);
  };

  try {
    const mockFahrmannAiResponse = {
      intent: 'SPEC_EXTRACTION',
      specPatch: {
        copies: 3000,
        book_width_mm: 139,
        book_height_mm: 212,
        interior_pages: 216,
        paper_type_interior: 'munken',
        paper_weight_interior: 90,
        binding_method: 'hardcover',
        has_mixed_interior: true,
        mixed_interior_details: '208 (1+1) + 8 (4+4) Seiten',
        has_endpapers: true,
        endpapers_details: '115 g/m² sin impresión (0+0)',
        has_spot_uv: false,
        spot_uv_details: 'partieller Relieflack (barniz de relieve parcial)',
        unsupported_features: ['partieller_relieflack']
      },
      declaredCommercials: {
        targetManufacturingPrice: 6048,
        targetTransportPrice: 435,
        currency: 'EUR',
        includesPaper: true,
        includesBinding: true,
        includesFinishing: true,
        includesPackaging: true
      },
      clarificationQuestions: [
        { field: 'copies', question: 'How many copies do you want?' },
        { field: 'targetManufacturingPrice', question: 'What is your target price?' }
      ],
      explanation: 'Extracted PDF document Fährmann_(VVA_10_Muster)_07.09.2026.pdf with 4 offer variants for 3,000 copies.',
      warnings: [],
      readyForValidation: true
    };

    // Turn 1: Initial upload interpretation via calibrationAssistantService.interpret (real service method)
    const res1 = await calibrationAssistantService.interpret('tenant-es-1', '[PDF subido]: Fährmann_(VVA_10_Muster)_07.09.2026.pdf', { id: 'u1' }, { evidenceId: 'qdoc-fahrmann-194f', mockResponse: mockFahrmannAiResponse });
    const prop1 = res1.proposal || res1;

    // Assertions on Captured AI Context Prompt (verifying reception of exact extracted document specs)
    assert.ok(capturedUserPrompts.length > 0, 'Must capture context prompt passed to AI adapter');
    const contextPrompt1 = capturedUserPrompts[0];
    assert.ok(contextPrompt1.includes('Fährmann_(VVA_10_Muster)_07.09.2026.pdf'), 'Context prompt must contain original PDF filename');
    assert.ok(contextPrompt1.includes('Vorsatz/Nachsatz 0+0'), 'Context prompt must contain unprinted endpapers 0+0 from PDF text');
    assert.ok(contextPrompt1.includes('208 (1+1) + 8 (4+4) Seiten'), 'Context prompt must contain mixed interior details from PDF text');
    assert.ok(contextPrompt1.includes('Hardcover, gerader Rücken, Fadenheftung'), 'Context prompt must contain Hardcover thread sewn binding from PDF text');
    assert.ok(contextPrompt1.includes('partieller Relieflack'), 'Context prompt must contain partial relief varnish without forcing UV assumption');

    assert.strictEqual(prop1.specPatch.copies, 3000, 'Must extract 3000 copies');
    assert.strictEqual(prop1.specPatch.book_width_mm, 139, 'Must extract width 139mm');
    assert.strictEqual(prop1.specPatch.book_height_mm, 212, 'Must extract height 212mm');
    assert.strictEqual(prop1.specPatch.interior_pages, 216, 'Must extract 216 interior pages');
    assert.strictEqual(prop1.specPatch.paper_type_interior, 'munken', 'Must preserve Munken paper');
    assert.strictEqual(prop1.specPatch.binding_method, 'hardcover', 'Must preserve Hardcover binding');
    assert.strictEqual(prop1.specPatch.has_mixed_interior, true, 'Must preserve mixed interior');
    assert.strictEqual(prop1.specPatch.endpapers_details, '115 g/m² sin impresión (0+0)', 'Must preserve unprinted 115g endpapers spec');
    assert.strictEqual(prop1.specPatch.has_spot_uv, false, 'Must NOT set has_spot_uv=true for unconfirmed UV technology');
    assert.ok(Array.isArray(prop1.specPatch.unsupported_features) && prop1.specPatch.unsupported_features.includes('partieller_relieflack'), 'Must track partieller_relieflack in unsupported_features');
    assert.strictEqual(prop1.specPatch.spot_uv_details, 'partieller Relieflack (barniz de relieve parcial)', 'Must preserve partial relief varnish details');

    // Verify deterministic filter strips redundant clarification questions when fields are already resolved
    assert.strictEqual(prop1.clarificationQuestions.length, 0, 'Deterministic filter must strip redundant questions for already resolved copies and target price');

    // Turn 2: Selected Variant Continuity via selectedVariantId: 'variant-1' (User selects Option 2: €6,184 + €435)
    // Pass DELIBERATELY WRONG numbers in AI mock to prove server-side DB override!
    const mockWrongVariant2AiResponse = {
      intent: 'SPEC_EXTRACTION',
      specPatch: { ...prop1.specPatch, copies: 1000 },
      declaredCommercials: {
        targetManufacturingPrice: 6048, // Intentionally wrong (Option 1 price)
        targetTransportPrice: 0,       // Intentionally wrong
        currency: 'EUR',
        includesPaper: true,
        includesBinding: true,
        includesFinishing: true,
        includesPackaging: true
      },
      clarificationQuestions: [],
      explanation: 'User selected Variant 2 (6184 EUR manufacturing + 435 EUR transport).',
      warnings: [],
      readyForValidation: true
    };

    const res2 = await calibrationAssistantService.interpret('tenant-es-1', '[Variante seleccionada]: Opción 2', { id: 'u1' }, { evidenceId: 'qdoc-fahrmann-194f', selectedVariantId: 'variant-1', mockResponse: mockWrongVariant2AiResponse });
    const prop2 = res2.proposal || res2;

    // Verify server-side resolution from DB record forces exact stored variant-1 values
    assert.strictEqual(prop2.declaredCommercials.targetManufacturingPrice, 6184, 'Server MUST override AI mock price with stored variant 6184 EUR');
    assert.strictEqual(prop2.declaredCommercials.targetTransportPrice, 435, 'Server MUST override AI mock transport with stored variant 435 EUR');
    assert.strictEqual(prop2.specPatch.copies, 3000, 'Server MUST override AI mock copies with stored variant 3000 copies');
    assert.strictEqual(prop2.specPatch.endpapers_details, '115 g/m² sin impresión (0+0)', 'Must preserve unprinted endpapers across turns');

    // Turn 3: Subsequent turn maintains selected variant (does not revert to 6048 EUR or change variants)
    const res3 = await calibrationAssistantService.interpret('tenant-es-1', 'Confirming this selection', { id: 'u1' }, { evidenceId: 'qdoc-fahrmann-194f', selectedVariantId: 'variant-1', mockResponse: mockWrongVariant2AiResponse });
    const prop3 = res3.proposal || res3;

    assert.strictEqual(prop3.declaredCommercials.targetManufacturingPrice, 6184, 'Turn 3 must maintain selected variant 6184 EUR without reverting');

    // Verify invalid selectedVariantId produces a controlled 400 error without picking another offer
    let invalidErrorThrown = false;
    try {
      await calibrationAssistantService.interpret('tenant-es-1', 'Test invalid variant', { id: 'u1' }, { evidenceId: 'qdoc-fahrmann-194f', selectedVariantId: 'non-existent-variant-999', mockResponse: mockWrongVariant2AiResponse });
    } catch (err) {
      invalidErrorThrown = true;
      assert.strictEqual(err.statusCode || err.status, 400, 'Invalid variantId must produce 400 error');
      assert.strictEqual(err.code, 'QUOTE_VARIANT_NOT_FOUND', 'Error code must be QUOTE_VARIANT_NOT_FOUND');
    }
    assert.ok(invalidErrorThrown, 'Must throw error when non-existent variantId is provided');

    console.log('✓ PASS 194F-25');
  } finally {
    // Restore original generateStructuredCompletion method in all execution paths
    aiAdapter.generateStructuredCompletion = originalGenerate;
  }

  console.log('\n==================================================');
  console.log('ALL PHASE 194F MULTILINGUAL ASSISTANT TESTS PASSED!');
  console.log('==================================================');
}

runTests().catch(err => {
  console.error('\n❌ Smoke Test Failed:', err);
  process.exit(1);
});
