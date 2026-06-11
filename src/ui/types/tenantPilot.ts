/**
 * src/ui/types/tenantPilot.ts
 * 
 * TypeScript typings for Phase 77 Tenant Pilot and Commercial Readiness.
 */

export type PilotStatus = 
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'READY_FOR_INTERNAL_TEST'
  | 'READY_FOR_PARTNER_TEST'
  | 'PILOT_ACTIVE'
  | 'PILOT_PAUSED'
  | 'PILOT_COMPLETED'
  | 'BLOCKED';

export type CommercialStatus = 
  | 'NOT_STARTED'
  | 'PILOT_ONLY'
  | 'COMMERCIAL_REVIEW'
  | 'APPROVED_FOR_LIVE'
  | 'LIVE';

export interface ReadinessDomains {
  printhouse: 'PASSED' | 'FAILED';
  capabilities: 'PASSED' | 'FAILED';
  users: 'PASSED' | 'PENDING' | 'FAILED';
  limits: 'PASSED' | 'FAILED';
  workspace_isolation: 'PASSED' | 'PENDING' | 'FAILED';
  auditability: 'PASSED' | 'FAILED';
  live_production: 'BLOCKED_BY_DESIGN' | 'PASSED' | 'FAILED';
}

export interface TenantPilot {
  id: string;
  tenant_id: string;
  printhouse_id: string;
  pilot_status: PilotStatus;
  commercial_status: CommercialStatus;
  live_production_enabled: boolean;
  pilot_access_enabled: boolean;
  partner_access_enabled: boolean;
  customer_access_enabled: boolean;
  max_pilot_orders: number;
  max_pilot_jobs_per_day: number;
  max_pilot_file_size_mb: number;
  max_pilot_storage_gb: number;
  allowed_order_types_json?: string[] | null;
  allowed_printhouse_ids_json?: string[] | null;
  allowed_machine_ids_json?: string[] | null;
  pilot_started_at?: string | null;
  pilot_completed_at?: string | null;
  blocked_reason?: string | null;
  readiness_snapshot_json?: any;
  created_at: string;
  updated_at: string;

  // Evaluation details
  ready_for_partner_pilot: boolean;
  ready_for_live: boolean;
  blocking_reasons: string[];
  warnings: string[];
  readiness_domains: ReadinessDomains;
}
