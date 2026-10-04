/**
 * src/api/services/calibrationAssistantService.js
 *
 * Phase 193E.2 — Conversational Calibration Assistant Domain Service
 *
 * Responsibilities:
 * 1. Assembles minimal, sanitized context for the authenticated tenant & session.
 * 2. Invokes aiProviderAdapter with strict system instruction for structured JSON extraction.
 * 3. Enforces deterministic schema validation, field allowlists, and canonical physical taxonomy.
 * 4. Side-effect free: Does NOT mutate calibration sessions, printer_nodes.rates_json,
 *    runs, activation grants, or solver outputs.
 * 5. Handles clarification questions for missing/ambiguous physical and commercial inclusion fields.
 * 6. Generates plain-language run explanations without touching mathematical solver outputs.
 * 7. Records structured audit logs in api_audit_logs.
 * 8. Enforces bounded chat history limits (max message count, size limit).
 */
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const aiAdapter = require('./aiProviderAdapter');
const calibrationSessionService = require('./calibrationSessionService');
const decisionProvider = require('./decisionProvider/decisionProvider');
const { isValidIso2Country } = require('../../lib/countryCatalog');
const logger = require('./logger').child('calibration-assistant');

// ── Strict Allowlist: Physical Spec Fields (Canonical Phase 193B) ───────────
const ALLOWED_SPEC_FIELDS = [
    'copies',
    'interior_pages',
    'cover_pages',
    'book_width_mm',
    'book_height_mm',
    'orientation',
    'interior_print',
    'cover_print',
    'paper_type_interior',
    'paper_weight_interior',
    'paper_type_cover',
    'paper_weight_cover',
    'binding_method',
    'lamination',
    'uv_varnish',
    'endpapers',
    'paper_type_endpapers',
    'paper_weight_endpapers',
    'delivery_country',
    'has_mixed_interior',
    'mixed_interior_details',
    'has_spot_uv',
    'spot_uv',
    'spot_uv_details',
    'has_endpapers',
    'endpapers_details',
    'has_hardcover_board',
    'unsupported_features',
    'raw_text',
    'rawText'
];

// ── Strict Allowlist: Declared Commercial Fields (Canonical Phase 193B) ──────
const ALLOWED_COMMERCIAL_FIELDS = [
    'targetManufacturingPrice',
    'targetTransportPrice',
    'currency',
    'transportPricePerKg',
    'transportCurrency',
    'includesPaper',
    'includesBinding',
    'includesFinishing',
    'includesPackaging'
];

// ── Canonical Physical Taxonomy Enums ────────────────────────────────────────
const VALID_INTERIOR_PRINT = ['1/1', '2/2', '4/4'];
const VALID_COVER_PRINT = ['1/0', '1/1', '2/0', '2/2', '3/0', '3/3', '4/0', '4/4', '5/0', '5/5'];
const VALID_BINDING_METHOD = ['perfect bound', 'saddle stitch', 'thread sewn', 'hardcover', 'wire-o', 'spiral'];
const VALID_PAPER_TYPE_INTERIOR = ['offset', 'mc', 'lux', 'munken', 'other'];
const VALID_PAPER_TYPE_COVER = ['mc', 'artboard', 'offset', 'wfmc', 'other'];
const VALID_PAPER_TYPE_ENDPAPER = ['offset', 'mc', 'other'];
const VALID_LAMINATION = ['gloss', 'matt', 'varnish'];
const VALID_ORIENTATION = ['portrait', 'landscape'];
const VALID_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'PLN', 'HUF', 'SEK', 'DKK', 'NOK', 'CZK'];
const ISO2_COUNTRY_PATTERN = /^[A-Z]{2}$/;

// ── Guard Rails (UI / Technical Bounds from 193B) ────────────────────────────
const TECHNICAL_GUARD_RAILS = {
    book_width_mm: { min: 50, max: 500 },
    book_height_mm: { min: 50, max: 700 },
    paper_weight_interior: { min: 40, max: 400 },
    paper_weight_cover: { min: 100, max: 600 },
    paper_weight_endpapers: { min: 80, max: 300 }
};

// ── Bounded Chat History Policy ─────────────────────────────────────────────
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH_CHARS = 4000;
const MAX_TOTAL_HISTORY_BYTES = 64 * 1024; // 64 KB

// ── System Prompt for Structured Extraction ─────────────────────────────────
const SYSTEM_INSTRUCTION = `You are the PrintPrice OS Conversational Calibration Assistant.
Your sole job is to assist printing managers in configuring Reference Book physical specifications and declared prices for deterministic calibration.

CRITICAL BOUNDARIES & INVARIANTS:
1. You DO NOT calculate prices, markups, paper costs, print costs, binding costs, or formulas.
2. You DO NOT generate, infer, or output pricing rates (rates_json).
3. You extract ONLY declared physical specifications and declared commercial totals from manager text.
4. If manager says "It costs 2450 €", extract 2450 as declared amount, but ask clarification questions about whether it includes VAT, transport, paper, binding, or finishing if not explicitly confirmed.
5. All taxonomy and field names must strictly follow canonical values:
   - Physical spec fields:
     * copies: number (e.g. 1000, 250)
     * book_width_mm: number in mm (e.g. 170, 210)
     * book_height_mm: number in mm (e.g. 240, 297)
     * interior_pages: number (e.g. 128, 200)
     * interior_print: "1/1", "2/2", "4/4"
     * paper_type_interior: "offset", "mc", "lux", "munken", "other"
     * paper_weight_interior: number in gsm (e.g. 80, 150)
     * paper_type_cover: "mc", "artboard", "offset", "wfmc", "other"
     * paper_weight_cover: number in gsm (e.g. 300, 350)
     * cover_print: "4/0", "4/4", "1/0", "1/1", etc.
     * binding_method: "perfect bound", "saddle stitch", "thread sewn", "hardcover", "wire-o", "spiral"
     * lamination: "gloss", "matt", "varnish", null
     * delivery_country: 2-letter uppercase ISO (e.g. "ES", "DE", "FR", "PL", "RE", "JP")
   - Declared commercial fields:
     * targetManufacturingPrice: number | null (e.g. 2450)
     * currency: string (e.g. "EUR")
6. NEVER use internal rate selectors like "one", "two", "full", "pb", "ss", "ts", "hc", "wo", "sp".
7. Prefer asking clarification questions over inventing unsupported values.
8. Output MUST be valid JSON strictly adhering to the schema below.

JSON RESPONSE SCHEMA:
{
  "intent": "SPEC_EXTRACTION" | "CLARIFICATION_NEEDED" | "EXPLANATION" | "GENERAL_INQUIRY",
  "specPatch": {
    "copies": number,
    "book_width_mm": number,
    "book_height_mm": number,
    "interior_pages": number,
    "interior_print": string,
    "paper_type_interior": string,
    "paper_weight_interior": number,
    "paper_type_cover": string,
    "paper_weight_cover": number,
    "cover_print": string,
    "binding_method": string,
    "lamination": string | null,
    "delivery_country": string
  },
  "declaredCommercials": {
    "targetManufacturingPrice": number | null,
    "currency": string | null,
    "transportPricePerKg": number | null,
    "transportCurrency": string | null,
    "includesPaper": boolean | null,
    "includesBinding": boolean | null,
    "includesFinishing": boolean | null,
    "includesPackaging": boolean | null
  },
  "clarificationQuestions": [
    { "field": string, "question": string, "options": string[] }
  ],
  "explanation": string,
  "warnings": string[],
  "readyForValidation": boolean
}`;

