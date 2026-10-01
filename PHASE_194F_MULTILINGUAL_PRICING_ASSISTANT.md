# Phase 194F — Multilingual Pricing Assistant UX & Jev Decision Provider Architecture

## Executive Summary

Phase 194F establishes a multilingual, multi-layer conversational UX and an optional, feature-flagged **Jev Decision Provider** for probabilistic classification, terminology disambiguation, and ambiguity routing within PrintPrice OS.

### Canon & Invariants
> **"Jev may advise. Deterministic governance decides."**

1. **Zero Source-of-Truth Pollution:** Jev is NEVER the source of truth for arithmetic, unit prices, manufacturing prices, quantities, residuals, tolerances, checksums, active revisions, or governed acceptance.
2. **Deterministic Veto Power:** Deterministic governance rules (such as unit price arithmetic checks or rate invariants) hold veto power over any probabilistic decision, regardless of provider confidence.
3. **Decoupled Multilingual Architecture:** Independent tracking of:
   - `userConversationLanguage` (e.g., `es` - Spanish)
   - `documentLanguage` (e.g., `de` - German)
   - `canonicalInternalLanguage` (e.g., `en` - English internal enums)
4. **Non-Mutating Handoff:** Quote reviews in Phase 194F transition quotes into `READY_FOR_CALIBRATION_REVIEW`. Calibration solver execution and rate activation are deferred to Phase 194G under explicit operator supervision.

---

## 1. Multilingual Conversational UX & Language Decoupling

The assistant independently tracks three language layers:

| Layer | Example Value | Description |
|---|---|---|
| `userConversationLanguage` | `es` | Language used by the manager in chat prompts and assistant responses. |
| `documentLanguage` | `de` | Language detected in the uploaded PDF quote document. |
| `canonicalInternalLanguage` | `en` | Canonical enum values used in backend data models (e.g., `HARDCOVER`, `THREAD_SEWN`). |

### Language Behavior Rule
- If user prompts in **Spanish**, assistant responds in **Spanish**.
- If user prompts in **English**, assistant responds in **English**.
- If user prompts in **German**, assistant responds in **German**.
- The PDF document language does **NOT** dictate the assistant's response language (e.g., a Spanish manager uploading a German PDF receives: *"Encontré un presupuesto en alemán..."*).

---

## 2. Pricing Chat Attachment & File Upload UX

Wired directly in `CalibrationConversation.tsx` and `QuickCalibrationPanel.tsx`:
- **Control:** Paperclip attachment button next to chat input bar.
- **Accessibility:** `aria-label="Adjuntar presupuesto PDF"`, visible focus ring, keyboard activation via `Enter` / `Space`.
- **Validation:** PDF-only file input (`accept="application/pdf,.pdf"`).
- **Backend Endpoint:** `POST /api/printhouse/onboarding/pricing/quote-evidence/upload` (`multipart/form-data`, key `file`).

### Upload UX States & User Messages
1. `IDLE` — Ready for prompt or file upload.
2. `FILE_SELECTED` — File chosen by user.
3. `UPLOADING` — *"Subiendo presupuesto…"*
4. `PROCESSING` — *"Analizando PDF… Documento detectado: alemán"*
5. `EXTRACTED` — *"Extracción completada. Presupuesto listo para revisión."*
6. `REVIEW_REQUIRED` / `READY_FOR_REVIEW` — *"He encontrado una inconsistencia en uno de los precios."*
7. `ERROR` — Displayed in clean user banner without internal stack trace leaks.

---

## 3. Structured Quote Review Card & Operator Correction UX

Rendered inside the chat view (`StructuredQuoteReviewCard.tsx`):
- **Document Metadata:** Filename, detected language badge, page count.
- **Product Metadata:** Title, format (width × height), pages, binding, finishing.
- **Materials Metadata:** Interior paper, cover paper, endpapers, colors.
- **Offers & Quantity Points Table:**
  - Variant / offer group
  - Quantity
  - Manufacturing price (€)
  - Transport price (€)
  - Total price (€)
  - Quoted unit price (€) vs Computed unit price (€)
  - Validation status badge (`CONSISTENT` green vs `INCONSISTENT_UNIT_PRICE` red/amber).
- **Expandable Original / Translated / Normalized Views:**
  - *Original wording:* German text (e.g. `"Festeinband, runder Rücken, Fadenheftung"`).
  - *Translated summary:* Manager's natural language.
  - *Normalized canonical:* English canonical values (`HARDCOVER` / `ROUNDED_SPINE` / `THREAD_SEWN`).
- **Operator Correction UX:**
  - Allows editing interpreted fields without mutating original source evidence.
  - Preserves: `sourceValue`, `interpretedValue`, `operatorCorrectedValue`, `correctedBy`, `correctedAt`.
  - Persisted via `PUT /api/printhouse/onboarding/pricing/quote-evidence/:id/corrections`.

---

## 4. Jev Decision Provider Architecture

Module location: `src/api/services/decisionProvider/`

```
src/api/services/decisionProvider/
├── decisionProvider.js              # Orchestrator & deterministic gate composition
├── jevDecisionProvider.js           # Jev HTTP adapter (POST /v1/systemone)
├── deterministicDecisionProvider.js # Rule-based fallback decision engine
└── llmDecisionProvider.js           # LLM adapter fallback
```

