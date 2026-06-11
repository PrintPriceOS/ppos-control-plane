import { BetaFunnelOverview, BetaFunnelEvent, BetaHealthAlert } from '../types/betaObservability';

export const fetchBetaOverview = async (cohortId: string): Promise<BetaFunnelOverview> => {
    const res = await fetch(`/api/admin/beta-observability/overview?cohortId=${cohortId}`);
    const data = await res.json();
    return data.overview;
};

export const fetchBetaAlerts = async (cohortId: string): Promise<BetaHealthAlert[]> => {
    const res = await fetch(`/api/admin/beta-observability/alerts?cohortId=${cohortId}`);
    const data = await res.json();
    return data.alerts;
};

export const acknowledgeAlert = async (alertId: string) => {
    await fetch(`/api/admin/beta-observability/alerts/${alertId}/acknowledge`, { method: 'POST' });
};
