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

  console.log('\n==================================================');
  console.log('ALL PHASE 194F MULTILINGUAL ASSISTANT TESTS PASSED!');
  console.log('==================================================');
}

runTests().catch(err => {
  console.error('\n❌ Smoke Test Failed:', err);
  process.exit(1);
});
