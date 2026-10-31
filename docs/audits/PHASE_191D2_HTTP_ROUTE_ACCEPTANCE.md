# PHASE_191D2_HTTP_ROUTE_ACCEPTANCE.md

## Endpoint Registration Check

The following routes have been registered and verified:

| Method | Path | Controller Handler | Authentication Hook |
| --- | --- | --- | --- |
| `GET` | `/api/printhouse/onboarding/machines/templates` | `templates` list | Bearer JWT (Printhouse role check) |
| `GET` | `/api/printhouse/onboarding/capabilities/types` | `types` list | Bearer JWT (Printhouse role check) |
| `GET` | `/api/printhouse/onboarding/sites/:siteId/machines` | `listMachines` | Bearer JWT + Tenant isolation check |
| `POST` | `/api/printhouse/onboarding/sites/:siteId/machines` | `createMachine` | Bearer JWT + Tenant isolation + protected fields block |
| `GET` | `/api/printhouse/onboarding/sites/:siteId/machines/:machineId` | `getMachine` | Bearer JWT + Tenant isolation check |
| `PUT` | `/api/printhouse/onboarding/sites/:siteId/machines/:machineId` | `updateMachine` | Bearer JWT + Tenant isolation + protected fields block |
| `DELETE` | `/api/printhouse/onboarding/sites/:siteId/machines/:machineId` | `archiveMachine` | Bearer JWT + Tenant isolation check |
| `GET` | `/api/printhouse/onboarding/sites/:siteId/capabilities` | `computeSiteCapabilities` | Bearer JWT + Tenant isolation check |
| `GET` | `/api/printhouse/onboarding/capabilities/summary` | `computeTenantCapabilities` | Bearer JWT (Printhouse role check) |

---

## Authentication Gating Results

Verified programmatically in `smoke_phase191d2_http_routes.js`:

| Scenario | HTTP Status | Expected Status | Result |
| --- | --- | --- | --- |
| **No JWT Header** | `401` | `401` | ✅ PASSED |
| **Malformed JWT Header** | `401` | `401` | ✅ PASSED |
| **Expired JWT** | `401` | `401` | ✅ PASSED |
| **Valid Printhouse Admin** | `200` | `200` | ✅ PASSED |
| **Suspended Tenant Admin** | `403` | `403` | ✅ PASSED |
| **Non-Printhouse User (Customer)** | `403` | `403` | ✅ PASSED |

---

## Tenant Isolation Results

| Scenario | HTTP Status | Expected Status | Result |
| --- | --- | --- | --- |
| **List Foreign Site** | `403` | `403` | ✅ PASSED |
| **Create in Foreign Site** | `403` | `403` | ✅ PASSED |
| **Read Foreign Machine** | `404` | `404` | ✅ PASSED |
| **Update Foreign Machine** | `404` | `404` | ✅ PASSED |

---

## Protected Payload Protection Results

Attempting to POST or PUT with a body containing protected fields (such as `id` or `tenant_id`) returns:
- **HTTP status**: `400 Bad Request`
- **Error code**: `FIELD_NOT_EDITABLE`
- **Violation details**: Safe list of blocked field names.
- **Verification status**: ✅ PASSED (verified for both POST and PUT endpoints).
