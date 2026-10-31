# Production Dispatch Security Architecture

This document outlines the security controls, threat models, and hardening measures implemented for the Production Dispatch system in the PrintPrice OS Control Plane.

## 1. Security Principles

### 1.1 Multi-Tenant Isolation
All production entities (Packages, Dispatches, Nodes, Events) are strictly isolated by `tenant_id`. 
- **Customers**: Can only view and manage packages they own.
- **Printers**: Can only view dispatches and packages explicitly assigned to them.
- **Super Admins**: Have global visibility for platform management.

### 1.2 Principle of Least Privilege
- Printers never receive raw access to the customer's storage.
- Downloadable bundles are generated on-the-fly and only include authorized artifacts.
- API tokens for print nodes are scoped to specific production actions.

## 2. Hardening Measures

### 2.1 Artifact Ownership Validation
During **Production Package** creation and **Bundle Generation**, the system re-validates that every linked artifact (source, fixed, certified) belongs to the package owner's `tenant_id`. This prevents "Artifact ID Guessing" attacks across tenants.

### 2.2 Path Traversal Protection
Bundle generation uses `path.basename()` to sanitize all filenames before adding them to the ZIP archive. This ensures that malicious artifact names cannot inject files into unauthorized directories or overwrite system files during extraction.

### 2.3 Secure Bundle Streaming
Bundles are streamed directly from storage to the client via `archiver`. 
- Raw filesystem paths are **never** exposed in the ZIP metadata or logs.
- Temporary files are avoided to minimize the risk of sensitive data leaking into `/tmp`.

### 2.4 Transactional Audit Logging
Every sensitive operation (Dispatch, Accept, Download) triggers:
1. An entry in `audit_logs` (System Audit).
2. An entry in `production_events` (Workflow Audit).
3. A `SECURITY_ALERT` log if a cross-tenant access attempt is detected.

## 3. Threat Model & Mitigations

| Threat | Mitigation |
|--------|------------|
| **Cross-Tenant Artifact Access** | Strict ownership validation in `ProductionBundleService`. |
| **Dispatch Spoofing** | Validation of node identity and active printer license before dispatch. |
| **Unauthorized Job Acceptance** | Check that `receiver_tenant_id` matches the authenticated user's tenant. |
| **Path Traversal in Bundles** | Filename sanitization using `path.basename()`. |
| **Resource Exhaustion (ZIP bomb)** | Quota limits on package sizes and streaming-only generation. |

## 4. Identified Risks (Backlog)
- [ ] **Node Token Rotation**: Implement automatic rotation for print node API keys.
- [ ] **Malicious PDF Payloads**: Although preflight certified, production nodes should treat PDFs as untrusted input.
- [ ] **IP Leakage**: Ensure production bundles do not include internal metadata from the preflight engine.

---
*Last Updated: 2026-04-30*
