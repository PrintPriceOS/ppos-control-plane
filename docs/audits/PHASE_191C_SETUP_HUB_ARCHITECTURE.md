# Phase 191C — Printhouse Setup Hub Architecture

## 1. Executive Summary
Phase 191C establishes the authenticated **Printhouse Setup Hub** (`/printhouse/setup`), enabling newly activated printing companies to progressively configure their workspace without being subjected to a monolithic 7-step wizard or forced through unneeded requirements before exploring the platform.

## 2. Information Architecture & Navigation
```
[ Authenticated User Landing ] ---> /printhouse/setup
                                          |
        +---------------------------------+---------------------------------+
        |                                 |                                 |
 [ Setup Overview Tab ]       [ Company Profile Tab ]         [ Production Sites Tab ]
 (Progress Summary & Cards)   (Legal & Trading Identity)     (Facility Nodes & Timezones)
```

## 3. Canonical Domain Model Findings
* **Canonical Production Site Verdict:** `IS_PRINTER_NODE_THE_CANONICAL_PRODUCTION_SITE: YES`
* A `printer_node` row in the database is the authoritative representation of a physical printing facility/site for a given `tenant_id`.
* The `DRAFT` printer node created during initial activation is reused and completed when configuring the primary site, preventing node duplication.
