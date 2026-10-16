# TypeScript Diagnostic Comparison Report (diagnostic_comparison.md)

## 1. Metadata & Reproducibility
- **Target Remote Branch:** `feat/onboarding-guided-restructure`
- **Initial Baseline Commit for Structural Comparison:** `d50d473a54a14800ffd7026763bb3a0cf928d37d`
- **Prior Verified Checkpoint Commit:** `3601d6da2a5113beb463528f04daaeaee354c5eb`
- **Preceding Verified Remote Commit:** `a5dcfca5d4a497e146c9261e60376f31ca408ec7`
- **Diagnostic Command:** `npx tsc --noEmit`
- **Timestamp:** 2026-10-16
- **Vitest Suite Result:** 27 test files passed, 392/392 tests passed (0 failures)
- **Vite Build Result:** `npm run build` completed cleanly (0 errors, 3564 modules transformed)

---

## 2. Executive Summary
- **Total Workspace Baseline Errors:** 193 errors across 37 files.
- **Errors in Restructured Guided Onboarding Files:** **0** (All onboarding components are 100% clean).
- **Added Regressions:** 0
- **Deleted / Suppressed Valid Errors:** 0
- **Net TypeScript Delta in Onboarding Scope:** 0 added errors. Strict type safety preserved across all props, draft schemas, API payloads, and i18n dictionaries.
- **Evidence Provenance & Distinction:**
  - *Historical Evidence (v2 / v3 baseline):* Archived in `historical_baseline_evidence/` (labeled as historical mock evidence for stage navigation and error normalization).
  - *Final Candidate Evidence (v4 fresh):* Captured live in `fresh_pricing_ui_evidence/` directly against the candidate source on port 5179, covering compact substep navigation, price comparison cards, collapsed/expanded technical details, light/dark themes, and ES/EN/DE multilingual rendering with mocked API data labeled.

---

## 3. Granular Audit of Modified Onboarding Components

| File Path | Status | TypeScript Error Count | Diagnostic Codes |
| :--- | :---: | :---: | :--- |
| src/ui/components/printhouse/onboarding/GuidedPrinthouseJourney.tsx | Clean | 0 | None |
| src/ui/components/printhouse/onboarding/GuidedStepCompany.tsx | Clean | 0 | None |
| src/ui/components/printhouse/onboarding/GuidedStepProducts.tsx | Clean | 0 | None |
| src/ui/components/printhouse/onboarding/GuidedStepReview.tsx | Clean | 0 | None |
| src/ui/components/printhouse/onboarding/SimplifiedOnboardingJourney.tsx | Clean | 0 | None |
| src/ui/components/printhouse/onboarding/CalculationComparisonView.tsx | Clean | 0 | None |
| src/ui/components/printhouse/onboarding/VariantSpecTable.tsx | Clean | 0 | None |
| src/ui/pages/printhouse/GuidedOnboardingPage.tsx | Clean | 0 | None |
| src/ui/lib/onboardingDraftStore.ts | Clean | 0 | None |
| src/ui/es.ts | Clean | 0 | None |
| src/ui/en.ts | Clean | 0 | None |
| src/ui/de.ts | Clean | 0 | None |
| tests/GuidedPrinthouseJourney.test.tsx | Clean | 0 | None |
| tests/PrinthouseOnboardingAuditAndGovernance.test.tsx | Clean | 0 | None |

---

## 4. Full Workspace Diagnostic Log Summary (193 Pre-Existing Errors)
All pre-existing errors reside outside the guided onboarding subsystem in legacy or unrelated modules:

| File Path | Error Count | Primary Diagnostic Codes |
| :--- | :---: | :--- |
| src/ui/pages/preflight/PreflightArtifactsPage.tsx | 18 | TS2339 |
| src/ui/pages/beta/LimitedBetaPreparationGate.tsx | 14 | TS2322 |
| src/ui/pages/preflight/PreflightQuotasPage.tsx | 13 | TS2339 |
| src/ui/pages/preflight/PreflightWorkersPage.tsx | 12 | TS2339 |
| src/ui/pages/production/ControlledPrinthouseHandoffPackage.tsx | 12 | TS2322 |
| src/ui/pages/production/FoundingPrinthousePilotGate.tsx | 12 | TS2322 |
| src/ui/pages/production/SandboxCommercialPilot.tsx | 12 | TS2322 |
| src/ui/pages/production/ControlledProductionPilotActivation.tsx | 11 | TS2322 |
| src/ui/pages/production/InternalOrderLifecyclePilot.tsx | 11 | TS2322 |
| src/ui/pages/production/InternalOrderLifecycleRuntimeVerification.tsx | 10 | TS2322 |
| src/ui/pages/production/PilotEvidenceReviewGoNoGo.tsx | 8 | TS2322 |
| src/ui/pages/preflight/PreflightJobDetailPage.tsx | 6 | TS2339 |
| src/ui/components/AIAuditModal.tsx | 5 | TS2307, TS2339 |
| src/ui/pages/os/PrinthouseDetailPage.tsx | 5 | TS2339 |
| src/ui/components/EfficiencyAuditModal.tsx | 4 | TS2307, TS2339 |
| src/ui/pages/admin/ProductionDispatchTab.tsx | 4 | TS2304, TS2552 |
| src/ui/pages/os/MachinesPage.tsx | 4 | TS2339, TS2345 |
| src/ui/pages/preflight/PreflightLargeDocumentsPage.tsx | 4 | TS2339, TS2551 |
| src/ui/pages/production-monitoring/ProductionMonitoringDashboardPage.tsx | 3 | TS2345, TS2554, TS2561 |
| src/ui/pages/beta/ControlledBetaCohortInterventionSimulation.tsx | 2 | TS2304 |
| src/ui/pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenEnv.tsx | 2 | TS2561 |
| src/ui/pages/beta/ControlledBetaCohortInterventionSimulationReview.tsx | 2 | TS2353, TS2561 |
| src/ui/pages/global/GlobalIncidents.tsx | 2 | TS2552 |
| src/ui/pages/intelligence/StrategyPerformance.tsx | 2 | TS2304 |
| src/ui/pages/pre-production/OperationalReadinessBoard.tsx | 2 | TS2352 |
| src/ui/pages/preflight/PreflightUploadModal.tsx | 2 | TS2304 |
| src/ui/components/auth/AuthToast.tsx | 1 | TS2322 |
| src/ui/components/LiveDispatchMap.tsx | 1 | TS2339 |
| src/ui/components/printhouse/pricing/quick-calibration/GovernedQuoteSmokeTest.tsx | 1 | TS2345 |
| src/ui/components/SubscriptionGuard.tsx | 1 | TS2339 |
| src/ui/pages/admin/RoutingDecisionTab.tsx | 1 | TS2304 |
| src/ui/pages/os/OrdersPage.tsx | 1 | TS2322 |
| src/ui/pages/os/PrinthousesPage.tsx | 1 | TS2353 |
| src/ui/pages/os/TenantsPage.tsx | 1 | TS2741 |
| src/ui/pages/printhouse/MachineCapabilityEditor.tsx | 1 | TS2551 |
| src/ui/pages/PrinthouseActivationPage.tsx | 1 | TS2322 |
| src/ui/pages/production/NodeMatchingTab.tsx | 1 | TS2339 |

---

## 5. Verification Verdict
No TypeScript errors exist in the guided printhouse onboarding subsystem. Typecheck baseline was preserved without suppressions or regressions.
