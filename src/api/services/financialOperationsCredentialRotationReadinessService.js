const crypto = require('crypto');

class FinancialOperationsCredentialRotationReadinessService {
    constructor(vaultService) {
        this.vaultService = vaultService;
        this._mockRotations = new Map();
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createRotationReadiness(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);

        const rotation = {
            id: crypto.randomUUID(),
            rotation_review_id: `crot_${crypto.randomUUID()}`,
            credential_vault_id: payload.credentialVaultId,
            tenant_id: payload.tenantId || null,
            provider_key: payload.providerKey,
            provider_type: payload.providerType,
            rotation_status: 'DRAFT',
            rotation_policy_json: payload.rotationPolicy || {},
            next_rotation_due_at: payload.nextRotationDueAt || null,
            last_rotation_reviewed_at: null,
            evidence_json: {},
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockRotations.set(rotation.rotation_review_id, rotation);
        await this._recordEvent('FINOPS_CREDENTIAL_ROTATION_REVIEW_CREATED', rotation, actor, 'Draft credential rotation review created');

        return rotation;
    }

    async evaluateReadiness(rotationReviewId, globalConfig, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        const rotation = this._getRotation(rotationReviewId);
        
        let blockers = [];

        if (!rotation.rotation_policy_json.interval_days) blockers.push('ROTATION_POLICY_NOT_DEFINED');
        if (!rotation.next_rotation_due_at) blockers.push('NEXT_ROTATION_DATE_NOT_DEFINED');
        if (!rotation.rotation_policy_json.revocation_path) blockers.push('REVOCATION_PATH_NOT_DEFINED');
        if (!rotation.rotation_policy_json.emergency_rotation_path) blockers.push('EMERGENCY_ROTATION_PATH_NOT_DEFINED');
        if (!rotation.rotation_policy_json.owner) blockers.push('OWNER_NOT_DEFINED');

        if (this.vaultService && rotation.credential_vault_id) {
            try {
                const vault = this.vaultService._getVault(rotation.credential_vault_id);
                if (vault.live_credentials_present) blockers.push('LIVE_CREDENTIALS_PRESENT');
                if (vault.live_provider_connectivity_enabled) blockers.push('LIVE_PROVIDER_CONNECTIVITY_ENABLED');
                if (vault.full_public_enabled) blockers.push('FULL_PUBLIC_ENABLED');
                if (!vault.redaction_required) blockers.push('REDACTION_NOT_CONFIRMED');
            } catch (err) {
                blockers.push('VAULT_RETRIEVAL_FAILED');
            }
        }

        const result = {
            status: blockers.length > 0 ? 'BLOCKED' : 'READY',
            blockers
        };

        await this._recordEvent('FINOPS_CREDENTIAL_ROTATION_READINESS_EVALUATED', rotation, actor, `Rotation evaluated. Status: ${result.status}`);
        return result;
    }

    async approveRotationReadiness(rotationReviewId, globalConfig, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        const rotation = this._getRotation(rotationReviewId);

        const evalResult = await this.evaluateReadiness(rotationReviewId, globalConfig, actor);
        if (evalResult.status === 'BLOCKED') {
            throw new Error(`Cannot approve rotation readiness. Blockers: ${evalResult.blockers.join(', ')}`);
        }

        rotation.rotation_status = 'APPROVED_FOR_READINESS';
        rotation.approved_at = new Date().toISOString();
        rotation.approved_by = actor.userId;

        await this._recordEvent('FINOPS_CREDENTIAL_ROTATION_APPROVED_FOR_READINESS', rotation, actor, 'Rotation readiness approved');
        return rotation;
    }

    _getRotation(id) {
        const rotation = this._mockRotations.get(id);
        if (!rotation) throw new Error('Rotation review not found');
        return rotation;
    }

    async _recordEvent(eventType, rotation, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            rotation_review_id: rotation.rotation_review_id,
            credential_vault_id: rotation.credential_vault_id,
            tenant_id: rotation.tenant_id,
            provider_key: rotation.provider_key,
            provider_type: rotation.provider_type,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsCredentialRotationReadinessService;
