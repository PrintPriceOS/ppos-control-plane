# Phase 191G.1: Frontend & API Alignment Audit

## 1. Route & Payload Alignment Matrix

| Frontend Component | Action | Target API Endpoint | HTTP Method | Payload / Params | Alignment Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ShippingPanel.tsx` | List Regions | `/api/printhouse/onboarding/shipping/regions` | GET | `siteId` | **MATCH** |
| `ShippingPanel.tsx` | Create Region | `/api/printhouse/onboarding/shipping/regions` | POST | `name`, `code`, `countries`, `standardTransitDays`, `expeditedTransitDays`, `handlingDays`, `pickupAvailable` | **MATCH** |
| `ShippingPanel.tsx` | Calculate Estimate | `/api/printhouse/onboarding/shipping/estimate` | POST | `siteId`, `regionId`, `productionLeadDays`, `isExpedited` | **MATCH** |
| `IntegrationsPanel.tsx` | List Profiles | `/api/printhouse/onboarding/integrations` | GET | `siteId` | **MATCH** |
| `IntegrationsPanel.tsx` | Create Profile | `/api/printhouse/onboarding/integrations` | POST | `name`, `integrationType`, `endpointUrl` | **MATCH** |
| `IntegrationsPanel.tsx` | Issue Credential | `/api/printhouse/onboarding/integrations/:id/credentials` | POST | `scopes` | **MATCH** |
| `IntegrationsPanel.tsx` | Test Connectivity | `/api/printhouse/onboarding/integrations/:id/test` | POST | `{}` | **MATCH** |

## 2. One-Time Secret & UI Security Guarantees
- Single-reveal secret displayed in temporary green modal (`oneTimeSecret`).
- Masked placeholders (`••••••••••••••••`) displayed on subsequent reloads.
- Non-binding delivery window disclaimer displayed prominently.
- Marketplace publication controls remain disabled.
