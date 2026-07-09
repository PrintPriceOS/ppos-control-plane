import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './layout/Layout';
import { DashboardPage } from './pages/os/DashboardPage';
import { CommandCenterPage } from './pages/admin/CommandCenterPage';
import TenantManagement from './pages/admin/TenantManagement';
import { JobsPage } from './pages/os/JobsPage';
import { QueuesWorkersPage } from './pages/os/QueuesWorkersPage';
import { GovernancePage } from './pages/os/GovernancePage';
import { DeploymentsPage } from './pages/os/DeploymentsPage';
import { UsageQuotasPage } from './pages/os/UsageQuotasPage';
import { PrinthousesPage } from './pages/os/PrinthousesPage';
import { PrinthouseDetailPage } from './pages/os/PrinthouseDetailPage';
import { OrdersPage } from './pages/os/OrdersPage';
import { SystemHealthPage } from './pages/os/SystemHealthPage';
import { RuntimeContextPage } from './pages/os/RuntimeContextPage';
import { MachinesPage } from './pages/os/MachinesPage';
import { AdminDashboard } from './pages/AdminDashboard'; // Legacy Dashboard
import { MarketplacePage } from './pages/admin/MarketplacePage';
import { MarketplaceOrdersPage } from './pages/MarketplaceOrdersPage';
import { PricingIntelligenceTab } from './pages/admin/PricingIntelligenceTab';
import { FinancialOpsTab } from './pages/admin/FinancialOpsTab';
import { SuccessWorkspace } from './pages/admin/SuccessWorkspace';
import { IntelligenceOverview } from './pages/intelligence/IntelligenceOverview';
import { AnomalyList } from './pages/intelligence/AnomalyList';
import { InsightList } from './pages/intelligence/InsightList';
import { RecommendationList } from './pages/intelligence/RecommendationList';
import { TenantRiskPage } from './pages/intelligence/TenantRiskPage';
import { DeploymentRiskPage } from './pages/intelligence/DeploymentRiskPage';
import { TrendDashboard } from './pages/intelligence/TrendDashboard';
import GuardrailsDashboard from './pages/intelligence/GuardrailsDashboard';
import CircuitBreakerPanel from './pages/intelligence/CircuitBreakerPanel';
import { OptimizationDashboard } from './pages/intelligence/OptimizationDashboard';
import { OptimizationCandidates } from './pages/intelligence/OptimizationCandidates';
import { OptimizationOutcomes } from './pages/intelligence/OptimizationOutcomes';
import { OptimizationPolicies } from './pages/intelligence/OptimizationPolicies';
import { LearningDashboard } from './pages/intelligence/LearningDashboard';
import { StrategyPerformance } from './pages/intelligence/StrategyPerformance';
import { OutcomeHistory } from './pages/intelligence/OutcomeHistory';
import { ConfidenceEvolution } from './pages/intelligence/ConfidenceEvolution';
import { AutonomyDashboard } from './pages/intelligence/AutonomyDashboard';
import { AutonomyPolicies } from './pages/intelligence/AutonomyPolicies';
import { AgentsDashboard } from './pages/intelligence/AgentsDashboard';
import { AgentDecisions } from './pages/intelligence/AgentDecisions';
import { AgentConflicts } from './pages/intelligence/AgentConflicts';
import { TelemetryTab } from './pages/admin/TelemetryTab';
import { ForensicsTab } from './pages/admin/ForensicsTab';
import { IndustrialOpsPage } from './pages/admin/IndustrialOpsPage';
import { MaterialsPage } from './pages/admin/MaterialsPage';
import { AuditExplorerPage } from './pages/admin/AuditExplorerPage';

import { PreflightJobsPage } from './pages/preflight/PreflightJobsPage';
import { PreflightJobDetailPage } from './pages/preflight/PreflightJobDetailPage';
import { PreflightLargeDocumentsPage } from './pages/preflight/PreflightLargeDocumentsPage';
import { PreflightArtifactsPage } from './pages/preflight/PreflightArtifactsPage';
import { PreflightCertificatesPage } from './pages/preflight/PreflightCertificatesPage';
import { PreflightQuotasPage } from './pages/preflight/PreflightQuotasPage';
import { PreflightWorkersPage } from './pages/preflight/PreflightWorkersPage';
import { ProductionDashboard } from './pages/production/ProductionDashboard';
import { ProductionBillingPage } from './pages/production/ProductionBillingPage';

