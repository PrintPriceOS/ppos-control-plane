import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
    getPricingProfiles,
    getPricingProfilesAsync,
    savePricingProfileAsync,
    deletePricingProfileAsync,
    syncFromOnboardingRates,
    computeDeterministicRatesChecksum
} = require('../services/pricing/pricingIntelligenceService');

/**
 * Stateful in-memory MySQL mock emulating `printer_nodes`, `printhouse_machines`,
 * `printer_pricing_profiles`, `materials_catalog`, and `printhouse_pricing_revisions`
 * to verify true SQL queries and bidirectional persistence.
 */
function createMockMySqlDb() {
    const store = {
        printer_nodes: [
            {
                id: 'node-bcn-01',
                tenant_id: 'tenant-mysql-sync-1',
                name: 'Planta Industrial Barcelona B1',
                signatures: JSON.stringify([16, 32]),
                rates_json: JSON.stringify({
                    interior_full_colour_fixed: 250,
                    interior_full_colour_var_per_1000: 42,
                    target_margin_pct: 29,
                    minimum_job_fee: 390
                }),
                status: 'ACTIVE',
                created_at: '2026-06-01T08:00:00.000Z'
            }
        ],
        printhouse_machines: [
            {
                id: 'mach-bcn-xl106',
                printhouse_id: 'node-bcn-01',
                tenant_id: 'tenant-mysql-sync-1',
                machine_name: 'Heidelberg Speedmaster XL 106-8P Barcelona',
                machine_type: 'OFFSET_PRESS',
                max_sheet_width_mm: 750,
                max_sheet_height_mm: 1060,
                supported_print_methods_json: JSON.stringify(['SHEETFED_OFFSET']),
                metadata_json: JSON.stringify({ hourlyRateEur: 280, setupFeeEur: 250, plateCostEur: 24 }),
                status: 'ACTIVE',
                created_at: '2026-06-01T08:00:00.000Z'
            },
            {
                id: 'mach-bcn-indigo',
                printhouse_id: 'node-bcn-01',
                tenant_id: 'tenant-mysql-sync-1',
                machine_name: 'HP Indigo 15K Digital Press BCN',
                machine_type: 'DIGITAL_PRESS',
                max_sheet_width_mm: 530,
                max_sheet_height_mm: 750,
                supported_print_methods_json: JSON.stringify(['DIGITAL_TONER']),
                metadata_json: JSON.stringify({ hourlyRateEur: 110, setupFeeEur: 30, plateCostEur: 0 }),
                status: 'ACTIVE',
                created_at: '2026-06-01T08:05:00.000Z'
            }
        ],
        printer_pricing_profiles: [
            {
                id: 'prof-bcn-xl106',
                printer_id: 'node-bcn-01',
                machine_id: 'mach-bcn-xl106',
                pricing_scope: 'MACHINE',
                currency: 'EUR',
                target_margin_pct: 31,
                platform_markup_pct: 8,
                minimum_job_fee: 410,
                active: 1,
                created_at: '2026-06-01T08:10:00.000Z'
            }
        ],
        materials_catalog: [
            {
                id: 'mat-munken-90',
                tenant_id: 'tenant-mysql-sync-1',
                printhouse_id: 'node-bcn-01',
                material_name: 'Munken Print White 1.5',
                material_type: 'PAPER',
                substrate_class: 'UNCOATED',
                gsm: 90,
                sheet_format: '70x100',
                metadata_json: JSON.stringify({ bulk_factor: 1.5, cost_per_ton_eur: 1390 }),
                created_at: '2026-06-01T08:00:00.000Z'
            }
        ],
        printhouse_pricing_revisions: []
    };

    return {
        store,
        async query(sql, params = []) {
            const q = String(sql).trim();

            if (q.includes('FROM printer_nodes WHERE tenant_id = ?')) {
                const tenantId = params[0];
                return store.printer_nodes.filter((n) => n.tenant_id === tenantId && n.status !== 'DELETED');
            }
            if (q.includes('FROM printhouse_machines WHERE tenant_id = ?')) {
                const tenantId = params[0];
                return store.printhouse_machines.filter((m) => m.tenant_id === tenantId && m.status !== 'ARCHIVED');
            }
            if (q.includes('FROM printer_pricing_profiles ppp')) {
                const tenantId = params[0];
                return store.printer_pricing_profiles
                    .map((p) => {
                        const node = store.printer_nodes.find((n) => n.id === p.printer_id);
                        return node && node.tenant_id === tenantId ? { ...p, printer_name: node.name } : null;
                    })
                    .filter(Boolean);
            }
            if (q.includes('FROM materials_catalog WHERE tenant_id = ?')) {
                const tenantId = params[0];
                return store.materials_catalog.filter((m) => m.tenant_id === tenantId);
            }
            if (q.includes('FROM printhouse_pricing_revisions WHERE tenant_id = ?')) {
                const tenantId = params[0];
                return store.printhouse_pricing_revisions
                    .filter((r) => r.tenant_id === tenantId)
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
            if (q.includes('SELECT id FROM printer_pricing_profiles WHERE id = ? OR printer_id = ?')) {
                const [id, printerId] = params;
                return store.printer_pricing_profiles.filter((p) => p.id === id || p.printer_id === printerId);
            }
            if (q.includes('SELECT id FROM printer_pricing_profiles WHERE printer_id = ?')) {
                const [printerId] = params;
                return store.printer_pricing_profiles.filter((p) => p.printer_id === printerId);
            }
            if (q.startsWith('UPDATE printer_pricing_profiles')) {
                const [margin, markup, minFee, activeOrId, maybeId] = params;
                const targetId = maybeId !== undefined ? maybeId : activeOrId;
                const row = store.printer_pricing_profiles.find((p) => p.id === targetId);
                if (row) {
                    row.target_margin_pct = margin;
                    row.platform_markup_pct = markup;
                    row.minimum_job_fee = minFee;
                    if (maybeId !== undefined) row.active = activeOrId;
                }
                return { affectedRows: row ? 1 : 0 };
            }
            if (q.startsWith('INSERT INTO printer_pricing_profiles')) {
                const [id, printer_id, machine_id, pricing_scope, target_margin_pct, platform_markup_pct, minimum_job_fee] = params;
                store.printer_pricing_profiles.push({
                    id,
                    printer_id,
                    machine_id,
                    pricing_scope: pricing_scope || 'PRINTER',
                    currency: 'EUR',
                    target_margin_pct,
                    platform_markup_pct,
                    minimum_job_fee,
                    active: 1,
                    created_at: new Date().toISOString()
                });
                return { affectedRows: 1 };
            }
            if (q.startsWith('UPDATE printer_nodes SET rates_json = ?')) {
                const [ratesJsonStr, nodeId, tenantId] = params;
                const node = store.printer_nodes.find((n) => n.id === nodeId && n.tenant_id === tenantId);
                if (node) {
                    node.rates_json = ratesJsonStr;
                }
                return { affectedRows: node ? 1 : 0 };
            }
            if (q.startsWith('DELETE FROM printer_pricing_profiles WHERE id = ?')) {
                const [id] = params;
                const before = store.printer_pricing_profiles.length;
                store.printer_pricing_profiles = store.printer_pricing_profiles.filter((p) => p.id !== id);
                return { affectedRows: before - store.printer_pricing_profiles.length };
            }
            if (q.startsWith('INSERT INTO printhouse_pricing_revisions')) {
                const [id, tenant_id, printer_node_id, rates_json, rates_checksum, baseline_rates_checksum, created_by_json] = params;
                store.printhouse_pricing_revisions.push({
                    id,
                    tenant_id,
                    printer_node_id,
                    source_type: 'WORKSPACE_SYNC',
                    rates_json,
                    rates_checksum,
                    baseline_rates_checksum,
                    created_by_json,
                    created_at: new Date().toISOString()
                });
                return { affectedRows: 1 };
            }
            return [];
        }
    };
}

describe('Phase 14B: Bidirectional MySQL Persistence Bridge (Onboarding <-> /ops/pricing Workspace)', () => {
    it('1. Hydrates economic profiles and paper catalog from MySQL (printer_nodes, printhouse_machines, printer_pricing_profiles, materials_catalog)', async () => {
        const mockDb = createMockMySqlDb();
        const res = await getPricingProfilesAsync('tenant-mysql-sync-1', mockDb);

        expect(res.ok).toBe(true);
        expect(res.profiles.length).toBe(2);
        expect(res.profiles[0].printerName).toBe('Heidelberg Speedmaster XL 106-8P Barcelona');
        expect(res.profiles[0].technology).toBe('OFFSET_B1');
        expect(res.profiles[0].hourlyRateEur).toBe(280);
        expect(res.profiles[0].targetMarginPct).toBe(31);
        expect(res.profiles[0].source).toBe('MYSQL_HYDRATED');

        expect(res.papers.length).toBe(1);
        expect(res.papers[0].name).toContain('Munken Print White 1.5');
        expect(res.papers[0].bulkFactor).toBe(1.5);
        expect(res.syncTelemetry.status).toBe('SYNCED_WITH_WORKSPACE');
    });

    it('2. Onboarding -> Workspace Sync: Saving calibrated rates in Onboarding updates /api/pricing/profiles and MySQL printer_pricing_profiles', async () => {
        const mockDb = createMockMySqlDb();
        const calibratedRates = {
            interior_full_colour_fixed: 295,
            interior_full_colour_var_per_1000: 48,
            hourly_rate_eur: 312,
            setup_fee_eur: 295,
            target_margin_pct: 34,
            platform_markup_pct: 9,
            minimum_job_fee: 450
        };
        const checksum = computeDeterministicRatesChecksum(calibratedRates);

        const syncRes = await syncFromOnboardingRates(
            'tenant-mysql-sync-1',
            calibratedRates,
            {
                nodeId: 'node-bcn-01',
                nodeName: 'Planta Industrial Barcelona B1',
                productFamily: 'HARDCOVER',
                ratesChecksum: checksum,
                revisionId: 'rev_onb_hc_001'
            },
            mockDb
        );

        expect(syncRes.ok).toBe(true);
        expect(syncRes.syncedProfile.hourlyRateEur).toBe(312);
        expect(syncRes.syncedProfile.setupFeeEur).toBe(295);
        expect(syncRes.syncedProfile.targetMarginPct).toBe(34);
        expect(syncRes.syncTelemetry.source).toBe('ONBOARDING_TO_WORKSPACE');
        expect(syncRes.syncTelemetry.ratesChecksum).toBe(checksum);

        // Verify MySQL printer_pricing_profiles row was updated
        const dbProf = mockDb.store.printer_pricing_profiles.find((p) => p.printer_id === 'node-bcn-01');
        expect(dbProf.target_margin_pct).toBe(34);
        expect(dbProf.minimum_job_fee).toBe(450);

        // Verify /api/pricing/profiles reflects the Onboarding calibration
        const workspaceView = getPricingProfiles('tenant-mysql-sync-1');
        expect(workspaceView.profiles[0].targetMarginPct).toBe(34);
        expect(workspaceView.profiles[0].hourlyRateEur).toBe(312);
    });

    it('3. Workspace -> Onboarding Sync: Updating a profile in /ops/pricing updates printer_nodes.rates_json and inserts an immutable revision in printhouse_pricing_revisions', async () => {
        const mockDb = createMockMySqlDb();

        const saveRes = await savePricingProfileAsync(
            'tenant-mysql-sync-1',
            {
                id: 'prof-bcn-xl106',
                nodeId: 'node-bcn-01',
                printerId: 'mach-bcn-xl106',
                printerName: 'Heidelberg Speedmaster XL 106-8P Barcelona',
                technology: 'OFFSET_B1',
                hourlyRateEur: 335,
                setupFeeEur: 275,
                plateCostEur: 25,
                targetMarginPct: 36,
                platformMarkupPct: 8,
                minimumJobFeeEur: 480
            },
            mockDb
        );

        expect(saveRes.ok).toBe(true);
        expect(saveRes.syncTelemetry.source).toBe('WORKSPACE_TO_ONBOARDING');

        // Verify `printer_nodes.rates_json` in MySQL was updated with the new workspace rates
        const updatedNode = mockDb.store.printer_nodes.find((n) => n.id === 'node-bcn-01');
        const parsedNodeRates = JSON.parse(updatedNode.rates_json);
        expect(parsedNodeRates.hourly_rate_eur).toBe(335);
        expect(parsedNodeRates.setup_fee_eur).toBe(275);
        expect(parsedNodeRates.target_margin_pct).toBe(36);
        expect(parsedNodeRates._workspace_profile.hourlyRateEur).toBe(335);

        // Verify immutable revision was recorded in `printhouse_pricing_revisions`
        expect(mockDb.store.printhouse_pricing_revisions.length).toBe(1);
        expect(mockDb.store.printhouse_pricing_revisions[0].rates_checksum).toBe(
            saveRes.syncTelemetry.ratesChecksum
        );
    });

    it('4. Enforces strict multi-tenant isolation between hydrated MySQL tenants and seed fallback tenants', async () => {
        const mockDb = createMockMySqlDb();
        const emptyTenantRes = await getPricingProfilesAsync('tenant-clean-no-db-rows', mockDb);

        // Clean fallback for tenant with zero rows in MySQL
        expect(emptyTenantRes.profiles.length).toBe(4);
        expect(emptyTenantRes.profiles[0].source).toBe('SEED_FALLBACK');

        // Ensure tenant-mysql-sync-1 changes never leaked into tenant-clean-no-db-rows
        expect(emptyTenantRes.profiles[0].hourlyRateEur).toBe(265);
    });

    it('5. Supports profile duplication (allowDuplicate) and deletion (deletePricingProfileAsync) in memory and MySQL', async () => {
        const mockDb = createMockMySqlDb();
        await getPricingProfilesAsync('tenant-mysql-sync-1', mockDb);

        const dupRes = await savePricingProfileAsync(
            'tenant-mysql-sync-1',
            {
                id: 'prof-bcn-indigo-copy-9999',
                printerId: 'mach-bcn-indigo-copy-9999',
                printerName: 'HP Indigo 15K Digital Press BCN (Copy)',
                technology: 'DIGITAL_TONER',
                hourlyRateEur: 110,
                setupFeeEur: 30,
                targetMarginPct: 35,
                minimumJobFeeEur: 90,
                allowDuplicate: true
            },
            mockDb
        );

        expect(dupRes.ok).toBe(true);
        expect(getPricingProfiles('tenant-mysql-sync-1').profiles.some((p) => p.id === 'prof-bcn-indigo-copy-9999')).toBe(
            true
        );

        const delRes = await deletePricingProfileAsync('tenant-mysql-sync-1', 'prof-bcn-indigo-copy-9999', mockDb);
        expect(delRes.ok).toBe(true);
        expect(delRes.deletedId).toBe('prof-bcn-indigo-copy-9999');
        expect(getPricingProfiles('tenant-mysql-sync-1').profiles.some((p) => p.id === 'prof-bcn-indigo-copy-9999')).toBe(
            false
        );
        expect(mockDb.store.printer_pricing_profiles.some((p) => p.id === 'prof-bcn-indigo-copy-9999')).toBe(false);
    });
});

