export interface LiveOrder {
    id: string;
    live_order_number: string;
    live_order_status: string;
    live_scope: string;
    order_type: string;
    tenant_id: string;
    printhouse_id: string;
}

export const liveOrdersClient = {
    async fetchLiveOrders(): Promise<LiveOrder[]> {
        return Promise.resolve([]); // Mock for now
    },
    async fetchLiveOrder(id: string): Promise<LiveOrder> {
        return Promise.resolve({} as LiveOrder);
    },
    async fetchLiveOrderGates(id: string) {
        return Promise.resolve({});
    },
    async evaluateLiveOrder(id: string) {
        return Promise.resolve({});
    },
    async enterQueue(id: string) {
        return Promise.resolve({ success: true });
    },
    async assignMachine(id: string, machineId: string) {
        return Promise.resolve({ success: true });
    },
    async startProduction(id: string) {
        return Promise.resolve({ success: true });
    },
    async pauseProduction(id: string, reason: string) {
        return Promise.resolve({ success: true });
    },
    async resumeProduction(id: string) {
        return Promise.resolve({ success: true });
    },
    async generateHandoff(id: string) {
        return Promise.resolve({ success: true });
    },
    async sendToPrinthouse(id: string) {
        return Promise.resolve({ success: true });
    },
    async complete(id: string, finalAuditPayload: any) {
        return Promise.resolve({ success: true });
    },
    async block(id: string, reason: string) {
        return Promise.resolve({ success: true });
    }
};
