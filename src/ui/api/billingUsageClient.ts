/**
 * src/ui/api/billingUsageClient.ts
 * 
 * Frontend API client wrapper for Tenant Billing and Quotas admin routes.
 */

import { adminFetch } from '../lib/adminApi';
import {
    CommercialPlan,
    TenantEntitlement,
    UsageCounters,
    BillingPeriodSummary,
    BillingEvent
} from '../types/billingUsage';

export async function getCommercialPlans(): Promise<{ ok: boolean; plans: CommercialPlan[] }> {
    return adminFetch<{ ok: boolean; plans: CommercialPlan[] }>('/api/admin/tenant-billing/plans');
}

export async function createOrUpdateCommercialPlan(payload: Partial<CommercialPlan>): Promise<{ ok: boolean; plan_code: string }> {
    return adminFetch<{ ok: boolean; plan_code: string }>('/api/admin/tenant-billing/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

export async function getTenantEntitlement(tenantId: string): Promise<{ ok: boolean; entitlement: TenantEntitlement }> {
    return adminFetch<{ ok: boolean; entitlement: TenantEntitlement }>(`/api/admin/tenant-billing/entitlements/${tenantId}`);
}

export async function assignPlanToTenant(tenantId: string, planCode: string, status?: string): Promise<{ ok: boolean; tenantId: string; planCode: string }> {
    return adminFetch<{ ok: boolean; tenantId: string; planCode: string }>(`/api/admin/tenant-billing/entitlements/${tenantId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode, status })
    });
}

export async function updateTenantBillingStatus(tenantId: string, billingStatus: string): Promise<{ ok: boolean; tenantId: string; billingStatus: string }> {
    return adminFetch<{ ok: boolean; tenantId: string; billingStatus: string }>(`/api/admin/tenant-billing/entitlements/${tenantId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingStatus })
    });
}

export async function getTenantUsage(tenantId: string, periodKey?: string): Promise<{ ok: boolean; summary: { tenantId: string; periodKey: string; counters: UsageCounters } }> {
    const pk = periodKey ? `?periodKey=${periodKey}` : '';
    return adminFetch<{ ok: boolean; summary: { tenantId: string; periodKey: string; counters: UsageCounters } }>(`/api/admin/tenant-billing/usage/${tenantId}${pk}`);
}

export async function getTenantBillingEvents(tenantId: string, periodKey?: string): Promise<{ ok: boolean; summary: BillingPeriodSummary }> {
    const pk = periodKey ? `?periodKey=${periodKey}` : '';
    return adminFetch<{ ok: boolean; summary: BillingPeriodSummary }>(`/api/admin/tenant-billing/events/${tenantId}${pk}`);
}

export async function applyManualAdjustment(tenantId: string, amountCents: number, currency: string, reason: string): Promise<{ ok: boolean; adjustment: BillingEvent }> {
    return adminFetch<{ ok: boolean; adjustment: BillingEvent }>(`/api/admin/tenant-billing/adjustments/${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents, currency, reason })
    });
}
