/**
 * scripts/seed_phase76_pilot_printhouse.js
 * 
 * Idempotent seeder for a Pilot Printhouse environment (Phase 76F).
 */
'use strict';

require('dotenv').config();
const db = require('../src/api/services/mysqlClient');
const printhouseCapabilityService = require('../src/api/services/printhouseCapabilityService');

async function introspectTenantsTable() {
    try {
        const columns = await db.query("SHOW COLUMNS FROM tenants");
        return columns.map(c => c.Field);
    } catch (e) {
        return null; // Table might not exist
    }
}

async function ensurePilotTenant(tenantId) {
    const columns = await introspectTenantsTable();
    if (!columns) {
        console.log(`[INFO] 'tenants' table does not exist. Relying on tenant_id reference only.`);
        return tenantId;
    }

    try {
        const existing = await db.query('SELECT * FROM tenants WHERE tenant_id = ?', [tenantId]);
        if (existing.length > 0) {
            console.log(`[INFO] Tenant ${tenantId} already exists. Reusing.`);
            return tenantId;
        }

        const insertColumns = ['tenant_id'];
        const insertValues = [tenantId];
        const placeholders = ['?'];

        if (columns.includes('tenant_name')) { insertColumns.push('tenant_name'); insertValues.push('Phase 76 Pilot Tenant'); placeholders.push('?'); }
        else if (columns.includes('name')) { insertColumns.push('name'); insertValues.push('Phase 76 Pilot Tenant'); placeholders.push('?'); }

        if (columns.includes('plan')) { insertColumns.push('plan'); insertValues.push('PILOT'); placeholders.push('?'); }
        if (columns.includes('role')) { insertColumns.push('role'); insertValues.push('PRINTHOUSE'); placeholders.push('?'); }
        if (columns.includes('status')) { insertColumns.push('status'); insertValues.push('ACTIVE'); placeholders.push('?'); }

        await db.query(`INSERT INTO tenants (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})`, insertValues);
        console.log(`[SUCCESS] Created Tenant ${tenantId}.`);
    } catch (err) {
        console.warn(`[WARN] Failed to insert tenant ${tenantId}. Continuing with logical reference.`, err.message);
    }
    return tenantId;
}

