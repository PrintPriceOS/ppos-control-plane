# Phase 191F: Pricing API Contract

## 1. REST Endpoints Matrix

All pricing onboarding endpoints are mounted under `/api/printhouse/onboarding/pricing`.

### 1.1 Price Books Management
- `GET    /price-books`: List all price books for the tenant.
- `POST   /price-books`: Create a new draft price book.
- `GET    /price-books/:priceBookId`: Retrieve price book details.
- `PUT    /price-books/:priceBookId`: Update draft price book metadata.
- `POST   /price-books/:priceBookId/clone`: Clone a price book version.
- `POST   /price-books/:priceBookId/validate`: Run quantity-tier, machine and currency coverage check.
- `POST   /price-books/:priceBookId/request-review`: Submit draft price book for administrator review.
- `DELETE /price-books/:priceBookId`: Archive/delete a draft or retired price book.

### 1.2 Pricing Rules Management
- `GET    /price-books/:priceBookId/rules`: Retrieve all rules inside a price book.
- `POST   /price-books/:priceBookId/rules`: Add a new pricing rule (base production, material surcharge, finishing operation, setup charges).
- `GET    /price-books/:priceBookId/rules/:ruleId`: Retrieve rule details.
- `PUT    /price-books/:priceBookId/rules/:ruleId`: Update a draft rule.
- `DELETE /price-books/:priceBookId/rules/:ruleId`: Delete/archive a rule.

### 1.3 Non-Binding Preview
- `POST   /preview`: Computes net total pricing preview breakdown, including component provenance and roundings.

### 1.4 Onboarding Readiness
- `GET    /readiness`: Returns pricing completeness audit status.
