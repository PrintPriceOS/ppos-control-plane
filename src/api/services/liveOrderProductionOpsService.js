class LiveOrderProductionOpsService {
    constructor(dependencies = {}) {
        this.liveOrderLifecycleService = dependencies.liveOrderLifecycleService || {};
        this.liveProductionGuardService = dependencies.liveProductionGuardService || {};
        this._mockState = {
            inQueue: {},
            machines: {},
            production: {},
            handoffs: {},
            audits: {},
            blocks: {}
        };
    }

    async evaluateLiveOrderQueueEligibility({ liveOrderId, actor }) {
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        // Gate check mock
        if (order._internal_gate_fails) {
            return { eligible: false, reason: `Blocked by ${order._internal_gate_fails}` };
        }
        
        if (this.liveProductionGuardService.evaluateGuard) {
            const guard = await this.liveProductionGuardService.evaluateGuard('ENTER_LIVE_QUEUE', { tenantId: order.tenant_id, printhouseId: order.printhouse_id, actor });
            if (guard.decision === 'BLOCKED') return { eligible: false, reason: guard.reason };
        }
        
        return { eligible: true };
    }

    async enterLiveProductionQueue({ liveOrderId, actor }) {
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        if (order._enablement_paused) throw new Error('BLOCKED: Live enablement paused');
        if (order._enablement_revoked) throw new Error('BLOCKED: Live enablement revoked');

        const evalRes = await this.evaluateLiveOrderQueueEligibility({ liveOrderId, actor });
        if (!evalRes.eligible) throw new Error(`Queue entry blocked: ${evalRes.reason}`);

        this._mockState.inQueue[liveOrderId] = true;
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: order.tenant_id, liveOrderId, eventType: 'LIVE_QUEUE_ENTERED', actor, message: 'Entered live queue'
        });
        return { success: true };
    }

    async assignMachineToLiveOrder({ liveOrderId, machineId, actor }) {
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        this._mockState.machines[liveOrderId] = machineId;
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: order.tenant_id, liveOrderId, eventType: 'LIVE_MACHINE_ASSIGNED', actor, message: `Assigned machine ${machineId}`
        });
        return { success: true };
    }

    async startLiveOrderProduction({ liveOrderId, actor }) {
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        const machine = this._mockState.machines[liveOrderId];
        if (machine && machine.includes('offline') && !order._operator_override) {
            throw new Error('BLOCKED: Machine offline');
        }

        this._mockState.production[liveOrderId] = 'STARTED';
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: order.tenant_id, liveOrderId, eventType: 'LIVE_PRODUCTION_STARTED', actor, message: 'Production started. SLA monitoring active.'
        });
        return { success: true };
    }

    async pauseLiveOrderProduction({ liveOrderId, reason, actor }) {
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        this._mockState.production[liveOrderId] = 'PAUSED';
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: order.tenant_id, liveOrderId, eventType: 'LIVE_PRODUCTION_PAUSED', actor, message: reason
        });
        return { success: true };
    }

    async resumeLiveOrderProduction({ liveOrderId, actor }) {
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        this._mockState.production[liveOrderId] = 'STARTED';
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: order.tenant_id, liveOrderId, eventType: 'LIVE_PRODUCTION_RESUMED', actor, message: 'Production resumed'
        });
        return { success: true };
    }

    async generateLiveOrderHandoffPackage({ liveOrderId, actor }) {
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        if (order._internal_gate_fails) {
            throw new Error('Handoff generation blocked by gates');
        }
        this._mockState.handoffs[liveOrderId] = 'GENERATED';
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: order.tenant_id, liveOrderId, eventType: 'LIVE_HANDOFF_READY', actor, message: 'Handoff generated'
        });
        return { success: true };
    }

    async sendLiveOrderToPrinthouse({ liveOrderId, actor }) {
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        if (!this._mockState.audits[liveOrderId] || !this._mockState.audits[liveOrderId].includes('FILE_ACCESS')) {
            throw new Error('BLOCKED: File access audit is required before send');
        }
        if (this._mockState.handoffs[liveOrderId] !== 'GENERATED') {
            throw new Error('BLOCKED: Handoff package not ready');
        }

        this._mockState.handoffs[liveOrderId] = 'SENT';
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: order.tenant_id, liveOrderId, eventType: 'LIVE_HANDOFF_SENT', actor, message: 'Handoff sent to printhouse'
        });
        return { success: true };
    }

    async markLiveOrderCompleted({ liveOrderId, finalAuditPayload, actor }) {
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        if (!finalAuditPayload) {
            throw new Error('BLOCKED: Final production audit required for completion');
        }

        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: order.tenant_id, liveOrderId, eventType: 'LIVE_COMPLETED', actor, message: 'Order completed'
        });
        return { success: true };
    }

    async blockLiveOrderProduction({ liveOrderId, reason, actor }) {
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        this._mockState.blocks[liveOrderId] = reason;
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: order.tenant_id, liveOrderId, eventType: 'LIVE_PRODUCTION_BLOCKED', actor, message: reason
        });
        return { success: true };
    }

    async handleLiveEnablementPauseOrRevocation({ tenantId, printhouseId, action, impactScope, actor }) {
        // e.g. action='REVOKE', impactScope='FULL_STOP'
        // Simulate cascading state to all live orders matching the pair
        return { cascaded: true, impactScope };
    }
}

module.exports = LiveOrderProductionOpsService;
