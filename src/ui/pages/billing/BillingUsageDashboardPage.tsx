import React, { useState, useEffect } from 'react';
import * as client from '../../api/billingUsageClient';
import { adminFetch } from '../../lib/adminApi';
import {
    CommercialPlan,
    TenantEntitlement,
    UsageCounters,
    BillingPeriodSummary
} from '../../types/billingUsage';
import { COLORS } from '../../design-system/tokens';
import { CommercialPlanList } from './CommercialPlanList';
import { TenantEntitlementPanel } from './TenantEntitlementPanel';
import { UsageCountersPanel } from './UsageCountersPanel';
import { QuotaDecisionPanel } from './QuotaDecisionPanel';
import { BillingEventsTimeline } from './BillingEventsTimeline';
import { OverageSummaryPanel } from './OverageSummaryPanel';
import { getUserRole } from '../../lib/authStore';
import {
    BanknotesIcon,
    ArrowPathIcon,
    PlusIcon,
    CheckIcon
} from '@heroicons/react/24/outline';

export const BillingUsageDashboardPage: React.FC = () => {
    const [plans, setPlans] = useState<CommercialPlan[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [selectedTenant, setSelectedTenant] = useState('');
    const [periodKey, setPeriodKey] = useState('2026-06');
    const [entitlement, setEntitlement] = useState<TenantEntitlement | null>(null);
    const [usage, setUsage] = useState<UsageCounters | null>(null);
    const [summary, setSummary] = useState<BillingPeriodSummary | null>(null);
    
    // Actions / Controls State
    const [newPlanCode, setNewPlanCode] = useState('');
    const [newBillingStatus, setNewBillingStatus] = useState('');
    const [adjAmount, setAdjAmount] = useState('');
    const [adjReason, setAdjReason] = useState('');
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);

    const userRole = getUserRole();
    const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'OPS_ADMIN';

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (selectedTenant) {
            fetchTenantData();
        }
    }, [selectedTenant, periodKey]);

    const fetchInitialData = async () => {
        try {
            const [plansRes, tenantsRes] = await Promise.all([
                client.getCommercialPlans(),
                adminFetch<{ ok: boolean; tenants: any[] }>('/api/admin/tenant-governance')
            ]);
            
            setPlans(plansRes.plans || []);
            const tenantList = tenantsRes.tenants || [];
            setTenants(tenantList);
            if (tenantList.length > 0) {
                setSelectedTenant(tenantList[0].id);
            }
        } catch (e) {
            console.error('Failed to load initial billing dashboard data', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchTenantData = async () => {
        setLoading(true);
        try {
            const [entRes, usageRes, sumRes] = await Promise.all([
                client.getTenantEntitlement(selectedTenant),
                client.getTenantUsage(selectedTenant, periodKey),
                client.getTenantBillingEvents(selectedTenant, periodKey)
            ]);

            setEntitlement(entRes.entitlement);
            setUsage(usageRes.summary.counters);
            setSummary(sumRes.summary);
            setNewPlanCode(entRes.entitlement.plan_code);
            setNewBillingStatus(entRes.entitlement.billing_status);
        } catch (e) {
            console.error('Failed to load tenant billing data', e);
        } finally {
            setLoading(false);
        }
    };

    const handleAssignPlan = async () => {
        if (!newPlanCode) return;
        setUpdating(true);
        try {
            await client.assignPlanToTenant(selectedTenant, newPlanCode);
            await fetchTenantData();
        } catch (e) {
            console.error('Failed to assign plan', e);
        } finally {
            setUpdating(false);
        }
    };

    const handleUpdateBillingStatus = async () => {
        if (!newBillingStatus) return;
        setUpdating(true);
        try {
            await client.updateTenantBillingStatus(selectedTenant, newBillingStatus);
            await fetchTenantData();
        } catch (e) {
            console.error('Failed to update billing status', e);
        } finally {
            setUpdating(false);
        }
    };

    const handleAddAdjustment = async () => {
        const cents = Math.round(Number(adjAmount) * 100);
        if (isNaN(cents) || !adjReason) return;
        setUpdating(true);
        try {
            await client.applyManualAdjustment(selectedTenant, cents, 'EUR', adjReason);
            setAdjAmount('');
            setAdjReason('');
            await fetchTenantData();
        } catch (e) {
            console.error('Failed to add adjustment', e);
        } finally {
            setUpdating(false);
        }
    };

    if (loading && plans.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[500px]">
                <ArrowPathIcon className="w-8 h-8 animate-spin text-zinc-500" />
            </div>
        );
    }

    const includedJobs = plans.find(p => p.plan_code === entitlement?.plan_code)?.included_preflight_jobs_monthly || 0;

    return (
        <div className="space-y-6 font-manrope">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className={`text-xl font-black tracking-tight flex items-center gap-2 ${COLORS.adaptive.textPrimary}`}>
                        <BanknotesIcon className="w-6 h-6 text-[#dc0000]" />
                        Usage, Billing &amp; Plan Limits Console
                    </h2>
                    <p className={`text-sm font-medium tracking-tight ${COLORS.adaptive.textSecondary}`}>
                        Manage commercial plan limits, entitlements, and manual credit adjustments.
                    </p>
                </div>

                {/* Tenant & Period Selector */}
                <div className="flex gap-2 w-full sm:w-auto">
                    <select
                        value={selectedTenant}
                        onChange={(e) => setSelectedTenant(e.target.value)}
                        className={`text-xs font-bold p-2 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} focus:outline-none`}
                    >
                        {tenants.map(t => (
                            <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                        ))}
                    </select>

                    <input
                        type="text"
                        value={periodKey}
                        onChange={(e) => setPeriodKey(e.target.value)}
                        placeholder="YYYY-MM"
                        className={`w-24 text-xs font-bold p-2 border text-center ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} focus:outline-none`}
                    />
                </div>
            </div>

            {/* Plans List */}
            <CommercialPlanList plans={plans} activePlanCode={entitlement?.plan_code} />

            {entitlement && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Entitlement and Counters */}
                    <div className="lg:col-span-2 space-y-6">
                        <TenantEntitlementPanel entitlement={entitlement} />
                        
                        {usage && entitlement && (
                            <UsageCountersPanel
                                counters={usage}
                                limits={entitlement.limits}
                                includedJobs={includedJobs}
                            />
                        )}

                        <QuotaDecisionPanel tenantId={selectedTenant} />

                        {summary && (
                            <BillingEventsTimeline events={summary.events} />
                        )}
                    </div>

                    {/* Right: Summary and Controls */}
                    <div className="space-y-6">
                        {summary && <OverageSummaryPanel summary={summary} />}

                        {/* Admin Controls */}
                        {isAdmin && (
                            <div className={`p-6 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} space-y-6`}>
                                <h3 className={`text-xs font-black uppercase tracking-widest ${COLORS.adaptive.textSecondary}`}>
                                    Commercial Management Panel
                                </h3>

                                {/* Plan Assignment */}
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                        Assign Commercial Plan
                                    </label>
                                    <div className="flex gap-2">
                                        <select
                                            value={newPlanCode}
                                            onChange={(e) => setNewPlanCode(e.target.value)}
                                            className={`flex-1 text-xs font-bold p-2 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} focus:outline-none`}
                                        >
                                            {plans.map(p => (
                                                <option key={p.plan_code} value={p.plan_code}>{p.plan_name}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={handleAssignPlan}
                                            disabled={updating}
                                            className="px-3 py-2 bg-zinc-900 text-white dark:bg-zinc-800 hover:bg-zinc-800 text-xs font-black uppercase tracking-wider"
                                        >
                                            Assign
                                        </button>
                                    </div>
                                </div>

                                {/* Billing Status */}
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                        Set Billing Status
                                    </label>
                                    <div className="flex gap-2">
                                        <select
                                            value={newBillingStatus}
                                            onChange={(e) => setNewBillingStatus(e.target.value)}
                                            className={`flex-1 text-xs font-bold p-2 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} focus:outline-none`}
                                        >
                                            <option value="ACTIVE">ACTIVE</option>
                                            <option value="TRIALING">TRIALING</option>
                                            <option value="PAST_DUE">PAST_DUE</option>
                                            <option value="BLOCKED">BLOCKED</option>
                                            <option value="NOT_REQUIRED">NOT_REQUIRED</option>
                                        </select>
                                        <button
                                            onClick={handleUpdateBillingStatus}
                                            disabled={updating}
                                            className="px-3 py-2 bg-zinc-900 text-white dark:bg-zinc-800 hover:bg-zinc-800 text-xs font-black uppercase tracking-wider"
                                        >
                                            Update
                                        </button>
                                    </div>
                                </div>

                                {/* Manual Adjustment */}
                                <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                        Apply Adjustment / Waiver (EUR)
                                    </label>
                                    <div className="space-y-2">
                                        <input
                                            type="number"
                                            value={adjAmount}
                                            onChange={(e) => setAdjAmount(e.target.value)}
                                            placeholder="Amount (e.g. -15.00 for credit)"
                                            className={`w-full text-xs font-bold p-2 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} focus:outline-none`}
                                        />
                                        <input
                                            type="text"
                                            value={adjReason}
                                            onChange={(e) => setAdjReason(e.target.value)}
                                            placeholder="Reason for adjustment"
                                            className={`w-full text-xs font-bold p-2 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} focus:outline-none`}
                                        />
                                        <button
                                            onClick={handleAddAdjustment}
                                            disabled={updating}
                                            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-[#dc0000] hover:bg-[#b90000] text-white text-xs font-black uppercase tracking-wider"
                                        >
                                            <PlusIcon className="w-4 h-4" /> Add Adjustment
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
