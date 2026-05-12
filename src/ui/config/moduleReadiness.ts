/**
 * src/ui/config/moduleReadiness.ts
 * 
 * Registry for Control Plane module status and technical requirements.
 */

export type ModuleStatus = 'ACTIVE' | 'DEGRADED' | 'NOT_CONFIGURED' | 'BACKEND_MISSING' | 'DB_MISSING' | 'MOCK_DISABLED';

export interface ModuleReadiness {
    id: string;
    label: string;
    route: string;
    status: ModuleStatus;
    requiredEndpoints: string[];
    requiredTables: string[];
    roles: string[];
    description?: string;
}

export const moduleReadinessRegistry: ModuleReadiness[] = [
    {
        id: 'dashboard',
        label: 'Command Center',
        route: '/dashboard',
        status: 'ACTIVE',
        requiredEndpoints: ['/api/admin/metrics/overview', '/api/admin/network/overview'],
        requiredTables: ['tenants', 'printer_nodes'],
        roles: ['SUPER_ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN'],
        description: 'Global industrial command center.'
    },
    {
        id: 'printhouses',
        label: 'Printhouse Management',
        route: '/printhouses',
        status: 'ACTIVE',
        requiredEndpoints: ['/api/admin/printhouses'],
        requiredTables: ['printer_nodes'],
        roles: ['SUPER_ADMIN', 'OPS_ADMIN'],
        description: 'Node lifecycle and capability management.'
    },
    {
        id: 'pricing',
        label: 'Pricing Intelligence',
        route: '/ops/pricing',
        status: 'ACTIVE',
        requiredEndpoints: ['/api/admin/pricing/profiles', '/api/admin/routing/economic/history'],
        requiredTables: ['printer_pricing_profiles', 'economic_routing_history'],
        roles: ['SUPER_ADMIN', 'OPS_ADMIN', 'TENANT_ADMIN'],
        description: 'Economic modeling and margin optimization.'
    },
    {
        id: 'preflight',
        label: 'Preflight Service',
        route: '/preflight/jobs',
        status: 'ACTIVE',
        requiredEndpoints: ['/api/admin/preflight/jobs'],
        requiredTables: ['preflight_jobs'],
        roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN'],
        description: 'Document analysis and technical validation.'
    },
    {
        id: 'production',
        label: 'Production Control',
        route: '/production',
        status: 'ACTIVE',
        requiredEndpoints: ['/api/admin/production/notifications'],
        requiredTables: ['production_notifications'],
        roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN'],
        description: 'Real-time manufacturing queue management.'
    },
    {
        id: 'manufacturing',
        label: 'Manufacturing Control',
        route: '/manufacturing',
        status: 'ACTIVE',
        requiredEndpoints: ['/api/admin/manufacturing/notifications'],
        requiredTables: ['manufacturing_notifications'],
        roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN'],
        description: 'Real-time manufacturing queue management.'
    },
    {
        id: 'machines',
        label: 'Machine Fleet',
        route: '/machines',
        status: 'ACTIVE',
        requiredEndpoints: ['/api/admin/machines'],
        requiredTables: ['printer_machines', 'print_nodes'],
        roles: ['SUPER_ADMIN', 'OPS_ADMIN', 'PRINTHOUSE_ADMIN'],
        description: 'Industrial equipment inventory.'
    },
    {
        id: 'materials',
        label: 'Materials Catalog',
        route: '/materials',
        status: 'ACTIVE',
        requiredEndpoints: ['/api/admin/materials'],
        requiredTables: ['materials_inventory'],
        roles: ['SUPER_ADMIN', 'OPS_ADMIN', 'PRINTHOUSE_ADMIN'],
        description: 'Paper and consumable registry.'
    },

    {
        id: 'governance',
        label: 'Global Governance',
        route: '/governance',
        status: 'ACTIVE',
        requiredEndpoints: ['/api/admin/global/blocks'],
        requiredTables: ['governance_policies'],
        roles: ['SUPER_ADMIN'],
        description: 'Policy enforcement and compliance.'
    },
    {
        id: 'federation',
        label: 'Federation Registry',
        route: '/federation',
        status: 'ACTIVE',
        requiredEndpoints: ['/api/admin/federation/registry'],
        requiredTables: ['instance_registry'],
        roles: ['SUPER_ADMIN'],
        description: 'Cross-instance synchronization.'
    },
    {
        id: 'audit',
        label: 'Audit Explorer',
        route: '/audit',
        status: 'ACTIVE',
        requiredEndpoints: ['/api/admin/audit'],
        requiredTables: ['api_audit_log'],
        roles: ['SUPER_ADMIN', 'OPS_ADMIN'],
        description: 'Security and operation logs.'
    }
];

export function getModuleReadiness(id: string): ModuleReadiness | undefined {
    return moduleReadinessRegistry.find(m => m.id === id);
}

export function isModuleEnabled(id: string): boolean {
    const module = getModuleReadiness(id);
    return !!module && module.status !== 'NOT_CONFIGURED' && module.status !== 'BACKEND_MISSING';
}
