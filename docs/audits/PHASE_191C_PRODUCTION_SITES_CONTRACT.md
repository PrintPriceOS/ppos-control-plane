# Phase 191C — Production Sites API Contract

## Endpoints

### `GET /api/printhouse/onboarding/sites`
* **Response:**
  ```json
  {
    "ok": true,
    "data": {
      "sites": [
        {
          "siteId": "node-12345678",
          "siteName": "Madrid Central Production Plant",
          "country": "ES",
          "city": "Madrid",
          "timezone": "Europe/Madrid",
          "isPrimary": true,
          "status": "CONFIGURING"
        }
      ]
    }
  }
  ```

### `POST /api/printhouse/onboarding/sites`
* **Request:**
  ```json
  {
    "siteName": "Barcelona Satellite Facility",
    "country": "ES",
    "city": "Barcelona",
    "timezone": "Europe/Madrid"
  }
  ```
* **Response (HTTP 201):** Returns site object.

### `PATCH /api/printhouse/onboarding/sites/:siteId`
* Updates site details for matching `siteId` owned by authenticated `tenantId`.

### `DELETE /api/printhouse/onboarding/sites/:siteId`
* Archives unused site if tenant has more than 1 site.
