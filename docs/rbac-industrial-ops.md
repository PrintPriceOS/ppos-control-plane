# RBAC Matrix — Industrial Operations

| Action | SUPER_ADMIN | OPS_ADMIN | TENANT_ADMIN | VIEWER |
|---|:---:|:---:|:---:|:---:|
| **Orchestration** | | | | |
| View Fleet Health | ✅ | ✅ | ❌ | ✅ |
| Quarantine Worker | ✅ | ✅ | ❌ | ❌ |
| Manual Scheduling | ✅ | ✅ | ❌ | ❌ |
| **Artifacts** | | | | |
| View Artifact Registry | ✅ | ✅ | ✅ (Own) | ✅ (Own) |
| Forensic Traceability | ✅ | ✅ | ✅ (Own) | ❌ |
| Manual Purge | ✅ | ❌ | ❌ | ❌ |
| **Incidents** | | | | |
| View Incident Registry | ✅ | ✅ | ✅ (Impacted) | ✅ (Impacted) |
| Raise Incident | ✅ | ✅ | ✅ (Bug Report) | ❌ |
| Resolve Incident | ✅ | ✅ | ❌ | ❌ |
| **Lifecycle** | | | | |
| View Policies | ✅ | ✅ | ✅ (Own) | ✅ (Own) |
| Manage Global Policy | ✅ | ❌ | ❌ | ❌ |
| Sync Lifecycle | ✅ | ✅ | ❌ | ❌ |

## Security Implementation
*   **Token-Based**: All industrial endpoints require `Bearer` token with `SUPER_ADMIN` or `OPS_ADMIN` claims.
*   **Audit**: Every destructive action (quarantine, purge, policy change) is recorded in `api_audit_log`.
*   **Fail-Safe**: By default, mutations return `403 Forbidden` if role is insufficient or ambiguous.
