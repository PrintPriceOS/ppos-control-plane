// src/api/services/printhouseCapabilityService.js
'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

function safeParseJson(str, fallback = {}) {
    if (!str) return fallback;
    if (typeof str !== 'string') return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

class PrinthouseCapabilityService {
    // Generate standard UUID-like IDs
    generateId(prefix) {
        return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
    }

    async auditCapabilityChange({ printhouseId, tenantId, eventType, actor, before, after }) {
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
            before ? JSON.stringify(before) : null,
            after ? JSON.stringify(after) : null
        ]);
    }

    // --- Printhouse ---

    async createPrinthouse(payload, actor) {
        const tenantId = actor?.tenantId || 'system';
        const id = this.generateId('print');
        
        await db.query(`
            INSERT INTO printhouses 
            (id, tenant_id, name, legal_name, country, region, city, contact_email, contact_phone, status, onboarding_status, default_currency, timezone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            tenantId,
            payload.name,
            payload.legal_name || null,
            payload.country || null,
            payload.region || null,
            payload.city || null,
            payload.contact_email || null,
            payload.contact_phone || null,
            payload.status || 'DRAFT',
            payload.onboarding_status || 'NOT_STARTED',
            payload.default_currency || 'EUR',
            payload.timezone || 'Europe/Madrid'
        ]);

        const created = await this.getPrinthouse(id);
        await this.auditCapabilityChange({
            printhouseId: id,
            tenantId,
            eventType: 'PRINTHOUSE_CREATED',
            actor,
            before: null,
            after: created
        });

        return created;
    }

    async updatePrinthouse(printhouseId, payload, actor) {
        const tenantId = actor?.tenantId || 'system';
        const before = await this.getPrinthouse(printhouseId);
        if (!before) throw new Error('PRINTHOUSE_NOT_FOUND');
        if (before.tenant_id !== tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');

        await db.query(`
            UPDATE printhouses
            SET name = COALESCE(?, name),
                legal_name = COALESCE(?, legal_name),
                country = COALESCE(?, country),
                region = COALESCE(?, region),
                city = COALESCE(?, city),
                contact_email = COALESCE(?, contact_email),
                contact_phone = COALESCE(?, contact_phone),
                status = COALESCE(?, status),
                onboarding_status = COALESCE(?, onboarding_status),
                default_currency = COALESCE(?, default_currency),
                timezone = COALESCE(?, timezone)
            WHERE id = ? AND tenant_id = ?
        `, [
            payload.name || null,
            payload.legal_name || null,
            payload.country || null,
            payload.region || null,
            payload.city || null,
            payload.contact_email || null,
            payload.contact_phone || null,
            payload.status || null,
            payload.onboarding_status || null,
            payload.default_currency || null,
            payload.timezone || null,
            printhouseId,
            tenantId
        ]);

        const after = await this.getPrinthouse(printhouseId);
        await this.auditCapabilityChange({
            printhouseId,
            tenantId,
            eventType: 'PRINTHOUSE_UPDATED',
            actor,
            before,
            after
        });

        return after;
    }

    async getPrinthouse(printhouseId) {
        const rows = await db.query('SELECT * FROM printhouses WHERE id = ?', [printhouseId]);
        return rows[0] || null;
    }

    async listPrinthouses(filters = {}) {
        let sql = 'SELECT * FROM printhouses WHERE 1=1';
        const params = [];
        if (filters.tenantId) {
            sql += ' AND tenant_id = ?';
            params.push(filters.tenantId);
        }
        if (filters.status) {
            sql += ' AND status = ?';
            params.push(filters.status);
        }
        return await db.query(sql, params);
    }

    // --- Machines ---

    validateMachinePayload(payload) {
        if (payload.max_sheet_width_mm !== undefined && payload.min_sheet_width_mm !== undefined) {
            if (payload.max_sheet_width_mm <= payload.min_sheet_width_mm) {
                throw new Error('INVALID_DIMENSIONS: max_sheet_width_mm must be greater than min_sheet_width_mm');
            }
        }
        if (payload.max_sheet_height_mm !== undefined && payload.min_sheet_height_mm !== undefined) {
            if (payload.max_sheet_height_mm <= payload.min_sheet_height_mm) {
                throw new Error('INVALID_DIMENSIONS: max_sheet_height_mm must be greater than min_sheet_height_mm');
            }
        }
        if (payload.max_print_width_mm !== undefined && payload.max_sheet_width_mm !== undefined) {
            if (payload.max_print_width_mm > payload.max_sheet_width_mm) {
                throw new Error('INVALID_DIMENSIONS: max_print_width_mm cannot exceed max_sheet_width_mm');
            }
        }
        if (payload.max_print_height_mm !== undefined && payload.max_sheet_height_mm !== undefined) {
            if (payload.max_print_height_mm > payload.max_sheet_height_mm) {
                throw new Error('INVALID_DIMENSIONS: max_print_height_mm cannot exceed max_sheet_height_mm');
            }
        }
        if (payload.max_tac_percent !== undefined) {
            if (payload.max_tac_percent < 100 || payload.max_tac_percent > 400) {
                throw new Error('INVALID_TAC: max_tac_percent must be between 100 and 400');
            }
        }
        if (payload.max_pages_per_job !== undefined && payload.max_pages_per_job < 0) {
            throw new Error('INVALID_PAGES: max_pages_per_job must be >= 0');
        }
        if (payload.max_file_size_mb !== undefined && payload.max_file_size_mb < 0) {
            throw new Error('INVALID_FILE_SIZE: max_file_size_mb must be >= 0');
        }
    }

    async createMachine(printhouseId, payload, actor) {
        const tenantId = actor?.tenantId || 'system';
        const p = await this.getPrinthouse(printhouseId);
        if (!p) throw new Error('PRINTHOUSE_NOT_FOUND');
        if (p.tenant_id !== tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');

        this.validateMachinePayload(payload);

        const id = this.generateId('mach');
        await db.query(`
            INSERT INTO printhouse_machines
            (id, printhouse_id, tenant_id, machine_name, machine_type, manufacturer, model, status,
             max_sheet_width_mm, max_sheet_height_mm, min_sheet_width_mm, min_sheet_height_mm,
             max_print_width_mm, max_print_height_mm, supported_color_modes_json, supported_print_methods_json,
             supported_sides_json, max_pages_per_job, max_file_size_mb, max_tac_percent, supports_pdfx, supports_pdfa,
             supports_variable_data, supports_white_ink, supports_spot_uv, supports_lamination, supports_hardcover,
             supports_softcover, supports_saddle_stitch, supports_perfect_binding, supports_case_binding, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, printhouseId, tenantId, payload.machine_name, payload.machine_type, payload.manufacturer || null,
            payload.model || null, payload.status || 'ACTIVE',
            payload.max_sheet_width_mm || null, payload.max_sheet_height_mm || null,
            payload.min_sheet_width_mm || null, payload.min_sheet_height_mm || null,
            payload.max_print_width_mm || null, payload.max_print_height_mm || null,
            payload.supported_color_modes_json ? JSON.stringify(payload.supported_color_modes_json) : null,
            payload.supported_print_methods_json ? JSON.stringify(payload.supported_print_methods_json) : null,
            payload.supported_sides_json ? JSON.stringify(payload.supported_sides_json) : null,
            payload.max_pages_per_job || null, payload.max_file_size_mb || null, payload.max_tac_percent || null,
            !!payload.supports_pdfx, !!payload.supports_pdfa, !!payload.supports_variable_data, !!payload.supports_white_ink,
            !!payload.supports_spot_uv, !!payload.supports_lamination, !!payload.supports_hardcover, !!payload.supports_softcover,
            !!payload.supports_saddle_stitch, !!payload.supports_perfect_binding, !!payload.supports_case_binding,
            payload.metadata_json ? JSON.stringify(payload.metadata_json) : null
        ]);

        const created = await this.getMachine(id);
        await this.auditCapabilityChange({
            printhouseId,
            tenantId,
            eventType: 'MACHINE_CREATED',
            actor,
            before: null,
            after: created
        });

        await this.evaluatePrinthouseOnboardingReadiness(printhouseId);
        return created;
    }

    async getMachine(machineId) {
        const rows = await db.query('SELECT * FROM printhouse_machines WHERE id = ?', [machineId]);
        if (rows[0]) {
            rows[0].supported_color_modes_json = safeParseJson(rows[0].supported_color_modes_json, []);
            rows[0].supported_print_methods_json = safeParseJson(rows[0].supported_print_methods_json, []);
            rows[0].supported_sides_json = safeParseJson(rows[0].supported_sides_json, []);
            rows[0].metadata_json = safeParseJson(rows[0].metadata_json, {});
        }
        return rows[0] || null;
    }

    async updateMachine(machineId, payload, actor) {
        const tenantId = actor?.tenantId || 'system';
        const before = await this.getMachine(machineId);
        if (!before) throw new Error('MACHINE_NOT_FOUND');
        if (before.tenant_id !== tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');

        const merged = { ...before, ...payload };
        this.validateMachinePayload(merged);

        await db.query(`
            UPDATE printhouse_machines
            SET machine_name = COALESCE(?, machine_name),
                machine_type = COALESCE(?, machine_type),
                manufacturer = COALESCE(?, manufacturer),
                model = COALESCE(?, model),
                status = COALESCE(?, status),
                max_sheet_width_mm = COALESCE(?, max_sheet_width_mm),
                max_sheet_height_mm = COALESCE(?, max_sheet_height_mm),
                min_sheet_width_mm = COALESCE(?, min_sheet_width_mm),
                min_sheet_height_mm = COALESCE(?, min_sheet_height_mm),
                max_print_width_mm = COALESCE(?, max_print_width_mm),
                max_print_height_mm = COALESCE(?, max_print_height_mm),
                supported_color_modes_json = COALESCE(?, supported_color_modes_json),
                supported_print_methods_json = COALESCE(?, supported_print_methods_json),
                supported_sides_json = COALESCE(?, supported_sides_json),
                max_pages_per_job = COALESCE(?, max_pages_per_job),
                max_file_size_mb = COALESCE(?, max_file_size_mb),
                max_tac_percent = COALESCE(?, max_tac_percent),
                supports_pdfx = COALESCE(?, supports_pdfx),
                supports_pdfa = COALESCE(?, supports_pdfa),
                supports_variable_data = COALESCE(?, supports_variable_data),
                supports_white_ink = COALESCE(?, supports_white_ink),
                supports_spot_uv = COALESCE(?, supports_spot_uv),
                supports_lamination = COALESCE(?, supports_lamination),
                supports_hardcover = COALESCE(?, supports_hardcover),
                supports_softcover = COALESCE(?, supports_softcover),
                supports_saddle_stitch = COALESCE(?, supports_saddle_stitch),
                supports_perfect_binding = COALESCE(?, supports_perfect_binding),
                supports_case_binding = COALESCE(?, supports_case_binding),
                metadata_json = COALESCE(?, metadata_json)
            WHERE id = ? AND tenant_id = ?
        `, [
            payload.machine_name || null,
            payload.machine_type || null,
            payload.manufacturer || null,
            payload.model || null,
            payload.status || null,
            payload.max_sheet_width_mm || null,
            payload.max_sheet_height_mm || null,
            payload.min_sheet_width_mm || null,
            payload.min_sheet_height_mm || null,
            payload.max_print_width_mm || null,
            payload.max_print_height_mm || null,
            payload.supported_color_modes_json ? JSON.stringify(payload.supported_color_modes_json) : null,
            payload.supported_print_methods_json ? JSON.stringify(payload.supported_print_methods_json) : null,
            payload.supported_sides_json ? JSON.stringify(payload.supported_sides_json) : null,
            payload.max_pages_per_job || null,
            payload.max_file_size_mb || null,
            payload.max_tac_percent || null,
            payload.supports_pdfx !== undefined ? !!payload.supports_pdfx : null,
            payload.supports_pdfa !== undefined ? !!payload.supports_pdfa : null,
            payload.supports_variable_data !== undefined ? !!payload.supports_variable_data : null,
            payload.supports_white_ink !== undefined ? !!payload.supports_white_ink : null,
            payload.supports_spot_uv !== undefined ? !!payload.supports_spot_uv : null,
            payload.supports_lamination !== undefined ? !!payload.supports_lamination : null,
            payload.supports_hardcover !== undefined ? !!payload.supports_hardcover : null,
            payload.supports_softcover !== undefined ? !!payload.supports_softcover : null,
            payload.supports_saddle_stitch !== undefined ? !!payload.supports_saddle_stitch : null,
            payload.supports_perfect_binding !== undefined ? !!payload.supports_perfect_binding : null,
            payload.supports_case_binding !== undefined ? !!payload.supports_case_binding : null,
            payload.metadata_json ? JSON.stringify(payload.metadata_json) : null,
            machineId,
            tenantId
        ]);

        const after = await this.getMachine(machineId);
        await this.auditCapabilityChange({
            printhouseId: before.printhouse_id,
            tenantId,
            eventType: 'MACHINE_UPDATED',
            actor,
            before,
            after
        });

        await this.evaluatePrinthouseOnboardingReadiness(before.printhouse_id);
        return after;
    }

    async listMachines(printhouseId) {
        const rows = await db.query('SELECT * FROM printhouse_machines WHERE printhouse_id = ?', [printhouseId]);
        rows.forEach(r => {
            r.supported_color_modes_json = safeParseJson(r.supported_color_modes_json, []);
            r.supported_print_methods_json = safeParseJson(r.supported_print_methods_json, []);
            r.supported_sides_json = safeParseJson(r.supported_sides_json, []);
            r.metadata_json = safeParseJson(r.metadata_json, {});
        });
        return rows;
    }

    // --- Media ---

    validateMediaPayload(payload) {
        if (payload.gsm !== undefined && payload.gsm <= 0) {
            throw new Error('INVALID_GSM: gsm must be greater than 0');
        }
        if (payload.thickness_microns !== undefined && payload.thickness_microns < 0) {
            throw new Error('INVALID_THICKNESS: thickness_microns must be >= 0');
        }
    }

    async createMedia(printhouseId, payload, actor) {
        const tenantId = actor?.tenantId || 'system';
        const p = await this.getPrinthouse(printhouseId);
        if (!p) throw new Error('PRINTHOUSE_NOT_FOUND');
        if (p.tenant_id !== tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');

        this.validateMediaPayload(payload);

        const id = this.generateId('med');
        await db.query(`
            INSERT INTO printhouse_media
            (id, printhouse_id, tenant_id, media_name, media_type, gsm, thickness_microns, finish, color,
             sheet_width_mm, sheet_height_mm, roll_width_mm, grain_direction, fsc_available, pefc_available,
             recycled_content_percent, status, compatible_machine_ids_json, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, printhouseId, tenantId, payload.media_name, payload.media_type, payload.gsm || null,
            payload.thickness_microns || null, payload.finish || null, payload.color || null,
            payload.sheet_width_mm || null, payload.sheet_height_mm || null, payload.roll_width_mm || null,
            payload.grain_direction || null, !!payload.fsc_available, !!payload.pefc_available,
            payload.recycled_content_percent || 0, payload.status || 'ACTIVE',
            payload.compatible_machine_ids_json ? JSON.stringify(payload.compatible_machine_ids_json) : null,
            payload.metadata_json ? JSON.stringify(payload.metadata_json) : null
        ]);

        const created = await this.getMedia(id);
        await this.auditCapabilityChange({
            printhouseId,
            tenantId,
            eventType: 'MEDIA_CREATED',
            actor,
            before: null,
            after: created
        });

        await this.evaluatePrinthouseOnboardingReadiness(printhouseId);
        return created;
    }

    async getMedia(mediaId) {
        const rows = await db.query('SELECT * FROM printhouse_media WHERE id = ?', [mediaId]);
        if (rows[0]) {
            rows[0].compatible_machine_ids_json = safeParseJson(rows[0].compatible_machine_ids_json, []);
            rows[0].metadata_json = safeParseJson(rows[0].metadata_json, {});
        }
        return rows[0] || null;
    }

    async updateMedia(mediaId, payload, actor) {
        const tenantId = actor?.tenantId || 'system';
        const before = await this.getMedia(mediaId);
        if (!before) throw new Error('MEDIA_NOT_FOUND');
        if (before.tenant_id !== tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');

        const merged = { ...before, ...payload };
        this.validateMediaPayload(merged);

        await db.query(`
            UPDATE printhouse_media
            SET media_name = COALESCE(?, media_name),
                media_type = COALESCE(?, media_type),
                gsm = COALESCE(?, gsm),
                thickness_microns = COALESCE(?, thickness_microns),
                finish = COALESCE(?, finish),
                color = COALESCE(?, color),
                sheet_width_mm = COALESCE(?, sheet_width_mm),
                sheet_height_mm = COALESCE(?, sheet_height_mm),
                roll_width_mm = COALESCE(?, roll_width_mm),
                grain_direction = COALESCE(?, grain_direction),
                fsc_available = COALESCE(?, fsc_available),
                pefc_available = COALESCE(?, pefc_available),
                recycled_content_percent = COALESCE(?, recycled_content_percent),
                status = COALESCE(?, status),
                compatible_machine_ids_json = COALESCE(?, compatible_machine_ids_json),
                metadata_json = COALESCE(?, metadata_json)
            WHERE id = ? AND tenant_id = ?
        `, [
            payload.media_name || null,
            payload.media_type || null,
            payload.gsm || null,
            payload.thickness_microns || null,
            payload.finish || null,
            payload.color || null,
            payload.sheet_width_mm || null,
            payload.sheet_height_mm || null,
            payload.roll_width_mm || null,
            payload.grain_direction || null,
            payload.fsc_available !== undefined ? !!payload.fsc_available : null,
            payload.pefc_available !== undefined ? !!payload.pefc_available : null,
            payload.recycled_content_percent !== undefined ? payload.recycled_content_percent : null,
            payload.status || null,
            payload.compatible_machine_ids_json ? JSON.stringify(payload.compatible_machine_ids_json) : null,
            payload.metadata_json ? JSON.stringify(payload.metadata_json) : null,
            mediaId,
            tenantId
        ]);

        const after = await this.getMedia(mediaId);
        await this.auditCapabilityChange({
            printhouseId: before.printhouse_id,
            tenantId,
            eventType: 'MEDIA_UPDATED',
            actor,
            before,
            after
        });

        await this.evaluatePrinthouseOnboardingReadiness(before.printhouse_id);
        return after;
    }

    async listMedia(printhouseId) {
        const rows = await db.query('SELECT * FROM printhouse_media WHERE printhouse_id = ?', [printhouseId]);
        rows.forEach(r => {
            r.compatible_machine_ids_json = safeParseJson(r.compatible_machine_ids_json, []);
            r.metadata_json = safeParseJson(r.metadata_json, {});
        });
        return rows;
    }

    // --- Policy Profiles ---

    validatePolicyProfilePayload(payload) {
        if (payload.max_tac_percent !== undefined) {
            if (payload.max_tac_percent < 100 || payload.max_tac_percent > 400) {
                throw new Error('INVALID_TAC: max_tac_percent must be between 100 and 400');
            }
        }
        if (payload.min_bleed_mm !== undefined && payload.min_bleed_mm < 0) {
            throw new Error('INVALID_BLEED: min_bleed_mm must be >= 0');
        }
        // Validate required policy profile fields
        if (payload.profile_name === undefined || payload.profile_name === '') {
            throw new Error('MISSING_FIELDS: profile_name is required');
        }
        if (payload.profile_type === undefined || payload.profile_type === '') {
            throw new Error('MISSING_FIELDS: profile_type is required');
        }
    }

    async createPolicyProfile(printhouseId, payload, actor) {
        const tenantId = actor?.tenantId || 'system';
        const p = await this.getPrinthouse(printhouseId);
        if (!p) throw new Error('PRINTHOUSE_NOT_FOUND');
        if (p.tenant_id !== tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');

        this.validatePolicyProfilePayload(payload);

        const id = this.generateId('pol');
        await db.query(`
            INSERT INTO printhouse_policy_profiles
            (id, printhouse_id, tenant_id, profile_name, profile_type, required_pdf_standard, allow_degraded_analysis,
             require_artifact_trust_production_certified, require_visual_proof_approval, require_human_review_for_page_marks,
             require_human_review_for_ink_changes, require_human_review_for_font_changes, require_human_review_for_transparency,
             max_tac_percent, min_bleed_mm, allow_rgb, allow_spot_colors, allow_transparency, allow_overprint,
             allow_annotations, allow_forms, allow_javascript, allow_embedded_files, required_output_intent,
             accepted_trim_box_policy, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, printhouseId, tenantId, payload.profile_name, payload.profile_type, payload.required_pdf_standard || 'NONE',
            payload.allow_degraded_analysis !== false, payload.require_artifact_trust_production_certified !== false,
            payload.require_visual_proof_approval !== false, payload.require_human_review_for_page_marks !== false,
            payload.require_human_review_for_ink_changes !== false, payload.require_human_review_for_font_changes !== false,
            payload.require_human_review_for_transparency !== false, payload.max_tac_percent || null, payload.min_bleed_mm || null,
            !!payload.allow_rgb, !!payload.allow_spot_colors, !!payload.allow_transparency, !!payload.allow_overprint,
            !!payload.allow_annotations, !!payload.allow_forms, !!payload.allow_javascript, !!payload.allow_embedded_files,
            payload.required_output_intent || null, payload.accepted_trim_box_policy || null,
            payload.metadata_json ? JSON.stringify(payload.metadata_json) : null
        ]);

        const created = await this.getPolicyProfile(id);
        await this.auditCapabilityChange({
            printhouseId,
            tenantId,
            eventType: 'POLICY_PROFILE_CREATED',
            actor,
            before: null,
            after: created
        });

        await this.evaluatePrinthouseOnboardingReadiness(printhouseId);
        return created;
    }

    async getPolicyProfile(profileId) {
        const rows = await db.query('SELECT * FROM printhouse_policy_profiles WHERE id = ?', [profileId]);
        if (rows[0]) {
            rows[0].metadata_json = safeParseJson(rows[0].metadata_json, {});
        }
        return rows[0] || null;
    }

    async updatePolicyProfile(profileId, payload, actor) {
        const tenantId = actor?.tenantId || 'system';
        const before = await this.getPolicyProfile(profileId);
        if (!before) throw new Error('POLICY_PROFILE_NOT_FOUND');
        if (before.tenant_id !== tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');

        const merged = { ...before, ...payload };
        this.validatePolicyProfilePayload(merged);

        await db.query(`
            UPDATE printhouse_policy_profiles
            SET profile_name = COALESCE(?, profile_name),
                profile_type = COALESCE(?, profile_type),
                required_pdf_standard = COALESCE(?, required_pdf_standard),
                allow_degraded_analysis = COALESCE(?, allow_degraded_analysis),
                require_artifact_trust_production_certified = COALESCE(?, require_artifact_trust_production_certified),
                require_visual_proof_approval = COALESCE(?, require_visual_proof_approval),
                require_human_review_for_page_marks = COALESCE(?, require_human_review_for_page_marks),
                require_human_review_for_ink_changes = COALESCE(?, require_human_review_for_ink_changes),
                require_human_review_for_font_changes = COALESCE(?, require_human_review_for_font_changes),
                require_human_review_for_transparency = COALESCE(?, require_human_review_for_transparency),
                max_tac_percent = COALESCE(?, max_tac_percent),
                min_bleed_mm = COALESCE(?, min_bleed_mm),
                allow_rgb = COALESCE(?, allow_rgb),
                allow_spot_colors = COALESCE(?, allow_spot_colors),
                allow_transparency = COALESCE(?, allow_transparency),
                allow_overprint = COALESCE(?, allow_overprint),
                allow_annotations = COALESCE(?, allow_annotations),
                allow_forms = COALESCE(?, allow_forms),
                allow_javascript = COALESCE(?, allow_javascript),
                allow_embedded_files = COALESCE(?, allow_embedded_files),
                required_output_intent = COALESCE(?, required_output_intent),
                accepted_trim_box_policy = COALESCE(?, accepted_trim_box_policy),
                metadata_json = COALESCE(?, metadata_json)
            WHERE id = ? AND tenant_id = ?
        `, [
            payload.profile_name || null,
            payload.profile_type || null,
            payload.required_pdf_standard || null,
            payload.allow_degraded_analysis !== undefined ? !!payload.allow_degraded_analysis : null,
            payload.require_artifact_trust_production_certified !== undefined ? !!payload.require_artifact_trust_production_certified : null,
            payload.require_visual_proof_approval !== undefined ? !!payload.require_visual_proof_approval : null,
            payload.require_human_review_for_page_marks !== undefined ? !!payload.require_human_review_for_page_marks : null,
            payload.require_human_review_for_ink_changes !== undefined ? !!payload.require_human_review_for_ink_changes : null,
            payload.require_human_review_for_font_changes !== undefined ? !!payload.require_human_review_for_font_changes : null,
            payload.require_human_review_for_transparency !== undefined ? !!payload.require_human_review_for_transparency : null,
            payload.max_tac_percent || null,
            payload.min_bleed_mm || null,
            payload.allow_rgb !== undefined ? !!payload.allow_rgb : null,
            payload.allow_spot_colors !== undefined ? !!payload.allow_spot_colors : null,
            payload.allow_transparency !== undefined ? !!payload.allow_transparency : null,
            payload.allow_overprint !== undefined ? !!payload.allow_overprint : null,
            payload.allow_annotations !== undefined ? !!payload.allow_annotations : null,
            payload.allow_forms !== undefined ? !!payload.allow_forms : null,
            payload.allow_javascript !== undefined ? !!payload.allow_javascript : null,
            payload.allow_embedded_files !== undefined ? !!payload.allow_embedded_files : null,
            payload.required_output_intent || null,
            payload.accepted_trim_box_policy || null,
            payload.metadata_json ? JSON.stringify(payload.metadata_json) : null,
            profileId,
            tenantId
        ]);

        const after = await this.getPolicyProfile(profileId);
        await this.auditCapabilityChange({
            printhouseId: before.printhouse_id,
            tenantId,
            eventType: 'POLICY_PROFILE_UPDATED',
            actor,
            before,
            after
        });

        await this.evaluatePrinthouseOnboardingReadiness(before.printhouse_id);
        return after;
    }

    async listPolicyProfiles(printhouseId) {
        const rows = await db.query('SELECT * FROM printhouse_policy_profiles WHERE printhouse_id = ?', [printhouseId]);
        rows.forEach(r => {
            r.metadata_json = safeParseJson(r.metadata_json, {});
        });
        return rows;
    }

    // --- SLA Profiles ---

    validateSlaProfilePayload(payload) {
        if (payload.production_days_min !== undefined && payload.production_days_max !== undefined) {
            if (payload.production_days_min > payload.production_days_max) {
                throw new Error('INVALID_SLA: production_days_min cannot exceed production_days_max');
            }
        }
        if (payload.max_daily_jobs !== undefined && payload.max_daily_jobs < 0) {
            throw new Error('INVALID_SLA: max_daily_jobs must be >= 0');
        }
        if (payload.max_daily_pages !== undefined && payload.max_daily_pages < 0) {
            throw new Error('INVALID_SLA: max_daily_pages must be >= 0');
        }
    }

    async createSlaProfile(printhouseId, payload, actor) {
        const tenantId = actor?.tenantId || 'system';
        const p = await this.getPrinthouse(printhouseId);
        if (!p) throw new Error('PRINTHOUSE_NOT_FOUND');
        if (p.tenant_id !== tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');

        this.validateSlaProfilePayload(payload);

        const id = this.generateId('sla');
        await db.query(`
            INSERT INTO printhouse_sla_profiles
            (id, printhouse_id, tenant_id, profile_name, production_days_min, production_days_max,
             cutoff_time_local, weekend_production, holiday_calendar_region, rush_available,
             rush_surcharge_percent, max_daily_jobs, max_daily_pages, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, printhouseId, tenantId, payload.profile_name, payload.production_days_min || null,
            payload.production_days_max || null, payload.cutoff_time_local || null,
            !!payload.weekend_production, payload.holiday_calendar_region || null,
            !!payload.rush_available, payload.rush_surcharge_percent || 0,
            payload.max_daily_jobs || null, payload.max_daily_pages || null,
            payload.metadata_json ? JSON.stringify(payload.metadata_json) : null
        ]);

        const created = await this.getSlaProfile(id);
        await this.auditCapabilityChange({
            printhouseId,
            tenantId,
            eventType: 'SLA_PROFILE_CREATED',
            actor,
            before: null,
            after: created
        });

        await this.evaluatePrinthouseOnboardingReadiness(printhouseId);
        return created;
    }

    async getSlaProfile(slaProfileId) {
        const rows = await db.query('SELECT * FROM printhouse_sla_profiles WHERE id = ?', [slaProfileId]);
        if (rows[0]) {
            rows[0].metadata_json = safeParseJson(rows[0].metadata_json, {});
        }
        return rows[0] || null;
    }

    async updateSlaProfile(slaProfileId, payload, actor) {
        const tenantId = actor?.tenantId || 'system';
        const before = await this.getSlaProfile(slaProfileId);
        if (!before) throw new Error('SLA_PROFILE_NOT_FOUND');
        if (before.tenant_id !== tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');

        const merged = { ...before, ...payload };
        this.validateSlaProfilePayload(merged);

        await db.query(`
            UPDATE printhouse_sla_profiles
            SET profile_name = COALESCE(?, profile_name),
                production_days_min = COALESCE(?, production_days_min),
                production_days_max = COALESCE(?, production_days_max),
                cutoff_time_local = COALESCE(?, cutoff_time_local),
                weekend_production = COALESCE(?, weekend_production),
                holiday_calendar_region = COALESCE(?, holiday_calendar_region),
                rush_available = COALESCE(?, rush_available),
                rush_surcharge_percent = COALESCE(?, rush_surcharge_percent),
                max_daily_jobs = COALESCE(?, max_daily_jobs),
                max_daily_pages = COALESCE(?, max_daily_pages),
                metadata_json = COALESCE(?, metadata_json)
            WHERE id = ? AND tenant_id = ?
        `, [
            payload.profile_name || null,
            payload.production_days_min || null,
            payload.production_days_max || null,
            payload.cutoff_time_local || null,
            payload.weekend_production !== undefined ? !!payload.weekend_production : null,
            payload.holiday_calendar_region || null,
            payload.rush_available !== undefined ? !!payload.rush_available : null,
            payload.rush_surcharge_percent !== undefined ? payload.rush_surcharge_percent : null,
            payload.max_daily_jobs || null,
            payload.max_daily_pages || null,
            payload.metadata_json ? JSON.stringify(payload.metadata_json) : null,
            slaProfileId,
            tenantId
        ]);

        const after = await this.getSlaProfile(slaProfileId);
        await this.auditCapabilityChange({
            printhouseId: before.printhouse_id,
            tenantId,
            eventType: 'SLA_PROFILE_UPDATED',
            actor,
            before,
            after
        });

        await this.evaluatePrinthouseOnboardingReadiness(before.printhouse_id);
        return after;
    }

    async listSlaProfiles(printhouseId) {
        const rows = await db.query('SELECT * FROM printhouse_sla_profiles WHERE printhouse_id = ?', [printhouseId]);
        rows.forEach(r => {
            r.metadata_json = safeParseJson(r.metadata_json, {});
        });
        return rows;
    }

    // --- Readiness Evaluation ---

    async evaluatePrinthouseOnboardingReadiness(printhouseId) {
        const printhouse = await this.getPrinthouse(printhouseId);
        if (!printhouse) throw new Error('PRINTHOUSE_NOT_FOUND');

        const machines = await this.listMachines(printhouseId);
        const media = await this.listMedia(printhouseId);
        const policyProfiles = await this.listPolicyProfiles(printhouseId);
        const slaProfiles = await this.listSlaProfiles(printhouseId);

        const missing_sections = [];
        const warnings = [];
        const blocking_reasons = [];

        if (machines.length === 0) {
            missing_sections.push('machines');
            blocking_reasons.push('NO_ACTIVE_MACHINES');
        }
        if (media.length === 0) {
            missing_sections.push('media');
            blocking_reasons.push('NO_MEDIA_DEFINED');
        }
        if (policyProfiles.length === 0) {
            missing_sections.push('policy_profiles');
            blocking_reasons.push('NO_POLICY_PROFILES_DEFINED');
        }
        if (slaProfiles.length === 0) {
            missing_sections.push('sla_profiles');
            blocking_reasons.push('NO_SLA_PROFILES_DEFINED');
        }

        // Check if printhouse profile itself has draft/incomplete contact info
        if (!printhouse.contact_email) {
            warnings.push('MISSING_CONTACT_EMAIL');
        }

        const ready_for_pilot = blocking_reasons.length === 0;
        let newOnboardingStatus = printhouse.onboarding_status;

        if (ready_for_pilot) {
            newOnboardingStatus = 'READY_FOR_PILOT';
        } else {
            if (machines.length > 0 || media.length > 0 || policyProfiles.length > 0 || slaProfiles.length > 0) {
                newOnboardingStatus = 'PROFILE_INCOMPLETE';
            } else {
                newOnboardingStatus = 'NOT_STARTED';
            }
        }

        if (newOnboardingStatus !== printhouse.onboarding_status) {
            await db.query('UPDATE printhouses SET onboarding_status = ? WHERE id = ?', [newOnboardingStatus, printhouseId]);
            await this.auditCapabilityChange({
                printhouseId,
                tenantId: printhouse.tenant_id,
                eventType: 'PRINTHOUSE_READINESS_EVALUATED',
                actor: { id: 'system', role: 'system' },
                before: { onboarding_status: printhouse.onboarding_status },
                after: { onboarding_status: newOnboardingStatus }
            });
            if (newOnboardingStatus === 'READY_FOR_PILOT') {
                await this.auditCapabilityChange({
                    printhouseId,
                    tenantId: printhouse.tenant_id,
                    eventType: 'PRINTHOUSE_READY_FOR_PILOT',
                    actor: { id: 'system', role: 'system' },
                    before: null,
                    after: { ready: true }
                });
            }
        }

        return {
            printhouse_id: printhouseId,
            onboarding_status: newOnboardingStatus,
            ready_for_pilot,
            missing_sections,
            warnings,
            blocking_reasons,
            capability_summary: {
                machines: machines.length,
                media: media.length,
                policy_profiles: policyProfiles.length,
                sla_profiles: slaProfiles.length
            }
        };
    }
}

module.exports = new PrinthouseCapabilityService();
