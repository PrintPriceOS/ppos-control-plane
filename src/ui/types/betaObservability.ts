export interface BetaFunnelEvent {
    id: string;
    event_type: string;
    event_status: string;
    created_at: string;
}

export interface BetaHealthAlert {
    id: string;
    alert_type: string;
    severity: string;
    alert_status: string;
    message: string;
    created_at: string;
}

export interface BetaFunnelOverview {
    counts: Record<string, number>;
    rates: Record<string, number>;
    dropOffs: Record<string, number>;
    blockers: { total_blockers: number; details: string[] };
    supportTickets: number;
    incidents: number;
    emergencyStops: number;
    rollbacks: number;
}
