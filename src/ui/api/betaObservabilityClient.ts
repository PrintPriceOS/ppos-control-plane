import { BetaFunnelOverview, BetaFunnelEvent, BetaHealthAlert } from '../types/betaObservability';
import { adminFetch } from '../lib/adminApi';

interface OverviewResponse {
    overview: BetaFunnelOverview;
}

interface AlertsResponse {
    alerts: BetaHealthAlert[];
}

export const fetchBetaOverview = async (cohortId: string): Promise<BetaFunnelOverview> => {
    const data = await adminFetch<OverviewResponse>(`/api/admin/beta-observability/overview?cohortId=${cohortId}`);
    return data.overview;
};

export const fetchBetaAlerts = async (cohortId: string): Promise<BetaHealthAlert[]> => {
    const data = await adminFetch<AlertsResponse>(`/api/admin/beta-observability/alerts?cohortId=${cohortId}`);
    return data.alerts;
};

export const acknowledgeAlert = async (alertId: string) => {
    await adminFetch<any>(`/api/admin/beta-observability/alerts/${alertId}/acknowledge`, { method: 'POST' });
};
