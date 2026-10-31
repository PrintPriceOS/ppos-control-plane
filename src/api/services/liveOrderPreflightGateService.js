class LiveOrderPreflightGateService {
    constructor(dependencies = {}) {
        this.liveOrderLifecycleService = dependencies.liveOrderLifecycleService || {};
        this.artifactTrustService = dependencies.artifactTrustService || {};
        // Stubbed data for smoke test
        this._mockData = {
            files: {},
            jobs: {},
            proofs: {},
            customerActions: {}
        };
    }

    async attachFileToLiveOrder({ liveOrderId, fileType, fileId, actor }) {
        if (!this._mockData.files[liveOrderId]) this._mockData.files[liveOrderId] = [];
        this._mockData.files[liveOrderId].push({ fileType, fileId });
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: 't1', liveOrderId, eventType: 'LIVE_FILE_ATTACHED', actor, message: `Attached ${fileType}`
        });
        return { success: true };
    }

    async evaluateLiveOrderFileReadiness({ liveOrderId, actor }) {
        const order = await this.liveOrderLifecycleService.getLiveOrder({ liveOrderId, actor });
        const required = JSON.parse(order.required_files_json || '[]');
        const uploaded = this._mockData.files[liveOrderId] || [];
        const missing = required.filter(r => !uploaded.find(u => u.fileType === r));
        
        const status = missing.length === 0 ? 'PASSED' : 'BLOCKED';
        
        await this.liveOrderLifecycleService.createGateSnapshot({
            liveOrderId, gateName: 'FILE_UPLOAD', gateStatus: status, snapshot: { missing }
        });

        return { gateName: 'FILE_UPLOAD', status, missing };
    }

    async submitLiveOrderPreflight({ liveOrderId, actor }) {
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: 't1', liveOrderId, eventType: 'LIVE_PREFLIGHT_STARTED', actor, message: 'Preflight submitted'
        });
        return { success: true };
    }

    async bindPreflightJobToLiveOrder({ liveOrderId, jobId, fileType, actor }) {
        if (!this._mockData.jobs[liveOrderId]) this._mockData.jobs[liveOrderId] = [];
        this._mockData.jobs[liveOrderId].push({ jobId, fileType, status: 'COMPLETED' });
        return { success: true };
    }

    async evaluateLiveOrderPreflightStatus({ liveOrderId, actor }) {
        const jobs = this._mockData.jobs[liveOrderId] || [];
        const hasFailed = jobs.some(j => j.status === 'FAILED');
        const hasDegraded = jobs.some(j => j.status === 'DEGRADED_BLOCKED'); // Mock blocked policy

        let status = 'PASSED';
        if (hasFailed || hasDegraded) status = 'BLOCKED';
        else if (jobs.length === 0) status = 'REVIEW_REQUIRED';

        await this.liveOrderLifecycleService.createGateSnapshot({
            liveOrderId, gateName: 'PREFLIGHT', gateStatus: status, snapshot: { jobs }
        });

        return { gateName: 'PREFLIGHT', status };
    }

    async evaluateLiveOrderArtifactTrust({ liveOrderId, actor }) {
        const trustStatus = this._mockData.artifactTrust || 'REVIEW_REQUIRED';
        await this.liveOrderLifecycleService.createGateSnapshot({
            liveOrderId, gateName: 'ARTIFACT_TRUST', gateStatus: trustStatus, snapshot: { status: trustStatus }
        });
        return { gateName: 'ARTIFACT_TRUST', status: trustStatus };
    }

    async requireLiveOrderCustomerAction({ liveOrderId, reason, actor }) {
        this._mockData.customerActions[liveOrderId] = 'REQUIRED';
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: 't1', liveOrderId, eventType: 'LIVE_CUSTOMER_ACTION_REQUIRED', actor, message: reason
        });
        return { success: true };
    }

    async resolveLiveOrderCustomerAction({ liveOrderId, actor }) {
        this._mockData.customerActions[liveOrderId] = 'RESOLVED';
        return { success: true };
    }

    async markLiveOrderProofRequired({ liveOrderId, proofPayload, actor }) {
        this._mockData.proofs[liveOrderId] = 'REQUIRED';
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: 't1', liveOrderId, eventType: 'LIVE_PROOF_REQUIRED', actor, message: 'Proof required'
        });
        return { success: true };
    }

    async approveLiveOrderProof({ liveOrderId, actor }) {
        this._mockData.proofs[liveOrderId] = 'APPROVED';
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: 't1', liveOrderId, eventType: 'LIVE_PROOF_APPROVED', actor, message: 'Proof approved'
        });
        return { success: true };
    }

    async rejectLiveOrderProof({ liveOrderId, reason, actor }) {
        this._mockData.proofs[liveOrderId] = 'REJECTED';
        await this.liveOrderLifecycleService.recordLiveOrderEvent({
            tenantId: 't1', liveOrderId, eventType: 'LIVE_PROOF_REJECTED', actor, message: reason
        });
        return { success: true };
    }

    async createLiveOrderGateSnapshots({ liveOrderId, actor }) {
        const file = await this.evaluateLiveOrderFileReadiness({ liveOrderId, actor });
        const preflight = await this.evaluateLiveOrderPreflightStatus({ liveOrderId, actor });
        const trust = await this.evaluateLiveOrderArtifactTrust({ liveOrderId, actor });

        const proofStatus = this._mockData.proofs[liveOrderId] || 'NOT_APPLICABLE';
        let pGate = 'NOT_APPLICABLE';
        if (proofStatus === 'REQUIRED') pGate = 'BLOCKED';
        if (proofStatus === 'APPROVED') pGate = 'PASSED';
        if (proofStatus === 'REJECTED') pGate = 'BLOCKED';

        await this.liveOrderLifecycleService.createGateSnapshot({
            liveOrderId, gateName: 'PROOF_APPROVAL', gateStatus: pGate, snapshot: { proofStatus }
        });

        return { file, preflight, trust, proof: pGate };
    }
}

module.exports = LiveOrderPreflightGateService;
