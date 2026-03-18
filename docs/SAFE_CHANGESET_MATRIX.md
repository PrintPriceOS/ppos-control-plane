# SAFE_CHANGESET_MATRIX

**Rollout Strategy**: Conservative / Low-Risk
**Status**: 🟢 READY FOR DEPLOYMENT (v1.11.1)

This matrix defines the features to be moved to production in this phase.

| Feature | Change Description | Risk | Status |
| :--- | :--- | :--- | :--- |
| **UX & i18n** | Full English/Spanish dictionaries and UI selector. | 🟢 LOW | **INCLUDE** |
| **Structured Logging** | Pino child loggers with `jobId`, `tenantId`, `assetId`. | 🟢 LOW | **INCLUDE** |
| **Resilience Tuning** | 10 retries + 30s exponential backoff. | 🟢 LOW | **INCLUDE** |
| **Worker Heartbeat** | Automatic node discovery in Redis. | 🟢 LOW | **INCLUDE** |
| **Canonical Storage** | Usage of `PPOS_UPLOADS_DIR` instead of relative paths. | 🟡 MED | **INCLUDE** (Safe fallback) |
| **Validation Tools** | `production-smoke-test.sh` script. | 🟢 LOW | **INCLUDE** |
| **Forced Async Autofix** | Always enqueuing multipart uploads. | 🔴 HIGH | **DEFERRED** (Reverted) |
| **Auth Redesign** | Centralized JWT gateway. | 🟡 MED | **DEFERRED** (Planned) |

## ✅ Compatibility Result
By reverting the forced async behavior in `/autofix`, we preserve the **Binary Stream Response** expected by existing product clients. The internal storage of these fixed files now benefits from the canonical directory structure without breaking the external API contract.