import { FederationOverview } from './pages/federation/FederationOverview';
import { InstanceRegistry } from './pages/federation/InstanceRegistry';
import { FederationSignals } from './pages/federation/FederationSignals';
import { FederationDecisions } from './pages/federation/FederationDecisions';
import { FederationConflicts } from './pages/federation/FederationConflicts';

import { GlobalOverview } from './pages/global/GlobalOverview';
import { GlobalPolicies } from './pages/global/GlobalPolicies';
import { GlobalRollouts } from './pages/global/GlobalRollouts';
import { GlobalPosture } from './pages/global/GlobalPosture';
import { GlobalIncidents } from './pages/global/GlobalIncidents';
import { GlobalConflicts } from './pages/global/GlobalConflicts';

import { AdminHelpPage } from './pages/admin-help/AdminHelpPage';
import { GlobalSettingsPage } from './pages/os/GlobalSettingsPage';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { PrinthouseRegistrationPage } from './pages/PrinthouseRegistrationPage';
import { PrinthouseOnboardingPage } from './pages/printhouse/PrinthouseOnboardingPage';
import { PublicHumanReportPage } from './pages/public/PublicHumanReportPage';
import { AuthGuard } from './components/AuthGuard';
import { ActivationGuard } from './components/auth/ActivationGuard';
import { ActivationHub } from './pages/connect/ActivationHub';
import { OnboardingObservability } from './pages/admin/OnboardingObservability';
import { MachineDrawerProvider } from './components/federation/MachineDrawerContext';
import { TenantPilotReadinessPage } from './pages/pilot/TenantPilotReadinessPage';

