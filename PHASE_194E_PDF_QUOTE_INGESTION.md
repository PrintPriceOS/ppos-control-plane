# Phase 194E / 194E-R — Multilingual PDF Quote Ingestion & Pricing Assistant Intake

## Overview

Phase 194E / 194E-R extends the PrintPrice OS Control Plane with a production-grade, secure PDF intake pipeline and a multilingual Pricing Assistant backend integration.

Users can upload PDF supplier quotations directly via REST APIs or Pricing Assistant backend services. The system validates the file, extracts textual content per page using `pdf-parse` (powered by `pdfjs-dist`), detects the document language, applies printing-domain terminology normalization, translates the content where needed, extracts structured commercial quote evidence contextually without fixture hardcoding, performs Phase 194A deterministic arithmetic validation, and presents the structured evidence for operator review.

$$\text{Untrusted PDF Binary} \xrightarrow{\quad\text{PDFParse Engine & Security}\quad} \text{Per-Page Text} \xrightarrow{\quad\text{Contextual Parser & Normalization}\quad} \text{Phase 194A Validation} \xrightarrow{\quad\text{Source Span Provenance}\quad} \text{Eligible Evidence}$$

---

## 1. Security Controls & Untrusted Input Boundary

Uploaded PDF files are treated as untrusted binary input. Phase 194E-R implements 10 security guardrails:
1. **MIME & Magic Bytes Validation:** Requires `application/pdf` MIME type and verifies `%PDF-` magic header bytes. Rejects malformed or non-PDF files (`INVALID_FILE_TYPE`, `PDF_MALFORMED`).
2. **File & Resource Bounds:** Enforces strict limits: MAX file size 10 MB (`FILE_TOO_LARGE`), MAX page count 50, MAX text extraction size 500 KB.
3. **Path Traversal & Filename Sanitization:** Strips directory traversal tokens (`../`, `..\`) and dangerous characters from filenames (`sanitizeFilename`).
4. **Idempotency & SHA-256 Fingerprinting:** Computes SHA-256 hash digest of file buffer. Duplicate uploads for the same tenant return `DUPLICATE_DOCUMENT`. Cross-tenant identical files remain strictly isolated.
5. **No Script / Macro Execution:** Extraction decodes text stream literals via `pdfjs-dist`; embedded JavaScript, macros, launch actions, and external links are strictly ignored.
6. **Encrypted & Image-Only PDF Handling:** Encrypted files return `PDF_ENCRYPTED`. Image-only PDFs (zero extractable text characters) return `OCR_REQUIRED`.
7. **Zero Rate Mutations:** No ingestion path can mutate `printer_nodes.rates_json`, create pricing revisions, or issue governed acceptances.

---

## 2. Text Extraction & Multilingual Translation Architecture

### 2.1 Production Extraction Engine (`pdfQuoteExtractionService.js`)
- Uses `pdf-parse` v2.4.5 to decode `FlateDecode` compressed streams, object streams, subset fonts, and CMaps:
  ```json
  {
    "ok": true,
    "status": "SUCCESS",
    "documentSha256": "...",
    "pageCount": 2,
    "pages": [{ "pageNumber": 1, "text": "..." }, { "pageNumber": 2, "text": "..." }],
    "combinedText": "...",
    "extractionMethod": "PDFPARSE_ENGINE",
    "extractionVersion": "2.4.5"
  }
  ```

### 2.2 Language Detection (`quoteLanguageService.js`)
- Detects language (`de`, `en`, `es`) deterministically using domain keyword frequencies and character set distributions.
- Returns `{ detectedLanguage: 'de', confidence: 0.95, status: 'CONFIDENT' }`.

### 2.3 Terminology Glossary Normalization (`printingTranslationService.js`)
- Maintains deterministic printing glossary mapping German, English, and Spanish terms:
  - `Auflage` / `Quantity` / `Tirada` $\rightarrow$ `QUANTITY`
  - `Festeinband` / `Hardcover` / `Tapa dura` $\rightarrow$ `HARDCOVER`
  - `Fadenheftung` / `Thread sewn` / `Cosido con hilo` $\rightarrow$ `THREAD_SEWN`
  - `Klebebindung` / `Perfect bound` / `Encolado` $\rightarrow$ `PERFECT_BOUND`
  - `runder Rücken` / `rounded spine` / `lomo redondo` $\rightarrow$ `ROUNDED_SPINE`
  - `matt laminiert` / `matte laminated` / `laminado mate` $\rightarrow$ `MATT_LAMINATED`
- **3 Distinct Wording Layers Preserved:**
  - `ORIGINAL`: source wording from PDF (e.g. "Festeinband, runder Rücken")
  - `TRANSLATED`: human-readable translation (e.g. "Hardcover, rounded spine")
  - `NORMALIZED`: canonical enum/value (e.g. `HARDCOVER`, `ROUNDED_SPINE`)

### 2.4 Generic Contextual Commercial Interpreter (`quoteDocumentInterpretationService.js`)
- **ZERO Hardcoding:** Derive product titles, quantities, prices, variants, and specs strictly from text.
- **Source Span Provenance:** Every commercial field attaches `{ value, pageNumber, sourceText }`.
- **False-Positive Safeguards:** Ignores dates (`31.08.2026`), paper gsm (`150 g`), format dimensions (`148 x 210 mm`), and postal codes (`1073`) during commercial offer line extraction.

---

## 3. Real Document Binary Extraction Results

Verified against 5 real-world supplier quote PDF binaries (`C:\Users\KIKE\Downloads\precios`):

1. **Natur (`Natur_31.08.2026.pdf`):**
   - Extracted 3 target quantities: 500, 600, 700 copies.
   - 500: Mfg €4321, Transport €325, Total €4646 $\rightarrow$ `CONSISTENT`
   - 600: Mfg €4604, Transport €325, Total €4929 $\rightarrow$ `CONSISTENT`
   - 700: Mfg €4846, Transport €325, Total €5171 $\rightarrow$ `CONSISTENT`

2. **Stutensee (`Stutensee_Mit_Margot_durch_das_Gartenjahr_04.09.2026 (1).pdf`):**
   - 250: Mfg €1283, Transport €190, Total €1473 $\rightarrow$ `CONSISTENT`
   - 300: Mfg €1335, Transport €190, Total €1525 (Quoted unit €3.05; computed unit €5.0833) $\rightarrow$ `INCONSISTENT_UNIT_PRICE` (Source quoted unit price €3.05 preserved intact).

3. **Fussel (`Fussel_08.09.2026 (2).pdf`):**
   - Extracted same manufacturing price (€3095) with 2 distinct transport options (Express €600 vs Standard €200). Separates manufacturing and transport prices without misclassification.

4. **Fährmann (`Fährmann_(VVA_10_Muster)_07.09.2026.pdf`):**
   - Extracted 3000 copies across 2 paper variants (Munken Print Cream 1.5 vs Munken Premium Cream 1.3). Preserves variants in distinct `offerGroups` without flattening.

5. **Die Mysteriösen Steine (`Die_Mysteriösen_Steine_08.09.2026 (1).pdf`):**
   - 1500 copies: Mfg €1792, Transport €415, Total €2207, Unit €1.47 $\rightarrow$ `CONSISTENT`.

---

## 4. Operator Corrections & Immutability

- **Original Evidence Immutability:** Raw extracted text and source numerical values remain immutable in database records (`quote_evidence_documents` & `quote_evidence_extractions`).
- **Operator Corrections:** User corrections submitted via `PUT /quote-evidence/:id/corrections` are stored separately in `operator_corrections_json` (`{ correctedBy, timestamp, corrections }`). Original source evidence is never overwritten.

---

## 5. Pricing Assistant Chat Integration & Language Decoupling

- **Language Decoupling:** Document language (e.g. German `de`) and User chat language (e.g. Spanish `es`) are independent.
- If a Spanish user uploads a German quote, the Pricing Assistant returns a structured Spanish summary detailing product title, format, binding, quantity points, manufacturing/transport prices, and validation status, while preserving original German source wording in evidence tooltips.
- **UI State Truth:** `BACKEND_READY / UI_PENDING`.

---

## 6. Schema Extension (Migration 153 Aligned)

```sql
-- Migration 153: Multilingual PDF Quote Ingestion Schema Extension
ALTER TABLE quote_evidence_documents
  ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS extraction_method VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS extraction_version VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(64) DEFAULT 'COMPLETED';

ALTER TABLE quote_evidence_extractions
  ADD COLUMN IF NOT EXISTS translated_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS confidence_status VARCHAR(32) DEFAULT 'HIGH_CONFIDENCE',
  ADD COLUMN IF NOT EXISTS interpretation_version VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS operator_corrections_json JSON NULL;
```

---

## 7. Phase 194F / 194G Handoff

- **Phase 194F:** Multilingual Assistant Conversational UX Refinement, File Upload UI & Glossary Management.
- **Phase 194G:** Reviewed Evidence Handoff $\rightarrow$ Multi-Quantity Solver Calibration $\rightarrow$ Governed Acceptance Pipeline.
