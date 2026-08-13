# Phase 191D: Machine API Contract

## 1. Scope
This document outlines the API route contract for the Machinery and Capability domains in the onboarding sequence.

---

## 2. API Endpoint Definitions

All paths are prefixed with `/api/printhouse/onboarding`.

### 2.1 Machine Templates
* **Endpoint**: `GET /machines/templates`
* **Response**:
  ```json
  {
    "ok": true,
    "templates": [
      {
        "template_id": "OFFSET_PRESS",
        "machine_type": "OFFSET_PRESS",
        "defaults": { ... }
      },
      ...
    ]
  }
  ```

### 2.2 Capability Types
* **Endpoint**: `GET /capabilities/types`
* **Response**:
  ```json
  {
    "ok": true,
    "types": [
      {
        "type": "PRINT_CMYK",
        "label": "CMYK Color Printing",
        "module": "PRINT"
      },
      ...
    ]
  }
  ```

### 2.3 List Machines
* **Endpoint**: `GET /sites/:siteId/machines`
* **Response**:
  ```json
  {
    "ok": true,
    "machines": [
      {
        "id": "mach_123...",
        "machine_name": "Offset Press 1",
        "status": "ACTIVE",
        ...
      }
    ]
  }
  ```

### 2.4 Create Machine
* **Endpoint**: `POST /sites/:siteId/machines`
* **Request Body**:
  ```json
  {
    "machine_name": "New Digital Press",
    "template_id": "DIGITAL_PRESS",
    "max_sheet_width_mm": 500
  }
  ```
* **Response (HTTP 201)**:
  ```json
  {
    "ok": true,
    "machine": {
      "id": "mach_xyz...",
      "printhouse_id": "site-A",
      "machine_name": "New Digital Press",
      "status": "ACTIVE",
      ...
    }
  }
  ```

### 2.5 Get Machine
* **Endpoint**: `GET /sites/:siteId/machines/:machineId`
* **Response**:
  ```json
  {
    "ok": true,
    "machine": { ... }
  }
  ```

### 2.6 Update Machine
* **Endpoint**: `PUT /sites/:siteId/machines/:machineId`
* **Request Body**:
  ```json
  {
    "machine_name": "Updated Press Name",
    "status": "MAINTENANCE"
  }
  ```
* **Response**:
  ```json
  {
    "ok": true,
    "machine": { ... }
  }
  ```

### 2.7 Archive Machine
* **Endpoint**: `DELETE /sites/:siteId/machines/:machineId`
* **Response**:
  ```json
  {
    "ok": true,
    "status": "ARCHIVED"
  }
  ```

### 2.8 Site Capabilities
* **Endpoint**: `GET /sites/:siteId/capabilities`
* **Response**:
  ```json
  {
    "site_id": "site-A",
    "tenant_id": "tenant-a",
    "machine_count": 2,
    "capabilities": [
      {
        "type": "PRINT_CMYK",
        "label": "CMYK Color Printing",
        "module": "PRINT",
        "active": true,
        "source_machine_ids": ["mach_1", "mach_2"]
      }
    ],
    "capability_count": 1
  }
  ```

### 2.9 Tenant Capabilities Summary
* **Endpoint**: `GET /capabilities/summary`
* **Response**:
  ```json
  {
    "tenant_id": "tenant-a",
    "site_count": 1,
    "total_machines": 2,
    "capabilities_summary": { ... }
  }
  ```
