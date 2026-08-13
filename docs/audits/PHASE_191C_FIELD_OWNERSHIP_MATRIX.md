# Phase 191C — Field Ownership Matrix

## Canonical Field Mapping & Editability Rules

| Field Name | Storage Table | Target Column / JSON Path | Self-Service Editable? | Guidance / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `legalName` | `tenants` & `metadata_json` | `name` / `legal_name` | Yes | Legal name for invoicing/contracts |
| `tradingName` | `tenants.metadata_json` | `trading_name` | Yes | Public brand display name |
| `country` | `tenants.metadata_json` | `country` | Yes | Primary operating jurisdiction |
| `city` | `tenants.metadata_json` | `city` | Yes | Primary city location |
| `address` | `tenants.metadata_json` | `address` | Yes | Street address |
| `phone` | `tenants.metadata_json` | `phone` | Yes | Contact phone number |
| `contactName` | `tenants.metadata_json` | `contact_name` | Yes | Account manager name |
| `siteName` | `printer_nodes` | `name` | Yes | Facility name (e.g. Madrid Central Plant) |
| `siteCountry` | `printer_nodes` | `country` | Yes | Facility country |
| `siteCity` | `printer_nodes` | `city` | Yes | Facility city |
| `timezone` | `printer_nodes` | `region` | Yes | Production cut-off timezone |
| `tenant_id` | `tenants` / `printer_nodes` | `id` / `tenant_id` | **NO (Forbidden)** | Immutable tenant ownership |
| `status` | `printer_nodes` | `status` | **NO (Forbidden)** | Internal operational approval status |
| `marketplace_enabled`| `printer_nodes` | `marketplace_enabled` | **NO (Forbidden)** | Marketplace publication control |
