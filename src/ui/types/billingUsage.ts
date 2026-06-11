/**
 * src/ui/types/billingUsage.ts
 * 
 * TypeScript interfaces for Commercial Plan and Billing Usage dashboards.
 */

export interface CommercialPlan {
    id: number;
    plan_code: string;
    plan_name: string;
    status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
    billing_mode: string;
    base_currency: string;
    monthly_base_price_cents: number;
    included_preflight_jobs_monthly: number;
    included_storage_gb: number;
    max_file_size_mb: number;
    max_monthly_orders: number;
    max_daily_jobs: number;
    allow_large_uploads: number;
    allow_audit_bundle_export: number;
    allow_commercial_handoff: number;
    allow_machine_assignment: number;
}

export interface TenantEntitlement {
    tenant_id: string;
    plan_code: string;
    entitlement_status: string;
    billing_status: string;
    usage_enforcement_enabled: boolean;
    commercial_live_enabled: boolean;
    limits: {
        max_file_size_mb: number;
        max_monthly_orders: number;
        max_daily_jobs: number;
        max_concurrent_jobs: number;
        included_storage_gb: number;
    };
    features: {
        allow_large_uploads: boolean;
        allow_api_access: boolean;
        allow_audit_bundle_export: boolean;
        allow_commercial_handoff: boolean;
    };
    blocking_reasons: string[];
    warnings: string[];
}

export interface UsageCounters {
    tenant_id: string;
    period_key: string;
    orders_count: number;
    preflight_jobs_count: number;
    autofix_jobs_count: number;
    uploaded_files_count: number;
    uploaded_bytes: number;
    stored_bytes: number;
    downloaded_bytes: number;
    audit_bundles_count: number;
    handoff_packages_count: number;
    machine_assignments_count: number;
    unsafe_fix_approvals_count: number;
    machine_override_approvals_count: number;
    failed_jobs_count: number;
}

export interface BillingEvent {
    id: number;
    tenant_id: string;
    period_key: string;
    event_type: string;
    plan_code: string;
    metric?: string;
    quantity: number;
    amount_cents: number;
    currency: string;
    status: string;
    metadata_json?: any;
    created_at: string;
}

export interface BillingPeriodSummary {
    tenantId: string;
    periodKey: string;
    total_overage_cents: number;
    total_adjustment_cents: number;
    grand_total_cents: number;
    currency: string;
    events: BillingEvent[];
}
