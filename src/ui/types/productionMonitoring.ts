/**
 * src/ui/types/productionMonitoring.ts
 * 
 * TypeScript interfaces for Live Production Monitoring, SLA Dashboard, and Incident Tracking.
 */

export interface ProductionMonitoringSnapshot {
    id: number;
    tenant_id: string;
    printhouse_id: string;
    order_id: string;
    job_id?: string;
    queue_entry_id?: string;
    machine_id?: string;
    production_status: 'NOT_STARTED' | 'WAITING_FOR_FILES' | 'WAITING_FOR_PREFLIGHT' | 'READY_FOR_QUEUE' | 'QUEUED' | 'IN_PRODUCTION' | 'COMPLETED' | 'PAUSED' | 'FAILED';
    sla_status: 'NOT_APPLICABLE' | 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'PAUSED' | 'BLOCKED';
    sla_started_at?: string;
    sla_due_at?: string;
    estimated_completion_at?: string;
    actual_completed_at?: string;
    remaining_minutes?: number;
    risk_score: number;
    blocking_reasons_json?: string[];
    warning_reasons_json?: string[];
    governance_snapshot_json?: any;
    monitoring_snapshot_json?: any;
    created_at?: string;
    updated_at?: string;
}

export interface ProductionTimelineEvent {
    id: number;
    tenant_id: string;
    printhouse_id: string;
    order_id: string;
    job_id?: string;
    event_type: string;
    event_status: 'INFO' | 'WARNING' | 'BLOCKER' | 'RESOLVED';
    actor_user_id?: string;
    actor_role?: string;
    message: string;
    metadata_json?: any;
    created_at: string;
}

export interface ProductionIncident {
    id: number;
    tenant_id: string;
    printhouse_id: string;
    order_id: string;
    job_id?: string;
    incident_type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
    title: string;
    description: string;
    resolution_notes?: string;
    assigned_to_user_id?: string;
    opened_at: string;
    acknowledged_at?: string;
    resolved_at?: string;
    metadata_json?: any;
    created_at?: string;
    updated_at?: string;
}

export interface MachineLoadSnapshot {
    id: number;
    tenant_id: string;
    printhouse_id: string;
    machine_id: string;
    machine_name: string;
    machine_type: string;
    load_status: 'IDLE' | 'NORMAL' | 'BUSY' | 'OVERLOADED' | 'OFFLINE';
    queued_jobs_count: number;
    active_jobs_count: number;
    estimated_queue_minutes: number;
    capacity_score: number;
    next_available_at?: string;
    snapshot_json?: any;
    created_at?: string;
}

export interface SlaDashboardSummary {
    total_jobs: number;
    queued_jobs: number;
    active_jobs: number;
    blocked_jobs: number;
    on_track_jobs: number;
    at_risk_jobs: number;
    breached_jobs: number;
}
