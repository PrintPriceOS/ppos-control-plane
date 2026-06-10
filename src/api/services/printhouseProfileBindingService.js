/**
 * src/api/services/printhouseProfileBindingService.js
 * 
 * Phase 76C — Service for binding printhouse profiles, creating immutable snapshots, 
 * and evaluating policy profile rules against job preflight governance state.
 */
'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const printhouseCapabilityService = require('./printhouseCapabilityService');

class PrinthouseProfileBindingService {
    
    hashSnapshot(snapshot) {
        if (!snapshot) return '';
        // Sort keys to produce stable hash
        const normalized = JSON.stringify(snapshot, Object.keys(snapshot).sort());
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }

    async emitBindingAuditEvent({ printhouseId, tenantId, eventType, actor, details }) {
        await db.query(`
            INSERT INTO printhouse_capability_audit 
            (printhouse_id, tenant_id, event_type, actor_user_id, actor_role, before_json, after_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            printhouseId,
            tenantId,
            eventType,
            actor?.userId || actor?.id || 'system',
            actor?.role || 'operator',
            null,
            details ? JSON.stringify(details) : null
        ]);
    }

    async bindPrinthouseProfileToOrder({
        orderId,
        tenantId,
        printhouseId,
        machineId,
        mediaId,
        policyProfileId,
        slaProfileId,
        actor
    }) {
        if (!orderId || !tenantId || !printhouseId) {
            throw new Error('MISSING_REQUIRED_PARAMS');
        }

        // 1. Fetch live configurations
        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) throw new Error('PRINTHOUSE_NOT_FOUND');

        // Tenant Isolation check
        if (printhouse.tenant_id !== tenantId) {
            await this.emitBindingAuditEvent({
                printhouseId,
                tenantId,
                eventType: 'PROFILE_BINDING_TENANT_VIOLATION_BLOCKED',
                actor,
                details: { orderId, reason: 'Printhouse tenant mismatch' }
            });
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }

        let machine = null;
        let media = null;
        let policyProfile = null;
        let slaProfile = null;

        if (machineId) {
            machine = await printhouseCapabilityService.getMachine(machineId);
            if (!machine) throw new Error('MACHINE_NOT_FOUND');
            if (machine.tenant_id !== tenantId || machine.printhouse_id !== printhouseId) {
                throw new Error('INVALID_RESOURCE_OWNERSHIP');
            }
        }

        if (mediaId) {
            media = await printhouseCapabilityService.getMedia(mediaId);
            if (!media) throw new Error('MEDIA_NOT_FOUND');
            if (media.tenant_id !== tenantId || media.printhouse_id !== printhouseId) {
                throw new Error('INVALID_RESOURCE_OWNERSHIP');
            }
        }

        if (policyProfileId) {
            policyProfile = await printhouseCapabilityService.getPolicyProfile(policyProfileId);
            if (!policyProfile) throw new Error('POLICY_PROFILE_NOT_FOUND');
            if (policyProfile.tenant_id !== tenantId || policyProfile.printhouse_id !== printhouseId) {
                throw new Error('INVALID_RESOURCE_OWNERSHIP');
            }
        }

        if (slaProfileId) {
            slaProfile = await printhouseCapabilityService.getSlaProfile(slaProfileId);
            if (!slaProfile) throw new Error('SLA_PROFILE_NOT_FOUND');
            if (slaProfile.tenant_id !== tenantId || slaProfile.printhouse_id !== printhouseId) {
                throw new Error('INVALID_RESOURCE_OWNERSHIP');
            }
        }

        // Determine binding status
        const isComplete = machine && media && policyProfile && slaProfile;
        const bindingStatus = isComplete ? 'BOUND' : 'DRAFT';

        // Supersede existing active BOUND or DRAFT bindings
        await db.query(`
            UPDATE marketplace_order_printhouse_bindings
            SET binding_status = 'SUPERSEDED'
            WHERE order_id = ? AND binding_status IN ('BOUND', 'DRAFT')
        `, [orderId]);

        // Generate binding ID
        const id = `bind_${crypto.randomBytes(16).toString('hex')}`;
        const boundAt = isComplete ? new Date() : null;

        const printhouse_snapshot_json = JSON.stringify(printhouse);
        const machine_snapshot_json = machine ? JSON.stringify(machine) : null;
        const media_snapshot_json = media ? JSON.stringify(media) : null;
        const policy_profile_snapshot_json = policyProfile ? JSON.stringify(policyProfile) : null;
        const sla_profile_snapshot_json = slaProfile ? JSON.stringify(slaProfile) : null;

        await db.query(`
            INSERT INTO marketplace_order_printhouse_bindings
            (id, order_id, tenant_id, printhouse_id, selected_machine_id, selected_media_id,
             selected_policy_profile_id, selected_sla_profile_id, printhouse_snapshot_json,
             machine_snapshot_json, media_snapshot_json, policy_profile_snapshot_json,
             sla_profile_snapshot_json, binding_status, bound_by_user_id, bound_by_role, bound_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, orderId, tenantId, printhouseId, machineId || null, mediaId || null,
            policyProfileId || null, slaProfileId || null, printhouse_snapshot_json,
            machine_snapshot_json, media_snapshot_json, policy_profile_snapshot_json,
            sla_profile_snapshot_json, bindingStatus, actor?.userId || actor?.id || 'system',
            actor?.role || 'operator', boundAt
        ]);

        const eventType = isComplete ? 'PRINTHOUSE_PROFILE_BOUND_TO_ORDER' : 'PRINTHOUSE_PROFILE_BINDING_DRAFT_CREATED';
        await this.emitBindingAuditEvent({
            printhouseId,
            tenantId,
            eventType,
            actor,
            details: { id, orderId, bindingStatus }
        });

        if (isComplete) {
            await this.emitBindingAuditEvent({
                printhouseId,
                tenantId,
                eventType: 'PRINTHOUSE_PROFILE_BINDING_COMPLETED',
                actor,
                details: { id, orderId }
            });
        }

        return {
            binding_id: id,
            order_id: orderId,
            binding_status: bindingStatus,
            printhouse_hash: this.hashSnapshot(printhouse),
            policy_profile_hash: policyProfile ? this.hashSnapshot(policyProfile) : '',
            machine_hash: machine ? this.hashSnapshot(machine) : '',
            media_hash: media ? this.hashSnapshot(media) : '',
            sla_hash: slaProfile ? this.hashSnapshot(slaProfile) : ''
        };
    }