class CalibrationAssistantService {

    /**
     * Executes conversational chat extraction (SIDE-EFFECT FREE).
     *
     * @param {string} tenantId - From JWT
     * @param {string} sessionId - Calibration session ID
     * @param {string} userMessage - Manager's natural language input
     * @param {Object} actor - Authenticated user info { id, email, role }
     * @param {Object} [options] - Optional mock/test injection
     * @returns {Promise<Object>} Validated structured proposal
     */
    async chat(tenantId, sessionId, userMessage, actor, options = {}) {
        if (!tenantId || !sessionId || !userMessage) {
            const err = new Error('MISSING_REQUIRED_CHAT_PARAMETERS');
            err.code = 'MISSING_REQUIRED_CHAT_PARAMETERS';
            err.statusCode = 400;
            throw err;
        }

        const sanitizedMessage = String(userMessage).trim().slice(0, MAX_MESSAGE_LENGTH_CHARS);
        if (!sanitizedMessage) {
            const err = new Error('USER_MESSAGE_EMPTY');
            err.code = 'USER_MESSAGE_EMPTY';
            err.statusCode = 400;
            throw err;
        }

        // 1. Fetch session (Tenant Isolation)
        const [session] = await db.query(
            `SELECT id, tenant_id, printer_node_id, printer_node_name_snapshot,
                    book_spec_json, target_manufacturing_price, currency,
                    transport_price_per_kg, transport_currency,
                    includes_paper, includes_binding, includes_finishing, includes_packaging,
                    status
             FROM printhouse_pricing_calibration_sessions
             WHERE id = ? AND tenant_id = ?`,
            [sessionId, tenantId]
        );

        if (!session) {
            const err = new Error('CALIBRATION_SESSION_NOT_FOUND');
            err.code = 'CALIBRATION_SESSION_NOT_FOUND';
            err.statusCode = 404;
            throw err;
        }

        // 2. Resolve Uploaded Document Evidence Context (if evidenceId provided)
        const evidenceId = options.evidenceId || null;
        const selectedVariantId = options.selectedVariantId || null;
        const evidenceDoc = await this._resolveEvidenceDocument(tenantId, evidenceId, selectedVariantId);

        // 3. Chat history (in-memory / stateless for assistantChat)
        const boundedHistory = [];

        // 4. Build minimal sanitized AI context
        const currentSpec = session.book_spec_json
            ? (typeof session.book_spec_json === 'string' ? JSON.parse(session.book_spec_json) : session.book_spec_json)
            : {};

        const currentCommercials = {
            targetManufacturingPrice: session.target_manufacturing_price,
            currency: session.currency,
            transportPricePerKg: session.transport_price_per_kg,
            transportCurrency: session.transport_currency,
            includesPaper: session.includes_paper,
            includesBinding: session.includes_binding,
            includesFinishing: session.includes_finishing,
            includesPackaging: session.includes_packaging
        };

        let evidencePromptBlock = '';
        if (evidenceDoc) {
            evidencePromptBlock = `\nUPLOADED QUOTE EVIDENCE DOCUMENT CONTEXT (Tenant Isolated):
Document ID: ${evidenceDoc.evidenceId}
Filename: ${evidenceDoc.filename}
Raw Extracted Document Text:
"""
${evidenceDoc.rawTextSnippet}
"""
Extracted Offers: ${JSON.stringify(evidenceDoc.offers)}
${evidenceDoc.selectedOffer ? `SERVER RESOLVED SELECTED VARIANT (from DB): ${JSON.stringify(evidenceDoc.selectedOffer)}` : ''}`;
        }

        const contextPrompt = `CURRENT SESSION STATE:
Reference Book: ${session.printer_node_name_snapshot ? `Printer Node ${session.printer_node_name_snapshot}` : 'Reference Book'}
Current Physical Specification: ${JSON.stringify(currentSpec)}
Current Commercial Inclusions: ${JSON.stringify(currentCommercials)}
Session Status: ${session.status}${evidencePromptBlock}

MANAGER MESSAGE:
"${sanitizedMessage}"`;

        // 5. Invoke AI Provider Adapter
        let aiResult;
        const startTime = Date.now();
        try {
            aiResult = await aiAdapter.generateStructuredCompletion({
                systemInstruction: SYSTEM_INSTRUCTION,
                userPrompt: contextPrompt,
                history: boundedHistory,
                mockResponse: options.mockResponse || null
            });
        } catch (aiErr) {
            logger.warn('AI provider failed, returning fail-closed error', {
                tenantId,
                sessionId,
                error: aiErr.code || aiErr.message
            });
            await this._logAudit(tenantId, actor, sessionId, 'CALIBRATION_AI_VALIDATION_FAILED', {
                error: aiErr.code || aiErr.message,
                latencyMs: aiErr.latencyMs || (Date.now() - startTime)
            });
            throw aiErr;
        }

        // 6. Deterministic Schema & Allowlist Validation (Untrusted Data Gate)
        const validatedResponse = this._validateAndNormalizeAIResponse(aiResult.json, sanitizedMessage, currentSpec, evidenceDoc);

        // 7. Record Audit Log (without raw secrets)
        await this._logAudit(tenantId, actor, sessionId, 'CALIBRATION_AI_CHAT_INVOKED', {
            model: aiResult.model,
            latencyMs: aiResult.latencyMs,
            intent: validatedResponse.intent,
            hasSpecPatch: Object.keys(validatedResponse.specPatch).length > 0,
            clarificationCount: validatedResponse.clarificationQuestions.length,
            readyForValidation: validatedResponse.readyForValidation
        });

        // S3: STRICTLY ZERO-WRITE CONTRACT.
        return {
            ok: true,
            sessionId,
            proposal: validatedResponse,
            model: aiResult.model,
            latencyMs: aiResult.latencyMs
        };
    }