### Required Interface
```javascript
evaluateDecision({ task, state, choices, context, thresholds })
```

### Normalized Output Contract
```json
{
  "provider": "JEV",
  "task": "QUOTE_FIELD_CLASSIFICATION",
  "decision": "manufacturing",
  "confidence": 0.92,
  "rawProviderMetadata": { "model": "systemone-v1" },
  "requiresReview": false,
  "auditMetadata": {
    "provider": "JEV",
    "providerModel": "systemone-v1",
    "task": "QUOTE_FIELD_CLASSIFICATION",
    "decision": "manufacturing",
    "confidence": 0.92,
    "requestedAt": "2026-10-01T02:00:00.000Z",
    "completedAt": "2026-10-01T02:00:00.120Z",
    "fallbackUsed": false
  }
}
```

---

## 5. Jev Configuration & Feature Flags

Environment Configuration:
- `JEV_ENABLED=false` (Default `false`; system functions 100% deterministically when disabled).
- `JEV_API_BASE_URL=https://api.typesafe.ai`
- `JEV_API_KEY=...` (Never committed or logged).
- `JEV_MIN_CONFIDENCE=0.85`
- `JEV_TIMEOUT_MS=3000`

### Fallback Priority Chain
If Jev is disabled, times out, rate-limited, unavailable, or yields low confidence (< `JEV_MIN_CONFIDENCE`):
1. `JevDecisionProvider` (If enabled & healthy)
2. `DeterministicDecisionProvider` (Rule-based engine)
3. `LLMDecisionProvider` (If configured)
4. Safe Fallback: `decision: 'REQUIRES_REVIEW'`, `requiresReview: true`, `fallbackUsed: true`.

---

## 6. Deterministic vs Probabilistic Decision Matrix

| Task | Allowed Provider | Category | Rule |
|---|---|---|---|
| `QUOTE_FIELD_CLASSIFICATION` | Jev / Deterministic | Probabilistic | Classifies candidate fields (mfg, transport, total). |
| `OFFER_GROUP_CLASSIFICATION` | Jev / Deterministic | Probabilistic | Groups variants (e.g. Munken Print vs Munken Premium). |
| `AMBIGUITY_ROUTING` | Jev / Deterministic | Probabilistic | Advisory routing for operator review. |
| `TERMINOLOGY_DISAMBIGUATION` | Jev / Deterministic | Probabilistic | Maps natural language terms to canonical enums. |
| `EVIDENCE_ELIGIBILITY_ASSIST` | Jev / Deterministic | Advisory Only | Advisory signal (`ELIGIBLE` / `REQUIRES_REVIEW`). |
| `ARITHMETIC_VALIDATION` | **Deterministic Only** | Governed Invariant | `quotedTotal == mfg + transport` arithmetic check. |
| `COMPUTED_UNIT_PRICE` | **Deterministic Only** | Governed Invariant | `total / quantity` unit price calculation. |
| `SOLVER_OBJECTIVE` | **Deterministic Only** | Governed Invariant | Multi-quantity curve fitting solver. |
| `RESIDUALS_VERIFICATION` | **Deterministic Only** | Governed Invariant | Numerical tolerance evaluation. |
| `CHECKSUM_VERIFICATION` | **Deterministic Only** | Governed Invariant | Active revision hash verification. |
| `REVISION_ACTIVATION` | **Deterministic Only** | Governed Invariant | Active pricing rate activation. |

---

## 7. Real-World UX Fixtures

### Stutensee Fixture (German Quote $\rightarrow$ Spanish Chat Summary)
- **250 copies:** Mfg €1.283, Transport €190, Total €1.473, Quoted €5,89, Computed €5,89 $\rightarrow$ **Correct (`CONSISTENT`)**
- **300 copies:** Mfg €1.335, Transport €190, Total €1.525, Quoted €3,05, Computed €5,08 $\rightarrow$ **Inconsistency Detected (`INCONSISTENT_UNIT_PRICE`)**. Red/amber highlight displayed. Jev CANNOT override this inconsistency!

### Fährmann Fixture
- **Variant 1:** Munken Print Cream 1.5
- **Variant 2:** Munken Premium Cream 1.3
- Both commercial variants are preserved separately without flattening.

---

## 8. Verification & Acceptance

- **Phase 194F Smoke Suite:** `tests/smoke_phase194f_multilingual_assistant.js` (PASS 14/14)
- **Phase 194F Jev Suite:** `tests/smoke_phase194f_jev_provider.js` (PASS 8/8)
- **Full Regression Suite:** Phase 194A, 194B, 194C, 194D, 194E, 194E-R, 193C, Hawkeye (PASS)
- **Build Verification:** `npm run build` (PASS)

---

## 9. Handoff to Phase 194G

Phase 194F successfully turns backend ingestion into a multilingual chat UX and introduces the Jev decision provider abstraction.

**Recommended Phase 194G Scope:**
- Handoff reviewed evidence (`READY_FOR_CALIBRATION_REVIEW`) into Multi-Quantity Calibration targets.
- Execute multi-quantity solver fitting under operator supervision.
- Evaluate governed curve acceptance.
- Create immutable active pricing revision.
