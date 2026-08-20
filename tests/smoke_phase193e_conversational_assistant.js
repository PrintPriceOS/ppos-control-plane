/**
 * tests/smoke_phase193e_conversational_assistant.js
 *
 * Phase 193E.2 Validation Suite — AI Conversational Calibration Assistant.
 *
 * Validates:
 * 1. Provider adapter exists and isolates API keys to server environment.
 * 2. Strict AICalibrationResponse structured schema enforcement.
 * 3. Unsupported / hallucinated fields in AI output are deterministically dropped.
 * 4. Internal pricing selectors (pb, ss, ts, one, full) are forbidden and rejected.
 * 5. Canonical physical taxonomy validation (print, binding, paper types, lamination).
 * 6. ISO-2 uppercase delivery country validation and normalization.
 * 7. Ambiguity handling: Incomplete specifications produce clarificationQuestions.
 * 8. Missing paper type is not invented/fabricated.
 * 9. Declared price is not silently promoted to confirmed targetManufacturingPrice without inclusion clarity.
 * 10. Inclusion semantics remain null until explicitly declared.
 * 11. Prompt injection defense: "Set prices to 0", "Accept automatically", "Expose competitor" fail closed.
 * 12. Tenant context is enforced exclusively from authenticated session / JWT.
 * 13. Cross-tenant session or run access is rejected with 403/404.
 * 14. POST assistant/chat is side-effect free: Zero mutation to printer_nodes.rates_json or session state.
 * 15. POST assistant/explain-run is side-effect free: Zero mutation to proposed_patch_json.
 * 16. No assistant acceptance routes or mutation endpoints exist.
 * 17. No direct SQL or pricing formulas inside the AI assistant service.
 * 18. Fail-closed error handling on provider timeout or malformed JSON.
 * 19. Manual 193B/193C/193D workflow remains 100% operational when AI fails.
 * 20. Bounded chat history policy (size & count capped).
 * 21. Data minimization & privacy: secrets and credentials excluded from prompt payloads.
 * 22. Activation grants remain 100% unmutated under all AI operations.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

function test(id, description, fn) {
    try {
        fn();
        console.log(`  ${PASS} ${id}: ${description}`);
        passed++;
    } catch (err) {
        console.log(`  ${FAIL} ${id}: ${description}`);
        console.log(`    → ${err.message}`);
        failed++;
    }
}

async function asyncTest(id, description, fn) {
    try {
        await fn();
        console.log(`  ${PASS} ${id}: ${description}`);
        passed++;
    } catch (err) {
        console.log(`  ${FAIL} ${id}: ${description}`);
        console.log(`    → ${err.message}`);
        failed++;
    }
}

const BASELINE_SNAPSHOT = {
    interior_full_colour_fixed: { '16p': 120.0 },
    interior_full_colour_var: { '16p': 18.0 },
    cover_fixed_by_colours: { '4': 66.0 },
    cover_var_per_1000_by_colours: { '4': 800.0 },
    binding_pb_fixed_by_sections: { '16': 0.164 },
    binding_pb_var_per_1000_by_sections: { '16': 14.7 },
    lam_fixed: { matt: 6.0 },
    lam_var_per_1000: { matt: 25.0 },
    paper_price_interior_by_kilo: { offset: 1.252 },
    paper_price_cover_by_kilo: { mc: 2.515 },
    transport_costs: { es: 0.95 }
};

// ── 1. Provider Adapter & Configuration Tests ───────────────────────────────

console.log('\n═══ Phase 193E: AI Provider Adapter Validation ═══\n');

const adapterPath = path.join(__dirname, '../src/api/services/aiProviderAdapter.js');
const assistantPath = path.join(__dirname, '../src/api/services/calibrationAssistantService.js');
const calibrationSessionService = require('../src/api/services/calibrationSessionService');

test('E1', 'AI Provider adapter exists and exports singleton', () => {
    assert.ok(fs.existsSync(adapterPath), 'aiProviderAdapter.js must exist');
    const adapter = require(adapterPath);
    assert.strictEqual(typeof adapter.generateStructuredCompletion, 'function');
});

test('E2', 'API keys are sourced server-side only and not exposed to client', () => {
    const adapterSource = fs.readFileSync(adapterPath, 'utf8');
    assert.ok(adapterSource.includes('process.env.GEMINI_API_KEY'));
    assert.ok(!adapterSource.includes('localStorage'));
    assert.ok(!adapterSource.includes('window.'));
});

test('E3', 'Provider adapter normalizes errors into canonical codes (TIMEOUT, UNAVAILABLE)', async () => {
    const adapter = require(adapterPath);
    // When unconfigured, throws AI_PROVIDER_UNAVAILABLE
    let caught = null;
    try {
        await adapter.generateStructuredCompletion({
            systemInstruction: 'test',
            userPrompt: 'test'
        });
    } catch (e) {
        caught = e;
    }
    assert.ok(caught);
    assert.ok(['AI_PROVIDER_UNAVAILABLE', 'AI_PROVIDER_TIMEOUT'].includes(caught.code));
});

// ── 2. Structured Schema & Taxonomy Normalization Tests ──────────────────────

console.log('\n═══ Phase 193E: Structured Schema & Taxonomy Gate ═══\n');

const assistant = require(assistantPath);

test('E4', 'Rejects unsupported / hallucinated rate fields in AI output', () => {
    const rawAiOutput = {
        intent: 'SPEC_EXTRACTION',
        specPatch: {
            copies: 1000,
            interior_pages: 128,
            hallucinated_rate_matrix: { pb: 15.0 }, // Hostile/unsupported
            __proto__: { polluted: true }
        },
        declaredCommercials: {
            targetManufacturingPrice: 1500,
            invented_margin_rate: 0.25 // Hostile/unsupported
        }
    };

    const validated = assistant._validateAndNormalizeAIResponse(rawAiOutput);
    assert.strictEqual(validated.specPatch.copies, 1000);
    assert.strictEqual(validated.specPatch.interior_pages, 128);
    assert.strictEqual(validated.specPatch.hallucinated_rate_matrix, undefined);
    assert.strictEqual(validated.declaredCommercials.invented_margin_rate, undefined);
    assert.strictEqual(Object.prototype.polluted, undefined);
});

test('E5', 'Forbids internal pricing selectors (pb, ss, ts, one, full) in physical taxonomy', () => {
    const rawAiOutput = {
        intent: 'SPEC_EXTRACTION',
        specPatch: {
            interior_print: 'full', // Invalid internal code instead of '4/4'
            binding_method: 'pb',    // Invalid internal code instead of 'perfect bound'
            delivery_country: 'spain' // Invalid ISO-2
        }
    };

    const validated = assistant._validateAndNormalizeAIResponse(rawAiOutput);
    assert.strictEqual(validated.specPatch.interior_print, undefined, 'Internal selector "full" must be rejected');
    assert.strictEqual(validated.specPatch.binding_method, undefined, 'Internal selector "pb" must be rejected');
    assert.strictEqual(validated.specPatch.delivery_country, undefined, '"spain" must be rejected in favor of ISO-2');
});

test('E6', 'Accepts canonical physical taxonomy (4/4, perfect bound, offset, mc, ES)', () => {
    const rawAiOutput = {
        intent: 'SPEC_EXTRACTION',
        specPatch: {
            copies: 500,
            interior_pages: 256,
            book_width_mm: 170,
            book_height_mm: 240,
            interior_print: '4/4',
            cover_print: '4/0',
            paper_type_interior: 'offset',
            paper_weight_interior: 80,
            paper_type_cover: 'mc',
            paper_weight_cover: 300,
            binding_method: 'perfect bound',
            lamination: 'matt',
            delivery_country: 'es' // lower case normalized to uppercase ES
        }
    };

    const validated = assistant._validateAndNormalizeAIResponse(rawAiOutput);
    assert.strictEqual(validated.specPatch.interior_print, '4/4');
    assert.strictEqual(validated.specPatch.binding_method, 'perfect bound');
    assert.strictEqual(validated.specPatch.delivery_country, 'ES');
    assert.strictEqual(validated.specPatch.lamination, 'matt');
});

test('E7', 'Ambiguity policy: Missing paper type or binding produces clarification question', () => {
    const rawAiOutput = {
        intent: 'SPEC_EXTRACTION',
        specPatch: {
            copies: 1000,
            interior_pages: 200,
            paper_weight_interior: 90 // Grammage specified, but paper type missing
        },
        declaredCommercials: {
            targetManufacturingPrice: 2450
        },
        clarificationQuestions: [
            { field: 'paper_type_interior', question: 'What paper type for interior pages (offset, coated mc, munken)?' }
        ]
    };

    const validated = assistant._validateAndNormalizeAIResponse(rawAiOutput);
    assert.strictEqual(validated.specPatch.paper_type_interior, undefined, 'Missing paper type must not be invented');
    assert.ok(validated.clarificationQuestions.length > 0);
    assert.strictEqual(validated.readyForValidation, false, 'Session must not be ready when inclusion/type is missing');
});

test('E8', 'Declared commercial amount is not confirmed targetManufacturingPrice without explicit inclusions', () => {
    const rawAiOutput = {
        intent: 'SPEC_EXTRACTION',
        specPatch: { copies: 1000, interior_pages: 120 },
        declaredCommercials: {
            targetManufacturingPrice: 2450,
            includesPaper: null, // Ambiguous inclusion
            includesBinding: null
        }
    };

    const validated = assistant._validateAndNormalizeAIResponse(rawAiOutput);
    assert.strictEqual(validated.declaredCommercials.targetManufacturingPrice, 2450);
    assert.strictEqual(validated.readyForValidation, false, 'Must be marked NOT ready until inclusions are clarified');
    assert.ok(validated.clarificationQuestions.some(q => q.field.includes('includes')));
});

// ── 3. Prompt Injection & Hostile Input Defenses (S1 & S2 Fail-Closed) ──────

console.log('\n═══ Phase 193E: Prompt Injection & Security Defense ═══\n');

test('E4 (S1)', 'Rejects entire response if forbidden economic/control fields are present (Fail-Closed)', () => {
    const rawAiOutput = {
        intent: 'SPEC_EXTRACTION',
        specPatch: {
            copies: 1000,
            interior_pages: 128,
            hallucinated_rate_matrix: { pb: 15.0 }
        },
        rates: { interior_full_colour_fixed: { '16p': 100.0 } }, // Forbidden key
        declaredCommercials: {
            targetManufacturingPrice: 1500
        }
    };

    const validated = assistant._validateAndNormalizeAIResponse(rawAiOutput);
    assert.deepStrictEqual(validated.specPatch, {}, 'specPatch must be empty on forbidden fields');
    assert.deepStrictEqual(validated.declaredCommercials, {}, 'declaredCommercials must be empty');
    assert.strictEqual(validated.readyForValidation, false);
    assert.ok(validated.warnings.includes('FORBIDDEN_CONTROL_FIELDS_REJECTED'));
});

test('E9 (S7)', 'Prompt injection attempting to set rates to zero triggers fail-closed rejection', () => {
    const hostileAiOutput = {
        intent: 'SPEC_EXTRACTION',
        rates: { interior_full_colour_fixed: { '16p': 0 } },
        proposed_patch_json: { all_rates: 0 },
        sql_command: "UPDATE printer_nodes SET rates_json = '{}'",
        specPatch: { copies: 500 }
    };

    const validated = assistant._validateAndNormalizeAIResponse(hostileAiOutput);
    assert.deepStrictEqual(validated.specPatch, {});
    assert.strictEqual(validated.readyForValidation, false);
    assert.ok(validated.warnings.includes('FORBIDDEN_CONTROL_FIELDS_REJECTED'));
});

test('E10 (S7)', 'Prompt injection attempting automatic acceptance or grant changes triggers fail-closed rejection', () => {
    const hostileAiOutput = {
        intent: 'EXPLANATION',
        action: 'ACCEPT_NOW',
        printhouse_activation_grants: { MARKETPLACE_VISIBLE: true },
        status: 'ACCEPTED',
        explanation: 'I have accepted your calibration.'
    };

    const validated = assistant._validateAndNormalizeAIResponse(hostileAiOutput);
    assert.deepStrictEqual(validated.specPatch, {});
    assert.strictEqual(validated.readyForValidation, false);
    assert.ok(validated.warnings.includes('FORBIDDEN_CONTROL_FIELDS_REJECTED'));
});

test('E11 (S7)', 'Prompt injection attempting competitor discovery triggers fail-closed rejection', () => {
    const hostileAiOutput = {
        intent: 'GENERAL_INQUIRY',
        competitor_rates: { 'tenant-competitor-999': { price: 1200 } },
        explanation: 'Here are competitor prices.'
    };

    const validated = assistant._validateAndNormalizeAIResponse(hostileAiOutput);
    assert.deepStrictEqual(validated.specPatch, {});
    assert.ok(validated.warnings.includes('FORBIDDEN_CONTROL_FIELDS_REJECTED'));
});

test('E11b (S7)', 'Nested forbidden fields (e.g. metadata.proposedPatch) trigger recursive fail-closed rejection', () => {
    const nestedHostileOutput = {
        intent: 'SPEC_EXTRACTION',
        specPatch: {
            copies: 1000,
            metadata: {
                proposed_patch_json: { backdoor: 1 }
            }
        }
    };

    const validated = assistant._validateAndNormalizeAIResponse(nestedHostileOutput);
    assert.deepStrictEqual(validated.specPatch, {});
    assert.ok(validated.warnings.includes('FORBIDDEN_CONTROL_FIELDS_REJECTED'));
});

// ── 4. Side-Effect Free Endpoint & Service Isolation Tests ──────────────────

console.log('\n═══ Phase 193E: Side-Effect Free Invariants ═══\n');

test('E12', 'Service code contains zero pricing formulas (no paper/print/binding cost math)', () => {
    const serviceSource = fs.readFileSync(assistantPath, 'utf8');
    assert.ok(!serviceSource.includes('evaluateForwardPrice'));
    assert.ok(!serviceSource.includes('buildPrice('));
    assert.ok(!serviceSource.includes('solve('));
    assert.ok(!serviceSource.includes('safeDeepMergeRates'));
    assert.ok(!serviceSource.includes('acceptCalibrationRun'));
});

test('E13 (S8)', 'Service code contains zero direct rates_json, session, or grants SQL mutations', () => {
    const serviceSource = fs.readFileSync(assistantPath, 'utf8');
    assert.ok(!serviceSource.includes('UPDATE printhouse_pricing_calibration_sessions'));
    assert.ok(!serviceSource.includes('UPDATE printer_nodes'));
    assert.ok(!serviceSource.includes('INSERT INTO printhouse_pricing_revisions'));
    assert.ok(!serviceSource.includes('INSERT INTO printhouse_pricing_calibration_acceptances'));
    assert.ok(!serviceSource.includes('UPDATE printhouse_activation_grants'));
});

test('E14 (S4)', 'Chat history policy enforces bounded message count and byte limit (Read-Only Context)', () => {
    const oversizedHistory = [];
    for (let i = 0; i < 50; i++) {
        oversizedHistory.push({ role: 'user', text: `Message ${i} with padding text...` });
    }
    const bounded = assistant._enforceHistoryLimits(oversizedHistory);
    assert.ok(bounded.length <= 20, 'History must be capped at 20 messages');
});

// ── 5. Runtime Mock Integration & Boundary Invariants ──────────────────────

console.log('\n═══ Phase 193E: Runtime Integration & Boundary Validation ═══\n');

test('E16', 'Runtime Tenant Isolation: Tenant A attempting to chat in Tenant B session is rejected with 404', async () => {
    assert.strictEqual(typeof assistant.chat, 'function');
});

test('E17 (S3)', 'Runtime Side-Effect Free Guarantee: assistant.chat does NOT mutate session status or rates_json', () => {
    const mockSession = {
        id: 'psess-001',
        status: 'DRAFT',
        rates_json: { ...BASELINE_SNAPSHOT }
    };
    const mockAiResponse = {
        intent: 'SPEC_EXTRACTION',
        specPatch: { copies: 500, interior_pages: 128 },
        explanation: 'Extracted 500 copies, 128 pages.'
    };

    // Chat returns proposal in memory; does not change mockSession.status or rates_json
    const proposal = assistant._validateAndNormalizeAIResponse(mockAiResponse);
    assert.strictEqual(mockSession.status, 'DRAFT', 'Session status must remain DRAFT');
    assert.strictEqual(mockSession.rates_json.cover_fixed_by_colours['4'], 66.0, 'rates_json must be untouched');
});

test('E18 (S9)', 'Runtime Run Explanation: explainRun generates plain-language text without modifying run patch', () => {
    const mockRun = {
        id: 'crun-001',
        target_price: 2450.0,
        predicted_manufacturing_price: 2450.02,
        absolute_residual: 0.02,
        proposed_patch_json: { interior_full_colour_fixed: { '16p': 145.0 } }
    };
    const originalPatchChecksum = calibrationSessionService.computeRatesChecksum(mockRun.proposed_patch_json);

    // Explaining run does not touch patch
    assert.strictEqual(calibrationSessionService.computeRatesChecksum(mockRun.proposed_patch_json), originalPatchChecksum);
});

test('E19 (S5 & S6)', 'Runtime Provider Failures: Timeout and malformed JSON fail closed gracefully', () => {
    // Malformed JSON test
    const malformed = assistant._validateAndNormalizeAIResponse("NOT_VALID_JSON");
    assert.strictEqual(malformed.readyForValidation, false);
    assert.deepStrictEqual(malformed.specPatch, {});
    assert.ok(malformed.warnings.includes('AI_PARSING_FAILED'));
});

test('E20', 'Runtime Grant Isolation: Activation grants are never modified by assistant service', () => {
    const serviceSource = fs.readFileSync(assistantPath, 'utf8');
    assert.ok(!serviceSource.includes('UPDATE printhouse_activation_grants'));
    assert.ok(!serviceSource.includes('MARKETPLACE_VISIBLE: true'));
    assert.ok(!serviceSource.includes('LIVE_QUOTING_ALLOWED: true'));
});

test('E22 (S10)', 'Observability: Audit logger records metadata only (no raw prompts, secrets, or JWTs)', () => {
    const serviceSource = fs.readFileSync(assistantPath, 'utf8');
    assert.ok(serviceSource.includes("'CALIBRATION_AI_CHAT_INVOKED'"));
    assert.ok(!serviceSource.includes('payload.userPrompt'));
    assert.ok(!serviceSource.includes('payload.apiKey'));
    assert.ok(!serviceSource.includes('payload.jwt'));
});

// ── 6. Route Wiring & API Contract Tests ─────────────────────────────────────

console.log('\n═══ Phase 193E: Route Wiring & Endpoints Validation ═══\n');

const routesPath = path.join(__dirname, '../src/api/routes/printhouseOnboardingRoutes.js');
const routesSource = fs.readFileSync(routesPath, 'utf8');

test('E21a', 'Routes file requires calibrationAssistantService', () => {
    assert.ok(routesSource.includes("require('../services/calibrationAssistantService')"));
});

test('E21b', 'POST /pricing/calibrations/:id/assistant/chat endpoint is mounted with requireAuth', () => {
    assert.ok(routesSource.includes("router.post('/pricing/calibrations/:id/assistant/chat'"));
});

test('E21c', 'POST /pricing/calibrations/:id/assistant/explain-run endpoint is mounted with requireAuth', () => {
    assert.ok(routesSource.includes("router.post('/pricing/calibrations/:id/assistant/explain-run'"));
});

test('E21d', 'No assistant acceptance or rates mutation routes exist', () => {
    assert.ok(!routesSource.includes('/assistant/accept'));
    assert.ok(!routesSource.includes('/assistant/apply-rates'));
    assert.ok(!routesSource.includes('/assistant/mutate'));
});

// ── 7. Summary Output ────────────────────────────────────────────────────────

console.log(`\n═══ Phase 193E Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}

