# Phase 191A — Proposed API Contracts

## 1. Auth & Activation Endpoints

### `POST /api/auth/printhouse/start`
Initiates minimal signup.
* **Request:**
  ```json
  { "email": "contact@printhouse.com", "termsAccepted": true }
  ```
* **Response (Blind):**
  ```json
  { "ok": true, "message": "If this email is valid, an activation email has been sent." }
  ```

### `POST /api/auth/printhouse/activate`
Consumes single-use token and provisions user/tenant/node.
* **Request:**
  ```json
  { "token": "raw-hex-token-from-email", "password": "SecurePassword123!" }
  ```
* **Response:**
  ```json
  {
    "ok": true,
    "token": "jwt-token-string",
    "user": { "email": "contact@printhouse.com", "role": "PRINTHOUSE_ADMIN", "tenantId": "ph-12345678", "printhouseId": "node-12345678" }
  }
  ```

### `POST /api/auth/google`
Google OAuth / ID Token authentication.
* **Request:**
  ```json
  { "idToken": "google-jwt-id-token" }
  ```
* **Response:** Returns JWT token and user details if `email_verified` is true.

## 2. Onboarding Hub & Readiness Endpoints

### `GET /api/printhouse/onboarding`
* **Response:**
  ```json
  {
    "ok": true,
    "data": {
      "onboardingStatus": "IN_PROGRESS",
      "sections": {
        "company": "COMPLETE",
        "sites": "IN_PROGRESS",
        "machines": "NOT_STARTED",
        "capabilities": "NOT_STARTED",
        "pricing": "NOT_STARTED"
      }
    }
  }
  ```

### `GET /api/printhouse/onboarding/readiness`
* **Response:**
  ```json
  {
    "ok": true,
    "data": {
      "accountSetup": { "score": 100, "status": "COMPLETE" },
      "operationalReadiness": { "score": 25, "status": "INCOMPLETE", "missing": ["At least 1 active machine", "Material catalog"] },
      "marketplaceReadiness": { "score": 0, "status": "LOCKED", "missing": ["Pricing rules", "Tax/Billing profile"] }
    }
  }
  ```
