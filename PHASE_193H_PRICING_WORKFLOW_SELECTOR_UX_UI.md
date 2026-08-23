# Phase 193H Audit Report — Pricing Workflow Selector UX/UI

## 1. Executive Summary & Objective

In the **PPOS Control Plane → Printhouse Workspace → Pricing** tab, the previous interface simultaneously rendered the **Pricing Calibration Assistant** and the **Manual Industrial Rate Card Configuration** directly in stacked vertical order. This caused cognitive overload and made both setup paths appear as though they had to be executed simultaneously.

Phase 193H resolves this by introducing a clear **Choice-First interaction model**:
1. Users are presented with two side-by-side workflow selection cards:
   - **Assistant-Guided Pricing** (Default / Recommended)
   - **Manual Rate Card Setup**
2. Selecting a workflow promotes that workflow as the primary visible interface.
3. The unselected alternative remains readily accessible beneath the primary view as a clean, collapsed secondary panel with an explicit "Open" toggle, preserving user control and existing form state without clutter.

---

## 2. Invariants & Governance Compliance

* **Zero Pricing/Solver Mutation**: No pricing mathematics, solver tolerances, inverse equations, or reachability rules were altered.
* **Canonical Baseline Preserved**: Baseline Revision 4 remains canonical (`prev-1b6d9af1`, Checksum `39ded89fed4da1a721fa34d6ac392a70bc3096ea890560b8add9638f0d9baf7a`).
* **Zero Database Writes**: Toggling between workflows, expanding panels, and viewing rate cards triggers zero session/run/revision creations or database writes.
* **Zero Stage 1 Governance Alteration**: Production activation, node reachability, and financial operations gates remain intact.

---

## 3. UI/UX Interaction Model Details

### 3.1 Prominent Workflow Selector
- **Heading**: `Choose Your Pricing Workflow`
- **Helper Text**: `Select how you want to configure pricing for this production node. You can switch later.`
- **Side-by-side cards** on desktop (`grid-cols-1 md:grid-cols-2`), stacking cleanly on mobile.
- **Visual styling**:
  - Selected: Red accent border (`#dc0000`), subtle red background tint, filled radio indicator.
  - Unselected: Neutral light border, standard background, unfilled radio indicator.
  - Badges: `Recommended` badge on Assistant-Guided Pricing.
- **Contextual Status Bar**:
  - Shows `Workflow selected: Assistant` (or `Manual Rate Card`) with a subtle `Switch` action link.

### 3.2 Assistant Mode
- Renders `QuickCalibrationPanel` as the primary workspace (including the 5-step stepper: Describe Job → Review → Manufacturing Cost → Calibrate → Test Pricing).
- Renders `Manual Rate Card Configuration` as a collapsed secondary panel underneath (`Open Manual Setup` / `Close Manual Setup`).

### 3.3 Manual Mode
- Renders `CanonicalIndustrialPricingEditor` as the primary workspace (preserving all tabs: Basic, Operational, Interior, Cover & Endpapers, Lamination & UV, Binding, Paper Costs, Transport).
- Renders `Assistant-Guided Pricing` as a collapsed secondary panel underneath (`Open Assistant` / `Close Assistant`).

### 3.4 Downstream Policies
- `Commercial Pricing Policies & Markups` remains in its own optional, collapsed section below.

---

## 4. Components Changed & Created

| File | Type | Changes |
| :--- | :--- | :--- |
| [`src/ui/components/printhouse/pricing/PricingWorkflowSelector.tsx`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/ui/components/printhouse/pricing/PricingWorkflowSelector.tsx) | **[NEW]** | Choice-First workflow cards & contextual selection row component. |
| [`src/ui/components/printhouse/setup/PricingPanel.tsx`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/ui/components/printhouse/setup/PricingPanel.tsx) | **[MODIFY]** | Integrated `PricingWorkflowSelector`, added `selectedWorkflow` (`assistant` \| `manual`) and `isSecondaryExpanded` state, conditionally rendering the primary workflow and the collapsed alternative. |

---

## 5. Verification & Build Evidence

- **Vite Production Build**: Passed with zero errors (`✓ built in 10.73s`).
- **Interaction Verification**:
  - Assistant selected by default with clear hierarchy.
  - Switching to Manual smoothly elevates industrial rate-card tables.
  - Collapsing/expanding secondary panels works seamlessly.
  - Downstream commercial policies remain isolated.