    async getOrderPrinthouseBinding(orderId, tenantId) {
        const rows = await db.query(`
            SELECT * FROM marketplace_order_printhouse_bindings
            WHERE order_id = ? AND tenant_id = ? AND binding_status IN ('BOUND', 'DRAFT')
            ORDER BY created_at DESC
        `, [orderId, tenantId]);

        const binding = rows[0] || null;
        if (binding) {
            binding.printhouse_snapshot = JSON.parse(binding.printhouse_snapshot_json);
            binding.machine_snapshot = binding.machine_snapshot_json ? JSON.parse(binding.machine_snapshot_json) : null;
            binding.media_snapshot = binding.media_snapshot_json ? JSON.parse(binding.media_snapshot_json) : null;
            binding.policy_profile_snapshot = binding.policy_profile_snapshot_json ? JSON.parse(binding.policy_profile_snapshot_json) : null;
            binding.sla_profile_snapshot = binding.sla_profile_snapshot_json ? JSON.parse(binding.sla_profile_snapshot_json) : null;
        }
        return binding;
    }

    async evaluateBoundPolicyProfileForJob({
        orderId,
        jobId,
        tenantId,
        preflightGovernance,
        artifactTrust,
        proofApprovalGovernance,
        heavyPdfProbeGovernance,
        standardsCertificationGovernance
    }) {
        const binding = await this.getOrderPrinthouseBinding(orderId, tenantId);
        if (!binding) {
            throw new Error('BINDING_NOT_FOUND');
        }

        const policy = binding.policy_profile_snapshot;
        if (!policy) {
            throw new Error('POLICY_PROFILE_NOT_FOUND_IN_BINDING');
        }

        const blocking_reasons = [];
        const warnings = [];
        const matched_rules = [];
        const failed_rules = [];
        let requires_review = false;

        // Rule 1 — artifact_trust authority
        if (policy.require_artifact_trust_production_certified !== false) {
            matched_rules.push('require_artifact_trust_production_certified');
            if (!artifactTrust || artifactTrust.production_certified === false) {
                blocking_reasons.push('ARTIFACT_TRUST_NOT_PRODUCTION_CERTIFIED');
                failed_rules.push('require_artifact_trust_production_certified');
            }
        }

        // Rule 2 — standards
        if (policy.required_pdf_standard && policy.required_pdf_standard !== 'NONE') {
            matched_rules.push('required_pdf_standard');
            const stdGov = standardsCertificationGovernance || {};
            if (!stdGov.validation_performed || !stdGov.validation_passed || stdGov.standard_detected !== policy.required_pdf_standard) {
                blocking_reasons.push('REQUIRED_STANDARD_NOT_VALIDATED');
                failed_rules.push('required_pdf_standard');
            }
        }

        // Rule 3 — degraded analysis
        if (policy.allow_degraded_analysis === false) {
            matched_rules.push('allow_degraded_analysis');
            const probeGov = heavyPdfProbeGovernance || {};
            if (probeGov.analysis_degraded === true || probeGov.heavy_pdf_detected === true) {
                blocking_reasons.push('DEGRADED_ANALYSIS_NOT_ALLOWED_BY_PROFILE');
                failed_rules.push('allow_degraded_analysis');
            }
        }

        // Rule 4 — visual proof
        if (policy.require_visual_proof_approval) {
            matched_rules.push('require_visual_proof_approval');
            const proofGov = proofApprovalGovernance || {};
            if (proofGov.proof_status !== 'APPROVED') {
                blocking_reasons.push('VISUAL_PROOF_APPROVAL_REQUIRED');
                failed_rules.push('require_visual_proof_approval');
            }
        }

        // Rule 5 — page marks / ink / font / transparency human review checks
        const preGov = preflightGovernance || {};
        if (policy.require_human_review_for_page_marks && preGov.page_marks_review_required) {
            requires_review = true;
            matched_rules.push('require_human_review_for_page_marks');
        }
        if (policy.require_human_review_for_ink_changes && preGov.ink_review_required) {
            requires_review = true;
            matched_rules.push('require_human_review_for_ink_changes');
        }
        if (policy.require_human_review_for_font_changes && preGov.font_review_required) {
            requires_review = true;
            matched_rules.push('require_human_review_for_font_changes');
        }
        if (policy.require_human_review_for_transparency && preGov.transparency_review_required) {
            requires_review = true;
            matched_rules.push('require_human_review_for_transparency');
        }

        // Rule 6 — unsafe / interactive PDF features
        if (policy.allow_annotations === false && preGov.annotations_detected) {
            blocking_reasons.push('ANNOTATIONS_NOT_ALLOWED_BY_PROFILE');
            failed_rules.push('allow_annotations');
        }
        if (policy.allow_forms === false && preGov.forms_detected) {
            blocking_reasons.push('FORMS_NOT_ALLOWED_BY_PROFILE');
            failed_rules.push('allow_forms');
        }
        if (policy.allow_javascript === false && preGov.javascript_detected) {
            blocking_reasons.push('JAVASCRIPT_NOT_ALLOWED_BY_PROFILE');
            failed_rules.push('allow_javascript');
        }
        if (policy.allow_embedded_files === false && preGov.embedded_files_detected) {
            blocking_reasons.push('EMBEDDED_FILES_NOT_ALLOWED_BY_PROFILE');
            failed_rules.push('allow_embedded_files');
        }

        // Rule 7 — output intent
        if (policy.required_output_intent && preGov.output_intent !== policy.required_output_intent) {
            blocking_reasons.push('OUTPUT_INTENT_MISMATCH');
            failed_rules.push('required_output_intent');
        }

        const profile_passed = blocking_reasons.length === 0;

        return {
            profile_passed,
            policy_profile_id: policy.id,
            policy_profile_name: policy.profile_name,
            blocking_reasons,
            warnings,
            matched_rules,
            failed_rules,
            requires_review,
            profile_snapshot_hash: this.hashSnapshot(policy),
            evaluated_at: new Date().toISOString()
        };
    }

