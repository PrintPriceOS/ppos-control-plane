# PHASE_192F_DATABASE_ACCEPTANCE.md

## Phase 192F — Database Migration Acceptance

### Migration
`145_phase192f_runtime_observability_kill_switches.sql`

### Migration Number
145

---

## Tables Created

### `runtime_kill_switches`

| Column | Type | Notes |
|--------|------|-------|
| `id` | VARCHAR(64) PK | Unique kill switch ID |
| `scope` | ENUM('GLOBAL','TENANT','PRINTHOUSE','SITE') | Scope of override |
| `target_id` | VARCHAR(64) | Tenant/site target; 'ALL' for GLOBAL |
| `capability` | VARCHAR(64) | Capability name or 'ALL' |
| `status` | ENUM('ACTIVE','CLEARED') | Kill switch state |
| `reason_code` | VARCHAR(64) | Required: machine-readable reason |
| `description` | TEXT | Optional human-readable description |
| `actor_id` | VARCHAR(64) | Operator who activated the switch |
| `created_at` | DATETIME | Activation timestamp |
| `cleared_at` | DATETIME NULL | Clearing timestamp |
| `cleared_by` | VARCHAR(64) NULL | Operator who cleared the switch |

### `runtime_incidents`

| Column | Type | Notes |
|--------|------|-------|
| `id` | VARCHAR(64) PK | Unique incident ID |
| `title` | VARCHAR(255) | Human-readable incident title |
| `severity` | ENUM('LOW','MEDIUM','HIGH','CRITICAL') | Impact level |
| `status` | ENUM('OPEN','INVESTIGATING','RESOLVED') | Incident state |
| `created_at` | DATETIME | Detection timestamp |
| `resolved_at` | DATETIME NULL | Resolution timestamp |

---

## Migration Registration

Registered in `migrations/migration-integrity-baseline.json`:
```json
"145": { "description": "Phase 192F Runtime Observability Kill Switches", "status": "registered" }
```

---

## DATABASE_ACCEPTANCE: PASS
