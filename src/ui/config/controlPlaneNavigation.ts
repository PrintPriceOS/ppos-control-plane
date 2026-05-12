/**
 * src/ui/config/controlPlaneNavigation.ts
 * 
 * Centralized navigation and module visibility by role.
 */

export type Role = 'SUPER_ADMIN' | 'OPS_ADMIN' | 'TENANT_ADMIN' | 'PRINTHOUSE_ADMIN' | 'PRINTHOUSE_OPERATOR' | 'VIEWER';

export interface NavItem {
    id: string;
    label: string;
    path: string;
    icon: string;
    roles: Role[];
}

export const navigationConfig: NavItem[] = [
    // Global Governance (Super Admin only)
    { id: 'governance', label: 'Global Governance', path: '/governance', icon: 'ShieldCheckIcon', roles: ['SUPER_ADMIN'] },
    { id: 'federation', label: 'Federation', path: '/federation', icon: 'CloudIcon', roles: ['SUPER_ADMIN'] },
    
    // Core Dashboard (Common)
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'HomeIcon', roles: ['SUPER_ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR', 'VIEWER'] },
    
    // Printhouse Operational Views
    { id: 'printhouses', label: 'Printhouses', path: '/printhouses', icon: 'PrinterIcon', roles: ['SUPER_ADMIN', 'OPS_ADMIN'] },
    { id: 'jobs', label: 'Incoming Jobs', path: '/jobs', icon: 'InboxIcon', roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR', 'VIEWER'] },
    { id: 'preflight', label: 'Preflight Service', path: '/preflight/jobs', icon: 'DocumentCheckIcon', roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR', 'VIEWER'] },
    { id: 'manufacturing', label: 'Manufacturing Queue', path: '/manufacturing', icon: 'CpuChipIcon', roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR', 'VIEWER'] },
    { id: 'machines', label: 'Machines', path: '/machines', icon: 'WrenchScrewdriverIcon', roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN'] },
    { id: 'materials', label: 'Materials & Paper', path: '/materials', icon: 'RectangleStackIcon', roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN'] },
    { id: 'pricing', label: 'Pricing Profiles', path: '/ops/pricing', icon: 'CurrencyDollarIcon', roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN'] },
    
    // Intelligence Layer (Super Admin & Ops Admin)
    { id: 'intelligence', label: 'Intelligence Layer', path: '/intelligence', icon: 'SparklesIcon', roles: ['SUPER_ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN'] },
    
    // Operations & Marketplace
    { id: 'marketplace', label: 'Marketplace', path: '/ops/marketplace', icon: 'BuildingStorefrontIcon', roles: ['SUPER_ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN'] },
    { id: 'financials', label: 'Financial Ops', path: '/ops/financials', icon: 'BanknotesIcon', roles: ['SUPER_ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN'] },
    { id: 'industrial', label: 'Industrial Ops', path: '/admin/industrial', icon: 'CommandLineIcon', roles: ['SUPER_ADMIN', 'OPS_ADMIN'] },

    // System / Admin
    { id: 'tenants', label: 'Tenant Management', path: '/tenants', icon: 'BuildingOfficeIcon', roles: ['SUPER_ADMIN', 'OPS_ADMIN'] },
    { id: 'audit', label: 'Audit Logs', path: '/audit', icon: 'ClipboardDocumentListIcon', roles: ['SUPER_ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN'] },
    { id: 'settings', label: 'Settings', path: '/settings', icon: 'Cog6ToothIcon', roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN'] },
];

export function getVisibleModulesForRole(role: Role): NavItem[] {
    if (role === 'SUPER_ADMIN') return navigationConfig;
    return navigationConfig.filter(item => item.roles.includes(role));
}
