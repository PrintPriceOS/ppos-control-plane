import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const {
    calculateGs1Mod10CheckDigit,
    validateSscc18,
    encodeGs1128BarcodeModules,
    generateSscc18,
    generateShipmentSsccBatch
} = require('../services/logistics/ssccGeneratorService');

describe('Phase 198C (LOGISTICS-05) — GS1-128 / SSCC-18 (NVE) Modulo-10 Check Digit & Generator Service', () => {
    it('Test 1: computes exact GS1 Modulo-10 check digits against official GS1 test vectors', () => {
        // Vector 1: Extension '0', Prefix '8412345', Serial '000000001'
        // 17-digit base: 08412345000000001
        // Weights from right to left (x3, x1):
        // pos1(1)*3 + pos10(5)*1 + pos11(4)*3 + pos12(3)*1 + pos13(2)*3 + pos14(1)*1 + pos15(4)*3 + pos16(8)*1 + pos17(0)*3
        // = 3 + 5 + 12 + 3 + 6 + 1 + 12 + 8 + 0 = 50 -> (10 - (50 % 10)) % 10 = 0
        const base17Prompt = '08412345000000001';
        const check1 = calculateGs1Mod10CheckDigit(base17Prompt);
        expect(check1).toBe(0);
        expect(validateSscc18(`${base17Prompt}${check1}`)).toBe(true);

        // Vector 2: Official GS1 General Specifications SSCC-18 example:
        // Base 17 digits: '00614141123456789' -> Check digit = 0 -> SSCC '006141411234567890'
        expect(calculateGs1Mod10CheckDigit('00614141123456789')).toBe(0);
        expect(validateSscc18('006141411234567890')).toBe(true);

        // Vector 3: Official GS1 example:
        // Base 17 digits: '10614141234567890' -> Check digit = 8 -> SSCC '106141412345678908'
        expect(calculateGs1Mod10CheckDigit('10614141234567890')).toBe(8);
        expect(validateSscc18('106141412345678908')).toBe(true);

        // Vector 4: DACH NVE / Zeitfracht Erfurt test vector:
        // Base 17 digits: '34012345000000001' -> Check digit = 7
        expect(calculateGs1Mod10CheckDigit('34012345000000001')).toBe(7);
        expect(validateSscc18('(00) 3 4012345 000000001 7')).toBe(true);
        expect(validateSscc18('(00) 3 4012345 000000001 9')).toBe(false);
    });

    it('Test 2: generates GS1-128 SSCC-18 with 7, 8, and 9-digit company prefixes, formatted HRI and plain barcode strings', () => {
        // 7-digit GS1 company prefix ('8412345') -> 9-digit serial reference
        const sscc7 = generateSscc18({
            extensionDigit: '0',
            companyPrefix: '8412345',
            serialReference: 1
        });
        expect(sscc7.extensionDigit).toBe('0');
        expect(sscc7.companyPrefix).toBe('8412345');
        expect(sscc7.serialReference).toBe('000000001');
        expect(sscc7.sscc18).toHaveLength(18);
        expect(sscc7.hriFormatted).toBe(`(00) 0 8412345 000000001 ${sscc7.checkDigit}`);
        expect(sscc7.gs1128Plain).toBe(`(00)${sscc7.sscc18}`);
        expect(validateSscc18(sscc7.hriFormatted)).toBe(true);

        // 8-digit GS1 company prefix ('40266350') -> 8-digit serial reference
        const sscc8 = generateSscc18({
            extensionDigit: '3',
            companyPrefix: '40266350',
            serialReference: 42
        });
        expect(sscc8.companyPrefix).toBe('40266350');
        expect(sscc8.serialReference).toBe('00000042');
        expect(sscc8.sscc18).toHaveLength(18);
        expect(validateSscc18(sscc8.sscc18)).toBe(true);

        // 9-digit GS1 company prefix ('841234567') -> 7-digit serial reference
        const sscc9 = generateSscc18({
            extensionDigit: '0',
            companyPrefix: '841234567',
            serialReference: 999
        });
        expect(sscc9.companyPrefix).toBe('841234567');
        expect(sscc9.serialReference).toBe('0000999');
        expect(sscc9.sscc18).toHaveLength(18);
        expect(validateSscc18(sscc9.sscc18)).toBe(true);
    });

    it('Test 3: encodes GS1-128 Subset C barcode modules with Start C (105), FNC1 (102), 10 digit pairs, Modulo-103 checksum and Stop (106)', () => {
        const sscc = generateSscc18({
            extensionDigit: '0',
            companyPrefix: '0614141',
            serialReference: 123456789
        });
        expect(sscc.sscc18).toBe('006141411234567890');

        const enc = encodeGs1128BarcodeModules(sscc.sscc18);
        expect(enc.symbology).toBe('GS1-128');
        expect(enc.codeSet).toBe('C');
        expect(enc.fnc1Prefix).toBe(true);
        expect(enc.encodedDigits).toBe('00006141411234567890');
        // Symbol sequence: Start C (105), FNC1 (102), 10 pairs ('00'..'90'), Checksum, Stop (106) -> 14 symbols total
        expect(enc.symbolValues).toHaveLength(14);
        expect(enc.symbolValues[0]).toBe(105);
        expect(enc.symbolValues[1]).toBe(102);
        expect(enc.symbolValues[2]).toBe(0); // AI '00'
        expect(enc.symbolValues[13]).toBe(106); // Stop
        // Total modules = 13 symbols * 11 modules + 1 Stop symbol * 13 modules = 156 modules
        expect(enc.totalModules).toBe(156);
        expect(enc.bars.length).toBeGreaterThan(35);
    });

    it('Test 4: generates sequential shipment pallet SSCC batches and rejects malformed company prefixes', () => {
        const batch = generateShipmentSsccBatch({
            palletCount: 4,
            companyPrefix: '8412345',
            extensionDigit: '0',
            startSerial: 101
        });
        expect(batch).toHaveLength(4);
        expect(batch[0].palletLabel).toBe('Pallet 1 of 4');
        expect(batch[3].palletLabel).toBe('Pallet 4 of 4');
        expect(batch[0].serialReference).toBe('000000101');
        expect(batch[3].serialReference).toBe('000000104');
        expect(batch.every(item => validateSscc18(item.sscc18))).toBe(true);

        // Reject invalid GS1 company prefix length (<7 or >9 digits)
        expect(() => generateSscc18({ companyPrefix: '12345' })).toThrow(/INVALID_GS1_COMPANY_PREFIX/);
        expect(() => calculateGs1Mod10CheckDigit('ABC')).toThrow(/INVALID_GS1_PAYLOAD/);
    });
});