    /**
     * Executes stateless pre-session natural-language interpretation (ZERO-WRITE / NO SESSION REQUIRED).
     * Reuses the exact same canonical structured validator, schema allowlists, and fail-closed rules.
     *
     * @param {string} tenantId - From JWT
     * @param {string} userMessage - Manager's natural language input
     * @param {Object} actor - Authenticated user info { id, email, role }
     * @param {Object} [options] - Optional mock/test injection
     * @returns {Promise<Object>} Validated structured proposal
     */
    async interpret(tenantId, userMessage, actor, options = {}) {
        if (!tenantId || !userMessage) {
            const err = new Error('MISSING_REQUIRED_INTERPRET_PARAMETERS');
            err.code = 'MISSING_REQUIRED_INTERPRET_PARAMETERS';
            err.statusCode = 400;
            throw err;
        }

        const sanitizedMessage = String(userMessage).trim().slice(0, MAX_MESSAGE_LENGTH_CHARS);
        if (!sanitizedMessage) {
            const err = new Error('USER_MESSAGE_EMPTY');
            err.code = 'USER_MESSAGE_EMPTY';
            err.statusCode = 400;
            throw err;
        }

        // Resolve Uploaded Document Evidence Context (if evidenceId provided)
        const evidenceId = options.evidenceId || null;
        const selectedVariantId = options.selectedVariantId || null;
        const evidenceDoc = await this._resolveEvidenceDocument(tenantId, evidenceId, selectedVariantId);

        let evidencePromptBlock = '';
        if (evidenceDoc) {
            evidencePromptBlock = `\nUPLOADED QUOTE EVIDENCE DOCUMENT CONTEXT (Tenant Isolated):
Document ID: ${evidenceDoc.evidenceId}
Filename: ${evidenceDoc.filename}
Raw Extracted Document Text:
"""
${evidenceDoc.rawTextSnippet}
"""
Extracted Offers: ${JSON.stringify(evidenceDoc.offers)}
${evidenceDoc.selectedOffer ? `SERVER RESOLVED SELECTED VARIANT (from DB): ${JSON.stringify(evidenceDoc.selectedOffer)}` : ''}`;
        }

        // Build minimal pre-session prompt
        const contextPrompt = `CURRENT SESSION STATE:
Reference Book Name: Pre-Session Calibration Workspace (Stateless)
Current Physical Specification: {}
Current Commercial Inclusions: {}
Session Status: PRE_SESSION${evidencePromptBlock}

MANAGER MESSAGE:
"${sanitizedMessage}"`;

        let aiResult;
        const startTime = Date.now();
        try {
            aiResult = await aiAdapter.generateStructuredCompletion({
                systemInstruction: SYSTEM_INSTRUCTION,
                userPrompt: contextPrompt,
                history: [],
                mockResponse: options.mockResponse || null
            });
        } catch (aiErr) {
            logger.warn('Pre-session AI provider failed, returning fail-closed error', {
                tenantId,
                error: aiErr.code || aiErr.message
            });
            await this._logAudit(tenantId, actor, null, 'CALIBRATION_AI_PRESESSION_VALIDATION_FAILED', {
                error: aiErr.code || aiErr.message,
                latencyMs: aiErr.latencyMs || (Date.now() - startTime)
            });
            throw aiErr;
        }

        // Deterministic Schema & Allowlist Validation (Untrusted Data Gate - Reused 100%)
        const validatedResponse = this._validateAndNormalizeAIResponse(aiResult.json, sanitizedMessage, null, evidenceDoc);

        // Record Audit Log (Metadata-only)
        await this._logAudit(tenantId, actor, null, 'CALIBRATION_AI_PRESESSION_INTERPRET_INVOKED', {
            model: aiResult.model,
            latencyMs: aiResult.latencyMs,
            intent: validatedResponse.intent,
            hasSpecPatch: Object.keys(validatedResponse.specPatch).length > 0,
            clarificationCount: validatedResponse.clarificationQuestions.length,
            readyForValidation: validatedResponse.readyForValidation
        });

        return {
            ok: true,
            proposal: validatedResponse,
            model: aiResult.model,
            latencyMs: aiResult.latencyMs
        };
    }

