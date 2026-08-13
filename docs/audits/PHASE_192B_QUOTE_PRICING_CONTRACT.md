# Phase 192B: Live Quote Pricing Contract & Money Safety

## 1. Money Safety & Formatting
- **Arithmetic Safety**: Calculates cost components using string-based decimal formatting (`toFixed(2)`).
- **Tax Breakdown**: Expresses net amount, tax amount, and gross amount explicitly (`taxStatus: "ESTIMATED_VAT"`).
- **Currency Provenance**: Inherited directly from resolved published price book.

## 2. API Response Contract
```json
{
  "success": true,
  "quote": {
    "quoteId": "lquote_12345",
    "tenantId": "tenant-1",
    "siteId": "site-1",
    "status": "CALCULATED",
    "currency": "EUR",
    "pricing": {
      "netAmount": "150.00",
      "taxAmount": "31.50",
      "grossAmount": "181.50",
      "taxStatus": "ESTIMATED_VAT"
    },
    "priceBookRef": {
      "id": "pb_published_1",
      "name": "Standard Catalog 2026"
    },
    "invariants": {
      "orderCreated": false,
      "routingCreated": false,
      "dispatchCreated": false,
      "capabilityChanged": false
    }
  }
}
```
