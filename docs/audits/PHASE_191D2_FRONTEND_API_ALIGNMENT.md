# PHASE_191D2_FRONTEND_API_ALIGNMENT.md

## Frontend/API Contract Matrix

The following table maps the Setup Hub frontend components to their respective backend API endpoints:

| Component | Target URL | HTTP Method | Request Body / Params | Expected Response |
| --- | --- | --- | --- | --- |
| `PrinthouseSetupHub.tsx` | `/api/printhouse/onboarding` | `GET` | *(None)* | `{ ok: true, data: { company, sites, readiness } }` |
| `MachineFleetPanel.tsx` | `/api/printhouse/onboarding/sites/:siteId/machines` | `GET` | `siteId` (params) | `{ ok: true, machines: [...] }` |
| `MachineFleetPanel.tsx` | `/api/printhouse/onboarding/sites/:siteId/machines` | `POST` | `siteId` (params), `body` (machine info) | `{ ok: true, machine: { ... } }` |
| `MachineFleetPanel.tsx` | `/api/printhouse/onboarding/sites/:siteId/machines/:machineId` | `PUT` | `siteId`, `machineId` (params), `body` (updates) | `{ ok: true, machine: { ... } }` |
| `MachineFleetPanel.tsx` | `/api/printhouse/onboarding/sites/:siteId/machines/:machineId` | `DELETE` | `siteId`, `machineId` (params) | `{ ok: true, status: 'ARCHIVED' }` |
| `MachineFleetPanel.tsx` | `/api/printhouse/onboarding/machines/templates` | `GET` | *(None)* | `{ ok: true, templates: [...] }` |
| `CapabilitiesPanel.tsx` | `/api/printhouse/onboarding/sites/:siteId/capabilities` | `GET` | `siteId` (params) | `{ site_id, capabilities: [...], capability_count }` |
| `CapabilitiesPanel.tsx` | `/api/printhouse/onboarding/capabilities/types` | `GET` | *(None)* | `{ ok: true, types: [...] }` |

---

## Alignment Verification

- **HTTP Method Matching**:
  - Frontend uses `PUT` for updates; backend routes explicitly map `PUT` under `/sites/:siteId/machines/:machineId`.
  - Frontend uses `DELETE` for archival; backend routes map `DELETE` which triggers `printhouseMachineService.archiveMachine` (soft delete).
- **Token Authorization**:
  - Every fetch call in the frontend includes:
    `headers: { 'Authorization': 'Bearer ' + token }`
    retrieved from `getAuthToken()` in `authStore.ts`.
- **Payload Shape Compatibility**:
  - The request shapes match: machine templates defs map default properties directly, and overrides are combined prior to sending.
  - The response shapes are parsed identically: `res.json()` data is mapped to state arrays (`machines`, `capabilities`).