import { BillingUsageDashboardPage } from './pages/billing/BillingUsageDashboardPage';
import { ProductionMonitoringDashboardPage } from './pages/production-monitoring/ProductionMonitoringDashboardPage';
import FinancialOperationsProductionActivationReviewPage from './pages/financial-operations-production-activation-review/FinancialOperationsProductionActivationReviewPage';
import { ProductionActivationGate } from './pages/financial-operations-production-activation/ProductionActivationGate';
import { ProductionActivationDryRun } from './pages/financial-operations-production-activation/ProductionActivationDryRun';
import { OperationalReadinessBoard } from './pages/pre-production/OperationalReadinessBoard';
import { ProductionDeploymentReadiness } from './pages/deployment/ProductionDeploymentReadiness';
import { ProductionDeploymentDryRun } from './pages/deployment/ProductionDeploymentDryRun';
import { ProductionIncidentReadiness } from './pages/operations/ProductionIncidentReadiness';
import { SecurityComplianceHardening } from './pages/prelaunch/SecurityComplianceHardening';
import { FinalPreproductionReleaseCandidate } from './pages/preproduction/FinalPreproductionReleaseCandidate';
import { ControlledProductionPilotActivation } from './pages/production/ControlledProductionPilotActivation';
import { InternalOrderLifecyclePilot } from './pages/production/InternalOrderLifecyclePilot';
import { InternalOrderLifecycleRuntimeVerification } from './pages/production/InternalOrderLifecycleRuntimeVerification';
import { FoundingPrinthousePilotGate } from './pages/production/FoundingPrinthousePilotGate';
import { ControlledPrinthouseHandoffPackage } from './pages/production/ControlledPrinthouseHandoffPackage';
import { SandboxCommercialPilot } from './pages/production/SandboxCommercialPilot';
import { PilotEvidenceReviewGoNoGo } from './pages/production/PilotEvidenceReviewGoNoGo';
import { LimitedBetaPreparationGate } from './pages/beta/LimitedBetaPreparationGate';
import { LimitedBetaRuntime } from './pages/beta/LimitedBetaRuntime';
import { ControlledBetaCohortActivation } from './pages/beta/ControlledBetaCohortActivation';
import { ControlledBetaInviteIssuance } from './pages/beta/ControlledBetaInviteIssuance';
import { ControlledBetaInviteAcceptance } from './pages/beta/ControlledBetaInviteAcceptance';
import { ControlledBetaRuntimeSession } from './pages/beta/ControlledBetaRuntimeSession';
import { ControlledBetaRuntimeActivityObservation } from './pages/beta/ControlledBetaRuntimeActivityObservation';
import { ControlledBetaRuntimeActivityReview } from './pages/beta/ControlledBetaRuntimeActivityReview';
import { ControlledBetaCohortInterventionPreparation } from './pages/beta/ControlledBetaCohortInterventionPreparation';
import { ControlledBetaCohortInterventionApproval } from './pages/beta/ControlledBetaCohortInterventionApproval';
import { ControlledBetaCohortInterventionExecution } from './pages/beta/ControlledBetaCohortInterventionExecution';
import { ControlledBetaCohortInterventionSimulation } from './pages/beta/ControlledBetaCohortInterventionSimulation';
import { ControlledBetaCohortInterventionSimulationReview } from './pages/beta/ControlledBetaCohortInterventionSimulationReview';
import { ControlledBetaCohortInterventionSimulationApprovalPreparation } from './pages/beta/ControlledBetaCohortInterventionSimulationApprovalPreparation';
import { ControlledBetaCohortInterventionSimulationApproval } from './pages/beta/ControlledBetaCohortInterventionSimulationApproval';
import { ControlledBetaCohortInterventionSimulationExecutionReadiness } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionReadiness';
import { ControlledBetaCohortInterventionSimulationExecutionAuthorization } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionAuthorization';
import { ControlledBetaCohortInterventionSimulationExecutionEnvelope } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionEnvelope';
import { ControlledBetaCohortInterventionSimulationExecutionDispatcher } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionDispatcher';
import { ControlledBetaCohortInterventionSimulationExecutionPlan } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlan';
import { ControlledBetaCohortInterventionSimulationExecutionPlanActivationReadiness } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationReadiness';
import { ControlledBetaCohortInterventionSimulationExecutionPlanActivationAuthorization } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationAuthorization';
import { ControlledBetaCohortInterventionSimulationExecutionPlanActivationLock } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationLock';
import { ControlledBetaCohortInterventionSimulationExecutionPlanActivationDecision } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationDecision';
import { ControlledBetaCohortInterventionSimulationExecutionPlanActivationHandoff } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationHandoff';
import { ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenAuth } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenAuth';
import { ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenEnv } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenEnv';
import { ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenFinalApv } from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenFinalApv';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenStaging from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenStaging';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenPreflight from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenPreflight';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenIssuance from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenIssuance';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionReadiness from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionReadiness';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionAuthorization from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionAuthorization';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionEnvelope from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionEnvelope';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionFinalApproval from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionFinalApproval';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionLock from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionLock';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockEligibility from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockEligibility';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockApproval from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockApproval';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockFinalReview from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockFinalReview';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockSeal from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockSeal';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreeze from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreeze';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockOperatorAttestation from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockOperatorAttestation';
import ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorization from './pages/beta/ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorization';


