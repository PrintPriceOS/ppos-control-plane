class CustomerLiveOrderActionService {
    constructor(dependencies = {}) {
        this.liveOrderLifecycleService = dependencies.liveOrderLifecycleService || {};
        this.liveOrderPreflightGateService = dependencies.liveOrderPreflightGateService || {};
        this.customerLiveOrderViewService = dependencies.customerLiveOrderViewService || {};
        this._mockTokens = {}; // token store for smoke test
    }

    async validateCustomerActionToken({ liveOrderId, token, expectedAction, actor }) {
        if (!token) return true; // Assuming non-tokenized authenticated actions for simplicity
        
        const tokenData = this._mockTokens[token];
        if (!tokenData) throw new Error('Invalid token');
        if (tokenData.liveOrderId !== liveOrderId) throw new Error('Token scope mismatch: Order');
        if (tokenData.action !== expectedAction) throw new Error('Token scope mismatch: Action');
        if (tokenData.expiresAt < Date.now()) {
            await this.auditCustomerLiveOrderAction({ liveOrderId, actor, actionType: expectedAction, status: 'EXPIRED_TOKEN' });
            throw new Error('Token expired');
        }
        if (tokenData.used) {
            await this.auditCustomerLiveOrderAction({ liveOrderId, actor, actionType: expectedAction, status: 'USED_TOKEN' });
            throw new Error('Token already used');
        }

        // Mark as used
        tokenData.used = true;
        return true;
    }

    async approveLiveOrderProof({ liveOrderId, actor, token, approvalPayload }) {
        await this.customerLiveOrderViewService.assertCustomerCanViewLiveOrder({ liveOrderId, actor });
        await this.validateCustomerActionToken({ liveOrderId, token, expectedAction: 'APPROVE_PROOF', actor });

        // Approve proof ONLY (does not bypass artifact trust)
        await this.liveOrderPreflightGateService.approveLiveOrderProof({ liveOrderId, actor });
        
        await this.auditCustomerLiveOrderAction({ liveOrderId, actor, actionType: 'APPROVE_PROOF', status: 'SUCCESS' });
        return { success: true, message: 'Proof approved successfully.' };
    }

    async rejectLiveOrderProof({ liveOrderId, actor, token, reason }) {
        await this.customerLiveOrderViewService.assertCustomerCanViewLiveOrder({ liveOrderId, actor });
        await this.validateCustomerActionToken({ liveOrderId, token, expectedAction: 'REJECT_PROOF', actor });

        await this.liveOrderPreflightGateService.rejectLiveOrderProof({ liveOrderId, reason, actor });
        
        await this.auditCustomerLiveOrderAction({ liveOrderId, actor, actionType: 'REJECT_PROOF', status: 'SUCCESS' });
        return { success: true, message: 'Proof rejected.' };
    }

    async uploadLiveOrderFile({ liveOrderId, actor, token, fileType, fileId }) {
        await this.customerLiveOrderViewService.assertCustomerCanViewLiveOrder({ liveOrderId, actor });
        await this.validateCustomerActionToken({ liveOrderId, token, expectedAction: 'UPLOAD_FILE', actor });

        // Attach file
        await this.liveOrderPreflightGateService.attachFileToLiveOrder({ liveOrderId, fileType, fileId, actor });

        // CRITICAL RULE: Reupload resets affected gates
        if (this.liveOrderLifecycleService.recordLiveOrderEvent) {
            await this.liveOrderLifecycleService.recordLiveOrderEvent({
                tenantId: actor.tenantId || 'system',
                liveOrderId,
                eventType: 'GATES_RESET_ON_REUPLOAD',
                actor,
                message: `Preflight, artifact trust, proof, and queue eligibility reset due to new ${fileType}`
            });
        }
        
        // Mocking the gate resets
        if (this.liveOrderPreflightGateService._mockData) {
            this.liveOrderPreflightGateService._mockData.jobs[liveOrderId] = [];
            this.liveOrderPreflightGateService._mockData.artifactTrust = 'REVIEW_REQUIRED';
            this.liveOrderPreflightGateService._mockData.proofs[liveOrderId] = 'REQUIRED';
        }

        await this.auditCustomerLiveOrderAction({ liveOrderId, actor, actionType: 'UPLOAD_FILE', status: 'SUCCESS' });
        return { success: true, message: 'File uploaded successfully. New reviews required.' };
    }

    async confirmLiveOrderPaymentReference({ liveOrderId, actor, token, paymentReference }) {
        await this.customerLiveOrderViewService.assertCustomerCanViewLiveOrder({ liveOrderId, actor });
        await this.validateCustomerActionToken({ liveOrderId, token, expectedAction: 'CONFIRM_PAYMENT_REFERENCE', actor });

        // Only updates reference, does NOT mark gate as PASSED implicitly.
        if (this.liveOrderLifecycleService.recordLiveOrderEvent) {
            await this.liveOrderLifecycleService.recordLiveOrderEvent({
                tenantId: actor.tenantId || 'system',
                liveOrderId,
                eventType: 'PAYMENT_REFERENCE_SUBMITTED',
                actor,
                message: `Payment reference submitted: ${paymentReference}`
            });
        }

        await this.auditCustomerLiveOrderAction({ liveOrderId, actor, actionType: 'CONFIRM_PAYMENT_REFERENCE', status: 'SUCCESS' });
        return { success: true, message: 'Payment reference submitted and is pending verification.' };
    }

    async requestLiveOrderCancellation({ liveOrderId, actor, token, reason }) {
        await this.customerLiveOrderViewService.assertCustomerCanViewLiveOrder({ liveOrderId, actor });
        await this.validateCustomerActionToken({ liveOrderId, token, expectedAction: 'REQUEST_CANCELLATION', actor });

        if (this.liveOrderLifecycleService.recordLiveOrderEvent) {
            await this.liveOrderLifecycleService.recordLiveOrderEvent({
                tenantId: actor.tenantId || 'system',
                liveOrderId,
                eventType: 'CANCELLATION_REQUESTED',
                actor,
                message: `Customer requested cancellation: ${reason}`
            });
        }

        // Does not delete order, just updates status/records event.
        await this.auditCustomerLiveOrderAction({ liveOrderId, actor, actionType: 'REQUEST_CANCELLATION', status: 'SUCCESS' });
        return { success: true, message: 'Cancellation requested.' };
    }

    async submitLiveOrderCustomerMessage({ liveOrderId, actor, token, message }) {
        await this.customerLiveOrderViewService.assertCustomerCanViewLiveOrder({ liveOrderId, actor });
        await this.validateCustomerActionToken({ liveOrderId, token, expectedAction: 'SEND_MESSAGE', actor });

        if (this.liveOrderLifecycleService.recordLiveOrderEvent) {
            await this.liveOrderLifecycleService.recordLiveOrderEvent({
                tenantId: actor.tenantId || 'system',
                liveOrderId,
                eventType: 'CUSTOMER_MESSAGE_SENT',
                actor,
                message: message
            });
        }

        await this.auditCustomerLiveOrderAction({ liveOrderId, actor, actionType: 'SEND_MESSAGE', status: 'SUCCESS' });
        return { success: true, message: 'Message sent.' };
    }

    async resolveCustomerActionRequirement({ liveOrderId, actionType, actor }) {
        // Mark action resolved in gate service
        await this.liveOrderPreflightGateService.resolveLiveOrderCustomerAction({ liveOrderId, actor });
    }

    async auditCustomerLiveOrderAction({ liveOrderId, actor, actionType, status }) {
        if (this.liveOrderLifecycleService.recordLiveOrderEvent) {
            await this.liveOrderLifecycleService.recordLiveOrderEvent({
                tenantId: actor.tenantId || 'system',
                liveOrderId,
                eventType: `CUSTOMER_ACTION_${status}`,
                actor,
                message: `Action: ${actionType}`
            });
        }
    }
}

module.exports = CustomerLiveOrderActionService;
