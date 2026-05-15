# Changelog - Hardened Intake Support (PrintPrice Pro v5.3)

All notable changes to the Control Plane for marketplace production intake support.

## [1.10.0] - 2026-05-15

### Added
- **Hardened Intake Schema**: Implemented `production_file_repositories`, `production_files`, and `production_file_events` tables for forensic asset tracking.
- **Production File Ingestion Service**: SSRF-safe background fetching of assets from external `DOWNLOAD_URL` sources.
- **Production File Upload Endpoint**: Authenticated multipart upload for local assets with magic byte validation.
- **Production File Validation Service**: Baseline PDF validation and optional Preflight certification gating.
- **Invoice Generation Service**: Secured financial gating; invoices can only be generated after asset validation.
- **Marketplace Dispatch Gating Service**: MES guardrails ensuring orders are PAID and VALIDATED before machine dispatch.
- **Printhouse Scoped API**: New `/api/printhouse/orders` routes providing isolated access to assigned orders and secure file downloads.
- **Marketplace Intake Admin UI**: High-density "Monolith" dashboard section in the order drawer for real-time intake observability.
- **Payment Infrastructure**: Schema for `printhouse_payment_settings` and order-linked `invoices`.

### Changed
- **Order Lifecycle**: Expanded `OrderStatus` to include industrial states: `FILES_PENDING`, `FILES_VALIDATED`, `INVOICE_PENDING`, `PAYMENT_PENDING`, `READY_FOR_PRINTHOUSE`.
- **Order Metadata**: Enhanced `orders` table with `selected_offer_id`, `production_files`, and `invoice_payment` JSON fields.
- **Admin Orders UI**: Injected industrial intake controls and status badges for operational intervention.

### Fixed
- **SSRF Vulnerability**: Prevented potential SSRF attacks in external file fetching via IP blocklists and protocol enforcement.
- **Financial Integrity**: Blocked premature payment links by decoupling offer selection from invoice generation.