export const App: React.FC = () => {
    return (
        <Routes>
            {/* Legacy Redirects */}
            <Route path="/legacy" element={<Navigate to="/dashboard" replace />} />
            <Route path="/legacy-dashboard" element={<Navigate to="/dashboard" replace />} />

            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/auth/reset-password" element={<ForgotPasswordPage />} />
            <Route path="/printhouse/register" element={<PrinthouseRegistrationPage />} />
            <Route path="/public/preflight/human-report/:token" element={<PublicHumanReportPage />} />
            
            <Route element={<AuthGuard><MachineDrawerProvider><Layout /></MachineDrawerProvider></AuthGuard>}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<ActivationGuard><CommandCenterPage /></ActivationGuard>} />
                <Route path="/activation-hub" element={<ActivationHub />} />
                <Route path="/governance" element={<GovernancePage />} />
                <Route path="/deployments" element={<DeploymentsPage />} />
                <Route path="/audit" element={<div className="p-8"><AuditExplorerPage /></div>} />
                <Route path="/usage" element={<UsageQuotasPage />} />
                <Route path="/printhouses" element={<PrinthousesPage />} />
                <Route path="/admin/printhouse-onboarding" element={<PrinthouseOnboardingPage />} />
                <Route path="/admin/printhouse-onboarding/new" element={<PrinthouseRegistrationPage adminMode />} />
                <Route path="/admin/observability" element={<OnboardingObservability />} />
                <Route path="/printhouses/:id" element={<PrinthouseDetailPage />} />
                <Route path="/orders" element={<OrdersPage />} />

                <Route path="/health" element={<SystemHealthPage />} />
                <Route path="/runtime" element={<RuntimeContextPage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/queues-workers" element={<QueuesWorkersPage />} />
                <Route path="/tenants" element={<TenantManagement />} />
                <Route path="/admin/tenant-pilots" element={<TenantPilotReadinessPage />} />
                <Route path="/admin/production-activation" element={<FinancialOperationsProductionActivationReviewPage />} />
                <Route path="/admin/production-activation/:id" element={<FinancialOperationsProductionActivationReviewPage />} />
                <Route path="/admin/production-activation-gate" element={<ProductionActivationGate />} />
                <Route path="/admin/production-activation-dry-run" element={<ProductionActivationDryRun />} />
                <Route path="/admin/pre-production/readiness-board" element={<OperationalReadinessBoard />} />
                <Route path="/admin/deployment/readiness" element={<ProductionDeploymentReadiness />} />
                <Route path="/admin/deployment/dry-run" element={<ProductionDeploymentDryRun />} />
                <Route path="/admin/operations/incident-readiness" element={<ProductionIncidentReadiness />} />
                <Route path="/admin/prelaunch/security-compliance" element={<SecurityComplianceHardening />} />
                <Route path="/admin/preproduction/release-candidate" element={<FinalPreproductionReleaseCandidate />} />
                <Route path="/admin/production/pilot-activation" element={<ControlledProductionPilotActivation />} />
                <Route path="/admin/production/internal-order-lifecycle-pilot" element={<InternalOrderLifecyclePilot />} />
                <Route path="/admin/production/internal-order-lifecycle-runtime-verification" element={<InternalOrderLifecycleRuntimeVerification />} />
                <Route path="/admin/production/founding-printhouse-pilot" element={<FoundingPrinthousePilotGate />} />
                <Route path="/admin/production/printhouse-handoff-package" element={<ControlledPrinthouseHandoffPackage />} />
                <Route path="/admin/production/sandbox-commercial-pilot" element={<SandboxCommercialPilot />} />
                <Route path="/admin/production/pilot-evidence-review" element={<PilotEvidenceReviewGoNoGo />} />
                <Route path="/admin/beta/preparation-gate" element={<LimitedBetaPreparationGate />} />
                <Route path="/admin/beta/runtime" element={<LimitedBetaRuntime />} />
                <Route path="/admin/beta/cohort-activation" element={<ControlledBetaCohortActivation />} />
                <Route path="/admin/beta/invite-issuance" element={<ControlledBetaInviteIssuance />} />
                <Route path="/admin/beta/invite-acceptance" element={<ControlledBetaInviteAcceptance />} />
                <Route path="/admin/beta/runtime-sessions" element={<ControlledBetaRuntimeSession />} />
                <Route path="/admin/beta/runtime-activity" element={<ControlledBetaRuntimeActivityObservation />} />
                <Route path="/admin/beta/runtime-reviews" element={<ControlledBetaRuntimeActivityReview />} />
                <Route path="/admin/beta/cohort-interventions" element={<ControlledBetaCohortInterventionPreparation />} />
                <Route path="/admin/beta/cohort-intervention-approvals" element={<ControlledBetaCohortInterventionApproval />} />
                <Route path="/admin/beta/cohort-intervention-executions" element={<ControlledBetaCohortInterventionExecution />} />
                <Route path="/admin/beta/cohort-intervention-simulations" element={<ControlledBetaCohortInterventionSimulation />} />
                <Route path="/admin/beta/cohort-intervention-simulation-reviews" element={<ControlledBetaCohortInterventionSimulationReview />} />
                <Route path="/admin/beta/cohort-intervention-approval-preparations" element={<ControlledBetaCohortInterventionSimulationApprovalPreparation />} />
                <Route path="/admin/beta/cohort-intervention-simulation-approvals" element={<ControlledBetaCohortInterventionSimulationApproval />} />
                <Route path="/admin/beta/cohort-intervention-readiness" element={<ControlledBetaCohortInterventionSimulationExecutionReadiness />} />
                <Route path="/admin/beta/cohort-intervention-auth" element={<ControlledBetaCohortInterventionSimulationExecutionAuthorization />} />
                <Route path="/admin/beta/cohort-intervention-envelope" element={<ControlledBetaCohortInterventionSimulationExecutionEnvelope />} />
                <Route path="/admin/beta/cohort-intervention-dispatcher" element={<ControlledBetaCohortInterventionSimulationExecutionDispatcher />} />
                <Route path="/admin/beta/cohort-intervention-plan" element={<ControlledBetaCohortInterventionSimulationExecutionPlan />} />
                <Route path="/admin/beta/cohort-intervention-activation-readiness" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationReadiness />} />
                <Route path="/admin/beta/cohort-intervention-activation-authorization" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationAuthorization />} />
                <Route path="/admin/beta/cohort-intervention-activation-lock" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationLock />} />
                <Route path="/admin/beta/cohort-intervention-activation-decision" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationDecision />} />
                <Route path="/admin/beta/cohort-intervention-activation-handoff" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationHandoff />} />
                <Route path="/admin/beta/cohort-intervention-activation-token-auth" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenAuth />} />
                <Route path="/admin/beta/cohort-intervention-activation-token-env" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenEnv />} />
                <Route path="/admin/beta/cohort-intervention-activation-token-final-apv" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenFinalApv />} />
                <Route path="/admin/beta/cohort-intervention-activation-token-staging/:id" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenStaging />} />
                <Route path="/admin/beta/cohort-intervention-activation-token-preflight/:id" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenPreflight />} />
                <Route path="/admin/beta/cohort-intervention-activation-token-issuance/:id" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenIssuance />} />
                <Route path="/admin/beta/cohort-intervention-activation-token-redemption-readiness/:id" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionReadiness />} />
        <Route path="/admin/beta/cohort-intervention-activation-token-redemption-authorization/:id" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionAuthorization />} />
        <Route path="/admin/beta/cohort-intervention-activation-token-redemption-envelope/:id" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionEnvelope />} />
        <Route path="/admin/beta/cohort-intervention-activation-token-redemption-final-approval/:id" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionFinalApproval />} />
        <Route path="/admin/beta/cohort-intervention-activation-token-redemption-lock/:id" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionLock />} />
        <Route path="/admin/beta/cohort-intervention-activation-token-redemption-unlock-eligibility/:id" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockEligibility />} />
        <Route path="/admin/beta/cohort-intervention-activation-token-redemption-unlock-approval/:id" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockApproval />} />
        <Route path="/admin/beta/cohort-intervention-activation-token-redemption-unlock-final-review/:id" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockFinalReview />} />
        <Route path="/admin/beta/cohort-intervention/activation-token-redemption-unlock-seal/:unlockSealId" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockSeal />} />
        <Route path="/admin/beta/cohort-intervention/activation-token-redemption-unlock-pre-execution-freeze/:unlockPreExecutionFreezeId" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreeze />} />
        <Route path="/admin/beta/cohort-intervention/activation-token-redemption-unlock-pre-execution-freeze" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreeze />} />
        <Route path="/admin/beta/cohort-intervention/activation-token-redemption-unlock-operator-attestation/:unlockOperatorAttestationId" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockOperatorAttestation />} />
        <Route path="/admin/beta/cohort-intervention/activation-token-redemption-unlock-operator-attestation" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockOperatorAttestation />} />
        <Route path="/admin/beta/cohort-intervention/activation-token-redemption-unlock-dual-control-authorization/:unlockDualControlAuthorizationId" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorization />} />
        <Route path="/admin/beta/cohort-intervention/activation-token-redemption-unlock-dual-control-authorization" element={<ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorization />} />


                <Route path="/admin/billing-usage" element={<BillingUsageDashboardPage />} />
                <Route path="/admin/production-monitoring" element={<ProductionMonitoringDashboardPage />} />


                {/* PREFLIGHT OPERATIONS */}
                <Route path="/preflight/jobs" element={<PreflightJobsPage />} />
                <Route path="/preflight/jobs/:jobId" element={<PreflightJobDetailPage />} />
                <Route path="/preflight/large-documents" element={<PreflightLargeDocumentsPage />} />
                <Route path="/preflight/artifacts" element={<PreflightArtifactsPage />} />
                <Route path="/preflight/certificates" element={<PreflightCertificatesPage />} />
                <Route path="/preflight/quotas" element={<PreflightQuotasPage />} />
                <Route path="/preflight/workers" element={<PreflightWorkersPage />} />

                {/* MANUFACTURING OPERATIONS */}
                <Route path="/production" element={<ProductionDashboard />} />
                <Route path="/manufacturing" element={<ProductionDashboard />} />
                <Route path="/production/billing" element={<ProductionBillingPage />} />
                <Route path="/manufacturing/billing" element={<ProductionBillingPage />} />

                {/* INTELLIGENCE LAYER */}
                <Route path="/intelligence" element={<IntelligenceOverview />} />
                <Route path="/intelligence/anomalies" element={<AnomalyList />} />
                <Route path="/intelligence/insights" element={<InsightList />} />
                <Route path="/intelligence/recommendations" element={<RecommendationList />} />
                <Route path="/intelligence/risk/tenants" element={<TenantRiskPage />} />
                <Route path="/intelligence/risk/deployments" element={<DeploymentRiskPage />} />
                <Route path="/intelligence/trends" element={<TrendDashboard />} />
                <Route path="/intelligence/guardrails" element={<GuardrailsDashboard />} />
                <Route path="/intelligence/circuit-breaker" element={<CircuitBreakerPanel />} />
                <Route path="/intelligence/optimization" element={<OptimizationDashboard />} />
                <Route path="/intelligence/optimization/candidates" element={<OptimizationCandidates />} />
                <Route path="/intelligence/optimization/outcomes" element={<OptimizationOutcomes />} />
                <Route path="/intelligence/optimization/policies" element={<OptimizationPolicies />} />
                <Route path="/intelligence/learning" element={<LearningDashboard />} />
                <Route path="/intelligence/learning/strategies" element={<StrategyPerformance />} />
                <Route path="/intelligence/learning/outcomes" element={<OutcomeHistory />} />
                <Route path="/intelligence/learning/confidence" element={<ConfidenceEvolution />} />

                <Route path="/intelligence/autonomy" element={<AutonomyDashboard />} />
                <Route path="/intelligence/autonomy/policies" element={<AutonomyPolicies />} />
                <Route path="/intelligence/autonomy/strategies" element={<AutonomyDashboard />} />

                <Route path="/intelligence/agents" element={<AgentsDashboard />} />
                <Route path="/intelligence/agents/decisions" element={<AgentDecisions />} />
                <Route path="/intelligence/agents/conflicts" element={<AgentConflicts />} />

                <Route path="/federation" element={<Navigate to="/federation/overview" replace />} />
                <Route path="/federation/overview" element={<FederationOverview />} />
                <Route path="/federation/registry" element={<InstanceRegistry />} />
                <Route path="/federation/signals" element={<FederationSignals />} />
                <Route path="/federation/decisions" element={<FederationDecisions />} />
                <Route path="/federation/conflicts" element={<FederationConflicts />} />

                <Route path="/global/overview" element={<GlobalOverview />} />
                <Route path="/global/policies" element={<GlobalPolicies />} />
                <Route path="/global/rollouts" element={<GlobalRollouts />} />
                <Route path="/global/posture" element={<GlobalPosture />} />
                <Route path="/global/incidents" element={<GlobalIncidents />} />
                <Route path="/global/conflicts" element={<GlobalConflicts />} />

                {/* EXTENDED OPERATIONS (Restored) */}
                <Route path="/ops/marketplace" element={<MarketplacePage />} />
                <Route path="/ops/marketplace-orders" element={<MarketplaceOrdersPage />} />
                <Route path="/marketplace/orders" element={<Navigate to="/ops/marketplace" replace />} />
                <Route path="/ops/pricing" element={<PricingIntelligenceTab />} />
                <Route path="/pricing" element={<PricingIntelligenceTab />} />
                <Route path="/machines" element={<MachinesPage />} />
                <Route path="/materials" element={<div className="p-8"><MaterialsPage /></div>} />
                <Route path="/ops/financials" element={<FinancialOpsTab />} />
                <Route path="/ops/success" element={<SuccessWorkspace />} />
                <Route path="/admin/help" element={<AdminHelpPage />} />
                <Route path="/telemetry" element={<div className="p-8"><TelemetryTab /></div>} />
                <Route path="/forensics" element={<div className="p-8"><ForensicsTab /></div>} />
                <Route path="/admin/industrial" element={<div className="p-8"><IndustrialOpsPage /></div>} />
                <Route path="/settings" element={<GlobalSettingsPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
};
