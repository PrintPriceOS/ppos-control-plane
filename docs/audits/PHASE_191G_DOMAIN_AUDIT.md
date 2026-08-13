# Phase 191G: Shipping & Integration Domain Audit

## 1. Scope
Audits existing shipping, delivery, carrier, transit time, and integration structures in `ppos-control-plane` prior to adding Phase 191G tables, services, and setup modules.

---

## 2. Mandatory Shipping Audit Verdicts

```text
IS_SHIPPING_REGION_TENANT_SCOPED: YES
```
- **Rationale**: All `printhouse_shipping_regions` entries contain a mandatory `tenant_id` foreign key referencing `tenants(id)`.

```text
IS_SHIPPING_REGION_SITE_SCOPED: YES
```
- **Rationale**: Shipping regions specify a mandatory `site_id` referencing physical print node facilities.

```text
IS_CARRIER_CONFIGURATION_SITE_SCOPED: YES
```
- **Rationale**: `printhouse_delivery_methods` link carriers (`carrier_name`, `service_level`) directly to site shipping regions.

```text
IS_SHIPPING_PRICE_PART_OF_PRICING_ENGINE: YES
```
- **Rationale**: Shipping delivery methods reference governed pricing rules (`cost_rule_id` linking to `printhouse_pricing_rules`) in Phase 191F price books rather than creating a duplicate secondary pricing model.

```text
IS_TRANSIT_TIME_SEPARATE_FROM_PRODUCTION_LEAD_TIME: YES
```
- **Rationale**: Production lead time (`production_lead_days` from Phase 191E) and transit days (`transit_days_min`/`transit_days_max` from Phase 191G) are separate, additive components of the non-binding estimated delivery window calculation.

---

## 3. Mandatory Integration Audit Verdicts

```text
JDF_SUPPORT: PARTIAL
JMF_SUPPORT: PARTIAL
WEBHOOK_SUPPORT: YES
PRINTHOUSE_API_KEYS: YES
MIS_CONNECTOR_MODEL: PARTIAL
INTEGRATION_SECRETS_ENCRYPTED_AT_REST: YES
```
- **Rationale**: Webhooks enforce signing secrets, event subscriptions, and SSRF security URL filtering. Printhouse API keys use server-side generation with single-reveal secrets, bcrypt/SHA256 hashes, and AES-256-GCM encryption at rest. JDF/JMF/MIS connectors track configuration & connectivity readiness separately from live production dispatch.
