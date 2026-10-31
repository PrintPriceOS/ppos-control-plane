# Phase 191F: Tax and Currency Contract

## 1. Currency Constraints
- **Explicit Currency Codes**: All pricing rules must define a currency using standard ISO 4217 uppercase codes (e.g. `EUR`, `USD`, `GBP`).
- **Single Currency price book**: A price book or rule set is strictly single-currency. Mixing different currency rules within the same active price book version throws a `PRICING_RULE_CURRENCY_MISMATCH` validation error.
- **Conversion**: Exchange rate conversions are not supported. Calculations are executed in the resolved currency of the price book.

---

## 2. Tax / VAT Separation Rules
- **Net Price Principle**: All base prices, surcharges, and setup fees configured by the operator are stored as **net values** (tax excluded).
- **Expose Labels**: The UI and calculations explicitly display and separate net values from taxes. The labels include:
  - `NET PRICE`
  - `TAX EXCLUDED`
  - `TAX INCLUDED`
  - `TAX CALCULATED AT QUOTE`
- **Tax Integrity**: Self-service users cannot modify calculated tax liabilities, jurisdictional tax tables, or verify their own tax statuses arbitrarily.
- **Historical Order Snapshots**: Order pricing snapshots seal the net price and tax rates/amounts immutably, ensuring historical reproducibility.
