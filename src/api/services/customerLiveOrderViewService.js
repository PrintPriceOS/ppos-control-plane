class CustomerLiveOrderViewService {
    constructor(dependencies = {}) {
        this.liveOrderLifecycleService = dependencies.liveOrderLifecycleService || {};
        this.liveOrderPreflightGateService = dependencies.liveOrderPreflightGateService || {};
        // Mock DB connection or similar can go here if needed.
    }

    async assertCustomerCanViewLiveOrder({ liveOrderId, actor }) {
        if (!actor || !actor.tenantId) throw new Error('Unauthorized');
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        if (!order) throw new Error('Order not found');
        
        // Enforce tenant/customer isolation
        if (actor.role === 'CUSTOMER') {
            if (order.tenant_id !== actor.tenantId) {
                await this.auditCustomerViewAccess({ liveOrderId, actor, status: 'BLOCKED_CROSS_TENANT' });
                throw new Error('Unauthorized cross-tenant access');
            }
            if (order.customer_id && actor.userId !== order.customer_id) {
                // Wait, if actor is just a generic customer under a tenant, they might only see their own orders.
                await this.auditCustomerViewAccess({ liveOrderId, actor, status: 'BLOCKED_CROSS_CUSTOMER' });
                throw new Error('Unauthorized cross-customer access');
            }
        }
        await this.auditCustomerViewAccess({ liveOrderId, actor, status: 'ALLOWED' });
        return order;
    }

    async auditCustomerViewAccess({ liveOrderId, actor, status }) {
        if (this.liveOrderLifecycleService.recordLiveOrderEvent) {
            await this.liveOrderLifecycleService.recordLiveOrderEvent({
                tenantId: actor.tenantId || 'system',
                liveOrderId,
                eventType: 'CUSTOMER_VIEW_ACCESS',
                actor,
                message: `Customer view access ${status}`
            });
        }
    }

    mapInternalStatusToCustomerStatus({ liveOrderStatus, gates = [], incidents = [] }) {
        // Forbidden: CERTIFIED, PRINT_READY, LIVE_APPROVED_INTERNAL, MACHINE_ASSIGNED_INTERNAL, GUARANTEED_DELIVERY
        const activeIncidents = incidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'DISMISSED');
        if (activeIncidents.length > 0) return 'PRODUCTION_PAUSED'; // or ACTION_REQUIRED depending on incident

        if (liveOrderStatus === 'LIVE_INTAKE_CREATED') return 'ORDER_RECEIVED';
        if (liveOrderStatus === 'FILES_REQUIRED') return 'FILES_NEEDED';
        if (liveOrderStatus === 'FILES_UPLOADED') return 'FILE_CHECK_IN_PROGRESS';
        
        // Mapping gates
        const proofGate = gates.find(g => g.gate_name === 'PROOF_APPROVAL');
        if (proofGate && proofGate.gate_status === 'BLOCKED' && proofGate.snapshot_json?.proofStatus === 'REQUIRED') {
            return 'PROOF_REVIEW_REQUIRED';
        }
        
        const payGate = gates.find(g => g.gate_name === 'PAYMENT');
        if (payGate && payGate.gate_status === 'BLOCKED') return 'PAYMENT_REQUIRED';

        if (['PREFLIGHT_REQUIRED', 'PREFLIGHT_RUNNING'].includes(liveOrderStatus)) return 'FILE_CHECK_IN_PROGRESS';
        if (liveOrderStatus === 'CUSTOMER_ACTION_REQUIRED') return 'ACTION_REQUIRED';
        if (['PREFLIGHT_COMPLETED', 'READY_FOR_LIVE_QUEUE', 'LIVE_QUEUED', 'LIVE_ASSIGNED_TO_MACHINE'].includes(liveOrderStatus)) return 'PREPARING_FOR_PRODUCTION';
        if (liveOrderStatus === 'LIVE_IN_PRODUCTION') return 'IN_PRODUCTION';
        if (liveOrderStatus === 'LIVE_PAUSED') return 'PRODUCTION_PAUSED';
        if (liveOrderStatus === 'LIVE_BLOCKED') return 'PRODUCTION_BLOCKED';
        if (['LIVE_HANDOFF_READY', 'LIVE_HANDOFF_SENT'].includes(liveOrderStatus)) return 'HANDOFF_IN_PROGRESS';
        if (liveOrderStatus === 'LIVE_COMPLETED') return 'COMPLETED';
        if (['LIVE_CANCELLED', 'LIVE_REVOKED'].includes(liveOrderStatus)) return 'CANCELLED';

        return 'ORDER_RECEIVED'; // Default fallback
    }

    mapGateStateToCustomerMessage({ gateName, gateStatus, snapshot }) {
        if (gateStatus === 'PASSED') return 'Check completed successfully.';
        if (gateName === 'FILE_UPLOAD') return 'Please upload all required files.';
        if (gateName === 'PREFLIGHT') return 'We detected an issue with your files. Please review and reupload.';
        if (gateName === 'PROOF_APPROVAL') return 'Please review and approve your proof.';
        if (gateName === 'PAYMENT') return 'Payment reference is pending verification.';
        return 'Additional action required.';
    }

    sanitizeIncidentForCustomer(incident) {
        // Strip out internal stack traces, exact internal component names, machine IDs, etc.
        return {
            id: incident.id,
            status: incident.status,
            customer_message: 'Production has been temporarily paused due to a technical review. No action is required from you at this moment.',
            created_at: incident.created_at
        };
    }

    sanitizePreflightSummaryForCustomer(preflightPayload) {
        // Hide raw JSON, internal rules, machine compatibility limits
        return {
            status: preflightPayload.status === 'PASSED' ? 'Check completed successfully' : 'Check flagged issues',
            customer_action_needed: preflightPayload.status !== 'PASSED',
            issues: (preflightPayload.issues || []).map(i => ({
                description: 'A file issue requires your attention.',
                page: i.page
            }))
        };
    }

    sanitizeProofPayloadForCustomer(proofPayload) {
        return {
            proof_url: proofPayload.safe_url || null, // Ensure signed safe URL
            requires_approval: true
        };
    }

    sanitizeTimelineForCustomer(events) {
        // Translate internal events into safe wording. Filter out purely internal system logs.
        const translated = [];
        for (const ev of events) {
            let msg = '';
            // Safe translation of events
            if (ev.event_type === 'LIVE_ORDER_CREATED') msg = 'Order received and logged.';
            else if (ev.event_type === 'LIVE_FILE_ATTACHED') msg = 'File securely uploaded.';
            else if (ev.event_type === 'LIVE_PREFLIGHT_STARTED') msg = 'File check initiated.';
            else if (ev.event_type === 'LIVE_PROOF_REQUIRED') msg = 'Proof generated and waiting for your review.';
            else if (ev.event_type === 'LIVE_PROOF_APPROVED') msg = 'Proof approved by customer.';
            else if (ev.event_type === 'LIVE_MACHINE_ASSIGNED') msg = 'Order scheduled for production.'; // Not "Machine assigned internal"
            else if (ev.event_type === 'LIVE_PRODUCTION_STARTED') msg = 'Order is now in production.';
            else if (ev.event_type === 'LIVE_COMPLETED') msg = 'Order completed and ready for handoff.';
            else if (ev.event_type === 'LIVE_QUEUE_ENTERED') msg = 'Order placed in production queue.';
            else if (ev.event_type === 'LIVE_GUARD_DECISION_RECORDED' || ev.event_type === 'MACHINE_COMPATIBILITY_PASSED') {
                msg = 'Your files have passed the current review step.';
            }

            if (msg) {
                translated.push({
                    event_id: ev.id,
                    date: ev.created_at,
                    message: msg
                });
            }
        }
        return translated;
    }

    sanitizeLiveOrderForCustomer(payload) {
        const safe = {
            live_order_id: payload.id,
            live_order_number: payload.live_order_number,
            customer_visible_status: this.mapInternalStatusToCustomerStatus({ liveOrderStatus: payload.live_order_status }),
            title: 'Order Status',
            message: 'Your order is progressing.',
            safe_progress: {
                files: 'PENDING',
                file_check: 'PENDING',
                proof: 'PENDING',
                payment: 'PENDING',
                production: 'NOT_STARTED'
            },
            documents: [],
            customer_notifications: [],
            can_cancel: true,
            can_upload_files: true,
            can_approve_proof: false,
            can_make_payment: false,
            can_download_customer_report: true
        };

        // Determine permissions
        if (safe.customer_visible_status === 'IN_PRODUCTION' || safe.customer_visible_status === 'COMPLETED') {
            safe.can_cancel = false;
        }
        if (safe.customer_visible_status === 'PROOF_REVIEW_REQUIRED') safe.can_approve_proof = true;
        if (safe.customer_visible_status === 'PAYMENT_REQUIRED') safe.can_make_payment = true;

        return safe;
    }

    async buildCustomerNextActions({ liveOrderId, actor }) {
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        const actions = [];
        const custStatus = this.mapInternalStatusToCustomerStatus({ liveOrderStatus: order.live_order_status });

        if (custStatus === 'FILES_NEEDED') {
            actions.push({ action: 'UPLOAD_FILES', label: 'Please upload missing files', required: true });
        } else if (custStatus === 'PROOF_REVIEW_REQUIRED') {
            actions.push({ action: 'APPROVE_PROOF', label: 'Review and approve proof', required: true });
        } else if (custStatus === 'PAYMENT_REQUIRED') {
            actions.push({ action: 'CONFIRM_PAYMENT_REFERENCE', label: 'Submit payment reference', required: true });
        }

        return actions;
    }

    async buildCustomerLiveOrderView({ liveOrderId, actor }) {
        const order = await this.assertCustomerCanViewLiveOrder({ liveOrderId, actor });
        const view = this.sanitizeLiveOrderForCustomer(order);
        view.next_actions = await this.buildCustomerNextActions({ liveOrderId, actor });
        return view;
    }

    async buildCustomerLiveOrderSummary({ liveOrderId, actor }) {
        const order = await this.assertCustomerCanViewLiveOrder({ liveOrderId, actor });
        return {
            live_order_id: order.id,
            live_order_number: order.live_order_number,
            customer_visible_status: this.mapInternalStatusToCustomerStatus({ liveOrderStatus: order.live_order_status })
        };
    }
}

module.exports = CustomerLiveOrderViewService;