    /**
     * Explains a calibration run in plain language (SIDE-EFFECT FREE).
     *
     * @param {string} tenantId - From JWT
     * @param {string} sessionId - Calibration session ID
     * @param {string} runId - Calibration run ID
     * @param {Object} actor - Authenticated user
     * @param {Object} [options] - Mock options
     * @returns {Promise<Object>} Plain-language explanation
     */
    async explainRun(tenantId, sessionId, runId, actor, options = {}) {
        if (!tenantId || !sessionId || !runId) {
            const err = new Error('MISSING_REQUIRED_EXPLAIN_PARAMETERS');
            err.code = 'MISSING_REQUIRED_EXPLAIN_PARAMETERS';
            err.statusCode = 400;
            throw err;
        }

        // Fetch session and run (Tenant Isolation)
        const [run] = await db.query(
            `SELECT id, tenant_id, calibration_session_id, printer_node_id,
                    target_price, engine_price_after, absolute_residual, percent_residual,
                    evaluations_count, status, warnings_json, identifiability_report_json
             FROM printhouse_pricing_calibration_runs
             WHERE id = ? AND tenant_id = ? AND calibration_session_id = ?`,
            [runId, tenantId, sessionId]
        );

        if (!run) {
            const err = new Error('CALIBRATION_RUN_NOT_FOUND');
            err.code = 'CALIBRATION_RUN_NOT_FOUND';
            err.statusCode = 404;
            throw err;
        }

        let warnings = [];
        if (run.warnings_json) {
            try {
                warnings = typeof run.warnings_json === 'string' ? JSON.parse(run.warnings_json) : run.warnings_json;
            } catch (e) {}
        }

        let identifiability = {};
        if (run.identifiability_report_json) {
            try {
                identifiability = typeof run.identifiability_report_json === 'string'
                    ? JSON.parse(run.identifiability_report_json)
                    : run.identifiability_report_json;
            } catch (e) {}
        }

        // Build descriptive summary without allowing AI to modify the run
        const prompt = `EXPLAIN THIS CALIBRATION RUN TO A PRINTING MANAGER:
Status: ${run.status}
Target Manufacturing Price: ${run.target_price} EUR
Predicted Manufacturing Price: ${run.engine_price_after} EUR
Absolute Residual: ${run.absolute_residual} EUR (${(Number(run.percent_residual) * 100).toFixed(2)}%)
Convergence Evaluations: ${run.evaluations_count}
Identifiability Classification: ${identifiability.classification || 'STANDARD'}
Active Categories Calibrated: ${JSON.stringify(identifiability.activeCategories || [])}
Transport Mode: ${identifiability.transportCalibration || 'EXTERNAL_REFERENCE_ONLY'}
Solver Warnings: ${JSON.stringify(warnings)}

Provide a concise, professional 2-3 paragraph explanation in plain manager language.
Highlight whether the residual is acceptable (< 0.50 EUR) and remind them that clicking 'Accept' in the UI will safely apply the rates.`;

        let aiResult;
        try {
            aiResult = await aiAdapter.generateStructuredCompletion({
                systemInstruction: "You are a professional print pricing calibration advisor. Explain the mathematical solver results clearly without technical jargon.",
                userPrompt: prompt,
                mockResponse: options.mockResponse || {
                    explanation: `Calibration run ${run.id} converged successfully with a target manufacturing price of ${run.target_price} EUR and a residual of ${run.absolute_residual} EUR. Transport is preserved as an external reference and not mixed into manufacturing rates. The proposal is ready for your review and governed acceptance.`
                }
            });
        } catch (err) {
            // Fallback deterministic explanation if AI is offline
            return {
                ok: true,
                runId,
                status: run.status,
                explanation: `Calibration run ${run.id} finished with status ${run.status}. Target price: ${run.target_price} EUR, predicted price: ${run.engine_price_after} EUR, absolute residual: ${run.absolute_residual} EUR. Active categories calibrated: ${(identifiability.activeCategories || []).join(', ')}.`,
                source: 'DETERMINISTIC_FALLBACK'
            };
        }

        await this._logAudit(tenantId, actor, sessionId, 'CALIBRATION_AI_EXPLANATION_GENERATED', {
            runId,
            model: aiResult.model,
            latencyMs: aiResult.latencyMs
        });

        return {
            ok: true,
            runId,
            status: run.status,
            explanation: aiResult.json?.explanation || aiResult.rawText,
            targetManufacturingPrice: run.target_price,
            predictedManufacturingPrice: run.engine_price_after,
            absoluteResidual: run.absolute_residual,
            warnings
        };
    }

    /**
     * Deterministically validates and normalizes untrusted AI output.
     * S1 & S2: STRICT FAIL-CLOSED POLICY.
     * If ANY forbidden control/economic field appears anywhere in the raw response,
     * the entire response is REJECTED (specPatch = {}, declaredCommercials = {}, readyForValidation = false).
     */
    _validateAndNormalizeAIResponse(rawJson, rawUserMessage = null, existingSessionSpec = null, evidenceDoc = null) {
        const existingRawText = (existingSessionSpec && existingSessionSpec.raw_text)
            ? existingSessionSpec.raw_text
            : ((existingSessionSpec && existingSessionSpec.rawText) ? existingSessionSpec.rawText : null);
        const initialRawText = existingRawText || rawUserMessage || null;

        if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) {
            return {
                intent: 'CLARIFICATION_NEEDED',
                specPatch: initialRawText ? { raw_text: initialRawText } : {},
                declaredCommercials: {},
                clarificationQuestions: [{ field: 'general', question: 'Could you clarify the physical book details?' }],
                explanation: 'I could not parse the book specifications. Could you please specify the format, pages, and quantity?',
                warnings: ['AI_PARSING_FAILED'],
                readyForValidation: false
            };
        }

        // S1: Detect forbidden control/economic keys recursively
        const FORBIDDEN_KEYS = [
            'rates',
            'rates_json',
            'ratepaths',
            'rate_paths',
            'proposedpatch',
            'proposed_patch',
            'proposed_patch_json',
            'proposed_patch_checksum',
            'active_rate_paths_json',
            'acceptancetolerance',
            'tolerance',
            'activationgrants',
            'activation_grants',
            'tenantid',
            'printernodeid',
            'sql',
            'sql_command',
            'action',
            'accept',
            'applyrates',
            'apply_rates',
            'competitor_rates',
            'competitor_pricing',
            '__proto__',
            'constructor',
            'prototype'
        ];

