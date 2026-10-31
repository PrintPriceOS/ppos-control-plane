const crypto = require('crypto');

class FinancialOperationsOperationalReadinessService {
    constructor() {
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async evaluateOperationalReadiness({ metrics, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const results = {
            id: crypto.randomUUID(),
            status: 'OPERATIONALLY_READY_FOR_REVIEW',
            blockers: [],
            warnings: [],
            evaluated_at: new Date().toISOString()
        };

        const checks = {
            AUDIT_TIMELINE_COMPLETE: metrics.auditTimelineComplete === true,
            MONITORING_EVENTS_PRESENT: metrics.monitoringEventsPresent === true,
            INCIDENT_RESPONSE_PATH_DEFINED: metrics.incidentResponsePathDefined === true,
            INCIDENT_SEVERITY_MODEL_DEFINED: metrics.incidentSeverityModelDefined === true,
            ROLLBACK_PATH_DOCUMENTED: metrics.rollbackPathDocumented === true,
            REVOCATION_PATH_AVAILABLE: metrics.revocationPathAvailable === true,
            RATE_LIMITS_PRESENT: metrics.rateLimitsPresent === true,
            OPERATOR_REVIEW_REQUIRED: metrics.operatorReviewRequired !== false,
            EXPORT_PREVIEW_ONLY: metrics.exportPreviewOnly !== false,
            NO_EXTERNAL_EXECUTION_ENABLED: metrics.externalExecutionEnabled === false
        };

        // Blockers
        if (!checks.AUDIT_TIMELINE_COMPLETE) results.blockers.push('BLOCKED_BY_AUDIT_GAPS');
        if (!checks.INCIDENT_RESPONSE_PATH_DEFINED || !checks.INCIDENT_SEVERITY_MODEL_DEFINED) results.blockers.push('BLOCKED_BY_MISSING_INCIDENT_RESPONSE');
        if (!checks.ROLLBACK_PATH_DOCUMENTED || !checks.REVOCATION_PATH_AVAILABLE) results.blockers.push('BLOCKED_BY_MISSING_ROLLBACK');
        if (!checks.NO_EXTERNAL_EXECUTION_ENABLED) results.blockers.push('EXTERNAL_EXECUTION_MUST_BE_DISABLED');

        // Warnings
        if (!checks.MONITORING_EVENTS_PRESENT) {
            results.warnings.push('Monitoring events are incomplete or missing');
        }
        if (!checks.RATE_LIMITS_PRESENT) {
            results.warnings.push('Rate limits are not fully configured');
        }

        if (results.blockers.length > 0) {
            results.status = results.blockers[0]; // Set status to first blocker
        } else if (results.warnings.length > 0) {
            results.status = 'MANUAL_REVIEW_REQUIRED';
        }

        await this._recordEvent({
            eventType: 'FINOPS_OPERATIONAL_READINESS_EVALUATED',
            actor,
            message: `Operational readiness evaluated. Status: ${results.status}`
        });

        if (results.blockers.includes('BLOCKED_BY_MISSING_INCIDENT_RESPONSE')) {
            await this._recordEvent({
                eventType: 'FINOPS_INCIDENT_RESPONSE_BLOCKER_DETECTED',
                actor,
                message: `Incident response path or severity model is missing`
            });
        }
        if (results.blockers.includes('BLOCKED_BY_AUDIT_GAPS')) {
            await this._recordEvent({
                eventType: 'FINOPS_AUDIT_GAP_DETECTED',
                actor,
                message: `Audit timeline is incomplete`
            });
        }
        if (results.warnings.includes('Monitoring events are incomplete or missing')) {
            await this._recordEvent({
                eventType: 'FINOPS_OBSERVABILITY_WARNING_RAISED',
                actor,
                message: `Monitoring events are incomplete or missing`
            });
        }
        if (!results.blockers.includes('BLOCKED_BY_MISSING_ROLLBACK')) {
            await this._recordEvent({
                eventType: 'FINOPS_ROLLBACK_READINESS_CONFIRMED',
                actor,
                message: `Rollback and revocation paths are documented and ready`
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

module.exports = FinancialOperationsOperationalReadinessService;
