'use strict';
/**
 * scripts/smoke_phase76a_printhouse_capability_schema.js
 * 
 * Smoke test for Phase 76A — Control Plane Printhouse Capability Schema.
 * Tests DB CRUD logic, validation constraints, readiness evaluation, audit logging, and tenant isolation.
 */

const db = require('../src/api/services/mysqlClient');
const service = require('../src/api/services/printhouseCapabilityService');

let PASS = 0, FAIL = 0;
const results = [];

function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        results.push({ label, status: 'PASS', detail });
        console.log(`  ✅  [PASS] ${label} ${detail ? `(${detail})` : ''}`);
    } else {
        FAIL++;
        results.push({ label, status: 'FAIL', detail });
        console.error(`  ❌  [FAIL] ${label} ${detail ? `: ${detail}` : ''}`);
    }
}

// Global mocks for testing when DB is offline
const originalQuery = db.query;
const mockDb = {
    tables: {
        printhouses: [],
        printhouse_machines: [],
        printhouse_media: [],
        printhouse_policy_profiles: [],
        printhouse_sla_profiles: [],
        printhouse_capability_audit: []
    },
    reset() {
        this.tables.printhouses = [];
        this.tables.printhouse_machines = [];
        this.tables.printhouse_media = [];
        this.tables.printhouse_policy_profiles = [];
        this.tables.printhouse_sla_profiles = [];
        this.tables.printhouse_capability_audit = [];
    }
};