async function seed() {
    console.log('### Starting Phase 76F Pilot Printhouse Seeding...');

    const tenantId = 'phase76-pilot-tenant';
    const pilotName = 'Demo Printhouse Pilot';
    let printhouseId = null;
    const stats = { created: 0, updated: 0 };
    const actor = { tenantId, userId: 'system_seeder', role: 'SYSTEM' };

    try {
        await ensurePilotTenant(tenantId);

        // --- 1. Printhouse ---
        const existingPrinthouses = await printhouseCapabilityService.listPrinthouses({ tenantId });
        const existingPilot = existingPrinthouses.find(p => p.name === pilotName);

        const printhousePayload = {
            name: pilotName,
            legal_name: 'Demo Printhouse Pilot Ltd.',
            country: 'ES',
            region: 'Andalusia',
            city: 'Sanlúcar de Barrameda',
            contact_email: 'pilot-printhouse@example.test',
            contact_phone: '+34 000 000 000',
            status: 'PILOT',
            onboarding_status: 'READY_FOR_PILOT',
            default_currency: 'EUR',
            timezone: 'Europe/Madrid'
        };

        if (existingPilot) {
            printhouseId = existingPilot.id;
            await printhouseCapabilityService.updatePrinthouse(printhouseId, printhousePayload, actor);
            console.log(`[UPDATED] Printhouse ${printhouseId}`);
            stats.updated++;
        } else {
            const created = await printhouseCapabilityService.createPrinthouse(printhousePayload, actor);
            printhouseId = created.id;
            console.log(`[CREATED] Printhouse ${printhouseId}`);
            stats.created++;
        }

        const commonMeta = {
            seeded_by: 'phase76f',
            pilot_safe: true,
            commercial_live: false,
            created_for: 'commercial_pilot_readiness'
        };

        // --- 2. Machines ---
        const machinesDef = [
            {
                machine_name: 'Digital Book Press A',
                machine_type: 'DIGITAL_PRESS',
                manufacturer: 'Generic',
                model: 'DigitalPress-A',
                status: 'ACTIVE',
                min_sheet_width_mm: 148,
                min_sheet_height_mm: 210,
                max_sheet_width_mm: 330,
                max_sheet_height_mm: 488,
                max_print_width_mm: 320,
                max_print_height_mm: 478,
                supported_color_modes_json: ["CMYK", "GRAYSCALE"],
                supported_print_methods_json: ["DIGITAL", "TONER"],
                supported_sides_json: ["SINGLE_SIDED", "DOUBLE_SIDED"],
                max_pages_per_job: 1200,
                max_file_size_mb: 2048,
                max_tac_percent: 320,
                supports_pdfx: true,
                supports_pdfa: false,
                supports_variable_data: true,
                supports_white_ink: false,
                supports_spot_uv: false,
                supports_lamination: false,
                supports_hardcover: false,
                supports_softcover: true,
                supports_saddle_stitch: true,
                supports_perfect_binding: true,
                supports_case_binding: false,
                metadata_json: commonMeta
            },
            {
                machine_name: 'Offset Press B',
                machine_type: 'OFFSET_PRESS',
                manufacturer: 'Generic',
                model: 'Offset-B2',
                status: 'ACTIVE',
                min_sheet_width_mm: 320,
                min_sheet_height_mm: 450,
                max_sheet_width_mm: 720,
                max_sheet_height_mm: 1020,
                max_print_width_mm: 700,
                max_print_height_mm: 1000,
                supported_color_modes_json: ["CMYK", "SPOT", "PANTONE"],
                supported_print_methods_json: ["OFFSET"],
                supported_sides_json: ["SINGLE_SIDED", "DOUBLE_SIDED"],
                max_pages_per_job: 5000,
                max_file_size_mb: 4096,
                max_tac_percent: 340,
                supports_pdfx: true,
                supports_pdfa: false,
                supports_variable_data: false,
                supports_white_ink: false,
                supports_spot_uv: false,
                supports_lamination: false,
                supports_hardcover: true,
                supports_softcover: true,
                supports_saddle_stitch: true,
                supports_perfect_binding: true,
                supports_case_binding: true,
                metadata_json: commonMeta
            },
            {
                machine_name: 'Binding Line C',
                machine_type: 'BINDING_LINE',
                manufacturer: 'Generic',
                model: 'Binding-C',
                status: 'ACTIVE',
                supported_color_modes_json: [],
                supported_print_methods_json: [],
                supported_sides_json: [],
                max_pages_per_job: 5000,
                max_file_size_mb: 0,
                supports_pdfx: false,
                supports_pdfa: false,
                supports_variable_data: false,
                supports_white_ink: false,
                supports_spot_uv: false,
                supports_lamination: false,
                supports_hardcover: true,
                supports_softcover: true,
                supports_saddle_stitch: true,
                supports_perfect_binding: true,
                supports_case_binding: true,
                metadata_json: commonMeta
            },
            {
                machine_name: 'Finishing Cutter D',
                machine_type: 'CUTTER',
                manufacturer: 'Generic',
                model: 'Cutter-D',
                status: 'ACTIVE',
                supports_lamination: false,
                supports_hardcover: false,
                supports_softcover: true,
                supports_saddle_stitch: true,
                supports_perfect_binding: true,
                supports_case_binding: true,
                metadata_json: commonMeta
            }
        ];

        const currentMachines = await printhouseCapabilityService.listMachines(printhouseId);
        const machineIdMap = {};

        for (const mDef of machinesDef) {
            const existing = currentMachines.find(m => m.machine_name === mDef.machine_name);
            if (existing) {
                await printhouseCapabilityService.updateMachine(existing.id, mDef, actor);
                machineIdMap[mDef.machine_name] = existing.id;
                stats.updated++;
            } else {
                const created = await printhouseCapabilityService.createMachine(printhouseId, mDef, actor);
                machineIdMap[mDef.machine_name] = created.id;
                stats.created++;
            }
        }

        // --- 3. Media ---
        const mediaDef = [
            {
                media_name: 'Interior 80 gsm Uncoated',
                media_type: 'TEXT_PAPER',
                gsm: 80,
                thickness_microns: 95,
                finish: 'UNCOATED',
                color: 'WHITE',
                sheet_width_mm: 320,
                sheet_height_mm: 450,
                grain_direction: 'LONG',
                fsc_available: true,
                pefc_available: false,
                recycled_content_percent: 0,
                status: 'ACTIVE',
                compatible_machine_ids_json: [machineIdMap['Digital Book Press A'], machineIdMap['Offset Press B'], machineIdMap['Binding Line C'], machineIdMap['Finishing Cutter D']].filter(Boolean),
                metadata_json: commonMeta
            },
            {
                media_name: 'Interior 115 gsm Gloss',
                media_type: 'COATED',
                gsm: 115,
                thickness_microns: 90,
                finish: 'GLOSS',
                color: 'WHITE',
                sheet_width_mm: 320,
                sheet_height_mm: 450,
                grain_direction: 'LONG',
                fsc_available: true,
                pefc_available: false,
                recycled_content_percent: 0,
                status: 'ACTIVE',
                compatible_machine_ids_json: [machineIdMap['Digital Book Press A'], machineIdMap['Offset Press B'], machineIdMap['Binding Line C'], machineIdMap['Finishing Cutter D']].filter(Boolean),
                metadata_json: commonMeta
            },
            {
                media_name: 'Interior 135 gsm Gloss',
                media_type: 'COATED',
                gsm: 135,
                thickness_microns: 110,
                finish: 'GLOSS',
                color: 'WHITE',
                sheet_width_mm: 320,
                sheet_height_mm: 450,
                grain_direction: 'LONG',
                fsc_available: true,
                pefc_available: false,
                recycled_content_percent: 0,
                status: 'ACTIVE',
                compatible_machine_ids_json: [machineIdMap['Digital Book Press A'], machineIdMap['Offset Press B'], machineIdMap['Binding Line C'], machineIdMap['Finishing Cutter D']].filter(Boolean),
                metadata_json: commonMeta
            },
            {
                media_name: 'Cover 170 gsm Gloss',
                media_type: 'COVER_PAPER',
                gsm: 170,
                thickness_microns: 150,
                finish: 'GLOSS',
                color: 'WHITE',
                sheet_width_mm: 320,
                sheet_height_mm: 450,
                grain_direction: 'SHORT',
                fsc_available: true,
                pefc_available: false,
                recycled_content_percent: 0,
                status: 'ACTIVE',
                compatible_machine_ids_json: [machineIdMap['Digital Book Press A'], machineIdMap['Offset Press B'], machineIdMap['Binding Line C'], machineIdMap['Finishing Cutter D']].filter(Boolean),
                metadata_json: commonMeta
            },
            {
                media_name: 'Cover 250 gsm Silk',
                media_type: 'COVER_PAPER',
                gsm: 250,
                thickness_microns: 240,
                finish: 'SILK',
                color: 'WHITE',
                sheet_width_mm: 320,
                sheet_height_mm: 450,
                grain_direction: 'SHORT',
                fsc_available: true,
                pefc_available: false,
                recycled_content_percent: 0,
                status: 'ACTIVE',
                compatible_machine_ids_json: [machineIdMap['Digital Book Press A'], machineIdMap['Offset Press B'], machineIdMap['Binding Line C'], machineIdMap['Finishing Cutter D']].filter(Boolean),
                metadata_json: commonMeta
            },
            {
                media_name: 'Hardcover Greyboard 2mm',
                media_type: 'BOARD',
                gsm: 1200,
                thickness_microns: 2000,
                finish: 'UNCOATED',
                color: 'GREY',
                sheet_width_mm: 700,
                sheet_height_mm: 1000,
                grain_direction: 'LONG',
                fsc_available: false,
                pefc_available: false,
                recycled_content_percent: 80,
                status: 'ACTIVE',
                compatible_machine_ids_json: [machineIdMap['Offset Press B'], machineIdMap['Binding Line C'], machineIdMap['Finishing Cutter D']].filter(Boolean),
                metadata_json: commonMeta
            }
        ];

        const currentMedia = await printhouseCapabilityService.listMedia(printhouseId);
        for (const md of mediaDef) {
            const existing = currentMedia.find(m => m.media_name === md.media_name);
            if (existing) {
                await printhouseCapabilityService.updateMedia(existing.id, md, actor);
                stats.updated++;
            } else {
                await printhouseCapabilityService.createMedia(printhouseId, md, actor);
                stats.created++;
            }
        }

        // --- 4. Policy Profiles ---
        const policyDef = [
            {
                profile_name: "Book Interior Digital",
                profile_type: "BOOK_INTERIOR",
                required_pdf_standard: "NONE",
                allow_degraded_analysis: false,
                require_artifact_trust_production_certified: true,
                require_visual_proof_approval: false,
                require_human_review_for_page_marks: true,
                require_human_review_for_ink_changes: true,
                require_human_review_for_font_changes: true,
                require_human_review_for_transparency: true,
                max_tac_percent: 320,
                min_bleed_mm: 3,
                allow_rgb: false,
                allow_spot_colors: false,
                allow_transparency: true,
                allow_overprint: true,
                allow_annotations: false,
                allow_forms: false,
                allow_javascript: false,
                allow_embedded_files: false,
                required_output_intent: "FOGRA39",
                accepted_trim_box_policy: "TRIMBOX_REQUIRED",
                metadata_json: commonMeta
            },
            {
                profile_name: "Book Cover Digital",
                profile_type: "BOOK_COVER",
                required_pdf_standard: "NONE",
                allow_degraded_analysis: false,
                require_artifact_trust_production_certified: true,
                require_visual_proof_approval: true,
                require_human_review_for_page_marks: true,
                require_human_review_for_ink_changes: true,
                require_human_review_for_font_changes: true,
                require_human_review_for_transparency: true,
                max_tac_percent: 320,
                min_bleed_mm: 3,
                allow_rgb: false,
                allow_spot_colors: true,
                allow_transparency: true,
                allow_overprint: true,
                allow_annotations: false,
                allow_forms: false,
                allow_javascript: false,
                allow_embedded_files: false,
                required_output_intent: "FOGRA39",
                accepted_trim_box_policy: "TRIMBOX_REQUIRED",
                metadata_json: commonMeta
            },
            {
                profile_name: "Softcover Book",
                profile_type: "SOFTCOVER",
                required_pdf_standard: "NONE",
                allow_degraded_analysis: false,
                require_artifact_trust_production_certified: true,
                require_visual_proof_approval: true,
                max_tac_percent: 320,
                min_bleed_mm: 3,
                allow_rgb: false,
                allow_spot_colors: true,
                allow_transparency: true,
                allow_overprint: true,
                allow_annotations: false,
                allow_forms: false,
                allow_javascript: false,
                allow_embedded_files: false,
                required_output_intent: "FOGRA39",
                accepted_trim_box_policy: "TRIMBOX_REQUIRED",
                metadata_json: commonMeta
            },
            {
                profile_name: "Hardcover Book",
                profile_type: "HARDCOVER",
                required_pdf_standard: "NONE",
                allow_degraded_analysis: false,
                require_artifact_trust_production_certified: true,
                require_visual_proof_approval: true,
                require_human_review_for_page_marks: true,
                require_human_review_for_ink_changes: true,
                require_human_review_for_font_changes: true,
                require_human_review_for_transparency: true,
                max_tac_percent: 320,
                min_bleed_mm: 3,
                allow_rgb: false,
                allow_spot_colors: true,
                allow_transparency: true,
                allow_overprint: true,
                allow_annotations: false,
                allow_forms: false,
                allow_javascript: false,
                allow_embedded_files: false,
                required_output_intent: "FOGRA39",
                accepted_trim_box_policy: "TRIMBOX_REQUIRED",
                metadata_json: commonMeta
            },
            {
                profile_name: "General PDF/X-4 Preferred",
                profile_type: "GENERAL_PRINT",
                required_pdf_standard: "PDFX_4",
                allow_degraded_analysis: false,
                require_artifact_trust_production_certified: true,
                require_visual_proof_approval: false,
                max_tac_percent: 320,
                min_bleed_mm: 3,
                allow_rgb: false,
                allow_spot_colors: true,
                allow_transparency: true,
                allow_overprint: true,
                allow_annotations: false,
                allow_forms: false,
                allow_javascript: false,
                allow_embedded_files: false,
                required_output_intent: "FOGRA39",
                accepted_trim_box_policy: "TRIMBOX_REQUIRED",
                metadata_json: commonMeta
            }
        ];

        const currentPolicies = await printhouseCapabilityService.listPolicyProfiles(printhouseId);
        for (const pd of policyDef) {
            const existing = currentPolicies.find(p => p.profile_name === pd.profile_name);
            if (existing) {
                await printhouseCapabilityService.updatePolicyProfile(existing.id, pd, actor);
                stats.updated++;
            } else {
                await printhouseCapabilityService.createPolicyProfile(printhouseId, pd, actor);
                stats.created++;
            }
        }

        // --- 5. SLA Profiles ---
        const slaDef = [
            {
                profile_name: "Standard Books 5–7 Business Days",
                production_days_min: 5,
                production_days_max: 7,
                cutoff_time_local: "15:00",
                weekend_production: false,
                holiday_calendar_region: "ES",
                rush_available: false,
                rush_surcharge_percent: 0,
                max_daily_jobs: 50,
                max_daily_pages: 100000,
                metadata_json: commonMeta
            },
            {
                profile_name: "Rush Books 2–3 Business Days",
                production_days_min: 2,
                production_days_max: 3,
                cutoff_time_local: "12:00",
                weekend_production: false,
                holiday_calendar_region: "ES",
                rush_available: true,
                rush_surcharge_percent: 25,
                max_daily_jobs: 10,
                max_daily_pages: 25000,
                metadata_json: commonMeta
            }
        ];

        const currentSla = await printhouseCapabilityService.listSlaProfiles(printhouseId);
        for (const sd of slaDef) {
            const existing = currentSla.find(s => s.profile_name === sd.profile_name);
            if (existing) {
                await printhouseCapabilityService.updateSlaProfile(existing.id, sd, actor);
                stats.updated++;
            } else {
                await printhouseCapabilityService.createSlaProfile(printhouseId, sd, actor);
                stats.created++;
            }
        }

        // --- Evaluate Readiness ---
        await printhouseCapabilityService.evaluatePrinthouseOnboardingReadiness(printhouseId);
        const finalPrinthouse = await printhouseCapabilityService.getPrinthouse(printhouseId);

        console.log('\n### Seeding Complete');
        console.log(JSON.stringify({
            ok: true,
            tenant_id: tenantId,
            printhouse_id: printhouseId,
            created: stats.created,
            updated: stats.updated,
            ready_for_pilot: finalPrinthouse.onboarding_status === 'READY_FOR_PILOT'
        }, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('[ERROR] Seeding failed:', err);
        process.exit(1);
    }
}

if (require.main === module) {
    seed();
} else {
    module.exports = seed;
}
