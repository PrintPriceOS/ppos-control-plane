/**
 * tests/materials_master_catalog_sync.test.js
 *
 * Verifies synchronization of the full European paper catalog (1,524 technical variants)
 * and i18n banner localization across en, de, es.
 */

import { describe, it, expect, vi } from 'vitest';
const industrialMaterialsService = require('../src/api/services/materials/industrialMaterialsCatalogService');
import { en } from '../src/ui/en';
import { es } from '../src/ui/es';
import { de } from '../src/ui/de';

describe('European Master Paper Catalog Sync & i18n Suite', () => {
    it('1. synchronizes variants via syncMasterIndustrialCatalog with simulated dbClient', async () => {
        const mockVariants = [
            {
                variant_id: 'var_test_01',
                product_id: 'prod_test_01',
                product_name: 'Munken Print White 1.5 90g 70x100',
                manufacturer: 'Arctic Paper',
                raw_category: 'OFFSET',
                gsm: 90,
                caliper_um: 135,
                bulk_factor: 1.5,
                width_mm: 700,
                height_mm: 1000,
                is_reel: 0,
                finish: 'UNCOATED',
                grain_direction: 'LONG_GRAIN'
            },
            {
                variant_id: 'var_test_02',
                product_id: 'prod_test_02',
                product_name: 'Invercote Creato 260g 64x92',
                manufacturer: 'Iggesund',
                raw_category: 'CARTON',
                gsm: 260,
                caliper_um: 290,
                bulk_factor: 1.115,
                width_mm: 640,
                height_mm: 920,
                is_reel: 0,
                finish: 'MATTE',
                grain_direction: 'SHORT_GRAIN'
            }
        ];

        const mockDb = {
            query: vi.fn().mockImplementation((sql) => {
                if (typeof sql === 'string' && sql.includes('FROM paper_variants')) {
                    return Promise.resolve(mockVariants);
                }
                return Promise.resolve([]);
            })
        };

        const result = await industrialMaterialsService.syncMasterIndustrialCatalog(
            { tenantId: 'tenant-test', printhouseId: 'ph-test' },
            mockDb
        );

        expect(result.ok).toBe(true);
        expect(result.syncedCount).toBe(2);
        expect(result.materials.length).toBe(2);
        expect(result.materials[0].name).toBe('Munken Print White 1.5 90g 70x100');
        expect(result.materials[1].material_type).toBe('BOARD_CARTON');
    });

    it('2. falls back cleanly to baseline European substrates when MySQL returns empty', async () => {
        const mockDb = {
            query: vi.fn().mockResolvedValue([])
        };

        const result = await industrialMaterialsService.syncMasterIndustrialCatalog(
            { tenantId: 'tenant-test', printhouseId: 'ph-test' },
            mockDb
        );

        expect(result.ok).toBe(true);
        expect(result.syncedCount).toBeGreaterThan(0);
        expect(result.materials.some((m) => m.name.includes('Munken') || m.name.includes('Coral'))).toBe(true);
    });

    it('3. verifies translations exist, interpolate {count}, and contain zero Spanish tokens in EN/DE locales', () => {
        const enKey = en['materials.syncSuccess'];
        const esKey = es['materials.syncSuccess'];
        const deKey = de['materials.syncSuccess'];

        expect(enKey).toBe(
            'European Master Paper Catalog ({count} technical variants from Munken, Fedrigoni, Sappi, Lecta, Stora Enso) synchronized successfully with MySQL.'
        );
        expect(deKey).toBe(
            'Europäischer Papier-Hauptkatalog ({count} technische Varianten von Munken, Fedrigoni, Sappi, Lecta, Stora Enso) erfolgreich mit MySQL synchronisiert.'
        );
        expect(esKey).toBe(
            'Catálogo Maestro Europeo de Papel ({count} variantes técnicas de Munken, Fedrigoni, Sappi, Lecta, Stora Enso) sincronizado con éxito en MySQL.'
        );

        const formattedEn = enKey.replace('{count}', '1524');
        const formattedDe = deKey.replace('{count}', '1524');
        const formattedEs = esKey.replace('{count}', '1524');

        expect(formattedEn).toContain('1524');
        expect(formattedDe).toContain('1524');
        expect(formattedEs).toContain('1524');

        // Zero Spanish tokens in EN/DE notifications
        const spanishTokens = ['Catálogo', 'sincronizado', 'éxito', 'variantes', 'Papel'];
        for (const token of spanishTokens) {
            expect(formattedEn).not.toContain(token);
            expect(formattedDe).not.toContain(token);
        }
    });

    it('4. verifies batch rate calculation formula preserves exact sheet price: (Width_m * Height_m * GSM / 1000) * Price_EUR_KG', async () => {
        const mockDb = {
            query: vi.fn().mockImplementation((sql) => {
                if (sql.includes('SELECT') && sql.includes('paper_variants')) {
                    return Promise.resolve([
                        [
                            {
                                variant_id: 'v-test-1',
                                product_name: 'Munken Print White 1.5 90g',
                                brand: 'Arctic Paper',
                                manufacturer: 'Arctic Paper',
                                raw_category: 'OFFSET',
                                gsm: 90,
                                caliper_um: 135,
                                bulk_factor: 1.50,
                                width_mm: 700,
                                height_mm: 1000,
                                is_reel: 0,
                                finish: 'UNCOATED',
                                grain_direction: 'LG'
                            },
                            {
                                variant_id: 'v-test-2',
                                product_name: 'Coral Book White 1.25 80g',
                                brand: 'Lecta / Torraspapel',
                                manufacturer: 'Lecta / Torraspapel',
                                raw_category: 'OFFSET',
                                gsm: 80,
                                caliper_um: 100,
                                bulk_factor: 1.25,
                                width_mm: 700,
                                height_mm: 1000,
                                is_reel: 0,
                                finish: 'UNCOATED',
                                grain_direction: 'LG'
                            }
                        ]
                    ]);
                }
                return Promise.resolve([{ affectedRows: 1 }]);
            })
        };

        const ratePerKg = 1.28;
        const result = await industrialMaterialsService.bulkActivateMasterVariants({
            variantIds: ['v-test-1', 'v-test-2'],
            ratePerKgEur: ratePerKg,
            scope: { tenantId: 'tenant-test', printhouseId: 'ph-test' },
            dbClient: mockDb
        });

        expect(result.ok).toBe(true);
        expect(result.activatedCount).toBe(2);

        // Formula: (Width_m * Height_m * GSM / 1000) * Price_EUR_KG
        // v-test-1: (0.7 * 1.0 * 90 / 1000) * 1.28 = 0.063 * 1.28 = 0.08064 -> rounded 4 decimals = 0.0806
        const expectedSheetPrice1 = Math.round(((0.7 * 1.0 * 90) / 1000) * ratePerKg * 10000) / 10000;
        expect(result.materials[0].cost_per_kg_eur).toBe(ratePerKg);
        expect(result.materials[0].cost_per_sheet_eur).toBe(expectedSheetPrice1);
        expect(result.materials[0].manufacturer).toBe('Arctic Paper');

        // v-test-2: (0.7 * 1.0 * 80 / 1000) * 1.28 = 0.056 * 1.28 = 0.07168 -> rounded 4 decimals = 0.0717
        const expectedSheetPrice2 = Math.round(((0.7 * 1.0 * 80) / 1000) * ratePerKg * 10000) / 10000;
        expect(result.materials[1].cost_per_kg_eur).toBe(ratePerKg);
        expect(result.materials[1].cost_per_sheet_eur).toBe(expectedSheetPrice2);
        expect(result.materials[1].manufacturer).toBe('Lecta / Torraspapel');
    });

    it('5. verifies full 1,524 master variants sync cleanly and update KPI counters dynamically', async () => {
        const simulated1524 = Array.from({ length: 1524 }, (_, idx) => ({
            variant_id: `var_1524_${idx + 1}`,
            product_id: `prod_1524_${idx + 1}`,
            product_name: idx % 2 === 0 ? `Munken Print White ${80 + (idx % 4) * 10}g` : `Coral Book White ${70 + (idx % 5) * 10}g`,
            manufacturer: idx % 2 === 0 ? 'Arctic Paper' : 'Lecta / Torraspapel',
            raw_category: idx % 10 === 0 ? 'CARTON' : 'OFFSET',
            gsm: idx % 10 === 0 ? 280 : 90,
            caliper_um: idx % 10 === 0 ? 336 : 113,
            bulk_factor: 1.25,
            width_mm: 700,
            height_mm: 1000,
            is_reel: idx % 15 === 0 ? 1 : 0,
            finish: 'UNCOATED',
            grain_direction: 'LONG_GRAIN'
        }));

        const mockDb = {
            query: vi.fn().mockImplementation((sql) => {
                if (typeof sql === 'string' && sql.includes('FROM paper_variants')) {
                    return Promise.resolve(simulated1524);
                }
                return Promise.resolve([]);
            })
        };

        const result = await industrialMaterialsService.syncMasterIndustrialCatalog(
            { tenantId: 'tenant-1524', printhouseId: 'ph-1524' },
            mockDb
        );

        expect(result.ok).toBe(true);
        expect(result.syncedCount).toBe(1524);
        expect(result.materials.length).toBe(1524);
        expect(result.kpiSummary.totalSubstrates).toBeGreaterThanOrEqual(1524);
        expect(result.kpiSummary.sheetfedCount).toBeGreaterThan(1000);
        expect(result.kpiSummary.reelCount).toBeGreaterThan(50);
    });

    it('6. verifies bulk CSV rate card parser matches variants and updates cost', async () => {
        const csvContent = `brand_or_name,grammage,format,price_eur_kg
Munken Print,90,70x100,1.52
Coral Book,80,70x100,1.38`;

        const mockDb = {
            query: vi.fn().mockResolvedValue([{ affectedRows: 1 }])
        };

        const result = await industrialMaterialsService.importPaperRateCardCsv({
            csvText: csvContent,
            scope: { tenantId: 'tenant-test', printhouseId: 'ph-test' },
            dbClient: mockDb
        });

        expect(result.ok).toBe(true);
        expect(result.importedCount).toBeGreaterThanOrEqual(2);
        const munken = result.materials.find(m => m.name.includes('Munken'));
        expect(munken).toBeDefined();
        expect(munken.cost_per_kg_eur).toBe(1.52);
    });
});
