# Phase 191G: Frontend Acceptance

## 1. UI Components Verified
- **[ShippingPanel.tsx](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/ui/components/printhouse/setup/ShippingPanel.tsx)**: Displays shipping regions list, form for adding standard/expedited transit & handling days, pickup checkbox, and non-binding delivery estimate calculator widget.
- **[IntegrationsPanel.tsx](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/ui/components/printhouse/setup/IntegrationsPanel.tsx)**: Displays integration cards for API, Webhook, JDF/JMF, and MIS. Supports credential creation with single-reveal secret modal, secret masked placeholders (`••••••••••••••••`), rotation, and connectivity test trigger with SSRF status feedback.
- **[PrinthouseSetupHub.tsx](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/ui/pages/printhouse/PrinthouseSetupHub.tsx)**: Enabled Shipping and Integrations tabs.

## 2. Safety & UX Guarantees
- No raw secrets displayed on reload (masked placeholders only).
- Delivery estimate calculation marked explicitly as non-binding.
- Marketplace publication toggle remains disabled until Phase 191H.
