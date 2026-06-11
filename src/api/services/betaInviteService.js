const crypto = require('crypto');

class BetaInviteService {
    constructor(dependencies = {}) {
        this.launchControlService = dependencies.launchControlService || {};
        this._mockInvites = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized: Role ${actor.role} lacks permission for beta invites`);
        }
    }

    hashInviteCode(inviteCode) {
        return crypto.createHash('sha256').update(inviteCode).digest('hex');
    }

    generateInviteCode(payload) {
        return `BETA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    }

    async createInviteCode({ cohortId, tenantId, printhouseId, payload, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        
        // Ensure cohort exists
        let cohortValid = false;
        if (this.launchControlService._mockCohorts) {
            const cohort = this.launchControlService._mockCohorts.find(c => c.id === cohortId);
            if (cohort && ['READY', 'ACTIVE'].includes(cohort.cohort_status)) {
                cohortValid = true;
            }
        } else {
            // If running standalone without full mock wiring, just assume valid
            cohortValid = true;
        }

        if (!cohortValid) {
            throw new Error('Cohort must be READY or ACTIVE');
        }

        const rawCode = this.generateInviteCode(payload);
        const invite = {
            id: `inv_${crypto.randomUUID()}`,
            _rawCodeForTests: rawCode, // Never exposed in list unless explicitly requested securely
            invite_hash: this.hashInviteCode(rawCode),
            cohort_id: cohortId,
            tenant_id: tenantId || null,
            printhouse_id: printhouseId || null,
            customer_email: payload.customer_email || null,
            customer_segment: payload.customer_segment || null,
            allowed_order_types_json: payload.allowed_order_types_json || null,
            allowed_countries_json: payload.allowed_countries_json || null,
            max_redemptions: payload.max_redemptions || 1,
            redemptions_count: 0,
            status: 'DRAFT',
            expires_at: payload.expires_at || new Date(Date.now() + 30*24*60*60*1000).toISOString()
        };

        this._mockInvites.push(invite);
        await this.recordBetaInviteEvent({ event_type: 'INVITE_CREATED', invite_code_id: invite.id, actor });
        
        // We return the raw code ONLY ONCE upon creation.
        return { ...invite, raw_invite_code: rawCode };
    }

    async issueInviteCode({ inviteCodeId, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const invite = this._mockInvites.find(i => i.id === inviteCodeId);
        if (!invite) throw new Error('Invite not found');
        if (invite.status !== 'DRAFT') throw new Error('Invite must be DRAFT to issue');

        invite.status = 'ISSUED';
        await this.recordBetaInviteEvent({ event_type: 'INVITE_ISSUED', invite_code_id: invite.id, actor });
        return this._sanitizeInvite(invite);
    }

    async validateInviteCode({ inviteCode, email, actor }) {
        const hash = this.hashInviteCode(inviteCode);
        const invite = this._mockInvites.find(i => i.invite_hash === hash);

        if (!invite) throw new Error('Invalid invite code');
        if (invite.status === 'EXPIRED' || new Date(invite.expires_at) < new Date()) {
            invite.status = 'EXPIRED';
            await this.recordBetaInviteEvent({ event_type: 'INVITE_EXPIRED', invite_code_id: invite.id, actor });
            throw new Error('Invite code expired');
        }
        if (invite.status === 'REVOKED') throw new Error('Invite code revoked');
        if (invite.redemptions_count >= invite.max_redemptions) throw new Error('Invite code max redemptions reached');
        if (invite.customer_email && invite.customer_email !== email) {
            await this.recordBetaInviteEvent({ event_type: 'INVITE_REJECTED', invite_code_id: invite.id, actor, message: 'Email mismatch' });
            throw new Error('Invite code not valid for this email');
        }
        if (!['ISSUED', 'ACTIVE'].includes(invite.status)) throw new Error('Invite code not active');

        await this.recordBetaInviteEvent({ event_type: 'INVITE_VALIDATED', invite_code_id: invite.id, actor });
        return this._sanitizeInvite(invite);
    }

    async redeemInviteCode({ inviteCode, email, actor }) {
        // validate first
        const invite = await this.validateInviteCode({ inviteCode, email, actor });
        const realInvite = this._mockInvites.find(i => i.id === invite.id);

        realInvite.redemptions_count++;
        if (realInvite.redemptions_count >= realInvite.max_redemptions) {
            realInvite.status = 'REDEEMED';
        } else {
            realInvite.status = 'ACTIVE';
        }

        realInvite.redeemed_by_customer_id = actor.userId || null;
        realInvite.redeemed_at = new Date().toISOString();

        await this.recordBetaInviteEvent({ event_type: 'INVITE_REDEEMED', invite_code_id: realInvite.id, actor });
        return this._sanitizeInvite(realInvite);
    }

    async revokeInviteCode({ inviteCodeId, reason, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        const invite = this._mockInvites.find(i => i.id === inviteCodeId);
        if (!invite) throw new Error('Invite not found');

        invite.status = 'REVOKED';
        invite.revocation_reason = reason;
        await this.recordBetaInviteEvent({ event_type: 'INVITE_REVOKED', invite_code_id: invite.id, actor, metadata_json: { reason } });
        return this._sanitizeInvite(invite);
    }

    async expireInviteCodes({ actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN']);
        const now = new Date();
        let expiredCount = 0;
        for (const invite of this._mockInvites) {
            if (['DRAFT', 'ISSUED', 'ACTIVE'].includes(invite.status) && new Date(invite.expires_at) < now) {
                invite.status = 'EXPIRED';
                await this.recordBetaInviteEvent({ event_type: 'INVITE_EXPIRED', invite_code_id: invite.id, actor });
                expiredCount++;
            }
        }
        return { expired_count: expiredCount };
    }

    async getInviteCodeStatus({ inviteCode, actor }) {
        const hash = this.hashInviteCode(inviteCode);
        const invite = this._mockInvites.find(i => i.invite_hash === hash);
        if (!invite) throw new Error('Invalid invite code');
        return this._sanitizeInvite(invite);
    }

    async listInviteCodes(filters, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'OPS_ADMIN']);
        return this._mockInvites.map(i => this._sanitizeInvite(i));
    }

    async recordBetaInviteEvent(event) {
        this._mockEvents.push({ ...event, created_at: new Date().toISOString() });
    }

    _sanitizeInvite(invite) {
        const copy = { ...invite };
        delete copy._rawCodeForTests;
        return copy;
    }
}

module.exports = BetaInviteService;
