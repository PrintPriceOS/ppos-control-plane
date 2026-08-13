# Phase 191G: API Contract

## 1. Shipping Endpoints (`/api/printhouse/onboarding/shipping`)
- `GET    /regions`: List shipping regions.
- `POST   /regions`: Create shipping region.
- `GET    /regions/:regionId`: Get region details.
- `PUT    /regions/:regionId`: Update region.
- `DELETE /regions/:regionId`: Archive region.
- `GET    /sites/:siteId/methods`: List delivery methods.
- `POST   /sites/:siteId/methods`: Add delivery method.
- `POST   /estimate`: Non-binding delivery window estimate calculation.
- `GET    /readiness`: Check shipping configuration completeness.

## 2. Integration Endpoints (`/api/printhouse/onboarding/integrations`)
- `GET    /`: List integration profiles.
- `POST   /`: Create integration profile.
- `GET    /:integrationId`: Get integration profile details.
- `PUT    /:integrationId`: Update integration profile.
- `DELETE /:integrationId`: Disable integration profile.
- `POST   /:integrationId/test`: Perform SSRF-validated connectivity test.
- `POST   /:integrationId/webhook`: Configure webhook target.
- `GET    /:integrationId/credentials`: List credentials (masked).
- `POST   /:integrationId/credentials`: Issue new credential (single-reveal secret).
- `POST   /:integrationId/credentials/rotate`: Rotate credential.
- `DELETE /:integrationId/credentials/:credentialId`: Revoke credential.
- `GET    /readiness`: Check integration completeness.
