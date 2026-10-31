# PHASE_191D2_FRONTEND_ACCEPTANCE.md

## Frontend Compilation Status
Vite build verification has been successfully executed:
- **Build Command**: `npm run build`
- **Exit Code**: `0`
- **Asset Size**:
  - `index-CF46vhlf.css`: 279.47 kB
  - `index-DCm2eeKC.js`: 2,701.60 kB
- **Warnings / Regressions**: None. Typescript compilation checks passed without errors.

---

## Component Level Acceptance

### 1. PrinthouseSetupHub.tsx
- **Module Lock Gating**:
  - Gated tabs: Machinery Fleet and Capabilities are locked (disabled state) until at least one production site is configured.
  - Locking state respects the `sites.length > 0` condition, disabling clicks and applying lower opacity (0.6) with `not-allowed` cursor.
- **Dynamic Badges**:
  - Sub-module statuses in the Hub overview grid are derived dynamically from `readiness.operationalReadiness` details, preventing state mismatch.

### 2. MachineFleetPanel.tsx
- **Site Selector**: Drops down a custom selector if the printer node fleet spans multiple locations.
- **Template Quick-Start**: Features 5 card templates (Offset, Digital, Large Format, Binder, Finisher) to instantiate machines with single-click defaults.
- **Archival Flow**: Asks for explicit confirmation inside the UI before executing soft-delete (DELETE request to endpoint).
- **Validation Alerts**: Surfaced when missing names, or if limits exceed boundaries. Surfaces protected field error block if payload validation rejects it.

### 3. CapabilitiesPanel.tsx
- **Grouping structure**: Segmented visually into 4 modules: PRINT, FINISHING, QUALITY, and FORMAT.
- **Provenance announcement**: Disseminates alert explaining that capabilities are auto-derived from active machine registry parameters (CMYK support, binder functions, sheets width).
- **Archived entities excluded**: Displays capability tags representing only active (non-archived) machines.
