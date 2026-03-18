import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './layout/Layout';
import { DashboardPage } from './pages/os/DashboardPage';
import { TenantsPage } from './pages/os/TenantsPage';
import { JobsPage } from './pages/os/JobsPage';
import { QueuesWorkersPage } from './pages/os/QueuesWorkersPage';
import { GovernancePage } from './pages/os/GovernancePage';
import { DeploymentsPage } from './pages/os/DeploymentsPage';
import { UsageQuotasPage } from './pages/os/UsageQuotasPage';
import { SystemHealthPage } from './pages/os/SystemHealthPage';
import { RuntimeContextPage } from './pages/os/RuntimeContextPage';
import { AdminDashboard } from './pages/AdminDashboard'; // Legacy Dashboard

export const App: React.FC = () => {
    return (
        <Routes>
            {/* Legacy Entry - For Backward Compatibility */}
            <Route path="/legacy" element={<AdminDashboard />} />

            {/* New OS Control Plane Layout */}
            <Route element={<Layout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/governance" element={<GovernancePage />} />
                <Route path="/deployments" element={<DeploymentsPage />} />
                <Route path="/audit" element={<div className="p-10 text-center font-bold text-slate-400 italic-text-off uppercase tracking-[0.2em] border-2 border-dashed border-slate-200 rounded-3xl">Audit Explorer Logic Deferred to Batch 3</div>} />
                <Route path="/usage" element={<UsageQuotasPage />} />

                <Route path="/health" element={<SystemHealthPage />} />
                <Route path="/runtime" element={<RuntimeContextPage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/queues-workers" element={<QueuesWorkersPage />} />
                <Route path="/tenants" element={<TenantsPage />} />

                {/* Extended Ops (Stubs for now) */}
                <Route path="/ops/*" element={<div className="p-10 text-center font-bold text-slate-400 italic-text-off uppercase tracking-[0.2em] border-2 border-dashed border-slate-200 rounded-3xl">Extended Operations Layer - Under Construction</div>} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
};
