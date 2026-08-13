# Phase 191C — Company Profile API Contract

## Endpoints

### `GET /api/printhouse/onboarding/company-profile`
* **Response:**
  ```json
  {
    "ok": true,
    "data": {
      "tenantId": "ph-12345678",
      "companyName": "PrintPrice Madrid S.L.",
      "legalName": "PrintPrice Madrid S.L.",
      "tradingName": "PrintMadrid",
      "country": "ES",
      "city": "Madrid",
      "phone": "+34912345678",
      "contactName": "Carlos Gomez"
    }
  }
  ```

### `PATCH /api/printhouse/onboarding/company-profile`
* **Request:**
  ```json
  {
    "legalName": "PrintPrice Madrid S.L.",
    "tradingName": "PrintMadrid",
    "country": "ES",
    "city": "Madrid",
    "address": "Calle Industria 45",
    "phone": "+34912345678"
  }
  ```
* **Response:**
  ```json
  {
    "ok": true,
    "data": { "tenantId": "ph-12345678", "legalName": "PrintPrice Madrid S.L.", "country": "ES" }
  }
  ```