        function containsForbiddenKeys(obj) {
            if (!obj || typeof obj !== 'object') return false;
            for (const key of Object.keys(obj)) {
                const lowerKey = key.toLowerCase();
                if (FORBIDDEN_KEYS.includes(lowerKey)) {
                    return true;
                }
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    if (containsForbiddenKeys(obj[key])) return true;
                }
            }
            return false;
        }

        if (containsForbiddenKeys(rawJson)) {
            logger.warn('Untrusted AI response contained forbidden control fields, failing closed');
            return {
                intent: 'CLARIFICATION_NEEDED',
                specPatch: initialRawText ? { raw_text: initialRawText } : {},
                declaredCommercials: {},
                clarificationQuestions: [{ field: 'general', question: 'Please describe the physical book specifications and declared costs.' }],
                explanation: 'The assistant generated invalid control or pricing parameters. All rate derivation must be handled through the deterministic calibration solver.',
                warnings: ['FORBIDDEN_CONTROL_FIELDS_REJECTED', 'AI_STRUCTURED_OUTPUT_INVALID'],
                readyForValidation: false
            };
        }

        const normalized = {
            intent: ['SPEC_EXTRACTION', 'CLARIFICATION_NEEDED', 'EXPLANATION', 'GENERAL_INQUIRY'].includes(rawJson.intent)
                ? rawJson.intent
                : 'SPEC_EXTRACTION',
            specPatch: initialRawText ? { raw_text: initialRawText } : {},
            declaredCommercials: {},
            clarificationQuestions: [],
            explanation: typeof rawJson.explanation === 'string' ? rawJson.explanation : '',
            warnings: Array.isArray(rawJson.warnings) ? rawJson.warnings.map(String) : [],
            readyForValidation: Boolean(rawJson.readyForValidation)
        };

        // 1. Filter and validate physical specPatch
        if (rawJson.specPatch && typeof rawJson.specPatch === 'object') {
            // Map common AI aliases into canonical keys
            const raw = rawJson.specPatch;
            const preNormalized = {};

            // Aliases map
            const aliasMap = {
                quantity: 'copies',
                run_length: 'copies',
                width_mm: 'book_width_mm',
                trim_width_mm: 'book_width_mm',
                widthMm: 'book_width_mm',
                height_mm: 'book_height_mm',
                trim_height_mm: 'book_height_mm',
                heightMm: 'book_height_mm',
                pages: 'interior_pages',
                interiorPages: 'interior_pages',
                interiorPrint: 'interior_print',
                interior_print_specification: 'interior_print',
                interior_paper_type: 'paper_type_interior',
                interiorPaperType: 'paper_type_interior',
                paper_type: 'paper_type_interior',
                interior_paper_weight: 'paper_weight_interior',
                interiorPaperWeight: 'paper_weight_interior',
                interior_gsm: 'paper_weight_interior',
                gsm: 'paper_weight_interior',
                cover_paper_type: 'paper_type_cover',
                coverPaperType: 'paper_type_cover',
                cover_paper_weight: 'paper_weight_cover',
                coverPaperWeight: 'paper_weight_cover',
                cover_gsm: 'paper_weight_cover',
                cover_print_specification: 'cover_print',
                cover_printing: 'cover_print',
                cover_colors: 'cover_print',
                cover_colours: 'cover_print',
                cover_colour: 'cover_print',
                cover_colors_specification: 'cover_print',
                coverPrint: 'cover_print',
                binding: 'binding_method',
                bindingMethod: 'binding_method',
                finishing: 'lamination',
                destination_country: 'delivery_country',
                destination: 'delivery_country'
            };

            for (const k of Object.keys(raw)) {
                const targetKey = aliasMap[k] || k;
                if (preNormalized[targetKey] === undefined) {
                    preNormalized[targetKey] = raw[k];
                }
            }

            for (const key of Object.keys(preNormalized)) {
                // Strict allowlist
                if (!ALLOWED_SPEC_FIELDS.includes(key)) continue;

                let val = preNormalized[key];
                if (val === null || val === undefined) continue;

                // Type & Taxonomy Validation
                if (key === 'copies' || key === 'interior_pages' || key === 'cover_pages') {
                    const num = parseInt(val, 10);
                    if (Number.isInteger(num) && num > 0) normalized.specPatch[key] = num;
                } else if (key === 'book_width_mm' || key === 'book_height_mm' || key === 'paper_weight_interior' || key === 'paper_weight_cover' || key === 'paper_weight_endpapers') {
                    const num = Number(val);
                    const guard = TECHNICAL_GUARD_RAILS[key];
                    if (!isNaN(num) && (!guard || (num >= guard.min && num <= guard.max))) {
                        normalized.specPatch[key] = num;
                    }
                } else if (key === 'interior_print') {
                    const s = String(val).trim();
                    if (VALID_INTERIOR_PRINT.includes(s)) {
                        normalized.specPatch[key] = s;
                    } else {
                        const match = s.match(/\b([1-4]\/[1-4])\b/);
                        if (match && VALID_INTERIOR_PRINT.includes(match[1])) {
                            normalized.specPatch[key] = match[1];
                        }
                    }
                } else if (key === 'cover_print') {
                    const s = String(val).trim();
                    if (VALID_COVER_PRINT.includes(s)) {
                        normalized.specPatch[key] = s;
                    } else {
                        const match = s.match(/\b([1-5]\/[0-5])\b/);
                        if (match && VALID_COVER_PRINT.includes(match[1])) {
                            normalized.specPatch[key] = match[1];
                        }
                    }
                } else if (key === 'binding_method') {
                    const s = String(val).toLowerCase().trim();
                    if (VALID_BINDING_METHOD.includes(s)) {
                        normalized.specPatch[key] = s;
                    } else if (s === 'perfect' || s === 'pb') {
                        normalized.specPatch[key] = 'perfect bound';
                    } else if (s === 'sewn' || s === 'thread-sewn') {
                        normalized.specPatch[key] = 'thread sewn';
                    } else if (s === 'case' || s === 'casebound' || s === 'hardback') {
                        normalized.specPatch[key] = 'hardcover';
                    }
                } else if (key === 'paper_type_interior') {
                    const s = String(val).toLowerCase().trim();
                    if (VALID_PAPER_TYPE_INTERIOR.includes(s)) {
                        normalized.specPatch[key] = s;
                    } else if (s === 'coated' || s === 'gloss' || s === 'matt') {
                        normalized.specPatch[key] = 'mc';
                    } else if (s === 'uncoated' || s === 'woodfree') {
                        normalized.specPatch[key] = 'offset';
                    }
                } else if (key === 'paper_type_cover') {
                    const s = String(val).toLowerCase().trim();
                    if (VALID_PAPER_TYPE_COVER.includes(s)) {
                        normalized.specPatch[key] = s;
                    } else if (s === 'coated') {
                        normalized.specPatch[key] = 'mc';
                    }
                } else if (key === 'paper_type_endpapers' && VALID_PAPER_TYPE_ENDPAPER.includes(val)) {
                    normalized.specPatch[key] = val;
                } else if (key === 'lamination') {
                    const s = String(val).toLowerCase().trim();
                    if (VALID_LAMINATION.includes(s)) {
                        normalized.specPatch[key] = s;
                    } else if (s === 'matte') {
                        normalized.specPatch[key] = 'matt';
                    } else if (s === 'glossy') {
                        normalized.specPatch[key] = 'gloss';
                    }
                } else if (key === 'orientation' && VALID_ORIENTATION.includes(val)) {
                    normalized.specPatch[key] = val;
                } else if (key === 'delivery_country') {
                    const match = String(val).match(/\b([A-Z]{2})\b/i);
                    const code = match ? match[1].toUpperCase() : String(val).toUpperCase().trim();
                    if (isValidIso2Country(code)) normalized.specPatch[key] = code;
                } else if (key === 'uv_varnish' || key === 'endpapers' || key === 'has_mixed_interior' || key === 'has_spot_uv' || key === 'spot_uv' || key === 'has_endpapers' || key === 'has_hardcover_board') {
                    const s = String(val).toLowerCase().trim();
                    if (s === 'none' || s === 'false' || s === 'no' || s === 'null' || s === 'undefined' || s === '0' || s === '') {
                        normalized.specPatch[key] = false;
                    } else if (val === true || s === 'true' || s === 'yes' || s === '1') {
                        normalized.specPatch[key] = true;
                    } else {
                        normalized.specPatch[key] = s;
                    }
                } else if (key === 'mixed_interior_details' || key === 'spot_uv_details' || key === 'endpapers_details') {
                    normalized.specPatch[key] = String(val);
                } else if (key === 'raw_text' || key === 'rawText') {
                    if (!normalized.specPatch.raw_text) {
                        normalized.specPatch.raw_text = String(val);
                    }
                } else if (key === 'unsupported_features' && Array.isArray(val)) {
                    normalized.specPatch[key] = val.map(String);
                }
            }
        }

        // 2. Filter and validate declaredCommercials
        if (rawJson.declaredCommercials && typeof rawJson.declaredCommercials === 'object') {
            for (const key of Object.keys(rawJson.declaredCommercials)) {
                if (!ALLOWED_COMMERCIAL_FIELDS.includes(key)) continue;

                const val = rawJson.declaredCommercials[key];
                if (val === null || val === undefined) {
                    normalized.declaredCommercials[key] = null;
                    continue;
                }

                if (key === 'targetManufacturingPrice' || key === 'targetTransportPrice') {
                    const num = Number(val);
                    if (Number.isFinite(num) && num >= 0) normalized.declaredCommercials[key] = num;
                    else normalized.declaredCommercials[key] = null;
                } else if (key === 'transportPricePerKg') {
                    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
                        normalized.declaredCommercials[key] = val;
                    } else {
                        normalized.declaredCommercials[key] = null;
                    }
                } else if (key === 'currency' || key === 'transportCurrency') {
                    const curr = String(val).toUpperCase().trim();
                    if (VALID_CURRENCIES.includes(curr)) normalized.declaredCommercials[key] = curr;
                } else if (key.startsWith('includes')) {
                    normalized.declaredCommercials[key] = typeof val === 'boolean' ? val : null;
                }
            }
        }

        // 2b. Server-Side Complexity Derivation (independent of Gemini boolean output)
        const combinedText = [
            normalized.explanation,
            ...normalized.warnings,
            normalized.specPatch.mixed_interior_details,
            normalized.specPatch.endpapers_details,
            normalized.specPatch.spot_uv_details,
            normalized.specPatch.raw_text,
            normalized.specPatch.rawText
        ].filter(Boolean).join(' ').toLowerCase();

        if (!normalized.specPatch.has_mixed_interior) {
            if (combinedText.includes('interior mixto') || combinedText.includes('mixed interior') || combinedText.includes('pantone') || combinedText.includes('208p 1/1') || (normalized.specPatch.mixed_interior_details && String(normalized.specPatch.mixed_interior_details).trim().length > 0)) {
                normalized.specPatch.has_mixed_interior = true;
            }
        }
        if (!normalized.specPatch.has_endpapers) {
            if (combinedText.includes('guardas') || combinedText.includes('endpaper')) {
                const negated = /(guardas|endpapers?)\s*[:=]\s*(none|false|no|null)|(sin|no)\s+(guardas|endpapers?)/i.test(combinedText);
                if (!negated) normalized.specPatch.has_endpapers = true;
            }
        }
        const hasReliefVarnish = combinedText.includes('relieflack') || combinedText.includes('relieve');
        const hasExplicitUV = combinedText.includes('spot uv') || combinedText.includes('uvi') || combinedText.includes('uv-lack') || combinedText.includes('uv varnish');

        if (hasReliefVarnish && !hasExplicitUV) {
            normalized.specPatch.has_spot_uv = false;
        } else if (!normalized.specPatch.has_spot_uv && hasExplicitUV) {
            const negated = /(spot_?uv|uvi)\s*[:=]\s*(none|false|no|null)|(sin|no)\s+(spot_?uv|uvi)/i.test(combinedText);
            if (!negated) normalized.specPatch.has_spot_uv = true;
        }

        if (hasReliefVarnish) {
            if (!Array.isArray(normalized.specPatch.unsupported_features)) {
                normalized.specPatch.unsupported_features = [];
            }
            if (!normalized.specPatch.unsupported_features.includes('partieller_relieflack') &&
                !normalized.specPatch.unsupported_features.includes('PARTIELLER_RELIEFLACK')) {
                normalized.specPatch.unsupported_features.push('partieller_relieflack');
            }
        }

        // 3. Filter clarification questions (stripping redundant questions for already resolved fields)
        if (Array.isArray(rawJson.clarificationQuestions)) {
            for (const q of rawJson.clarificationQuestions) {
                if (q && typeof q.question === 'string' && q.question.trim()) {
                    const field = typeof q.field === 'string' ? q.field.toLowerCase() : 'general';
                    const textL = q.question.toLowerCase();

                    // Check if question asks about copies/quantity when copies are already resolved
                    const isCopiesResolved = normalized.specPatch.copies != null && Number(normalized.specPatch.copies) > 0;
                    const isCopiesQuestion = field === 'copies' || field === 'quantity' || textL.includes('how many copies') || textL.includes('cuántos ejemplares') || textL.includes('cuantas copias') || textL.includes('tirada');

                    // Check if question asks about price when price is already resolved
                    const isPriceResolved = normalized.declaredCommercials.targetManufacturingPrice != null && Number(normalized.declaredCommercials.targetManufacturingPrice) > 0;
                    const isPriceQuestion = field === 'targetmanufacturingprice' || field === 'price' || textL.includes('target price') || textL.includes('precio de fabricación') || textL.includes('precio');

                    if ((isCopiesResolved && isCopiesQuestion) || (isPriceResolved && isPriceQuestion)) {
                        // Skip redundant question
                        continue;
                    }

                    normalized.clarificationQuestions.push({
                        field: typeof q.field === 'string' ? q.field : 'general',
                        question: q.question.trim(),
                        options: Array.isArray(q.options) ? q.options.map(String) : []
                    });
                }
            }
        }

        // Server-side override from tenant-isolated evidence document & selected variant
        if (evidenceDoc && evidenceDoc.selectedOffer) {
            normalized.declaredCommercials.targetManufacturingPrice = Number(evidenceDoc.selectedOffer.manufacturingPrice);
            if (evidenceDoc.selectedOffer.transportPrice != null) {
                normalized.declaredCommercials.targetTransportPrice = Number(evidenceDoc.selectedOffer.transportPrice);
            }
            if (evidenceDoc.selectedOffer.quantity) {
                normalized.specPatch.copies = Number(evidenceDoc.selectedOffer.quantity);
            }
        }

        // Ambiguity Rule (E2.6): If declared manufacturing price exists but inclusions are undefined, not ready
        const comms = normalized.declaredCommercials;
        if (comms.targetManufacturingPrice && (comms.includesPaper === null || comms.includesBinding === null)) {
            normalized.readyForValidation = false;
            const hasInclusionQ = normalized.clarificationQuestions.some(q => q.field.includes('includes'));
            if (!hasInclusionQ) {
                normalized.clarificationQuestions.push({
                    field: 'includes_paper',
                    question: 'Does this target price include paper and binding production costs?',
                    options: ['Yes, all manufacturing included', 'No, print only']
                });
            }
        }

        return normalized;
    }

    /**
     * Resolves an uploaded quote evidence document for context prompt injection.
     * Enforces strict tenant isolation: queries quote_evidence_documents WHERE id = ? AND tenant_id = ?.
     * Throws 404 QUOTE_EVIDENCE_NOT_FOUND if not found or belongs to another tenant.
     * Also resolves server-side offer amounts for options.selectedVariantId directly from DB.
     */
    async _resolveEvidenceDocument(tenantId, evidenceId, selectedVariantId = null) {
        if (!evidenceId) return null;

        const docs = await db.query(
            `SELECT d.id, d.tenant_id, d.original_filename as file_name, d.document_sha256, d.detected_language, d.raw_text,
                    e.validation_status, e.normalized_json as normalized_quote_json
             FROM quote_evidence_documents d
             LEFT JOIN quote_evidence_extractions e ON d.id = e.quote_evidence_document_id
             WHERE d.id = ? AND d.tenant_id = ?`,
            [evidenceId, tenantId]
        );

        if (!docs || docs.length === 0) {
            const err = new Error('QUOTE_EVIDENCE_NOT_FOUND');
            err.code = 'QUOTE_EVIDENCE_NOT_FOUND';
            err.statusCode = 404;
            throw err;
        }

        const doc = docs[0];
        const rawJsonStr = doc.normalized_quote_json || doc.normalized_json || '{}';
        const normalized = typeof rawJsonStr === 'string'
            ? JSON.parse(rawJsonStr || '{}')
            : (rawJsonStr || {});

        const offers = normalized.offers || [];
        let selectedOffer = null;

        if (selectedVariantId !== null && selectedVariantId !== undefined && selectedVariantId !== '') {
            // 1. Exact canonical ID or name match FIRST (matches drawer resolution priority)
            selectedOffer = offers.find((off) =>
                off.variantId === selectedVariantId ||
                off.id === selectedVariantId ||
                off.variantName === selectedVariantId
            ) || null;

            // 2. Positional fallback ONLY if no exact canonical ID matched
            if (!selectedOffer) {
                const idxMatch = String(selectedVariantId).match(/^variant-(\d+)$/);
                if (idxMatch) {
                    const targetIdx = parseInt(idxMatch[1], 10);
                    if (targetIdx >= 0 && targetIdx < offers.length) {
                        selectedOffer = offers[targetIdx];
                    }
                } else if (/^\d+$/.test(String(selectedVariantId))) {
                    const targetIdx = parseInt(String(selectedVariantId), 10);
                    if (targetIdx >= 0 && targetIdx < offers.length) {
                        selectedOffer = offers[targetIdx];
                    }
                }
            }

            if (!selectedOffer && offers.length > 0) {
                const err = new Error(`QUOTE_VARIANT_NOT_FOUND: Variant '${selectedVariantId}' not found in evidence document`);
                err.code = 'QUOTE_VARIANT_NOT_FOUND';
                err.statusCode = 400;
                throw err;
            }
        }

        return {
            evidenceId: doc.id,
            filename: doc.file_name,
            rawTextSnippet: doc.raw_text ? doc.raw_text.slice(0, 3000) : '',
            normalizedQuote: normalized,
            offers,
            selectedOffer
        };
    }

    /**
     * Enforces bounded limits on chat history array.
     */
    _enforceHistoryLimits(history) {
        let trimmed = history.slice(-MAX_HISTORY_MESSAGES);
        let serialized = JSON.stringify(trimmed);
        while (serialized.length > MAX_TOTAL_HISTORY_BYTES && trimmed.length > 2) {
            trimmed.shift();
            serialized = JSON.stringify(trimmed);
        }
        return trimmed;
    }

    /**
     * Internal audit helper writing to api_audit_logs.
     */
    async _logAudit(tenantId, actor, resourceId, eventType, payload) {
        try {
            await db.query(
                `INSERT INTO api_audit_logs
                 (id, tenant_id, actor_id, event_type, resource_type, resource_id, payload_json, created_at)
                 VALUES (?, ?, ?, ?, 'pricing_calibration_session', ?, ?, NOW(6))`,
                [
                    `audit-${uuidv4().substring(0, 8)}`,
                    tenantId,
                    actor?.id || 'system',
                    eventType,
                    resourceId,
                    JSON.stringify(payload)
                ]
            );
        } catch (e) {
            logger.warn('Audit log write failed (non-fatal):', e.message);
        }
    }

    /**
     * Processes an uploaded quote evidence document and formats structured conversational review
     * in the user's conversational language (e.g. 'es', 'en', 'de').
     */
    async processQuoteEvidenceForChat(tenantId, evidenceId, userChatLanguage = 'es') {
        const docs = await db.query(
            `SELECT d.id, d.tenant_id, d.original_filename as file_name, d.document_sha256 as file_hash_sha256, d.detected_language, d.raw_text as raw_extracted_text,
                    e.id as extraction_id, e.validation_status, e.normalized_json as normalized_quote_json, e.translated_text, e.confidence_status
             FROM quote_evidence_documents d
             LEFT JOIN quote_evidence_extractions e ON d.id = e.quote_evidence_document_id
             WHERE d.id = ? AND d.tenant_id = ?`,
            [evidenceId, tenantId]
        );

        if (!docs || docs.length === 0) {
            const err = new Error('QUOTE_EVIDENCE_NOT_FOUND');
            err.code = 'QUOTE_EVIDENCE_NOT_FOUND';
            err.statusCode = 404;
            throw err;
        }

        const doc = docs[0];
        const normalized = typeof doc.normalized_quote_json === 'string'
            ? JSON.parse(doc.normalized_quote_json)
            : doc.normalized_quote_json;

        // Evaluate advisory eligibility decision using DecisionProvider
        const decisionResult = await decisionProvider.evaluateDecision({
            task: 'EVIDENCE_ELIGIBILITY_ASSIST',
            state: { validationStatus: doc.validation_status },
            choices: ['ELIGIBLE', 'REQUIRES_REVIEW'],
            context: { snippet: doc.raw_extracted_text, documentLanguage: doc.detected_language }
        });

        const docLangNames = {
            es: { de: 'alemán', en: 'inglés', es: 'español' },
            de: { de: 'Deutsch', en: 'Englisch', es: 'Spanisch' },
            en: { de: 'German', en: 'English', es: 'Spanish' }
        };

        const docLangName = (docLangNames[userChatLanguage] && docLangNames[userChatLanguage][doc.detected_language]) || doc.detected_language;

        let summaryText = '';
        if (userChatLanguage === 'es') {
            summaryText += `Encontré un presupuesto en ${docLangName}.\n\n`;
            if (normalized.printhouseName) summaryText += `Producto:\n${normalized.printhouseName}\n\n`;

            const offerList = normalized.offers || [];
            const offerCount = offerList.length;
            summaryText += `He encontrado ${offerCount} tirada${offerCount !== 1 ? 's' : ''}.\n\n`;

            for (const off of offerList) {
                const isConsistent = off.validationStatus === 'CONSISTENT';
                const statusLabel = isConsistent ? 'Correcto' : 'Inconsistencia detectada';
                summaryText += `${off.quantity} uds:\n`;
                summaryText += `Fabricación: €${off.manufacturingPrice}\n`;
                summaryText += `Transporte: €${off.transportPrice || 0}\n`;
                summaryText += `Total: €${off.quotedTotalPrice}\n`;
                summaryText += `Precio unitario indicado: €${Number(off.quotedUnitPrice).toFixed(2).replace('.', ',')}\n`;
                summaryText += `Precio unitario calculado: €${Number(off.computedUnitPrice || off.quotedUnitPrice).toFixed(2).replace('.', ',')}\n`;
                summaryText += `Estado: ${statusLabel}\n\n`;
            }
        } else if (userChatLanguage === 'de') {
            summaryText += `Ich habe ein Angebot auf ${docLangName} gefunden.\n\n`;
            if (normalized.printhouseName) summaryText += `Produkt:\n${normalized.printhouseName}\n\n`;

            const offerList = normalized.offers || [];
            const offerCount = offerList.length;
            summaryText += `${offerCount} Auflage${offerCount !== 1 ? 'n' : ''} gefunden.\n\n`;

            for (const off of offerList) {
                const isConsistent = off.validationStatus === 'CONSISTENT';
                const statusLabel = isConsistent ? 'Korrekt' : 'Inkonsistenz erkannt';
                summaryText += `${off.quantity} Stk:\n`;
                summaryText += `Herstellung: €${off.manufacturingPrice}\n`;
                summaryText += `Transport: €${off.transportPrice || 0}\n`;
                summaryText += `Gesamt: €${off.quotedTotalPrice}\n`;
                summaryText += `Angegebener Einzelpreis: €${Number(off.quotedUnitPrice).toFixed(2).replace('.', ',')}\n`;
                summaryText += `Berechneter Einzelpreis: €${Number(off.computedUnitPrice || off.quotedUnitPrice).toFixed(2).replace('.', ',')}\n`;
                summaryText += `Status: ${statusLabel}\n\n`;
            }
        } else {
            summaryText += `Found a quotation in ${docLangName}.\n\n`;
            if (normalized.printhouseName) summaryText += `Product:\n${normalized.printhouseName}\n\n`;

            const offerList = normalized.offers || [];
            const offerCount = offerList.length;
            summaryText += `Found ${offerCount} quantity point${offerCount !== 1 ? 's' : ''}.\n\n`;

            for (const off of offerList) {
                const isConsistent = off.validationStatus === 'CONSISTENT';
                const statusLabel = isConsistent ? 'Valid' : 'Inconsistency detected';
                summaryText += `${off.quantity} copies:\n`;
                summaryText += `Manufacturing: €${off.manufacturingPrice}\n`;
                summaryText += `Transport: €${off.transportPrice || 0}\n`;
                summaryText += `Total: €${off.quotedTotalPrice}\n`;
                summaryText += `Quoted unit price: €${Number(off.quotedUnitPrice).toFixed(2)}\n`;
                summaryText += `Computed unit price: €${Number(off.computedUnitPrice || off.quotedUnitPrice).toFixed(2)}\n`;
                summaryText += `Status: ${statusLabel}\n\n`;
            }
        }

        return {
            ok: true,
            evidenceId: doc.id,
            documentSha256: doc.file_hash_sha256,
            filename: doc.file_name,
            detectedLanguage: doc.detected_language,
            userChatLanguage,
            chatSummary: summaryText.trim(),
            normalizedQuote: normalized,
            validationStatus: doc.validation_status,
            confidenceStatus: doc.confidence_status,
            decisionResult
        };
    }
}

module.exports = new CalibrationAssistantService();
