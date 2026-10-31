# PHASE 193E.1 — AI Conversational Calibration Assistant Architecture Audit
## Governance, Boundaries, Schemas & Security Design Document

> **Auditor/Architect**: Google Deepmind (Antigravity)
> **Date**: 2026-08-20
> **Status**: **ARCHITECTURE AUDIT COMPLETE — PASS**
> **Canonical Engine**: `@ppos/pricing-engine` (1.0.0, commit `8d324290d64b5bf17325ff1098db7ebb5f646b5d`)
> **Canonical Baselines**: Phase 193B (`430727a9...`), Phase 193C (`a316ab30...`), Phase 193D (`89830370...`)

---

## 1. Existing AI Infrastructure Audit (E1)

Control Plane has previously utilized client-side LLM proxies for preflight human reports and efficiency audit modals (`/api/gemini-proxy/v1/...`). However:
- **No unified server-side AI provider abstraction** currently exists in `src/api/services/`.
- Client-side calls in `AIAuditModal.tsx` and `EfficiencyAuditModal.tsx` perform direct prompt generation and JSON candidate extraction.
- **Provider Architecture for 193E**: We introduce a clean server-side adapter pattern (`src/api/services/aiProviderAdapter.js`) supporting standard completion APIs (Gemini via standard REST or SDK, with OpenAI-compatible fallback).
- **API Key & Secrets Management**: The API key is sourced strictly from `process.env.GEMINI_API_KEY` (or `process.env.OPENAI_API_KEY`) on the server. Never exposed to the frontend client.
- **Fail-Closed & Timeout**: 15s hard timeout on AI calls; failure throws structured domain errors (`AI_PROVIDER_UNAVAILABLE`, `AI_RESPONSE_INVALID`).

---

## 2. Budget / BookPrice Assistant Alignment (E2)

In the BookPrice / Budget domain, natural language intake maps user expressions to physical job variables. 
Key architectural lessons incorporated into 193E:
1. **Single Physical Taxonomy**: 193E reuses the exact physical book specification defined in Phase 193B (`VALID_INTERIOR_PRINT`, `VALID_COVER_PRINT`, `VALID_BINDING_METHOD`, `VALID_PAPER_TYPE_*`, `VALID_LAMINATION`).
2. **Zero Inferred Rates**: The AI extracts declared numbers (e.g., "1000 copies", "2450 EUR") and declared physical parameters. The AI never calculates division, markup, or subtotal formulas.
3. **Clarification Over Guessing**: Incomplete or ambiguous specifications generate structured `clarificationQuestions` rather than silent fallback defaults.

---

## 3. Strict Responsibility Boundary (E3, E20)

```mermaid
graph TD
    subgraph "Untrusted AI Layer (Phase 193E)"
        M[Manager Natural Language] --> AI[AI Conversational Assistant]
        AI --> EXT[1. Extract Physical Book Spec]
        AI --> CLA[2. Clarify Missing Semantics]
        AI --> EXP[3. Explain Solver Proposal & Residuals]
    end

    subgraph "Deterministic Governance Core (Phases 193B, 193C, 193D)"
        EXT -->|Validated Spec Patch| B[Phase 193B: CalibrationSessionService]
        B -->|Explicit Promotion| READY[Session: READY]
        READY -->|Explicit Solver Trigger| C[Phase 193C: Deterministic Inverse Solver]
        C -->|Forward Verification| BPE[@ppos/pricing-engine buildPrice]
        C -->|Proposal & Run| RUN[Run: SUCCEEDED]
        RUN --> EXP
        EXP -->|Explicit Manager Click| D[Phase 193D: CalibrationAcceptanceService]
        D -->|Safe Merge & Verification| REV[Immutable Pricing Revision + rates_json]
    end
```

### Invariants:
- **AI MAY**: Map natural language $\to$ physical fields, identify missing fields, ask clarification questions, format summaries, explain residuals and solver warnings in plain manager language.
- **AI MUST NOT**:
  - Compute manufacturing prices, margins, or waste.
  - Generate, infer, or hallucinate pricing rates directly.
  - Modify `printer_nodes.rates_json` or database tables.
  - Accept calibration runs or trigger Phase 193D mutations autonomously.
  - Mutate `printhouse_activation_grants`.

---

## 4. Conversational User Journey (E4, E11)

1. **Intake**: Manager posts natural language description to `/api/printhouse/onboarding/pricing/calibrations/:id/assistant/chat`.
2. **AI Extraction & Clarification**: Assistant parses physical spec, checks for missing/ambiguous fields (e.g., binding type, paper grammage, inclusion of VAT/transport), and returns a structured response.
3. **Manager Confirmation**: Manager reviews the structured draft preview in UI and clicks "Apply to Draft".
4. **Draft Update (193B)**: Server updates the calibration session record via `calibrationSessionService.updateDraftSession()`.
5. **Manager Promotion**: Manager explicitly promotes session to `READY` (`POST /calibrations/:id/ready`).
6. **Solver Execution (193C)**: Manager clicks "Calculate Calibration" (`POST /calibrations/:id/calculate`).
7. **AI Run Explanation (193E)**: Assistant explains the mathematical solver proposal, residual, and active categories in plain language.
8. **Governed Acceptance (193D)**: Manager explicitly clicks "Accept Calibration" (`POST /calibrations/:id/accept`). Phase 193D executes the atomic transaction and drift checks.

