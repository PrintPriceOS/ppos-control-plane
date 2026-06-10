/**
 * src/api/services/marketplaceProductionQueueService.js
 * 
 * Phase 38.5 — Production Queue / Machine Assignment Gate
 */

const mysqlClient = require('./mysqlClient');
const marketplaceOrderService = require('./marketplaceOrderService');
const logger = require('./logger').child('marketplace-production-queue');
const lifecycleAudit = require('./marketplaceLifecycleAuditService');

function safeParseJson(str, fallback = {}) {
    if (!str) return fallback;
    if (typeof str !== 'string') return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

/**
 * Evaluates whether an order is eligible for the production queue.
 */
async function evaluateProductionQueueEligibility(orderId, options = {}) {
    logger.info({ event: 'PRODUCTION_QUEUE_EVALUATING', orderId });

    const orders = await mysqlClient.query('SELECT tenant_id, status, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});
    const dispatchPackage = metadata.dispatch_package;

    if (!dispatchPackage) {
        throw new Error('HANDOFF_PACKAGE_NOT_FOUND');
    }

    // Eligibility check blockers
    const blockers = [];
    const warnings = [];

    // Profile Binding checks
    const tenantId = order.tenant_id;
    const bindingService = require('./printhouseProfileBindingService');
    const machineCompatibilityService = require('./machineCompatibilityService');
    const binding = await bindingService.getOrderPrinthouseBinding(orderId, tenantId);
    
    let isBindingOk = false;
    let jobId = null;
    try {
        const files = await mysqlClient.query(
            'SELECT preflight_job_id FROM marketplace_order_files WHERE order_id = ? LIMIT 1',
            [orderId]
        );
        if (files && files.length > 0) jobId = files[0].preflight_job_id;
    } catch (e) {}

    if (!binding) {
        blockers.push('MISSING_PROFILE_BINDING');
        blockers.push('PRINTHOUSE_PROFILE_BINDING_MISSING');
    } else if (binding.binding_status !== 'BOUND') {
        blockers.push('PROFILE_BINDING_INCOMPLETE');
    } else if (!binding.printhouse_snapshot_json || !binding.machine_snapshot_json || !binding.media_snapshot_json || !binding.policy_profile_snapshot_json || !binding.sla_profile_snapshot_json) {
        blockers.push('CAPABILITY_SNAPSHOT_MISSING');
    } else {
        // Evaluate policy profile and machine compatibility
        isBindingOk = true;
        try {
            if (jobId) {
                const gateway = require('./preflightContractGateway');
                const jobState = await gateway.getJob(jobId);
                
                const evaluation = await bindingService.evaluateBoundPolicyProfileForJob({
                    orderId,
                    jobId,
                    tenantId,
                    preflightGovernance: jobState.preflight_governance || jobState,
                    artifactTrust: jobState.artifact_trust,
                    proofApprovalGovernance: jobState.proof_approval_governance,
                    heavyPdfProbeGovernance: jobState.heavy_pdf_probe_governance,
                    standardsCertificationGovernance: jobState.standards_certification_governance
                });

                if (!evaluation.profile_passed) {
                    blockers.push('POLICY_PROFILE_FAILED');
                    if (evaluation.blocking_reasons) {
                        for (const reason of evaluation.blocking_reasons) {
                            if (!blockers.includes(reason)) blockers.push(reason);
                        }
                    }
                }
                
                // Attach evaluation results to job governance
                await bindingService.attachPolicyProfileGovernanceToJob({
                    orderId,
                    jobId,
                    tenantId,
                    evaluation
                });

                // Phase 76D Machine Compatibility Evaluation
                const compat = await machineCompatibilityService.evaluateMachineCompatibilityForOrder({
                    orderId,
                    tenantId,
                    jobId,
                    actor: { id: options.operatorId || 'SYSTEM', role: 'SYSTEM' }
                });

                // Check override
                const overrideApproved = metadata.machine_compatibility_override?.approved === true;
                if (!compat.compatible && !overrideApproved) {
                    blockers.push('MACHINE_INCOMPATIBLE');
                    if (compat.blocking_reasons) {
                        for (const reason of compat.blocking_reasons) {
                            if (!blockers.includes(reason)) blockers.push(reason);
                        }
                    }
                }

                await machineCompatibilityService.attachMachineCompatibilityGovernance({
                    orderId,
                    jobId,
                    tenantId,
                    evaluation: compat,
                    actor: { id: options.operatorId || 'SYSTEM', role: 'SYSTEM' }
                });
            }
        } catch (e) {
            blockers.push('POLICY_PROFILE_EVALUATION_FAILED');
            logger.error({ event: 'POLICY_PROFILE_EVALUATION_ERROR', error: e.message });
        }
    }

    // Order status must be PRODUCTION_ACCEPTED for initial queueing
    if (!options.ignoreOrderStatus && order.status !== 'PRODUCTION_ACCEPTED') {
        blockers.push('INVALID_ORDER_STATUS_FOR_QUEUE');
    }

    // Dispatch package status must be PRINTHOUSE_ACCEPTED
    if (dispatchPackage.status !== 'PRINTHOUSE_ACCEPTED') {
        blockers.push('DISPATCH_PACKAGE_NOT_ACCEPTED');
    }

    // Manifest checks
    const manifest = dispatchPackage.manifest || {};
    const invoice = manifest.invoice || {};
    const payment = manifest.payment || {};
    const productionUnlock = metadata.production_unlock || {};
    const productionDecision = metadata.production_decision || {};

    if (invoice.status !== 'ISSUED') {
        blockers.push('INVOICE_NOT_ISSUED');
    }
    if (payment.status !== 'PAYMENT_CONFIRMED') {
        blockers.push('PAYMENT_NOT_CONFIRMED');
    }
    if (productionUnlock.status !== 'PRODUCTION_UNLOCKED') {
        blockers.push('PRODUCTION_NOT_UNLOCKED');
    }
    if (productionDecision.decision !== 'PRODUCTION_ACCEPTED') {
        blockers.push('PRODUCTION_DECISION_NOT_ACCEPTED');
    }

    // Query audit events to check if file access was completed
    const events = await mysqlClient.query(
        'SELECT type FROM marketplace_order_events WHERE order_id = ? AND type = "PRINTHOUSE_FILE_DOWNLOAD_COMPLETED"',
        [orderId]
    );
    const hasDownloadCompleted = events && events.length > 0;
    if (!hasDownloadCompleted) {
        warnings.push('FILE_ACCESS_NOT_VERIFIED_BY_AUDIT');
    }

    // Check machine registry validation warning if machineId is provided
    const machineId = options.machineId;
    if (machineId) {
        const machines = await mysqlClient.query(
            'SELECT id FROM print_node_machine_profiles WHERE id = ? AND status = "ACTIVE"',
            [machineId]
        );
        if (!machines || machines.length === 0) {
            warnings.push('MACHINE_REGISTRY_NOT_VERIFIED');
        }
    }

    // Resolve preflight job to get machine capability signals
    let machineReadinessGov = null;
    try {
        const files = await mysqlClient.query(
            'SELECT preflight_job_id FROM marketplace_order_files WHERE order_id = ? LIMIT 1',
            [orderId]
        );
        if (files && files.length > 0) {
            const jobId = files[0].preflight_job_id;
            const humanReportService = require('./preflightHumanReportService');
            const reportRes = await humanReportService.getHumanReport(jobId, { operatorId: options.operatorId || 'SYSTEM' });
            if (reportRes && reportRes.ok && reportRes.report) {
                machineReadinessGov = reportRes.report.machine_readiness_governance;
            }
        }
    } catch (e) {
        // Tolerant preflight signals resolution
    }

    if (machineReadinessGov) {
        // Preserve warnings from preflight machine governance
        if (Array.isArray(machineReadinessGov.warnings)) {
            for (const w of machineReadinessGov.warnings) {
                if (!warnings.includes(w)) warnings.push(w);
            }
        }

        // If machine matching is required and machineId is provided
        if (machineId && machineReadinessGov.machine_match_required === true) {
            const incompatibleReasons = machineReadinessGov.incompatible_machine_reasons || {};
            const reasonsForMachine = incompatibleReasons[machineId] || incompatibleReasons['default'] || [];
            if (Array.isArray(reasonsForMachine) && reasonsForMachine.length > 0) {
                blockers.push('PRODUCTION_MACHINE_INCOMPATIBLE');
                for (const reason of reasonsForMachine) {
                    if (!warnings.includes(reason)) warnings.push(reason);
                }
            }
        }
    }

    const eligible = blockers.length === 0;

    // Phase 48: Strict Readiness Guard for queue eligibility
    // Must be re-evaluated to prevent stale readiness from unlocking machines
    let progressionAssert = null;
    try {
        progressionAssert = await marketplaceOrderService.assertOrderReadyForFinancialProgression(orderId, {
            action: 'evaluate_queue_eligibility',
            operatorId: options.operatorId || 'SYSTEM'
        }, options);
        if (progressionAssert && progressionAssert.warnings) {
            warnings.push(...progressionAssert.warnings);
        }
    } catch (err) {
        if (err.code === 'MARKETPLACE_READINESS_REQUIRED') {
            blockers.push('READINESS_REQUIRED');
            if (err.readiness && err.readiness.blockers) {
                blockers.push(...err.readiness.blockers);
            }
        } else {
            blockers.push('READINESS_EVALUATION_FAILED');
        }
    }

    const finalEligible = blockers.length === 0;

    if (!finalEligible) {
        await lifecycleAudit.auditProductionQueueTransition('PRODUCTION_QUEUE_BLOCKED', 'FAILURE', {
            order_id: orderId,
            previous_status: order.status,
            next_status: order.status,
            blockers,
            warnings,
            actor: options.operatorId || 'SYSTEM'
        });
    } else {
        await lifecycleAudit.auditProductionQueueTransition('PRODUCTION_QUEUE_ELIGIBILITY_CHECKED', 'SUCCESS', {
            order_id: orderId,
            previous_status: order.status,
            next_status: order.status,
            warnings,
            actor: options.operatorId || 'SYSTEM'
        });
    }

    const governance_domains = {
        artifact_trust: blockers.some(b => b.includes('ARTIFACT_TRUST')) ? 'BLOCKED' : 'PASSED',
        policy_profile: blockers.includes('POLICY_PROFILE_FAILED') ? 'BLOCKED' : 'PASSED',
        machine_compatibility: (blockers.includes('MACHINE_INCOMPATIBLE') || blockers.includes('PRINTHOUSE_PROFILE_BINDING_MISSING')) ? 'BLOCKED' : 'PASSED',
        proof: blockers.includes('VISUAL_PROOF_APPROVAL_REQUIRED') ? 'BLOCKED' : 'PASSED',
        payment: (blockers.includes('PAYMENT_NOT_CONFIRMED') || blockers.includes('INVOICE_NOT_ISSUED')) ? 'BLOCKED' : 'PASSED',
        handoff: blockers.includes('HANDOFF_PACKAGE_NOT_FOUND') ? 'BLOCKED' : 'PASSED'
    };

    return {
        ok: true,
        orderId,
        eligible: finalEligible,
        blockers,
        warnings,
        governance_domains,
        humanReportGates: progressionAssert ? progressionAssert.humanReportGates : [],
        orderStatus: order.status,
        metadata: {
            dispatchPackageStatus: dispatchPackage.status,
            invoiceStatus: invoice.status,
            paymentStatus: payment.status,
            productionUnlockStatus: productionUnlock.status,
            productionDecision: productionDecision.decision
        }
    };
}

/**
 * Creates a production queue entry, transitioning order status to PRODUCTION_QUEUED or MACHINE_ASSIGNED.
 */
async function createProductionQueueEntry(orderId, payload = {}, options = {}) {
    logger.info({ event: 'CREATING_PRODUCTION_QUEUE_ENTRY', orderId, payload });

    const orders = await mysqlClient.query('SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    // Idempotency: if already queued or machine assigned, return existing entry
    if ((order.status === 'PRODUCTION_QUEUED' || order.status === 'MACHINE_ASSIGNED') && metadata.production_queue) {
        return {
            ok: true,
            idempotent: true,
            productionQueue: metadata.production_queue,
            status: order.status
        };
    }

    // Evaluate eligibility
    const evalResult = await evaluateProductionQueueEligibility(orderId, {
        machineId: payload.machineId,
        operatorId: options.operatorId
    });

    if (!evalResult.eligible) {
        if (evalResult.blockers.includes('PRODUCTION_MACHINE_INCOMPATIBLE')) {
            throw new Error('PRODUCTION_MACHINE_INCOMPATIBLE');
        }
        throw new Error('PRODUCTION_QUEUE_CREATION_BLOCKED');
    }

    const queuedAt = new Date().toISOString();
    const queuedBy = options.operatorId || 'SYSTEM';
    const warnings = evalResult.warnings;

    const production_queue = {
        phase: '38.5',
        status: 'PRODUCTION_QUEUED',
        queuedAt,
        queuedBy,
        warnings,
        machineAssignment: {
            machineId: null,
            assignedAt: null,
            assignedBy: null,
            assignmentStatus: 'UNASSIGNED',
            history: []
        }
    };

    const hasMachineId = !!payload.machineId;
    let assignedAt = null;
    let assignedBy = null;
    if (hasMachineId) {
        assignedAt = new Date().toISOString();
        assignedBy = options.operatorId || 'SYSTEM';
        production_queue.status = 'MACHINE_ASSIGNED';
        production_queue.machineAssignment = {
            machineId: payload.machineId,
            assignedAt,
            assignedBy,
            assignmentStatus: 'ASSIGNED',
            history: [{
                action: 'ASSIGN',
                machineId: payload.machineId,
                timestamp: assignedAt,
                operatorId: assignedBy,
                note: payload.note || ''
            }]
        };
    }

    const newStatus = production_queue.status;
    metadata.production_queue = production_queue;

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = ?, updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), newStatus, orderId]
    );

    // Emit audit events
    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_QUEUE_ENTRY_CREATED',
            actorId: queuedBy,
            payload: {
                phase: '38.5',
                status: 'PRODUCTION_QUEUED',
                queuedAt,
                queuedBy,
                warnings
            }
        });

        await lifecycleAudit.auditProductionQueueTransition('PRODUCTION_QUEUED', 'SUCCESS', {
            order_id: orderId,
            previous_status: order.status,
            next_status: newStatus,
            warnings,
            actor: queuedBy
        });

        if (hasMachineId) {
            await marketplaceOrderService.appendOrderEvent(orderId, {
                type: 'PRODUCTION_MACHINE_ASSIGNED',
                actorId: assignedBy,
                payload: {
                    phase: '38.5',
                    machineId: payload.machineId,
                    assignedAt,
                    assignedBy,
                    note: payload.note || '',
                    warnings
                }
            });

            await lifecycleAudit.auditMachineAssignmentTransition('MACHINE_ASSIGNED', 'SUCCESS', {
                order_id: orderId,
                previous_status: 'PRODUCTION_QUEUED',
                next_status: newStatus,
                machine_id: payload.machineId,
                warnings,
                actor: assignedBy,
                reason: payload.note || ''
            });
        }
    }

    return {
        ok: true,
        productionQueue: production_queue,
        status: newStatus
    };
}

