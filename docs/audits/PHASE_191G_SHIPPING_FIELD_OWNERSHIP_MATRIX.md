# Phase 191G: Shipping Field Ownership Matrix

| Field Name | Category | Editable by Printhouse Operator | Description | Protected |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Identifier | NO | Unique primary key (`sreg_...`) | YES |
| `tenant_id` | Boundary | NO | Multi-tenant boundary key | YES |
| `site_id` | Location | YES (on creation) | Print node site assignment | NO |
| `name` | Metadata | YES | Friendly shipping region name | NO |
| `code` | Metadata | YES | Short region code (`EU_CENTRAL`) | NO |
| `enabled` | State | YES | Active region flag | NO |
| `countries_json` | Scope | YES | Array of ISO country codes | NO |
| `postal_rules_json` | Scope | YES | Optional postal code rules | NO |
| `standard_transit_days` | Lead Time | YES | Standard transit days | NO |
| `expedited_transit_days` | Lead Time | YES | Expedited transit days | NO |
| `pickup_available` | Capability | YES | Customer pickup availability | NO |
| `handling_days` | Lead Time | YES | Origin handling days | NO |
| `routing_enabled` | Governance | NO | Governed routing authorization | YES |
| `marketplace_enabled` | Governance | NO | Marketplace publication state | YES |
| `created_at` | Audit | NO | Record creation timestamp | YES |
| `updated_at` | Audit | NO | Record modification timestamp | YES |

Any self-service attempt to mutate protected fields returns `FIELD_NOT_EDITABLE` (HTTP 400).