function enableMockDb() {
    db.query = async (sql, params) => {
        const sqlUpper = sql.trim().toUpperCase();
        
        // INSERT PRINTHOUSES
        if (sqlUpper.startsWith('INSERT INTO PRINTHOUSES')) {
            const row = {
                id: params[0],
                tenant_id: params[1],
                name: params[2],
                legal_name: params[3],
                country: params[4],
                region: params[5],
                city: params[6],
                contact_email: params[7],
                contact_phone: params[8],
                status: params[9],
                onboarding_status: params[10],
                default_currency: params[11],
                timezone: params[12]
            };
            mockDb.tables.printhouses.push(row);
            return { insertId: 1 };
        }
        
        // UPDATE PRINTHOUSES
        if (sqlUpper.startsWith('UPDATE PRINTHOUSES')) {
            if (sqlUpper.includes('SET ONBOARDING_STATUS = ?')) {
                const onboarding_status = params[0];
                const id = params[1];
                const row = mockDb.tables.printhouses.find(r => r.id === id);
                if (row) row.onboarding_status = onboarding_status;
            } else {
                const id = params[11];
                const tenant_id = params[12];
                const row = mockDb.tables.printhouses.find(r => r.id === id && r.tenant_id === tenant_id);
                if (row) {
                    if (params[0]) row.name = params[0];
                    if (params[7]) row.status = params[7];
                    if (params[8]) row.onboarding_status = params[8];
                }
            }
            return { affectedRows: 1 };
        }

        // SELECT PRINTHOUSES
        if (sqlUpper.startsWith('SELECT * FROM PRINTHOUSES')) {
            if (sqlUpper.includes('WHERE ID = ?')) {
                return mockDb.tables.printhouses.filter(r => r.id === params[0]);
            }
            if (sqlUpper.includes('AND TENANT_ID = ?')) {
                return mockDb.tables.printhouses.filter(r => r.tenant_id === params[0]);
            }
            return mockDb.tables.printhouses;
        }

        // INSERT MACHINES
        if (sqlUpper.startsWith('INSERT INTO PRINTHOUSE_MACHINES')) {
            const row = {
                id: params[0], printhouse_id: params[1], tenant_id: params[2], machine_name: params[3],
                machine_type: params[4], manufacturer: params[5], model: params[6], status: params[7],
                max_sheet_width_mm: params[8], max_sheet_height_mm: params[9], min_sheet_width_mm: params[10], min_sheet_height_mm: params[11],
                max_print_width_mm: params[12], max_print_height_mm: params[13], supported_color_modes_json: params[14], supported_print_methods_json: params[15],
                supported_sides_json: params[16], max_pages_per_job: params[17], max_file_size_mb: params[18], max_tac_percent: params[19],
                supports_pdfx: params[20], supports_pdfa: params[21], supports_variable_data: params[22], supports_white_ink: params[23],
                supports_spot_uv: params[24], supports_lamination: params[25], supports_hardcover: params[26], supports_softcover: params[27],
                supports_saddle_stitch: params[28], supports_perfect_binding: params[29], supports_case_binding: params[30], metadata_json: params[31]
            };
            mockDb.tables.printhouse_machines.push(row);
            return { insertId: 1 };
        }

        // SELECT MACHINES
        if (sqlUpper.startsWith('SELECT * FROM PRINTHOUSE_MACHINES')) {
            if (sqlUpper.includes('WHERE ID = ?')) {
                return mockDb.tables.printhouse_machines.filter(r => r.id === params[0]);
            }
            if (sqlUpper.includes('WHERE PRINTHOUSE_ID = ?')) {
                return mockDb.tables.printhouse_machines.filter(r => r.printhouse_id === params[0]);
            }
        }

        // INSERT MEDIA
        if (sqlUpper.startsWith('INSERT INTO PRINTHOUSE_MEDIA')) {
            const row = {
                id: params[0], printhouse_id: params[1], tenant_id: params[2], media_name: params[3], media_type: params[4],
                gsm: params[5], thickness_microns: params[6], finish: params[7], color: params[8], sheet_width_mm: params[9],
                sheet_height_mm: params[10], roll_width_mm: params[11], grain_direction: params[12], fsc_available: params[13],
                pefc_available: params[14], recycled_content_percent: params[15], status: params[16], compatible_machine_ids_json: params[17], metadata_json: params[18]
            };
            mockDb.tables.printhouse_media.push(row);
            return { insertId: 1 };
        }

        // SELECT MEDIA
        if (sqlUpper.startsWith('SELECT * FROM PRINTHOUSE_MEDIA')) {
            if (sqlUpper.includes('WHERE ID = ?')) {
                return mockDb.tables.printhouse_media.filter(r => r.id === params[0]);
            }
            if (sqlUpper.includes('WHERE PRINTHOUSE_ID = ?')) {
                return mockDb.tables.printhouse_media.filter(r => r.printhouse_id === params[0]);
            }
        }

        // INSERT POLICY PROFILES
        if (sqlUpper.startsWith('INSERT INTO PRINTHOUSE_POLICY_PROFILES')) {
            const row = {
                id: params[0], printhouse_id: params[1], tenant_id: params[2], profile_name: params[3], profile_type: params[4],
                required_pdf_standard: params[5], allow_degraded_analysis: params[6], require_artifact_trust_production_certified: params[7],
                require_visual_proof_approval: params[8], require_human_review_for_page_marks: params[9], require_human_review_for_ink_changes: params[10],
                require_human_review_for_font_changes: params[11], require_human_review_for_transparency: params[12], max_tac_percent: params[13],
                min_bleed_mm: params[14], allow_rgb: params[15], allow_spot_colors: params[16], allow_transparency: params[17],
                allow_overprint: params[18], allow_annotations: params[19], allow_forms: params[20], allow_javascript: params[21],
                allow_embedded_files: params[22], required_output_intent: params[23], accepted_trim_box_policy: params[24], metadata_json: params[25]
            };
            mockDb.tables.printhouse_policy_profiles.push(row);
            return { insertId: 1 };
        }

        // SELECT POLICY PROFILES
        if (sqlUpper.startsWith('SELECT * FROM PRINTHOUSE_POLICY_PROFILES')) {
            if (sqlUpper.includes('WHERE ID = ?')) {
                return mockDb.tables.printhouse_policy_profiles.filter(r => r.id === params[0]);
            }
            if (sqlUpper.includes('WHERE PRINTHOUSE_ID = ?')) {
                return mockDb.tables.printhouse_policy_profiles.filter(r => r.printhouse_id === params[0]);
            }
        }

        // INSERT SLA PROFILES
        if (sqlUpper.startsWith('INSERT INTO PRINTHOUSE_SLA_PROFILES')) {
            const row = {
                id: params[0], printhouse_id: params[1], tenant_id: params[2], profile_name: params[3],
                production_days_min: params[4], production_days_max: params[5], cutoff_time_local: params[6],
                weekend_production: params[7], holiday_calendar_region: params[8], rush_available: params[9],
                rush_surcharge_percent: params[10], max_daily_jobs: params[11], max_daily_pages: params[12], metadata_json: params[13]
            };
            mockDb.tables.printhouse_sla_profiles.push(row);
            return { insertId: 1 };
        }

        // SELECT SLA PROFILES
        if (sqlUpper.startsWith('SELECT * FROM PRINTHOUSE_SLA_PROFILES')) {
            if (sqlUpper.includes('WHERE ID = ?')) {
                return mockDb.tables.printhouse_sla_profiles.filter(r => r.id === params[0]);
            }
            if (sqlUpper.includes('WHERE PRINTHOUSE_ID = ?')) {
                return mockDb.tables.printhouse_sla_profiles.filter(r => r.printhouse_id === params[0]);
            }
        }

        // INSERT AUDIT
        if (sqlUpper.startsWith('INSERT INTO PRINTHOUSE_CAPABILITY_AUDIT')) {
            const row = {
                printhouse_id: params[0],
                tenant_id: params[1],
                event_type: params[2],
                actor_user_id: params[3],
                actor_role: params[4],
                before_json: params[5],
                after_json: params[6]
            };
            mockDb.tables.printhouse_capability_audit.push(row);
            return { insertId: mockDb.tables.printhouse_capability_audit.length };
        }

        // SELECT AUDIT
        if (sqlUpper.startsWith('SELECT * FROM PRINTHOUSE_CAPABILITY_AUDIT')) {
            return mockDb.tables.printhouse_capability_audit.filter(r => r.printhouse_id === params[0]);
        }

        return [];
    };
}

