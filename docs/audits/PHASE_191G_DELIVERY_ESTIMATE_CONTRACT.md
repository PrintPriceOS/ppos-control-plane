# Phase 191G: Non-Binding Delivery Estimate Contract

## 1. Formula & Component Separation
The delivery estimate calculation explicitly separates production lead time from transit and handling time:

$$\text{PRODUCTION\_LEAD\_TIME} + \text{HANDLING\_TIME} + \text{TRANSIT\_TIME} = \text{ESTIMATED\_DELIVERY\_WINDOW}$$

- **Production Lead Time**: Sourced from Phase 191E production lead-time configurations.
- **Handling Days**: Sourced from site shipping region handling days.
- **Transit Days**: Sourced from region standard / expedited transit parameters.

## 2. API Contract
- **Endpoint**: `POST /api/printhouse/onboarding/shipping/estimate`
- **Request Body**:
  ```json
  {
    "siteId": "site-1",
    "regionId": "sreg_123",
    "productionLeadDays": 5,
    "isExpedited": false
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "estimate": {
      "timestamps": {
        "estimateRequestedAt": "2026-08-13T10:00:00Z",
        "productionCompleteAt": "2026-08-18T10:00:00Z",
        "dispatchReadyAt": "2026-08-19T10:00:00Z"
      },
      "estimatedDeliveryWindow": {
        "from": "2026-08-22",
        "to": "2026-08-24"
      },
      "nonBinding": true,
      "disclaimer": "Delivery estimate is indicative for operational planning and does not constitute a contractual guarantee or carrier shipping label creation."
    }
  }
  ```

## 3. Governance Constraints
- **Zero Side-Effects**: Calculates dates in-memory without creating orders, modifying quotes, or purchasing carrier labels.
- **Non-Contractual**: Returns `nonBinding: true` and disclaimer text.