/**
 * Gets production queue status for an order.
 */
async function getProductionQueueStatus(orderId, options = {}) {
    const orders = await mysqlClient.query('SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    return {
        ok: true,
        orderId,
        orderStatus: order.status,
        productionQueue: metadata.production_queue || null
    };
}

/**
 * Assigns a machine to a queued order.
 */
async function assignProductionMachine(orderId, machineId, payload = {}, options = {}) {
    logger.info({ event: 'ASSIGNING_PRODUCTION_MACHINE', orderId, machineId, payload });

    if (!machineId) {
        throw new Error('MACHINE_ID_REQUIRED');
    }

    const orders = await mysqlClient.query('SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    if (!metadata.production_queue) {
        throw new Error('PRODUCTION_QUEUE_ENTRY_NOT_FOUND');
    }

    if (order.status !== 'PRODUCTION_QUEUED' && order.status !== 'MACHINE_ASSIGNED') {
        throw new Error('INVALID_ORDER_STATUS_FOR_ASSIGNMENT');
    }

    const currentAssignment = metadata.production_queue.machineAssignment || {};
    if (currentAssignment.machineId === machineId && currentAssignment.assignmentStatus === 'ASSIGNED') {
        return {
            ok: true,
            idempotent: true,
            productionQueue: metadata.production_queue,
            status: order.status
        };
    }

    // Phase 73: Check machine capability compatibility matching
    const evalResult = await evaluateProductionQueueEligibility(orderId, {
        machineId,
        operatorId: options.operatorId,
        ignoreOrderStatus: true
    });
    if (!evalResult.eligible) {
        if (evalResult.blockers.includes('PRODUCTION_MACHINE_INCOMPATIBLE')) {
            throw new Error('PRODUCTION_MACHINE_INCOMPATIBLE');
        }
        throw new Error('PRODUCTION_QUEUE_CREATION_BLOCKED');
    }

    const assignedAt = new Date().toISOString();
    const assignedBy = options.operatorId || 'SYSTEM';
    const note = payload.note || '';

    // Check machine registry validation warning
    const warnings = [...new Set([
        ...(metadata.production_queue.warnings || []),
        ...(evalResult.warnings || [])
    ])];
    const machines = await mysqlClient.query(
        'SELECT id FROM print_node_machine_profiles WHERE id = ? AND status = "ACTIVE"',
        [machineId]
    );
    if ((!machines || machines.length === 0) && !warnings.includes('MACHINE_REGISTRY_NOT_VERIFIED')) {
        warnings.push('MACHINE_REGISTRY_NOT_VERIFIED');
    }

    metadata.production_queue.status = 'MACHINE_ASSIGNED';
    metadata.production_queue.warnings = warnings;
    metadata.production_queue.machineAssignment = {
        machineId,
        assignedAt,
        assignedBy,
        assignmentStatus: 'ASSIGNED',
        history: [
            ...(currentAssignment.history || []),
            {
                action: 'ASSIGN',
                machineId,
                timestamp: assignedAt,
                operatorId: assignedBy,
                note
            }
        ]
    };

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "MACHINE_ASSIGNED", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_MACHINE_ASSIGNED',
            actorId: assignedBy,
            payload: {
                phase: '38.5',
                machineId,
                assignedAt,
                assignedBy,
                note,
                warnings
            }
        });

        await lifecycleAudit.auditMachineAssignmentTransition('MACHINE_ASSIGNED', 'SUCCESS', {
            order_id: orderId,
            previous_status: order.status,
            next_status: 'MACHINE_ASSIGNED',
            machine_id: machineId,
            warnings,
            actor: assignedBy,
            reason: note
        });
    }

    return {
        ok: true,
        productionQueue: metadata.production_queue,
        status: 'MACHINE_ASSIGNED'
    };
}

