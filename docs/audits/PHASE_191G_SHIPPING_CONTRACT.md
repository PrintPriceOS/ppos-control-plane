# Phase 191G: Shipping Configuration & Regions Contract

## 1. Domain Scope
Printhouse shipping configuration defines:
1. **Regions Served**: Countries and optional postal-code rules.
2. **Delivery Methods**: Carrier names, service levels, and transit ranges.
3. **Handling Days**: Origin dispatch processing lead time.
4. **Pickup Availability**: Local customer pickup options.

## 2. API Matrix
- `GET    /api/printhouse/onboarding/shipping/regions`: List shipping regions.
- `POST   /api/printhouse/onboarding/shipping/regions`: Create shipping region.
- `GET    /api/printhouse/onboarding/shipping/regions/:regionId`: Get region details.
- `PUT    /api/printhouse/onboarding/shipping/regions/:regionId`: Update region.
- `DELETE /api/printhouse/onboarding/shipping/regions/:regionId`: Archive region.
- `GET    /api/printhouse/onboarding/shipping/sites/:siteId/methods`: List delivery methods.
- `POST   /api/printhouse/onboarding/shipping/sites/:siteId/methods`: Add delivery method.
- `GET    /api/printhouse/onboarding/shipping/readiness`: Check shipping completeness.
