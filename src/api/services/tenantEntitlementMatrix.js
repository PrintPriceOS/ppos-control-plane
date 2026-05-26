/**
 * src/api/services/tenantEntitlementMatrix.js
 * 
 * Defines commercial plan tiers, default resource limits, module entitlements,
 * and normalizations for PrintPrice OS Tenant Governance.
 */

// Supported plans
const PLANS = {
    FREE: 'FREE',
    PRO: 'PRO',
    ENTERPRISE: 'ENTERPRISE',
    CUSTOM: 'CUSTOM',
    FOUNDING_PRINTHOUSE: 'FOUNDING_PRINTHOUSE',
    SYSTEM: 'SYSTEM'
};

// Supported commercial statuses
const COMMERCIAL_STATUSES = {
    ACTIVE: 'ACTIVE',
    GRACE: 'GRACE',
    GRACE_EXPIRED: 'GRACE_EXPIRED',
    SUSPENDED: 'SUSPENDED',
    CONVERTED: 'CONVERTED',
    CANCELLED: 'CANCELLED',
    MANUAL_REVIEW: 'MANUAL_REVIEW'
};

// Supported access levels
const ACCESS_LEVELS = {
    BASIC: 'BASIC',
    PROFESSIONAL: 'PROFESSIONAL',
    FULL: 'FULL',
    CUSTOM: 'CUSTOM',
    SYSTEM: 'SYSTEM'
};

// Default resource limits per plan
const DEFAULT_LIMITS = {
    [PLANS.FREE]: {
        maxFileSizeMb: 25,
        maxJobSizeMb: 50,
        maxJobsPerMonth: 100,
        retentionDays: 7,
        gracePeriodDays: 0
    },
    [PLANS.PRO]: {
        maxFileSizeMb: 150,
        maxJobSizeMb: 300,
        maxJobsPerMonth: 1000,
        retentionDays: 30,
        gracePeriodDays: 0
    },
    [PLANS.ENTERPRISE]: {
        maxFileSizeMb: 1024, // 1 GB
        maxJobSizeMb: 2048, // 2 GB
        maxJobsPerMonth: 100000,
        retentionDays: 90,
        gracePeriodDays: 0
    },
    [PLANS.FOUNDING_PRINTHOUSE]: {
        maxFileSizeMb: 1024, // 1 GB
        maxJobSizeMb: 2048, // 2 GB
        maxJobsPerMonth: 50000, // Controlled but generous
        retentionDays: 30,
        gracePeriodDays: 7 // 7-day grace period
    },
    [PLANS.CUSTOM]: {
        maxFileSizeMb: 2048,
        maxJobSizeMb: 4096,
        maxJobsPerMonth: 50000,
        retentionDays: 90,
        gracePeriodDays: 0
    },
    [PLANS.SYSTEM]: {
        maxFileSizeMb: 5120, // 5 GB
        maxJobSizeMb: 10240,
        maxJobsPerMonth: 999999,
        retentionDays: 3650,
        gracePeriodDays: 0
    }
};

