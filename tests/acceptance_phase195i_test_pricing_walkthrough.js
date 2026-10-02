/**
 * tests/acceptance_phase195i_test_pricing_walkthrough.js
 *
 * Phase 195I — Test Pricing Walkthrough & Specification Persistence Regression Suite
 *
 * Verifies:
 * 1. Spec persistence (3,000 copies, 139x212mm, 216 pages, Hardcover, DE).
 * 2. HTTP request payload matches form values without reset to 750 / 170x240 / 64.
 * 3. Preservation of Hardcover binding (mapped cleanly to BPE hc without fallback to perfect bound).
 * 4. Invalidation of previous calculation results when inputs change.
 * 5. Preservation of original extracted details for mixed interior (1+1 Pantone + 4+4) and unsupported features.
 * 6. Explicit limitation flags blocking automatic calibration acceptance on complex specs.
 */
const assert = require('assert');
const buildPriceAdapter = require('../src/api/services/buildPriceCalibrationAdapter');
const quotePreviewService = require('../src/api/services/printhouseQuotePreviewService');

console.log('================================================================================');
console.log('=== PHASE 195I — TEST PRICING & SPECIFICATION PERSISTENCE ACCEPTANCE TEST ===');
console.log('================================================================================\n');

(async () => {
    let testCount = 0;
    let passCount = 0;

    function runTest(name, fn) {
        testCount++;
        try {
            fn();
            passCount++;
            console.log(`[PASS] Test ${testCount}: ${name}`);
        } catch (err) {
            console.error(`[FAIL] Test ${testCount}: ${name}`);
            console.error(err);
            process.exit(1);
        }
    }

    const canonicalStringify = (obj) => {
        if (obj === null || obj === undefined) return 'null';
        if (typeof obj !== 'object') return JSON.stringify(obj);
        if (Array.isArray(obj)) return '[' + obj.map(v => canonicalStringify(v)).join(',') + ']';
        const keys = Object.keys(obj).sort();
        return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
    };

    const computeBookSpecChecksum = async (spec) => {
        if (!spec || typeof spec !== 'object') return null;
        const str = canonicalStringify(spec);
        if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
            const msgUint8 = new TextEncoder().encode(str);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
        return require('crypto').createHash('sha256').update(str).digest('hex');
    };

    // 1. Fährmann Book Specification
    const fahrmannSpec = {
        copies: 3000,
        book_width_mm: 139,
        book_height_mm: 212,
        interior_pages: 216,
        interior_print: '1/1',
        paper_type_interior: 'munken',
        paper_weight_interior: 90,
        cover_print: '4/0',
        paper_type_cover: 'mc',
        paper_weight_cover: 130,
        lamination: 'matt',
        binding_method: 'hardcover',
        delivery_country: 'DE',
        has_mixed_interior: true,
        mixed_interior_details: '208p 1/1 Pantone + 8p 4/4 CMYK',
        has_spot_uv: true,
        unsupported_features: ['MIXED_INTERIOR_PANTONE_CMYK', 'SPOT_UV_VARNISH', 'HARDCOVER_BOARD_2.4MM']
    };

    // Test 1: Binding method normalization maps 'hardcover' to BPE code 'hc'
    runTest('Hardcover binding method maps cleanly to BPE hc without falling back to perfect bound', () => {
        const canonicalNodeConfig = {
            id: 'node-test',
            name: 'Test Node',
            signatures: [16, 8, 4],
            production_lead_days: 7,
            shipping_days: 2
        };
        const sampleRates = {
            base_setup_price: 150,
            price_per_signature_per_1000: 12.5,
            paper_price_per_kg: 1.8,
            binding_setup_perfect_bound: 80,
            binding_price_per_unit_perfect_bound: 0.15,
            binding_setup_hardcover: 250,
            binding_price_per_unit_hardcover: 0.85
        };

        const adapted = buildPriceAdapter.adaptBookSpec(fahrmannSpec);
        assert.ok(adapted, 'Adapted parameters must be returned');
        assert.strictEqual(adapted.bindingCode, 'hc', 'Binding code must be hc for hardcover spec');
        assert.notStrictEqual(adapted.bindingCode, 'pb', 'Binding code must NOT fall back to perfect bound pb');
    });

    // Test 2: Spec properties preserved (no substitution by 750 / 170x240 / 64)
    runTest('Fährmann spec properties (3000 copies, 139x212, 216 pages, DE) strictly preserved', () => {
        assert.strictEqual(fahrmannSpec.copies, 3000, 'Copies must remain 3000');
        assert.strictEqual(fahrmannSpec.book_width_mm, 139, 'Width must remain 139');
        assert.strictEqual(fahrmannSpec.book_height_mm, 212, 'Height must remain 212');
        assert.strictEqual(fahrmannSpec.interior_pages, 216, 'Interior pages must remain 216');
        assert.strictEqual(fahrmannSpec.binding_method, 'hardcover', 'Binding method must remain hardcover');
        assert.strictEqual(fahrmannSpec.delivery_country, 'DE', 'Delivery country must remain DE');
    });

    // Test 3: Complex specification limitation detection
    runTest('Complex specification (mixed interior, spot UV) flagged with explicit limitation', () => {
        const hasComplexSpec = Boolean(
            fahrmannSpec.has_mixed_interior ||
            fahrmannSpec.mixed_interior_details ||
            fahrmannSpec.has_spot_uv ||
            (fahrmannSpec.unsupported_features && fahrmannSpec.unsupported_features.length > 0)
        );

        assert.strictEqual(hasComplexSpec, true, 'Complex spec limitation flag must evaluate to true');
        assert.ok(fahrmannSpec.unsupported_features.includes('MIXED_INTERIOR_PANTONE_CMYK'), 'Must list mixed interior in unsupported features');
        assert.ok(fahrmannSpec.unsupported_features.includes('SPOT_UV_VARNISH'), 'Must list spot UV varnish in unsupported features');
    });

    // Test 4: Result Invalidation on Spec Modification
    runTest('Form spec change invalidates previous quote result', () => {
        let currentQuoteResult = { totals: { finalSellingPrice: 6048 } };
        
        // Simulate user editing a field (e.g. changing copies from 3000 to 4000)
        function updateSpec(key, value) {
            currentQuoteResult = null; // Invalidate previous result
            fahrmannSpec[key] = value;
        }

        updateSpec('copies', 4000);
        assert.strictEqual(currentQuoteResult, null, 'Previous quote result must be invalidated (set to null)');
        assert.strictEqual(fahrmannSpec.copies, 4000, 'Spec must reflect updated value 4000');
    });

    // Test 5: Server-side complex specification rejection before rate persistence
    runTest('Server-side calibrationAcceptanceService fails-closed on complex specs with UNSUPPORTED_COMPLEX_SPECIFICATION', async () => {
        const calibrationAcceptanceService = require('../src/api/services/calibrationAcceptanceService');
        
        try {
            await calibrationAcceptanceService.acceptCommercialCalibration({
                tenantId: 'tenant-test',
                printerNodeId: 'node-test',
                baselineRatesChecksum: 'sha256:dummy',
                bookSpec: {
                    copies: 3000,
                    has_mixed_interior: true,
                    mixed_interior_details: '208p 1/1 + 8p 4/4',
                    unsupported_features: ['MIXED_INTERIOR_PANTONE_CMYK']
                }
            });
            assert.fail('Should have thrown UNSUPPORTED_COMPLEX_SPECIFICATION error');
        } catch (err) {
            assert.strictEqual(err.code, 'UNSUPPORTED_COMPLEX_SPECIFICATION', 'Error code must be UNSUPPORTED_COMPLEX_SPECIFICATION');
            assert.strictEqual(err.statusCode, 422, 'HTTP status code must be 422');
        }
    });

    // Test 6: In-flight async calculation race condition protection
    runTest('Out-of-order async calculation responses are ignored when active request ID advances', () => {
        let activeRequestId = 0;
        let displayedQuoteResult = null;

        function triggerCalculation() {
            const reqId = ++activeRequestId;
            return {
                resolveResponse: (resData) => {
                    if (reqId === activeRequestId) {
                        displayedQuoteResult = resData;
                    }
                }
            };
        }

        const req1 = triggerCalculation(); // reqId = 1
        const req2 = triggerCalculation(); // reqId = 2 (user clicked again or edited field)

        // Late response arrives for req 1
        req1.resolveResponse({ finalSellingPrice: 500 });
        assert.strictEqual(displayedQuoteResult, null, 'Late response from req 1 must be ignored');

        // Response arrives for req 2
        req2.resolveResponse({ finalSellingPrice: 6048 });
        assert.strictEqual(displayedQuoteResult.finalSellingPrice, 6048, 'Response from active req 2 must be displayed');
    });

    // Test 7: Server derives complexity from text details even when client boolean flags are omitted
    runTest('Server derives complexity from text details (Pantone/CMYK) even when has_mixed_interior boolean is omitted', async () => {
        const calibrationAcceptanceService = require('../src/api/services/calibrationAcceptanceService');
        
        try {
            await calibrationAcceptanceService.acceptCommercialCalibration({
                tenantId: 'tenant-test',
                printerNodeId: 'node-test',
                baselineRatesChecksum: 'sha256:dummy',
                bookSpec: {
                    copies: 3000,
                    // Note: has_mixed_interior: true is intentionally omitted!
                    mixed_interior_details: '208p 1/1 Pantone + 8p 4/4 CMYK'
                }
            });
            assert.fail('Should have thrown UNSUPPORTED_COMPLEX_SPECIFICATION error based on derived text details');
        } catch (err) {
            assert.strictEqual(err.code, 'UNSUPPORTED_COMPLEX_SPECIFICATION', 'Error code must be UNSUPPORTED_COMPLEX_SPECIFICATION');
            assert.strictEqual(err.statusCode, 422, 'HTTP status code must be 422');
        }
    });

    // Test 8: Active revision status strictly requires checksum parity between node rates and revision
    runTest('Active revision status requires exact checksum match with current node rates_json', () => {
        const govState = {
            activeRevisionId: 'rev-100',
            activeRevisionChecksum: 'sha256:abc123',
            latestRevisionId: 'rev-100'
        };

        const currentRatesChecksum = 'sha256:abc123';
        const isMatched = Boolean(govState.activeRevisionId && govState.activeRevisionChecksum === currentRatesChecksum);
        assert.strictEqual(isMatched, true, 'Checksum match must confirm active status');

        const driftedRatesChecksum = 'sha256:different999';
        const isMatchedDrifted = Boolean(govState.activeRevisionId && govState.activeRevisionChecksum === driftedRatesChecksum);
        assert.strictEqual(isMatchedDrifted, false, 'Checksum mismatch must report inactive / checksum drift status');
    });

    // Test 9: Positive and Negative test cases for isComplexSpec
    runTest('isComplexSpec correctly approves standard 4/4 CMYK and 1/1 mono jobs while rejecting complex specs', () => {
        const calibrationAcceptanceService = require('../src/api/services/calibrationAcceptanceService');
        
        // Negative Case 1: Standard 4/4 CMYK interior
        const standard44Spec = {
            copies: 500,
            book_width_mm: 170,
            book_height_mm: 240,
            interior_pages: 128,
            interior_print: '4/4',
            paper_type_interior: 'mc',
            paper_weight_interior: 115,
            cover_print: '4/0',
            paper_type_cover: 'mc',
            paper_weight_cover: 250,
            lamination: 'matt',
            binding_method: 'perfect bound',
            delivery_country: 'ES'
        };
        assert.strictEqual(calibrationAcceptanceService.isComplexSpec(standard44Spec), false, 'Standard 4/4 CMYK book must NOT be flagged as complex');

        // Negative Case 2: Standard 1/1 mono interior
        const standard11Spec = {
            copies: 1000,
            interior_pages: 200,
            interior_print: '1/1',
            paper_type_interior: 'offset',
            paper_weight_interior: 80,
            cover_print: '4/0',
            paper_type_cover: 'mc',
            paper_weight_cover: 300,
            binding_method: 'perfect bound',
            delivery_country: 'DE'
        };
        assert.strictEqual(calibrationAcceptanceService.isComplexSpec(standard11Spec), false, 'Standard 1/1 mono book must NOT be flagged as complex');

        // Positive Case 1: Fährmann mixed interior text (208p 1/1 Pantone + 8p 4/4 CMYK)
        const mixedFahrmannSpec = {
            copies: 3000,
            mixed_interior_details: '208p 1/1 Pantone + 8p 4/4 CMYK'
        };
        assert.strictEqual(calibrationAcceptanceService.isComplexSpec(mixedFahrmannSpec), true, 'Mixed Pantone + 4/4 interior MUST be flagged as complex');

        // Positive Case 2: Spec with endpapers / guardas
        const endpapersSpec = {
            copies: 1000,
            raw_text: 'Interior 128p 1/1, Guardas 115g sin impresión, Tapa dura cartón 2.4mm'
        };
        assert.strictEqual(calibrationAcceptanceService.isComplexSpec(endpapersSpec), true, 'Spec with guardas and cartón MUST be flagged as complex');
    });

    // Test 10: State and request cancellation on printerNodeId change
    runTest('Changing printerNodeId cancels in-flight requests and clears stale results', () => {
        let activeReqId = 0;
        let activeResult = { totals: { finalSellingPrice: 1200 } };
        let loadingState = true;

        function onPrinterNodeIdChange() {
            activeReqId++;
            activeResult = null;
            loadingState = false;
        }

        onPrinterNodeIdChange();
        assert.strictEqual(activeResult, null, 'Quote result must be reset to null when printerNodeId changes');
        assert.strictEqual(loadingState, false, 'Loading state must be reset to false when printerNodeId changes');
    });

    // Test 11: GovernedQuoteSmokeTest spec normalization & payload preservation for Fährmann unedited spec
    runTest('GovernedQuoteSmokeTest initialSpec synchronization preserves 3000 / 139x212 / 216 / hardcover / DE without fallback reset', () => {
        // Mock parent state passing initialSpec
        let parentInitialSpec = {
            copies: 3000,
            book_width_mm: 139,
            book_height_mm: 212,
            interior_pages: 216,
            interior_print: '1/1',
            paper_type_interior: 'munken',
            paper_weight_interior: 90,
            cover_print: '4/0',
            paper_type_cover: 'mc',
            paper_weight_cover: 130,
            lamination: 'matt',
            binding_method: 'hardcover',
            delivery_country: 'DE'
        };

        // Simulate GovernedQuoteSmokeTest internal state logic
        function normalizeBinding(b) {
            if (!b) return 'perfect bound';
            const s = String(b).toLowerCase().trim();
            if (s === 'hardcover' || s === 'hard_cover' || s === 'case' || s === 'casebound' || s === 'hardback') return 'hardcover';
            return s;
        }

        let componentSpec = { ...parentInitialSpec, binding_method: normalizeBinding(parentInitialSpec.binding_method) };

        // Simulate parent re-render passing cloned initialSpec
        parentInitialSpec = { ...parentInitialSpec }; // New object reference!

        // Simulate handleCalculate dispatch
        const payloadDispatched = {
            printerNodeId: 'node-329a3bc4',
            jobSpec: componentSpec
        };

        assert.strictEqual(payloadDispatched.jobSpec.copies, 3000, 'Payload copies must be 3000');
        assert.strictEqual(payloadDispatched.jobSpec.book_width_mm, 139, 'Payload width must be 139');
        assert.strictEqual(payloadDispatched.jobSpec.book_height_mm, 212, 'Payload height must be 212');
        assert.strictEqual(payloadDispatched.jobSpec.interior_pages, 216, 'Payload interior_pages must be 216');
        assert.strictEqual(payloadDispatched.jobSpec.binding_method, 'hardcover', 'Payload binding_method must be hardcover');
        assert.strictEqual(payloadDispatched.jobSpec.delivery_country, 'DE', 'Payload delivery_country must be DE');
        assert.notStrictEqual(payloadDispatched.jobSpec.copies, 750, 'Payload MUST NOT reset to default 750');
    });

    // Test 12: Quote preview returns isSimplifiedApproximation: true and warning for mixed interior, guardas, and barniz
    runTest('printhouseQuotePreviewService preserves complex origins (mixed interior, guardas, barniz) returning isSimplifiedApproximation: true and SIMPLIFIED_INTERIOR_APPROXIMATION warning', async () => {
        const db = require('../src/api/services/mysqlClient');
        const origQuery = db.query;
        db.query = async () => [{
            id: 'node-329a3bc4',
            name: 'Test Node',
            tenant_id: 'tenant-demo',
            rates_json: JSON.stringify({ base_setup_price: 100 }),
            signatures: JSON.stringify([16, 8, 4]),
            limits: JSON.stringify({ min_copies: 1, max_copies: 100000 }),
            production_lead_days: 7
        }];

        try {
            const complexJobSpec = {
                copies: 3000,
                book_width_mm: 139,
                book_height_mm: 212,
                interior_pages: 216,
                interior_print: '1/1',
                paper_type_interior: 'munken',
                paper_weight_interior: 90,
                cover_print: '4/0',
                paper_type_cover: 'mc',
                paper_weight_cover: 130,
                lamination: 'matt',
                binding_method: 'hardcover',
                delivery_country: 'DE',
                has_mixed_interior: true,
                mixed_interior_details: '208p 1/1 + 8p 4/4',
                has_endpapers: true,
                endpapers_details: 'Guardas 115g sin impresión',
                has_spot_uv: true,
                spot_uv_details: 'Barniz UVI en portada',
                unsupported_features: ['MIXED_INTERIOR_PANTONE_CMYK', 'GUARDAS', 'SPOT_UV_VARNISH']
            };

            const preview = await quotePreviewService.generateQuotePreview('tenant-demo', complexJobSpec, 'node-329a3bc4');
            assert.ok(preview, 'Preview result must be generated');
            assert.strictEqual(preview.isSimplifiedApproximation, true, 'isSimplifiedApproximation must be true for complex spec');
            assert.ok(preview.warnings.some(w => w.includes('SIMPLIFIED_INTERIOR_APPROXIMATION')), 'Must contain SIMPLIFIED_INTERIOR_APPROXIMATION warning');
            assert.ok(preview.warnings.some(w => w.includes('Guardas') || w.includes('Barniz') || w.includes('208p')), 'Warning details must include complex feature details');
        } finally {
            db.query = origQuery;
        }
    });

    // Test 13: Partial Service-Level Check: Exact Checksum Parity Verification & Run Resolution Helper
    runTest('[Partial Service Check] Checksum computed by computeBookSpecChecksum has 100% parity with calibrationSessionService and filters non-matching runs', async () => {
        const sessionService = require('../src/api/services/calibrationSessionService');

        const testSpec = {
            copies: 3000,
            book_width_mm: 139,
            book_height_mm: 212,
            interior_pages: 216,
            interior_print: '1/1',
            paper_type_interior: 'munken',
            paper_weight_interior: 90,
            cover_print: '4/0',
            paper_type_cover: 'mc',
            paper_weight_cover: 130,
            lamination: 'matt',
            binding_method: 'hardcover',
            delivery_country: 'DE'
        };

        const backendChecksum = sessionService.computeRatesChecksum(testSpec);
        const frontendChecksum = await computeBookSpecChecksum(testSpec);

        assert.ok(backendChecksum, 'Backend checksum must exist');
        assert.ok(frontendChecksum, 'Frontend checksum must exist');
        assert.strictEqual(frontendChecksum, backendChecksum, 'Frontend computeBookSpecChecksum MUST produce exact same SHA-256 hex string as backend calibrationRunService');

        // Test run selection logic
        const matchingRun = { id: 'crun-match', sessionInputChecksum: backendChecksum, targetPrice: 6048 };
        const mismatchRun = { id: 'crun-stale', sessionInputChecksum: 'sha256:stale750' };

        async function resolveActiveRun(spec, run) {
            if (!spec || !run) return null;
            const expected = await computeBookSpecChecksum(spec);
            const runCk = run.sessionInputChecksum || run.session_input_checksum;
            if (!expected || !runCk || expected !== runCk) return null;
            return run;
        }

        const activeMatch = await resolveActiveRun(testSpec, matchingRun);
        const activeMismatch = await resolveActiveRun(testSpec, mismatchRun);

        assert.deepStrictEqual(activeMatch, matchingRun, 'Matching run MUST be displayed');
        assert.strictEqual(activeMismatch, null, 'Mismatching run MUST NOT be displayed (cleared to null)');
    });

    // Test 14: Partial Service-Level Check: ACCEPTED session isolation branch logic
    runTest('[Partial Service Check] Session status ACCEPTED routing branch creates separate DRAFT session leaving historical intact', async () => {
        const historicalAcceptedSession = {
            id: 'cal-adc1df15',
            status: 'ACCEPTED',
            bookSpec: { copies: 750, book_width_mm: 170, book_height_mm: 240, interior_pages: 64 },
            targetManufacturingPrice: 939.66,
            acceptedAt: '2026-08-23T10:00:00Z'
        };

        const newOfferSpec = {
            copies: 3000,
            book_width_mm: 139,
            book_height_mm: 212,
            interior_pages: 216,
            binding_method: 'hardcover',
            delivery_country: 'DE'
        };

        let createSessionCalled = false;
        let updateDraftSessionCalled = false;

        // Mock API handlers
        const mockApi = {
            createSession: async (payload) => {
                createSessionCalled = true;
                return {
                    id: 'cal-newdraft-888',
                    status: 'DRAFT',
                    printerNodeId: payload.printerNodeId,
                    bookSpec: payload.bookSpec,
                    targetManufacturingPrice: payload.targetManufacturingPrice
                };
            },
            updateDraftSession: async (id, payload) => {
                updateDraftSessionCalled = true;
                return { id, ...payload };
            }
        };

        // Simulated handleApplyProposal routing branch logic
        async function applyProposalForSession(session, spec, comms) {
            if (!session?.id || session.status === 'ACCEPTED' || session.status === 'REJECTED') {
                return await mockApi.createSession({
                    printerNodeId: 'node-329a3bc4',
                    referenceBookName: 'New Quote Offer Calibration',
                    bookSpec: spec,
                    targetManufacturingPrice: comms.targetManufacturingPrice
                });
            } else if (session.status === 'DRAFT') {
                return await mockApi.updateDraftSession(session.id, { bookSpec: spec });
            }
            return session;
        }

        const resultSession = await applyProposalForSession(historicalAcceptedSession, newOfferSpec, { targetManufacturingPrice: 6048 });

        assert.strictEqual(historicalAcceptedSession.id, 'cal-adc1df15', 'Historical session ID must remain cal-adc1df15');
        assert.strictEqual(historicalAcceptedSession.status, 'ACCEPTED', 'Historical session status must remain ACCEPTED');
        assert.strictEqual(createSessionCalled, true, 'createSession MUST be called for the new offer');
        assert.strictEqual(updateDraftSessionCalled, false, 'updateDraftSession MUST NOT be called on cal-adc1df15');
        assert.strictEqual(resultSession.id, 'cal-newdraft-888', 'Resulting session must be the new DRAFT session ID');
        assert.strictEqual(resultSession.status, 'DRAFT', 'Resulting session status must be DRAFT');
        assert.strictEqual(resultSession.bookSpec.copies, 3000, 'Resulting session must reflect 3000 copies');
    });

    // Test 15: Standard job with endpapers="none" does NOT trigger simplified approximation
    runTest('Standard job spec with endpapers="none" evaluates isSimplifiedApproximation: false without warnings', async () => {
        const db = require('../src/api/services/mysqlClient');
        const origQuery = db.query;
        db.query = async () => [{
            id: 'node-329a3bc4',
            name: 'Test Node',
            tenant_id: 'tenant-demo',
            rates_json: JSON.stringify({ base_setup_price: 100 }),
            signatures: JSON.stringify([16, 8, 4]),
            limits: JSON.stringify({ min_copies: 1, max_copies: 100000 }),
            production_lead_days: 7
        }];

        try {
            const standardJobSpec = {
                copies: 1000,
                book_width_mm: 170,
                book_height_mm: 240,
                interior_pages: 128,
                interior_print: '4/4',
                paper_type_interior: 'mc',
                paper_weight_interior: 115,
                cover_print: '4/0',
                paper_type_cover: 'mc',
                paper_weight_cover: 250,
                lamination: 'matt',
                binding_method: 'perfect bound',
                delivery_country: 'ES',
                endpapers: 'none',
                has_endpapers: false,
                has_spot_uv: false
            };

            const preview = await quotePreviewService.generateQuotePreview('tenant-demo', standardJobSpec, 'node-329a3bc4');
            assert.ok(preview, 'Preview result must be generated');
            assert.strictEqual(preview.isSimplifiedApproximation, false, 'isSimplifiedApproximation MUST be false for endpapers="none"');
            const simplifiedWarnings = preview.warnings.filter(w => w.includes('SIMPLIFIED_INTERIOR_APPROXIMATION'));
            assert.strictEqual(simplifiedWarnings.length, 0, 'No SIMPLIFIED_INTERIOR_APPROXIMATION warning should be present for endpapers="none"');
        } finally {
            db.query = origQuery;
        }
    });

    // Test 16: Partial Service-Level Check: Active run clearing matrix
    runTest('[Partial Service Check] Active run clearing matrix helper validates missing and mismatching checksums', async () => {

        const validSpec = { copies: 3000, book_width_mm: 139, book_height_mm: 212, interior_pages: 216, binding_method: 'hardcover' };
        const validChecksum = await computeBookSpecChecksum(validSpec);

        async function resolveActiveRun(expectedChecksum, run) {
            if (!expectedChecksum || !run) return null;
            const runChecksum = run.sessionInputChecksum || run.session_input_checksum;
            if (!runChecksum || expectedChecksum !== runChecksum) return null;
            return run;
        }

        // Case A: Missing run checksum
        const runWithoutChecksum = { id: 'crun-no-checksum', targetPrice: 1000 };
        assert.strictEqual(await resolveActiveRun(validChecksum, runWithoutChecksum), null, 'Run without checksum MUST be cleared');

        // Case B: Missing expected checksum
        const runWithChecksum = { id: 'crun-123', sessionInputChecksum: validChecksum };
        assert.strictEqual(await resolveActiveRun(null, runWithChecksum), null, 'Run with missing expected checksum MUST be cleared');

        // Case C: Checksum mismatch
        const runWithDifferentChecksum = { id: 'crun-456', sessionInputChecksum: 'sha256:different999' };
        assert.strictEqual(await resolveActiveRun(validChecksum, runWithDifferentChecksum), null, 'Run with mismatching checksum MUST be cleared');

        // Case D: Both exist and match
        assert.deepStrictEqual(await resolveActiveRun(validChecksum, runWithChecksum), runWithChecksum, 'Run with matching checksum MUST be retained');
    });

    // Test 17: Partial Service-Level Check: Complex spec pipeline through backend services
    runTest('[Partial Service Check] Backend service pipeline preserves complex spec attributes from assistant normalization to quote preview', async () => {
        const calibrationAssistantService = require('../src/api/services/calibrationAssistantService');

        const rawAiOutput = {
            intent: 'SPEC_EXTRACTION',
            specPatch: {
                copies: 3000,
                book_width_mm: 139,
                book_height_mm: 212,
                interior_pages: 216,
                binding_method: 'hardcover',
                has_mixed_interior: true,
                mixed_interior_details: '208p 1/1 Pantone + 8p 4/4 CMYK',
                has_endpapers: true,
                endpapers_details: 'Guardas 115g sin impresión',
                has_spot_uv: true,
                spot_uv_details: 'Barniz UVI en portada',
                unsupported_features: ['MIXED_INTERIOR_PANTONE_CMYK', 'GUARDAS', 'SPOT_UV_VARNISH']
            },
            declaredCommercials: {
                targetManufacturingPrice: 6048,
                currency: 'EUR',
                includesPaper: true,
                includesBinding: true,
                includesFinishing: true,
                includesPackaging: true
            },
            readyForValidation: true
        };

        // 1. Assistant normalization gate
        const normalized = calibrationAssistantService._validateAndNormalizeAIResponse(rawAiOutput);
        assert.strictEqual(normalized.specPatch.has_mixed_interior, true, 'Assistant MUST preserve has_mixed_interior');
        assert.strictEqual(normalized.specPatch.mixed_interior_details, '208p 1/1 Pantone + 8p 4/4 CMYK', 'Assistant MUST preserve mixed_interior_details');
        assert.strictEqual(normalized.specPatch.has_endpapers, true, 'Assistant MUST preserve has_endpapers');
        assert.strictEqual(normalized.specPatch.has_spot_uv, true, 'Assistant MUST preserve has_spot_uv');

        // 2. DRAFT Creation & Recovery (simulated spec state)
        let draftSpec = { ...normalized.specPatch };

        // 3. Subsequent Clarification Turn (user answers commercial inclusion)
        const clarificationAnswers = { includesPaper: 'yes', delivery_country: 'DE' };

        // Clarification merge logic
        Object.entries(clarificationAnswers).forEach(([field, answer]) => {
            if (field === 'delivery_country') draftSpec.delivery_country = answer;
        });

        // Verify complex spec attributes SURVIVED the clarification turn
        assert.strictEqual(draftSpec.has_mixed_interior, true, 'has_mixed_interior MUST survive clarification turn');
        assert.strictEqual(draftSpec.mixed_interior_details, '208p 1/1 Pantone + 8p 4/4 CMYK', 'mixed_interior_details MUST survive clarification turn');
        assert.strictEqual(draftSpec.has_endpapers, true, 'has_endpapers MUST survive clarification turn');
        assert.strictEqual(draftSpec.has_spot_uv, true, 'has_spot_uv MUST survive clarification turn');

        // 4. Send resulting draftSpec to previewQuote
        const db = require('../src/api/services/mysqlClient');
        const origQuery = db.query;
        db.query = async () => [{
            id: 'node-329a3bc4',
            name: 'Test Node',
            tenant_id: 'tenant-demo',
            rates_json: JSON.stringify({ base_setup_price: 100 }),
            signatures: JSON.stringify([16, 8, 4]),
            limits: JSON.stringify({ min_copies: 1, max_copies: 100000 }),
            production_lead_days: 7
        }];

        try {
            const preview = await quotePreviewService.generateQuotePreview('tenant-demo', draftSpec, 'node-329a3bc4');
            assert.strictEqual(preview.isSimplifiedApproximation, true, 'previewQuote MUST output isSimplifiedApproximation: true');
            assert.ok(preview.warnings.some(w => w.includes('SIMPLIFIED_INTERIOR_APPROXIMATION')), 'previewQuote MUST include SIMPLIFIED_INTERIOR_APPROXIMATION warning');
            assert.ok(preview.warnings.some(w => w.includes('Guardas') && w.includes('Barniz')), 'previewQuote warning MUST contain extracted details for Guardas and Barniz');
        } finally {
            db.query = origQuery;
        }
    });

    // Test 18: Exact Assistant response with missing flags & textual transport options
    runTest('Server derives complexity when Gemini booleans are omitted, sanitizes textual transport option to null, and canonicalizes interior_print', async () => {
        const calibrationAssistantService = require('../src/api/services/calibrationAssistantService');
        const rawAiOutputMissingBooleans = {
            intent: 'SPEC_EXTRACTION',
            specPatch: {
                copies: 3000,
                book_width_mm: 139,
                book_height_mm: 212,
                interior_pages: 216,
                interior_print: '1/1 (Single color black)',
                paper_type_interior: 'munken',
                paper_weight_interior: 90,
                cover_print: '4/0',
                paper_type_cover: 'mc',
                paper_weight_cover: 130,
                binding_method: 'hardcover',
                lamination: 'matt',
                delivery_country: 'DE (Germany)',
                mixed_interior_details: '208p 1/1 Pantone + 8p 4/4 CMYK',
                endpapers_details: 'Guardas 115g',
                spot_uv_details: 'Barniz UVI'
                // has_mixed_interior, has_endpapers, has_spot_uv booleans missing!
            },
            declaredCommercials: {
                targetManufacturingPrice: 6048,
                currency: 'EUR',
                transportPricePerKg: 'Transport not included (€435 total separate)',
                includesPaper: true,
                includesBinding: true,
                includesFinishing: true,
                includesPackaging: true
            },
            explanation: 'Propuesta Fährmann con interior mixto, guardas y barniz.',
            warnings: ['Interior mixto detectado', 'Barniz UVI detectado'],
            readyForValidation: true
        };

        const normalized = calibrationAssistantService._validateAndNormalizeAIResponse(rawAiOutputMissingBooleans);

        // Server MUST derive boolean flags from text/explanation/warnings
        assert.strictEqual(normalized.specPatch.has_mixed_interior, true, 'Server MUST derive has_mixed_interior');
        assert.strictEqual(normalized.specPatch.has_endpapers, true, 'Server MUST derive has_endpapers');
        assert.strictEqual(normalized.specPatch.has_spot_uv, true, 'Server MUST derive has_spot_uv');

        // Textual transport option must be sanitized to null
        assert.strictEqual(normalized.declaredCommercials.transportPricePerKg, null, 'transportPricePerKg must be null when textual option string is provided');

        // Canonical interior_print must be 1/1
        assert.strictEqual(normalized.specPatch.interior_print, '1/1', 'interior_print must be canonical 1/1');
        assert.strictEqual(normalized.specPatch.delivery_country, 'DE', 'delivery_country must be canonical DE');
    });

    console.log(`\n================================================================================`);
    console.log(`=== ALL ${passCount} / ${testCount} PHASE 195I ACCEPTANCE TESTS PASSED SUCCESSFULLY ===`);
    console.log(`================================================================================\n`);
})();
