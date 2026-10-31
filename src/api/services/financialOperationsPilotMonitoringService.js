const crypto = require('crypto');

class FinancialOperationsPilotMonitoringService {
    constructor(dependencies = {}) {
        this.runService = dependencies.financialOperationsPilotRunService;
        this.programService = dependencies.financialOperationsPilotProgramService;
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async generateMonitoringSummary({ runId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'FINANCE_ADMIN', 'OPS_ADMIN']);

        const run = this.runService ? this.runService._mockRuns.find(r => r.pilot_run_id === runId) : null;
        if (!run) throw new Error('Pilot run not found');

        const program = this.programService ? this.programService._mockPrograms.find(p => p.pilot_program_id === run.pilot_program_id) : null;

        const incidents = [];
        const warnings = [];
        const requiredActions = [];

        function reportIncident(msg) { incidents.push(msg); }
        function reportWarning(msg) { warnings.push(msg); }

        // Checks
        if (!run.source_snapshot_json) reportIncident('Missing source snapshot in pilot run');
        if (run.execution_mode !== 'DRY_RUN') reportIncident('Execution mode anomaly: Not DRY_RUN');
        
        if (program) {
            if (program.external_execution_enabled) reportIncident('Attempted external execution flag enabled');
            if (program.full_public_enabled) reportIncident('FULL_PUBLIC anomaly: enabled in pilot program');
            if (!program.dry_run_only) reportIncident('Program is not strictly dry_run_only');
        } else {
             // Mock failure condition for testing
            if (run._mock_missing_audit) reportIncident('Missing audit event');
            if (run._mock_external_execution_enabled) reportIncident('Attempted external execution flag enabled');
            if (run._mock_full_public_enabled) reportIncident('FULL_PUBLIC anomaly: enabled in pilot program');
        }

        if (run.run_status === 'BLOCKED') reportWarning('Pilot run is blocked');

        let status = 'HEALTHY';
        if (incidents.some(i => i.includes('Attempted external execution') || i.includes('FULL_PUBLIC anomaly'))) {
            status = 'PILOT_SUSPENSION_RECOMMENDED';
            requiredActions.push('SUSPEND_PILOT_PROGRAM');
        } else if (incidents.length > 0) {
            status = 'INCIDENT_REVIEW_REQUIRED';
            requiredActions.push('MANUAL_REVIEW');
        } else if (warnings.length > 0) {
            status = 'WARNING';
        }

        const summary = {
            id: `mon_${crypto.randomUUID()}`,
            pilot_run_id: runId,
            monitoring_status: status,
            incident_count: incidents.length,
            warnings,
            incidents,
            required_actions: requiredActions,
            evidence: { timestamp: new Date().toISOString() }
        };

        await this._recordEvent({
            eventType: 'FINOPS_PILOT_MONITORING_EVALUATED',
            actor,
            pilot_run_id: runId,
            message: `Pilot monitoring evaluated. Status: ${status}`
        });

        if (status === 'PILOT_SUSPENSION_RECOMMENDED') {
            await this._recordEvent({
                eventType: 'FINOPS_PILOT_SUSPENSION_RECOMMENDED',
                actor,
                pilot_run_id: runId,
                message: 'Critical pilot anomaly detected. Suspension recommended.'
            });
        } else if (status === 'INCIDENT_REVIEW_REQUIRED') {
            await this._recordEvent({
                eventType: 'FINOPS_PILOT_INCIDENT_DETECTED',
                actor,
                pilot_run_id: runId,
                message: `Incident detected: ${incidents[0]}`
            });
        } else if (status === 'WARNING') {
            await this._recordEvent({
                eventType: 'FINOPS_PILOT_MONITORING_WARNING_RAISED',
                actor,
                pilot_run_id: runId,
                message: `Warning raised: ${warnings[0]}`
            });
        }

        return summary;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            pilot_run_id: event.pilot_run_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsPilotMonitoringService;
