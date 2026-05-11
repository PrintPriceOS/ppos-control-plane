import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './layout/Layout';
import { DashboardPage } from './pages/os/DashboardPage';
import { CommandCenterPage } from './pages/admin/CommandCenterPage';
import { TenantsPage } from './pages/os/TenantsPage';
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
import { MarketplaceTab } from './pages/admin/MarketplaceTab';
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
import { PrinthouseRegistrationPage } from './pages/PrinthouseRegistrationPage';
import { AuthGuard } from './components/AuthGuard';

export const App: React.FC = () => {
    return (
        <Routes>
            {/* Legacy Entry - For Backward Compatibility */}
            <Route path="/legacy" element={<AdminDashboard />} />

            {/* New OS Control Plane Layout */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/printhouse/register" element={<PrinthouseRegistrationPage />} />
            
            <Route element={<AuthGuard><Layout /></AuthGuard>}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<CommandCenterPage />} />
                <Route path="/legacy-dashboard" element={<DashboardPage />} />
                <Route path="/governance" element={<GovernancePage />} />
                <Route path="/deployments" element={<DeploymentsPage />} />
                <Route path="/audit" element={<div className="p-10 text-center font-bold text-slate-500 italic-text-off uppercase tracking-[0.2em] border-2 border-dashed border-white/10">Audit Explorer Logic Deferred to Batch 3</div>} />
                <Route path="/usage" element={<UsageQuotasPage />} />
                <Route path="/printhouses" element={<PrinthousesPage />} />
                <Route path="/printhouses/:id" element={<PrinthouseDetailPage />} />
                <Route path="/orders" element={<OrdersPage />} />

                <Route path="/health" element={<SystemHealthPage />} />
                <Route path="/runtime" element={<RuntimeContextPage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/queues-workers" element={<QueuesWorkersPage />} />
                <Route path="/tenants" element={<TenantsPage />} />

                {/* PREFLIGHT OPERATIONS */}
                <Route path="/preflight/jobs" element={<PreflightJobsPage />} />
                <Route path="/preflight/jobs/:jobId" element={<PreflightJobDetailPage />} />
                <Route path="/preflight/large-documents" element={<PreflightLargeDocumentsPage />} />
                <Route path="/preflight/artifacts" element={<PreflightArtifactsPage />} />
                <Route path="/preflight/certificates" element={<PreflightCertificatesPage />} />
                <Route path="/preflight/quotas" element={<PreflightQuotasPage />} />
                <Route path="/preflight/workers" element={<PreflightWorkersPage />} />

                {/* PRODUCTION OPERATIONS */}
                <Route path="/production" element={<ProductionDashboard />} />
                <Route path="/production/billing" element={<ProductionBillingPage />} />

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
                <Route path="/ops/marketplace" element={<MarketplaceTab />} />
                <Route path="/ops/pricing" element={<PricingIntelligenceTab />} />
                <Route path="/pricing" element={<PricingIntelligenceTab />} />
                <Route path="/machines" element={<MachinesPage />} />
                <Route path="/materials" element={<div className="p-10 text-center font-bold text-slate-500 italic-text-off uppercase tracking-[0.2em] border-2 border-dashed border-white/10">Material & Paper Catalog Deferred to Batch 3</div>} />
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
