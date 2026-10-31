# Phase 191A — Field to Storage Matrix

## Overview
This matrix maps every field collected during registration/onboarding to its canonical database storage path, business classification, and recommended onboarding phase.

| Field Name | Category | Database Table | Target Column / JSON Path | Onboarding Stage | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `email` | Identity Critical | `control_users` / `printhouse_signup_requests` | `email`, `email_normalized` | 1. Registration | Normalized to lowercase |
| `password` | Identity Critical | `control_users` | `password_hash` | 1. Registration (Email flow) | Bcrypt hash cost 12 |
| `contactName` | Account Critical | `control_users` / `printer_nodes` | `name` / `metadata_json.contact_name` | 2. Account Setup | Account manager/admin contact |
| `companyName` | Account Critical | `tenants` & `printer_nodes` | `name` | 2. Account Setup | Official business entity name |
| `country` | Account Critical | `printer_nodes` | `country` | 2. Account Setup | ISO 2-letter country code |
| `city` | Account Critical | `printer_nodes` | `city` | 2. Account Setup | Operational city location |
| `phone` | Account Critical | `printer_nodes` | `phone` | 2. Account Setup | Primary phone contact |
| `website` | Account Critical | `printer_nodes` | `website` | 2. Account Setup | Business website URL |
| `presses` | Operational | `printhouse_machines` | Independent machine rows | 3. Production Sites & Machines | Sheet limits, dimensions, capabilities |
| `productionTypes` | Operational | `printhouse_capabilities` | `metadata_json.production_types` | 3. Production Capabilities | Offset, Digital, Large Format, etc. |
| `certifications` | Marketplace-Only | `printhouse_capabilities` | `metadata_json.certifications` | 3. Marketplace Readiness | ISO 12647, FOGRA, FSC, etc. |
| `qaModules` | Operational | `printhouse_capabilities` | `metadata_json.qa_modules` | 3. Production Capabilities | Preflight, densitometry, sampling |
| `selectedPlan` | Commercial | `tenants` & `tenant_licenses` | `plan` | 3. Commercial Setup | Default: Trial/Starter |
| `integrationLevel`| Integration | `tenants.metadata_json` | `qualification.integrationLevel` | 3. Integrations | Dashboard Only, API, Webhooks, JDF |
| `billingInterval` | Commercial | `tenants.metadata_json` | `qualification.billingInterval` | 3. Commercial Setup | Monthly vs Annual |
| `orchestrationPerms`| Integration | `tenants.metadata_json` | `orchestration_permissions` | 3. Integrations | Computed based on plan |
