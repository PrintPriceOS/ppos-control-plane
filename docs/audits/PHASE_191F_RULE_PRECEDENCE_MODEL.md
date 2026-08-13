# Phase 191F: Rule Precedence Model

## 1. Resolution Precedence Hierarchy

Quotes are resolved dynamically in a strict deterministic order to ensure consistent calculations:

```text
  1. TENANT DEFAULT
     ↓
  2. SITE OVERRIDE (Scoped to printer node)
     ↓
  3. MACHINE/TECHNOLOGY OVERRIDE (Scoped to press)
     ↓
  4. MATERIAL RULE (Associated with selected paper stock)
     ↓
  5. FINISHING RULE (Associated with binding/lamination capabilities)
     ↓
  6. QUANTITY TIER (Slices base rates according to order volume)
     ↓
  7. EXPEDITE SURCHARGE (Shift schedule compression factor)
     ↓
  8. DISCOUNT (Negates percentage/flat bounds if authorized)
     ↓
  9. TAX / VAT (Jurisdictional final addition)
```

---

## 2. Conflict Resolution Invariants

- **Specificity Overrides General**: A machine-specific base rate takes precedence over a general site base rate.
- **Additive surcharges**: Material and finishing surcharges are additive to the resolved base rate.
- **Validity Bound Check**: Expired or future-dated rules are skipped during resolution.
- **Multi-currency rejection**: Mixed currencies inside a single price book resolve transaction are rejected.
