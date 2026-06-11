const crypto = require('crypto');
const BetaFunnelAggregationService = require('./betaFunnelAggregationService');

class BetaHealthAlertService {
    constructor(dependencies = {}) {
        this.aggregationService = dependencies.betaFunnelAggregationService || new BetaFunnelAggregationService();
        this._mockAlerts = [];
    }

    _assertRole(actor) {
        if (!['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN'].includes(actor.role)) {
            throw new Error('Unauthorized');
        }
    }

    async createBetaObservabilityAlert({ alertType, severity, payload, actor }) {
        this._assertRole(actor);
        const alert = {
            id: `bha_${crypto.randomUUID()}`,
            tenant_id: payload.tenant_id,
            cohort_id: payload.cohort_id,
            alert_type: alertType,
            severity,
            alert_status: 'OPEN',
            message: payload.message,
            metric_snapshot_json: payload.metric_snapshot_json,
            created_by: actor.userId,
            created_by_role: actor.role,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        this._mockAlerts.push(alert);
        return alert;
    }

    async acknowledgeBetaAlert({ alertId, actor }) {
        this._assertRole(actor);
        const alert = this._mockAlerts.find(a => a.id === alertId);
        if (!alert) throw new Error('Alert not found');
        alert.alert_status = 'ACKNOWLEDGED';
        alert.acknowledged_by = actor.userId;
        alert.acknowledged_at = new Date().toISOString();
        alert.updated_at = new Date().toISOString();
        return alert;
    }

    async resolveBetaAlert({ alertId, resolutionNotes, actor }) {
        this._assertRole(actor);
        const alert = this._mockAlerts.find(a => a.id === alertId);
        if (!alert) throw new Error('Alert not found');
        alert.alert_status = 'RESOLVED';
        alert.resolved_by = actor.userId;
        alert.resolved_at = new Date().toISOString();
        alert.updated_at = new Date().toISOString();
        return alert;
    }

    async dismissBetaAlert({ alertId, reason, actor }) {
        this._assertRole(actor);
        const alert = this._mockAlerts.find(a => a.id === alertId);
        if (!alert) throw new Error('Alert not found');
        alert.alert_status = 'DISMISSED';
        alert.updated_at = new Date().toISOString();
        return alert;
    }

    async evaluateBetaHealth({ cohortId, tenantId, actor }) {
        const funnel = await this.aggregationService.computeBetaFunnel({ cohortId, tenantId, actor });
        
        await this.evaluateFunnelDropOffRisk({ funnel, cohortId, tenantId, actor });
        await this.evaluateOfferConversionRisk({ funnel, cohortId, tenantId, actor });
        await this.evaluateFileUploadFailureRisk({ funnel, cohortId, tenantId, actor });
        await this.evaluatePreflightFailureRisk({ funnel, cohortId, tenantId, actor });
        await this.evaluateProofPaymentStallRisk({ funnel, cohortId, tenantId, actor });
        await this.evaluateLivePipelineBlockRisk({ funnel, cohortId, tenantId, actor });
        await this.evaluateSupportLoadRisk({ funnel, cohortId, tenantId, actor });
        await this.evaluateIncidentRateRisk({ funnel, cohortId, tenantId, actor });

        if (funnel.emergencyStops > 0) {
            await this.createBetaObservabilityAlert({ alertType: 'EMERGENCY_STOP_ACTIVE', severity: 'CRITICAL', payload: { tenant_id: tenantId, cohort_id: cohortId, message: 'Emergency stop detected' }, actor });
        }
        if (funnel.rollbacks > 0) {
            await this.createBetaObservabilityAlert({ alertType: 'ROLLBACK_ACTIVE', severity: 'CRITICAL', payload: { tenant_id: tenantId, cohort_id: cohortId, message: 'Rollback detected' }, actor });
        }

        return { status: 'HEALTH_EVALUATED' };
    }

    async evaluateFunnelDropOffRisk({ funnel, cohortId, tenantId, actor }) {
        if (funnel.rates && funnel.rates.REGISTERED < 50 && funnel.counts.REDEEMED > 5) {
            await this.createBetaObservabilityAlert({
                alertType: 'REGISTRATION_DROP_OFF_HIGH',
                severity: 'WARNING',
                payload: { tenant_id: tenantId, cohort_id: cohortId, message: 'High registration drop-off' },
                actor
            });
        }
    }

    async evaluateOfferConversionRisk({ funnel, cohortId, tenantId, actor }) {
        if (funnel.rates && funnel.rates.OFFER_ACCEPTED < 20 && funnel.counts.OFFER_GENERATED > 10) {
            await this.createBetaObservabilityAlert({
                alertType: 'OFFER_CONVERSION_LOW',
                severity: 'WARNING',
                payload: { tenant_id: tenantId, cohort_id: cohortId, message: 'Low offer conversion' },
                actor
            });
        }
    }

    async evaluateFileUploadFailureRisk({ funnel, cohortId, tenantId, actor }) {
        if (funnel.dropOffs && funnel.dropOffs.FILES_UPLOADED > 5) {
            await this.createBetaObservabilityAlert({
                alertType: 'FILE_UPLOAD_FAILURE_SPIKE',
                severity: 'WARNING',
                payload: { tenant_id: tenantId, cohort_id: cohortId, message: 'File upload failures' },
                actor
            });
        }
    }

    async evaluatePreflightFailureRisk({ funnel, cohortId, tenantId, actor }) {
        if (funnel.dropOffs && funnel.dropOffs.PREFLIGHT_COMPLETED > 5) {
            await this.createBetaObservabilityAlert({
                alertType: 'PREFLIGHT_FAILURE_SPIKE',
                severity: 'WARNING',
                payload: { tenant_id: tenantId, cohort_id: cohortId, message: 'Preflight failures' },
                actor
            });
        }
    }

    async evaluateProofPaymentStallRisk({ funnel, cohortId, tenantId, actor }) {
        if (funnel.dropOffs && (funnel.dropOffs.PROOF_APPROVED > 5 || funnel.dropOffs.PAYMENT_CONFIRMED > 5)) {
            await this.createBetaObservabilityAlert({
                alertType: 'PROOF_PAYMENT_STALLED',
                severity: 'WARNING',
                payload: { tenant_id: tenantId, cohort_id: cohortId, message: 'Proof/payment stalled' },
                actor
            });
        }
    }

    async evaluateLivePipelineBlockRisk({ funnel, cohortId, tenantId, actor }) {
        if (funnel.dropOffs && funnel.dropOffs.LIVE_PIPELINE_ENTERED > 2) {
            await this.createBetaObservabilityAlert({
                alertType: 'LIVE_PIPELINE_BLOCKED',
                severity: 'CRITICAL',
                payload: { tenant_id: tenantId, cohort_id: cohortId, message: 'Live pipeline blocked' },
                actor
            });
        }
    }

    async evaluateSupportLoadRisk({ funnel, cohortId, tenantId, actor }) {
        if (funnel.supportTickets > 10) {
            await this.createBetaObservabilityAlert({
                alertType: 'SUPPORT_LOAD_HIGH',
                severity: 'WARNING',
                payload: { tenant_id: tenantId, cohort_id: cohortId, message: 'High support load' },
                actor
            });
        }
    }

    async evaluateIncidentRateRisk({ funnel, cohortId, tenantId, actor }) {
        if (funnel.incidents > 2) {
            await this.createBetaObservabilityAlert({
                alertType: 'INCIDENT_RATE_HIGH',
                severity: 'CRITICAL',
                payload: { tenant_id: tenantId, cohort_id: cohortId, message: 'High incident rate' },
                actor
            });
        }
    }
}

module.exports = BetaHealthAlertService;