// Module access matrix
const DEFAULT_MODULES = {
    [PLANS.FREE]: {
        budget_app: true,
        basic_preflight: true,
        full_preflight: false,
        reports: 'limited',
        job_history: true,
        own_order_dashboard: true,
        marketplace_orders: false,
        file_repository: false,
        print_house_handoff: false,
        production_readiness: false,
        production_queue: false,
        machine_assignment: false,
        federation_telemetry: false,
        dispatch_orchestration: false,
        api_access: false,
        advanced_audit: false,
        tenant_admin: false, // Required adjustment: false or limited
        billing_placeholder: true
    },
    [PLANS.PRO]: {
        budget_app: true,
        basic_preflight: true,
        full_preflight: true,
        reports: true,
        job_history: true,
        own_order_dashboard: true,
        marketplace_orders: 'limited',
        file_repository: 'limited',
        print_house_handoff: false,
        production_readiness: false,
        production_queue: false,
        machine_assignment: false,
        federation_telemetry: false,
        dispatch_orchestration: false,
        api_access: false,
        advanced_audit: false,
        tenant_admin: true,
        billing_placeholder: true
    },
    [PLANS.ENTERPRISE]: {
        budget_app: true,
        basic_preflight: true,
        full_preflight: true,
        reports: true,
        job_history: true,
        own_order_dashboard: true,
        marketplace_orders: true,
        file_repository: true,
        print_house_handoff: true,
        production_readiness: true,
        production_queue: true,
        machine_assignment: true,
        federation_telemetry: true,
        dispatch_orchestration: true,
        api_access: true,
        advanced_audit: true,
        tenant_admin: true,
        billing_placeholder: true
    },
    [PLANS.FOUNDING_PRINTHOUSE]: {
        // Founding printhouses have full access equivalent to Enterprise during grace
        budget_app: true,
        basic_preflight: true,
        full_preflight: true,
        reports: true,
        job_history: true,
        own_order_dashboard: true,
        marketplace_orders: true,
        file_repository: true,
        print_house_handoff: true,
        production_readiness: true,
        production_queue: true,
        machine_assignment: true,
        federation_telemetry: true,
        dispatch_orchestration: true,
        api_access: true,
        advanced_audit: true,
        tenant_admin: true,
        billing_placeholder: true
    },
    [PLANS.CUSTOM]: {
        // Can be overridden contractually, starts as Enterprise
        budget_app: true,
        basic_preflight: true,
        full_preflight: true,
        reports: true,
        job_history: true,
        own_order_dashboard: true,
        marketplace_orders: true,
        file_repository: true,
        print_house_handoff: true,
        production_readiness: true,
        production_queue: true,
        machine_assignment: true,
        federation_telemetry: true,
        dispatch_orchestration: true,
        api_access: true,
        advanced_audit: true,
        tenant_admin: true,
        billing_placeholder: true
    },
    [PLANS.SYSTEM]: {
        budget_app: true,
        basic_preflight: true,
        full_preflight: true,
        reports: true,
        job_history: true,
        own_order_dashboard: true,
        marketplace_orders: true,
        file_repository: true,
        print_house_handoff: true,
        production_readiness: true,
        production_queue: true,
        machine_assignment: true,
        federation_telemetry: true,
        dispatch_orchestration: true,
        api_access: true,
        advanced_audit: true,
        tenant_admin: true,
        billing_placeholder: true
    }
};

// Map plan codes to access levels
const PLAN_ACCESS_LEVELS = {
    [PLANS.FREE]: ACCESS_LEVELS.BASIC,
    [PLANS.PRO]: ACCESS_LEVELS.PROFESSIONAL,
    [PLANS.ENTERPRISE]: ACCESS_LEVELS.FULL,
    [PLANS.FOUNDING_PRINTHOUSE]: ACCESS_LEVELS.FULL,
    [PLANS.CUSTOM]: ACCESS_LEVELS.CUSTOM,
    [PLANS.SYSTEM]: ACCESS_LEVELS.SYSTEM
};

// Normalize input strings safely to canonical values
function normalizePlan(plan) {
    if (!plan) return PLANS.FREE;
    const upper = plan.toUpperCase();
    return PLANS[upper] || PLANS.FREE;
}

function normalizeStatus(status) {
    if (!status) return COMMERCIAL_STATUSES.ACTIVE;
    const upper = status.toUpperCase();
    return COMMERCIAL_STATUSES[upper] || COMMERCIAL_STATUSES.ACTIVE;
}

module.exports = {
    PLANS,
    COMMERCIAL_STATUSES,
    ACCESS_LEVELS,
    DEFAULT_LIMITS,
    DEFAULT_MODULES,
    PLAN_ACCESS_LEVELS,
    normalizePlan,
    normalizeStatus
};
