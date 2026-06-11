const crypto = require('crypto');

class CohortExpansionMonitoringService {
    constructor() {
        this._mockAlerts = [];
        this._mockFunnel = {
            rates: { OFFER_ACCEPTED: 50 },
            dropOffs: { PREFLIGHT_COMPLETED: 1, FILES_UPLOADED: 1 },
            supportTickets: 0,
            incidents: 0,
            publicGuardBlocks: 0,
            emergencyStops: 0,
            securityAnomalies: 0
        };
    }

    _assertRole(actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN'].includes(actor.role)) {
            throw new Error('Unauthorized');
        }
    }

    async startExpansionMonitoring({ expansionExecutionId, actor }) {
        this._assertRole(actor);
        return { status: 'MONITORING_ACTIVE', expansionExecutionId };
    }

    async evaluateExpansionHealth({ expansionExecutionId, actor }) {
        this._assertRole(actor);
        const f = this._mockFunnel;
        const anomalies = [];

        if (f.rates.OFFER_ACCEPTED < 20) anomalies.push('Conversion degradation detected');
        if (f.dropOffs.FILES_UPLOADED > 5) anomalies.push('File upload failure spike detected');
        if (f.dropOffs.PREFLIGHT_COMPLETED > 5) anomalies.push('Preflight failure spike detected');
        if (f.supportTickets > 10) anomalies.push('Support load spike detected');
        if (f.incidents > 2) anomalies.push('Incident spike detected');
        if (f.publicGuardBlocks > 10) anomalies.push('Public guard blocks spike detected');
        if (f.securityAnomalies > 0) anomalies.push('Security/RBAC anomaly creates critical alert');
        if (f.emergencyStops > 0) anomalies.push('Emergency stop active');

        return {
            expansionExecutionId,
            status: anomalies.length > 0 ? 'ANOMALIES_DETECTED' : 'OK',
            anomalies
        };
    }

    async createExpansionMonitoringAlert({ expansionExecutionId, alertType, severity, payload, actor }) {
        this._assertRole(actor);
        const alert = {
            id: `cema_${crypto.randomUUID()}`,
            expansion_execution_id: expansionExecutionId,
            alert_type: alertType,
            severity,
            payload_json: payload,
            status: 'OPEN',
            created_at: new Date().toISOString()
        };
        this._mockAlerts.push(alert);
        return alert;
    }

    async resolveExpansionMonitoringAlert({ alertId, resolutionNotes, actor }) {
        this._assertRole(actor);
        const alert = this._mockAlerts.find(a => a.id === alertId);
        if (!alert) throw new Error('Alert not found');
        alert.status = 'RESOLVED';
        alert.resolution_notes = resolutionNotes;
        alert.resolved_at = new Date().toISOString();
        return alert;
    }

    async evaluateExpansionRollbackTriggers({ expansionExecutionId, actor }) {
        this._assertRole(actor);
        const health = await this.evaluateExpansionHealth({ expansionExecutionId, actor });
        
        let shouldRecommend = false;
        const reasons = [];

        if (health.anomalies.includes('Incident spike detected')) {
            shouldRecommend = true;
            reasons.push('Incident spike detected');
        }
        if (health.anomalies.includes('Security/RBAC anomaly creates critical alert')) {
            shouldRecommend = true;
            reasons.push('Security/RBAC anomaly creates critical alert');
        }
        if (health.anomalies.includes('Emergency stop active')) {
            shouldRecommend = true;
            reasons.push('Emergency stop active');
        }

        if (shouldRecommend) {
            await this.recommendExpansionPauseOrRollback({ expansionExecutionId, actor });
        }

        return { recommend_rollback: shouldRecommend, reasons };
    }

    async recommendExpansionPauseOrRollback({ expansionExecutionId, actor }) {
        this._assertRole(actor);
        return { expansionExecutionId, recommendation: 'PAUSE_OR_ROLLBACK_RECOMMENDED' };
    }

    _simulateFunnel(funnelPatch) {
        this._mockFunnel = { ...this._mockFunnel, ...funnelPatch };
    }
}

module.exports = CohortExpansionMonitoringService;
