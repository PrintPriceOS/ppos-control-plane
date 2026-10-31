const crypto = require('crypto');

class FinancialOperationsFinalReleaseCandidateReviewService {
    constructor(candidateService) {
        this._mockEvents = [];
        this.candidateService = candidateService;
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async approveFinalReleaseCandidate(candidateId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const rc = this.candidateService ? this.candidateService._mockCandidates.find(c => c.final_release_candidate_id === candidateId) : null;
        if (!rc) throw new Error('Release candidate not found');

        if (rc.release_candidate_status !== 'READY_FOR_REVIEW' && rc.release_candidate_status !== 'APPROVED_AS_FINAL_RELEASE_CANDIDATE') {
            throw new Error(`Cannot approve release candidate in status ${rc.release_candidate_status}`);
        }

        rc.release_candidate_status = 'APPROVED_AS_FINAL_RELEASE_CANDIDATE';
        rc.approved_at = new Date().toISOString();
        rc.approved_by = actor.userId;

        await this._recordEvent('FINOPS_FINAL_RELEASE_CANDIDATE_APPROVED', rc, actor, 'Final Release Candidate approved');

        return rc;
    }

    async rejectFinalReleaseCandidate(candidateId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const rc = this.candidateService ? this.candidateService._mockCandidates.find(c => c.final_release_candidate_id === candidateId) : null;
        if (!rc) throw new Error('Release candidate not found');

        rc.release_candidate_status = 'REJECTED';
        rc.completed_at = new Date().toISOString();
        rc.completed_by = actor.userId;

        await this._recordEvent('FINOPS_FINAL_RELEASE_CANDIDATE_REJECTED', rc, actor, 'Final Release Candidate rejected');

        return rc;
    }

    async revokeFinalReleaseCandidate(candidateId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const rc = this.candidateService ? this.candidateService._mockCandidates.find(c => c.final_release_candidate_id === candidateId) : null;
        if (!rc) throw new Error('Release candidate not found');

        rc.release_candidate_status = 'REVOKED';
        rc.revoked_at = new Date().toISOString();
        rc.revoked_by = actor.userId;

        await this._recordEvent('FINOPS_FINAL_RELEASE_CANDIDATE_REVOKED', rc, actor, 'Final Release Candidate revoked');

        return rc;
    }

    async resolveFinding(candidateId, findingCode, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);

        const rc = { final_release_candidate_id: candidateId };
        await this._recordEvent('FINOPS_FINAL_RELEASE_CANDIDATE_FINDING_RESOLVED', rc, actor, `Finding ${findingCode} resolved`);
        return true;
    }

    async dismissWarning(candidateId, warningText, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const rc = { final_release_candidate_id: candidateId };
        await this._recordEvent('FINOPS_FINAL_RELEASE_CANDIDATE_WARNING_DISMISSED', rc, actor, `Warning dismissed: ${warningText}`);
        return true;
    }

    async addReviewNote(candidateId, noteType, note, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const rc = { final_release_candidate_id: candidateId };
        await this._recordEvent('FINOPS_FINAL_RELEASE_CANDIDATE_REVIEW_NOTE_ADDED', rc, actor, `Note added (${noteType}): ${note}`);
        return true;
    }

    async requestAdditionalEvidence(candidateId, note, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN', 'COMPLIANCE_ADMIN']);
        const rc = { final_release_candidate_id: candidateId };
        await this._recordEvent('FINOPS_FINAL_RELEASE_CANDIDATE_REVIEW_ACTION_RECORDED', rc, actor, `Additional evidence requested: ${note}`);
        return true;
    }

    async _recordEvent(eventType, rc, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            final_release_candidate_id: rc ? rc.final_release_candidate_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsFinalReleaseCandidateReviewService;
