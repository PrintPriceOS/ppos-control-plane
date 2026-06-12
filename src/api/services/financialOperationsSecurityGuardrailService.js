const crypto = require('crypto');

class FinancialOperationsSecurityGuardrailService {
    constructor() {
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async evaluateGuardrails({ config, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);

        const results = {
            id: crypto.randomUUID(),
            status: 'PASS',
            blockers: [],
            warnings: [],
            evaluated_at: new Date().toISOString()
        };

        // Blockers (Must be strictly disabled/enabled)
        if (config.fullPublicEnabled) results.blockers.push('FULL_PUBLIC enabled');
        if (config.livePaymentEnabled) results.blockers.push('Live payment execution enabled');
        if (config.liveRefundEnabled) results.blockers.push('Live refund execution enabled');
        if (config.livePayoutEnabled) results.blockers.push('Live payout execution enabled');
        if (config.externalInvoiceEnabled) results.blockers.push('External invoice submission enabled');
        if (config.taxFilingEnabled) results.blockers.push('Tax filing automation enabled');
        if (!config.mockProviderLocalOnly) results.blockers.push('Mock provider is not local-only');
        if (!config.sandboxModeEnforced) results.blockers.push('Sandbox mode is not enforced');
        if (!config.dryRunModeEnforced) results.blockers.push('Dry-run mode is not enforced');
        if (!config.manualApprovalGatesPresent) results.blockers.push('Manual approval gates missing');
        if (!config.auditLoggingEnabled) results.blockers.push('Audit logging disabled');

        // Warnings
        if (!config.partnerAccessScoped) results.warnings.push('Partner access scope not explicitly defined');
        if (!config.tenantAccessScoped) results.warnings.push('Tenant access scope not explicitly defined');

        if (results.blockers.length > 0) {
            results.status = 'BLOCKED';
        } else if (results.warnings.length > 0) {
            results.status = 'WARNING';
        }

        await this._recordEvent({
            eventType: 'FINOPS_SECURITY_GUARDRAILS_EVALUATED',
            actor,
            message: `Security guardrails evaluated. Status: ${results.status}`
        });

        if (results.blockers.length > 0) {
            await this._recordEvent({
                eventType: 'FINOPS_SECURITY_GUARDRAIL_BLOCKER_DETECTED',
                actor,
                message: `Security blockers detected: ${results.blockers.join(', ')}`
            });
        }

        if (results.warnings.length > 0) {
            await this._recordEvent({
                eventType: 'FINOPS_SECURITY_GUARDRAIL_WARNING_RAISED',
                actor,
                message: `Security warnings raised: ${results.warnings.join(', ')}`
            });
        }

        return results;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsSecurityGuardrailService;