    async attachPolicyProfileGovernanceToJob({
        orderId,
        jobId,
        tenantId,
        evaluation
    }) {
        // Mock payload attachment to preflight_job_registry or similar JSON column
        // We will execute DB update queries for the job registry record
        await db.query(`
            UPDATE preflight_job_registry
            SET canonical_payload_json = JSON_SET(
                COALESCE(canonical_payload_json, '{}'),
                '$.job.policy_profile_governance',
                JSON_OBJECT(
                    'profile_passed', ?,
                    'policy_profile_id', ?,
                    'policy_profile_name', ?,
                    'blocking_reasons', ?,
                    'warnings', ?,
                    'profile_snapshot_hash', ?,
                    'evaluated_at', ?
                )
            )
            WHERE id = ? OR job_id = ?
        `, [
            evaluation.profile_passed,
            evaluation.policy_profile_id,
            evaluation.policy_profile_name,
            JSON.stringify(evaluation.blocking_reasons),
            JSON.stringify(evaluation.warnings),
            evaluation.profile_snapshot_hash,
            evaluation.evaluated_at,
            jobId, jobId
        ]);

        const binding = await this.getOrderPrinthouseBinding(orderId, tenantId);
        if (binding) {
            const auditEvent = evaluation.profile_passed ? 'POLICY_PROFILE_PASSED' : 'POLICY_PROFILE_FAILED';
            await this.emitBindingAuditEvent({
                printhouseId: binding.printhouse_id,
                tenantId,
                eventType: auditEvent,
                actor: { id: 'system', role: 'system' },
                details: { orderId, jobId, policyProfileId: evaluation.policy_profile_id }
            });
        }

        // Emit evaluation audit log
        if (binding) {
            await this.emitBindingAuditEvent({
                printhouseId: binding.printhouse_id,
                tenantId,
                eventType: 'POLICY_PROFILE_EVALUATED_FOR_JOB',
                actor: { id: 'system', role: 'system' },
                details: { orderId, jobId, evaluation }
            });
        }
    }
}

module.exports = new PrinthouseProfileBindingService();
