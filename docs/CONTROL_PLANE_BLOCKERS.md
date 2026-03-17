# CONTROL_PLANE_BLOCKERS

## 🚩 Production Blockers

1. **Hardcoded Monolith Strings**: Some services might still have hardcoded references to monolithic configurations or file paths (e.g. `/tmp/preflight/...`).
2. **Database Schema**: The control plane needs its own schema or a safe view into the monolith DB via Shared Infra.
3. **SSO/Auth**: The stubbed auth is unsafe for anything but local development.
4. **Build Pipeline**: Missing CI/CD for the new repository.
5. **i18n**: Missing actual translations for admin-specific keys.

## 🟡 Non-Blocking (Iteration Phase)
- Analytics charts might not render without real time-series data.
- Search functions in Admin Dashboard will return empty results.
