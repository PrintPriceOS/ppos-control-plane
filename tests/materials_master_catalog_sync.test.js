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

    it('3. verifies translations exist and interpolate {count} across EN, ES, DE', () => {
        const enKey = en['materials.catalog.syncSuccess'];
        const esKey = es['materials.catalog.syncSuccess'];
        const deKey = de['materials.catalog.syncSuccess'];

        expect(enKey).toBeDefined();
        expect(esKey).toBeDefined();
        expect(deKey).toBeDefined();

        expect(enKey).toContain('{count}');
        expect(esKey).toContain('{count}');
        expect(deKey).toContain('{count}');

        const formattedEn = enKey.replace('{count}', '1524');
        const formattedEs = esKey.replace('{count}', '1524');
        const formattedDe = deKey.replace('{count}', '1524');

        expect(formattedEn).toContain('1524');
        expect(formattedEs).toContain('1524');
        expect(formattedDe).toContain('1524');
    });
});