/**
 * Unassigns a machine from a queued order, returning status to PRODUCTION_QUEUED.
 */
async function unassignProductionMachine(orderId, payload = {}, options = {}) {
    logger.info({ event: 'UNASSIGNING_PRODUCTION_MACHINE', orderId, payload });

    const orders = await mysqlClient.query('SELECT status, metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
    if (!orders || orders.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }

    const order = orders[0];
    const metadata = safeParseJson(order.metadata_json, {});

    if (!metadata.production_queue) {
        throw new Error('PRODUCTION_QUEUE_ENTRY_NOT_FOUND');
    }

    const currentAssignment = metadata.production_queue.machineAssignment || {};
    if (order.status === 'PRODUCTION_QUEUED' && currentAssignment.assignmentStatus === 'UNASSIGNED') {
        return {
            ok: true,
            idempotent: true,
            productionQueue: metadata.production_queue,
            status: order.status
        };
    }

    if (order.status !== 'MACHINE_ASSIGNED') {
        throw new Error('INVALID_ORDER_STATUS_FOR_UNASSIGNMENT');
    }

    const unassignedAt = new Date().toISOString();
    const unassignedBy = options.operatorId || 'SYSTEM';
    const reason = payload.reason || '';

    metadata.production_queue.status = 'PRODUCTION_QUEUED';
    metadata.production_queue.machineAssignment = {
        machineId: null,
        assignedAt: null,
        assignedBy: null,
        assignmentStatus: 'UNASSIGNED',
        history: [
            ...(currentAssignment.history || []),
            {
                action: 'UNASSIGN',
                timestamp: unassignedAt,
                operatorId: unassignedBy,
                reason
            }
        ]
    };

    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = "PRODUCTION_QUEUED", updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );

    if (marketplaceOrderService && typeof marketplaceOrderService.appendOrderEvent === 'function') {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type: 'PRODUCTION_MACHINE_UNASSIGNED',
            actorId: unassignedBy,
            payload: {
                phase: '38.5',
                unassignedAt,
                unassignedBy,
                reason
            }
        });
    }

    return {
        ok: true,
        productionQueue: metadata.production_queue,
        status: 'PRODUCTION_QUEUED'
    };
}

module.exports = {
    evaluateProductionQueueEligibility,
    createProductionQueueEntry,
    getProductionQueueStatus,
    assignProductionMachine,
    unassignProductionMachine
};
