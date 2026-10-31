# Phase 191F: Pricing Domain Audit

## 1. Scope
Audits the existing pricing tables, schema structures, and business logic dependencies in the `ppos-control-plane` repository before adding tables or pricing services.

---

## 2. Mandatory Domain Audit Questions

```text
IS_PRICING_SITE_SCOPED: YES
```
- **Rationale**: The `printer_pricing_profiles` table contains a foreign key referencing `printer_nodes(id)`, meaning that commercial pricing configurations (such as margins, setup fees, rush multipliers) are linked directly to a physical printing site.

```text
IS_PRICING_MACHINE_SCOPED: YES
```
- **Rationale**: The `printer_pricing_profiles` table supports a nullable `machine_id` foreign key. Profile resolution logic in `pricingIntelligenceService.js` resolves machine-specific profiles first, then falls back to printer-wide rules.

```text
IS_PRICING_MATERIAL_SCOPED: PARTIAL
```
- **Rationale**: There is no dedicated material-scoped pricing table in the database schema. However, the site-level manufacturing cost estimation in `IndustrialEconomicService.js` parses a `rates_json` column stored on the site (`print_nodes`), which contains a `material_multiplier` factor.

```text
IS_PRICE_BOOK_CANONICAL: NO
```
- **Rationale**: No `price_books` or `printhouse_price_books` table currently exists in the active database schema list.

```text
ARE_PUBLISHED_PRICES_IMMUTABLE: NO
```
- **Rationale**: Active `printer_pricing_profiles` can be updated in-place via the `PUT /profiles/:id` endpoint in `pricingAdmin.js`.

```text
ARE_ORDER_PRICING_SNAPSHOTS_IMMUTABLE: YES
```
- **Rationale**: Once order pricing snapshots are created and sealed, the database trigger `trg_order_pricing_snapshots_before_update` strictly prevents modification of any snapshot data (json, amount, currency, rate cards), returning a MySQL exception (45000) on update attempts.