---

## 5. Structured AI Output Schema (E5, E6, E7, E8, E9)

The AI assistant endpoint communicates strictly via this typed JSON contract:

```typescript
interface AICalibrationResponse {
  intent: 'SPEC_EXTRACTION' | 'CLARIFICATION_NEEDED' | 'EXPLANATION' | 'GENERAL_INQUIRY';
  specPatch: {
    copies?: number;
    interior_pages?: number;
    cover_pages?: 4;
    book_width_mm?: number;
    book_height_mm?: number;
    orientation?: 'portrait' | 'landscape';
    interior_print?: '1/1' | '2/2' | '4/4';
    cover_print?: '1/0' | '1/1' | '2/0' | '2/2' | '3/0' | '3/3' | '4/0' | '4/4' | '5/0' | '5/5';
    paper_type_interior?: 'offset' | 'mc' | 'lux' | 'munken' | 'other';
    paper_weight_interior?: number;
    paper_type_cover?: 'mc' | 'artboard' | 'offset' | 'wfmc' | 'other';
    paper_weight_cover?: number;
    binding_method?: 'perfect bound' | 'saddle stitch' | 'thread sewn' | 'hardcover' | 'wire-o' | 'spiral';
    lamination?: 'gloss' | 'matt' | 'varnish';
    uv_varnish?: boolean;
    endpapers?: boolean;
    paper_type_endpapers?: 'offset' | 'mc' | 'other';
    paper_weight_endpapers?: number;
    delivery_country?: string; // ISO-2 uppercase
  };
  declaredCommercials: {
    targetManufacturingPrice?: number | null;
    currency?: string | null;
    transportPricePerKg?: number | null;
    transportCurrency?: string | null;
    includesPaper?: boolean | null;
    includesBinding?: boolean | null;
    includesFinishing?: boolean | null;
    includesPackaging?: boolean | null;
  };
  clarificationQuestions: Array<{
    field: string;
    question: string;
    options?: string[];
  }>;
  explanation: string;
  warnings: string[];
  readyForValidation: boolean;
}
```

---

## 6. Security, Isolation & Observability (E14, E15, E16, E17, E18)

1. **Prompt Injection Protection**: Manager inputs are treated as untrusted data. The structured schema validator drops any unauthorized fields, injected SQL commands, or instructions attempting to force automatic acceptance.
2. **Tenant Isolation**: AI prompts include only context for the authenticated `tenantId`, the active `sessionId`, and the target `printerNodeId`. Zero visibility into competitor prices, global marketplace orders, or other tenants' data.
3. **Data Minimization**: Prompts contain only physical job parameters and declared calibration prices. Never JWTs, database connection strings, credentials, or internal system configurations.
4. **Audit Logging**: Interactions record `CALIBRATION_AI_CHAT_INVOKED` events in `api_audit_logs` containing model metadata, token usage, latency, and schema validation status.
5. **Fail-Closed & Manual Fallback**: If the AI provider is unavailable, rate-limited, or returns invalid JSON, the system gracefully returns `AI_PROVIDER_UNAVAILABLE` or `AI_STRUCTURED_OUTPUT_INVALID`. Manual form editing (193B), calculating (193C), and acceptance (193D) remain 100% operational.

---

## 7. Migration Decision (E22)

```text
MIGRATION_REQUIRED: NO
```
**Rationale**:
- `printhouse_pricing_calibration_sessions` already contains `chat_history_json`, `book_spec_json`, `metadata_json`, and inclusion flags.
- `printhouse_pricing_calibration_runs` already contains full solver logs, proposals, and residuals.
- Audit events are recorded in `api_audit_logs`.
- No new database tables or schema migrations are necessary for Phase 193E.

---

## 8. Implementation Plan for Phase 193E

1. **New Services**:
   - `src/api/services/aiProviderAdapter.js` — Pluggable provider adapter (Gemini REST/SDK with fallback, retries, and timeout).
   - `src/api/services/calibrationAssistantService.js` — Conversational domain service managing prompt construction, schema validation, physical mapping, ambiguity resolution, and run explanations.
2. **New Routes in `src/api/routes/printhouseOnboardingRoutes.js`**:
   - `POST /api/printhouse/onboarding/pricing/calibrations/:id/assistant/chat` — Conversational interaction endpoint.
   - `POST /api/printhouse/onboarding/pricing/calibrations/:id/assistant/explain-run` — Generates plain-language explanation of a 193C run.
3. **New Validation Suite**:
   - `tests/smoke_phase193e_conversational_assistant.js` — Comprehensive test suite covering prompt injection, physical taxonomy validation, clarification generation, ambiguity policy, tenant isolation, and zero rate mutation guarantees.
