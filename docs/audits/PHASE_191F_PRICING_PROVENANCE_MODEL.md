# Phase 191F: Pricing Provenance Model

## 1. Provenance Classification Codes

Every commercial pricing rule and computed component exposes a `provenance` value to trace its origin:

- **`TENANT_DEFINED`**: Default fallback configured at the tenant level.
- **`SITE_DEFINED`**: Rule associated with a physical printing plant site override.
- **`MACHINE_DEFINED`**: Rule configured for a specific press or device.
- **`MATERIAL_DEFINED`**: Surcharges or pricing rules associated with a specific catalog substrate.
- **`ADMIN_DEFINED`**: Manual override or safety markup established by global Control Plane administrators.
- **`SYSTEM_DEFAULT`**: Platform fallbacks.
- **`CONTRACT_DEFINED`**: Negotiated customer group or corporate contract rates.
- **`IMPORTED`**: Rule synchronizations from external factory ERPs.

---

## 2. Calculated Component Provenance Format

Dynamic pricing previews return component arrays formatted with trace indicators:

```json
{
  "currency": "EUR",
  "netTotal": "325.50",
  "components": [
    {
      "code": "BASE_PRODUCTION",
      "amount": "150.00",
      "source": "MACHINE_DEFINED",
      "sourceId": "rule-press-madrid-01"
    },
    {
      "code": "MATERIAL_SURCHARGE",
      "amount": "120.50",
      "source": "MATERIAL_DEFINED",
      "sourceId": "mat-silk-300g"
    },
    {
      "code": "FINISHING_OPERATION",
      "amount": "55.00",
      "source": "SITE_DEFINED",
      "sourceId": "finishing-cut-fold"
    }
  ]
}
```
This guarantees complete economic auditability.
