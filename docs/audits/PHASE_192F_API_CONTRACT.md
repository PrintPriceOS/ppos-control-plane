# PHASE_192F_API_CONTRACT.md

## Phase 192F — Admin Runtime Operations API Contract

### Mount Point
`/api/admin/runtime`

### Authorization
All endpoints require role: `SUPER_ADMIN` | `GLOBAL_ADMIN` | `PLATFORM_OPERATOR`
(enforced via `x-user-role` header; `403 FORBIDDEN_OPERATIONAL_ROLE` on violation)

---

## Endpoints

### GET /api/admin/runtime/health

Returns current domain-level operational health and active kill switch count.

**Response 200:**
```json
{
  "success": true,
  "health": {
    "overallStatus": "HEALTHY",
    "activeKillSwitchesCount": 0,
    "evaluatedAt": "2026-08-13T08:48:00.000Z",
    "domains": {
      "quoting": { "status": "HEALTHY", "capabilityEnabled": true, "metrics": {} },
      "dispatch": { "status": "PAUSED", "capabilityEnabled": false, "metrics": {} }
    }
  }
}
```

---

### GET /api/admin/runtime/kill-switches

Returns list of currently active emergency kill switch overrides.

**Response 200:**
```json
{
  "success": true,
  "killSwitches": [
    { "id": "ks_...", "scope": "GLOBAL", "capability": "PRODUCTION_DISPATCH_ALLOWED", "reasonCode": "FLEET_HALT", "status": "ACTIVE" }
  ]
}
```

---

### POST /api/admin/runtime/kill-switches

Activates an emergency kill switch override.

**Request Body:**
```json
{
  "scope": "GLOBAL | TENANT | PRINTHOUSE | SITE",
  "targetId": "tenant_id | site_id | null",
  "capability": "ALL | MARKETPLACE_VISIBLE | LIVE_QUOTING_ALLOWED | JOB_ROUTING_ALLOWED | PRODUCTION_DISPATCH_ALLOWED",
  "reasonCode": "DISPATCH_ANOMALY",
  "description": "Optional human-readable description"
}
```

**Error Codes:**
- `400 KILL_SWITCH_INVALID_PARAMETERS` — missing reasonCode
- `400 KILL_SWITCH_INVALID_SCOPE` — invalid scope value

---

### POST /api/admin/runtime/kill-switches/:id/clear

Clears an active emergency kill switch override. Restores effective capability to activation grant state.

**Response 200:**
```json
{ "success": true, "cleared": true, "killSwitch": { "id": "...", "status": "CLEARED" } }
```

**Response 404:**
```json
{ "success": false, "code": "KILL_SWITCH_NOT_FOUND_OR_ALREADY_CLEARED" }
```

---

## API_CONTRACT_COVERAGE: COMPLETE