async function runSmokeTest() {
    console.log('=== PRINTPRICE OS: PHASE 76A SMOKE TESTS ===\n');

    enableMockDb();
    mockDb.reset();

    const actor1 = { tenantId: 'tenant_a', userId: 'user_1', role: 'SUPER_ADMIN' };
    const actor2 = { tenantId: 'tenant_b', userId: 'user_2', role: 'ADMIN' };

    try {
        // 1. Create Printhouse
        console.log('--- 1. Printhouse Onboarding & Auditing ---');
        const ph = await service.createPrinthouse({
            name: 'Madrid Premium Print',
            legal_name: 'Madrid Premium Print S.L.',
            country: 'ES',
            region: 'Madrid',
            city: 'Madrid',
            contact_email: 'ops@madridprint.es',
            contact_phone: '+34910000000'
        }, actor1);

        assert(ph.id.startsWith('print_'), 'Printhouse ID created with print_ prefix');
        assert(ph.onboarding_status === 'NOT_STARTED', 'Initial onboarding status is NOT_STARTED');
        assert(ph.tenant_id === 'tenant_a', 'Printhouse bound to actor tenantId');

        // Audit Log verification
        const audits = mockDb.tables.printhouse_capability_audit;
        assert(audits.length > 0, 'Audit event triggered');
        assert(audits[0].event_type === 'PRINTHOUSE_CREATED', 'First audit type is PRINTHOUSE_CREATED');

        // 2. Schema Constraints & Validations
        console.log('\n--- 2. Machine Validation Constraints ---');

        // Max sheet width <= min sheet width should fail
        let machineErr = null;
        try {
            await service.createMachine(ph.id, {
                machine_name: 'Speedmaster 102',
                machine_type: 'OFFSET',
                min_sheet_width_mm: 500,
                max_sheet_width_mm: 400
            }, actor1);
        } catch (e) {
            machineErr = e;
        }
        assert(machineErr !== null && machineErr.message.includes('max_sheet_width_mm must be greater than min_sheet_width_mm'), 
            'Machine creation fails if max width <= min width');

        // Max print width > max sheet width should fail
        machineErr = null;
        try {
            await service.createMachine(ph.id, {
                machine_name: 'Speedmaster 102',
                machine_type: 'OFFSET',
                min_sheet_width_mm: 200,
                max_sheet_width_mm: 500,
                max_print_width_mm: 600
            }, actor1);
        } catch (e) {
            machineErr = e;
        }
        assert(machineErr !== null && machineErr.message.includes('max_print_width_mm cannot exceed max_sheet_width_mm'), 
            'Machine creation fails if max print width exceeds max sheet width');

        // Max TAC percent outside bounds (100-400) should fail
        machineErr = null;
        try {
            await service.createMachine(ph.id, {
                machine_name: 'Speedmaster 102',
                machine_type: 'OFFSET',
                min_sheet_width_mm: 200,
                max_sheet_width_mm: 500,
                max_print_width_mm: 450,
                max_tac_percent: 450
            }, actor1);
        } catch (e) {
            machineErr = e;
        }
        assert(machineErr !== null && machineErr.message.includes('max_tac_percent must be between 100 and 400'), 
            'Machine creation fails if TAC percent is > 400');

        // Correct machine creation
        const mach = await service.createMachine(ph.id, {
            machine_name: 'Speedmaster XL 106',
            machine_type: 'OFFSET',
            min_sheet_width_mm: 340,
            max_sheet_width_mm: 1050,
            min_sheet_height_mm: 480,
            max_sheet_height_mm: 750,
            max_print_width_mm: 1040,
            max_print_height_mm: 740,
            max_tac_percent: 320,
            max_pages_per_job: 16,
            max_file_size_mb: 250,
            supports_pdfx: true
        }, actor1);

        assert(mach.id.startsWith('mach_'), 'Machine successfully created');

        // 3. Media GSM Constraints
        console.log('\n--- 3. Media GSM Validation ---');
        let mediaErr = null;
        try {
            await service.createMedia(ph.id, {
                media_name: 'Coated Silk 130g',
                media_type: 'COATED',
                gsm: -5
            }, actor1);
        } catch (e) {
            mediaErr = e;
        }
        assert(mediaErr !== null && mediaErr.message.includes('gsm must be greater than 0'), 'Media creation fails if GSM <= 0');

        const med = await service.createMedia(ph.id, {
            media_name: 'Coated Silk 150g',
            media_type: 'COATED',
            gsm: 150,
            thickness_microns: 135,
            finish: 'SILK',
            color: 'WHITE',
            fsc_available: true
        }, actor1);
        assert(med.id.startsWith('med_'), 'Media successfully created');

        // 4. Policy Profile Constraints (bleed, TAC bounds)
        console.log('\n--- 4. Policy Profile Validation ---');
        let policyErr = null;
        try {
            await service.createPolicyProfile(ph.id, {
                profile_name: 'Strict PDF/X-4 Policy',
                profile_type: 'PREFLIGHT',
                max_tac_percent: 80
            }, actor1);
        } catch (e) {
            policyErr = e;
        }
        assert(policyErr !== null && policyErr.message.includes('max_tac_percent must be between 100 and 400'), 'Policy creation fails if TAC < 100');

        const pol = await service.createPolicyProfile(ph.id, {
            profile_name: 'Standard ISO Policy',
            profile_type: 'PREFLIGHT',
            required_pdf_standard: 'PDF/X-4',
            max_tac_percent: 300,
            min_bleed_mm: 3,
            allow_rgb: false
        }, actor1);
        assert(pol.id.startsWith('pol_'), 'Policy Profile successfully created');

        // 5. SLA Profile Constraints
        console.log('\n--- 5. SLA Profile Constraints ---');
        let slaErr = null;
        try {
            await service.createSlaProfile(ph.id, {
                profile_name: 'Express Turnaround',
                production_days_min: 5,
                production_days_max: 2
            }, actor1);
        } catch (e) {
            slaErr = e;
        }
        assert(slaErr !== null && slaErr.message.includes('production_days_min cannot exceed production_days_max'), 'SLA creation fails if min days > max days');

        const sla = await service.createSlaProfile(ph.id, {
            profile_name: 'Standard SLA',
            production_days_min: 1,
            production_days_max: 3,
            max_daily_jobs: 50,
            max_daily_pages: 10000
        }, actor1);
        assert(sla.id.startsWith('sla_'), 'SLA Profile successfully created');

        // 6. Tenant Isolation
        console.log('\n--- 6. Tenant Isolation ---');
        let isolationErr = null;
        try {
            // actor2 has tenant_b, while ph is tenant_a
            await service.createMachine(ph.id, {
                machine_name: 'Intruder Press',
                machine_type: 'DIGITAL'
            }, actor2);
        } catch (e) {
            isolationErr = e;
        }
        assert(isolationErr !== null && isolationErr.message === 'UNAUTHORIZED_TENANT_ACCESS', 'Tenant isolation prevents cross-tenant machine insertion');

        // 7. Onboarding Readiness Check
        console.log('\n--- 7. Onboarding Readiness Evaluation ---');
        const readiness = await service.evaluatePrinthouseOnboardingReadiness(ph.id);
        assert(readiness.ready_for_pilot === true, 'Printhouse is READY_FOR_PILOT when all sections exist');
        assert(readiness.onboarding_status === 'READY_FOR_PILOT', 'Onboarding status transitioned to READY_FOR_PILOT');

    } catch (err) {
        console.error('Smoke test scenario execution failed:', err);
        FAIL++;
    }

    console.log('\n================================================');
    console.log(`Phase 76A smoke test run completed.`);
    console.log(`Passed: ${PASS} | Failed: ${FAIL}`);
    console.log('================================================');

    if (FAIL > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runSmokeTest();
