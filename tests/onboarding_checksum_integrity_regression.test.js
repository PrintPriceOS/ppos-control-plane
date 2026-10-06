import { describe, test, expect } from 'vitest';
const calibrationSessionService = require('../src/api/services/calibrationSessionService');
const {
    normalizeSha256Hex,
    describeInvalidChecksum,
    verifyRatesChecksumIntegrity,
    computeCanonicalRatesChecksum,
    canonicalStringify
} = require('../scripts/test_onboarding_connected_suite');

describe('Onboarding Harness Checksum Integrity & Normalization Regressions', () => {
    const HASH_A = '08356ccedaa6377630e6f20e6bf674394d3b28edac46fbfd9621c37ef310f00d';
    const HASH_B = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    describe('1. Hexadecimal puro equivalente', () => {
        test('1.1 Acepta digests idénticos en hexadecimal puro de 64 caracteres en minúscula', () => {
            const res = verifyRatesChecksumIntegrity(HASH_A, HASH_A);
            expect(res.valid).toBe(true);
            expect(res.storedNormalized).toBe(HASH_A);
            expect(res.computedNormalized).toBe(HASH_A);
            expect(res.error).toBeNull();
        });

        test('1.2 Normaliza hexadecimal en mayúsculas a minúsculas y valida identidad estricta', () => {
            const upperHash = HASH_A.toUpperCase();
            const res = verifyRatesChecksumIntegrity(upperHash, HASH_A);
            expect(res.valid).toBe(true);
            expect(res.storedNormalized).toBe(HASH_A);
            expect(res.computedNormalized).toBe(HASH_A);
            expect(res.error).toBeNull();
        });

        test('1.3 Normaliza hexadecimal con mezcla de mayúsculas y minúsculas', () => {
            const mixedA = '08356CCEDAA6377630e6f20e6bf674394D3B28edac46fbfd9621c37ef310F00D';
            const mixedB = '08356ccedaa6377630E6F20E6BF674394d3b28EDAC46FBFD9621C37EF310f00d';
            const res = verifyRatesChecksumIntegrity(mixedA, mixedB);
            expect(res.valid).toBe(true);
            expect(res.storedNormalized).toBe(HASH_A);
            expect(res.computedNormalized).toBe(HASH_A);
        });
    });

    describe('2. Formato sha256:<hash> equivalente', () => {
        test('2.1 Acepta almacenamiento en hex puro de 64 caracteres frente a cálculo con prefijo sha256:', () => {
            const stored = HASH_A;
            const computed = `sha256:${HASH_A}`;
            const res = verifyRatesChecksumIntegrity(stored, computed);
            expect(res.valid).toBe(true);
            expect(res.storedNormalized).toBe(HASH_A);
            expect(res.computedNormalized).toBe(HASH_A);
            expect(res.error).toBeNull();
        });

        test('2.2 Acepta almacenamiento con prefijo sha256: frente a cálculo en hex puro de 64 caracteres', () => {
            const stored = `sha256:${HASH_A}`;
            const computed = HASH_A;
            const res = verifyRatesChecksumIntegrity(stored, computed);
            expect(res.valid).toBe(true);
            expect(res.storedNormalized).toBe(HASH_A);
            expect(res.computedNormalized).toBe(HASH_A);
            expect(res.error).toBeNull();
        });

        test('2.3 Acepta ambos valores con prefijo sha256: e insensible a mayúsculas del prefijo', () => {
            const stored = `sha256:${HASH_A}`;
            const computed = `SHA256:${HASH_A.toUpperCase()}`;
            const res = verifyRatesChecksumIntegrity(stored, computed);
            expect(res.valid).toBe(true);
            expect(res.storedNormalized).toBe(HASH_A);
            expect(res.computedNormalized).toBe(HASH_A);
            expect(res.error).toBeNull();
        });
    });

    describe('3. Hash válido pero diferente', () => {
        test('3.1 Rechaza estrictamente digests válidos pero divergentes', () => {
            const res = verifyRatesChecksumIntegrity(HASH_A, HASH_B);
            expect(res.valid).toBe(false);
            expect(res.storedNormalized).toBe(HASH_A);
            expect(res.computedNormalized).toBe(HASH_B);
            expect(res.error).toContain(HASH_A);
            expect(res.error).toContain(HASH_B);
            expect(res.error).toMatch(/Checksum mismatch/i);
        });

        test('3.2 Rechaza divergencia incluso con prefijo sha256: en uno o ambos valores', () => {
            const res = verifyRatesChecksumIntegrity(`sha256:${HASH_A}`, HASH_B);
            expect(res.valid).toBe(false);
            expect(res.storedNormalized).toBe(HASH_A);
            expect(res.computedNormalized).toBe(HASH_B);
        });

        test('3.3 No filtra tarifas, tokens Bearer, contraseñas ni datos sensibles en el diagnóstico de error', () => {
            const res = verifyRatesChecksumIntegrity(HASH_A, HASH_B);
            expect(res.error).not.toContain('rates_json');
            expect(res.error).not.toContain('Bearer');
            expect(res.error).not.toContain('password');
            expect(res.error).not.toContain('email');
            expect(res.error).not.toContain('token');
        });
    });

    describe('4. Formatos inválidos y valores ausentes', () => {
        test('4.1 Rechaza valores ausentes (null, undefined, cadena vacía y solo espacios)', () => {
            expect(normalizeSha256Hex(null)).toBeNull();
            expect(normalizeSha256Hex(undefined)).toBeNull();
            expect(normalizeSha256Hex('')).toBeNull();
            expect(normalizeSha256Hex('   ')).toBeNull();

            const resNull = verifyRatesChecksumIntegrity(null, HASH_A);
            expect(resNull.valid).toBe(false);
            expect(resNull.storedNormalized).toBeNull();
            expect(resNull.error).toBe('[origen: stored] [tipo: null] [motivo: Valor ausente o tipo no string]');

            const resUndef = verifyRatesChecksumIntegrity(HASH_A, undefined);
            expect(resUndef.valid).toBe(false);
            expect(resUndef.computedNormalized).toBeNull();
            expect(resUndef.error).toBe('[origen: computed] [tipo: undefined] [motivo: Valor ausente o tipo no string]');

            const resEmpty = verifyRatesChecksumIntegrity('', HASH_A);
            expect(resEmpty.valid).toBe(false);
            expect(resEmpty.storedNormalized).toBeNull();
            expect(resEmpty.error).toBe('[origen: stored] [tipo: string] [longitud: 0] [motivo: Cadena vacía o solo espacios en blanco]');

            const resSpaces = verifyRatesChecksumIntegrity(HASH_A, '   ');
            expect(resSpaces.valid).toBe(false);
            expect(resSpaces.computedNormalized).toBeNull();
            expect(resSpaces.error).toBe('[origen: computed] [tipo: string] [longitud: 3] [motivo: Cadena vacía o solo espacios en blanco]');
        });

        test('4.2 Rechaza tipos no string (números, booleanos, objetos, arrays)', () => {
            expect(normalizeSha256Hex(12345)).toBeNull();
            expect(normalizeSha256Hex(true)).toBeNull();
            expect(normalizeSha256Hex({})).toBeNull();
            expect(normalizeSha256Hex([HASH_A])).toBeNull();

            const resNum = verifyRatesChecksumIntegrity(12345, HASH_A);
            expect(resNum.valid).toBe(false);
            expect(resNum.storedNormalized).toBeNull();
            expect(resNum.error).toBe('[origen: stored] [tipo: number] [motivo: Valor ausente o tipo no string]');

            const resObj = verifyRatesChecksumIntegrity(HASH_A, {});
            expect(resObj.valid).toBe(false);
            expect(resObj.computedNormalized).toBeNull();
            expect(resObj.error).toBe('[origen: computed] [tipo: object] [motivo: Valor ausente o tipo no string]');
        });

        test('4.3 Rechaza longitudes incorrectas (distintas de exactamente 64 hex chars)', () => {
            const short63 = HASH_A.slice(0, 63);
            const long65 = HASH_A + 'a';
            const md5Length32 = HASH_A.slice(0, 32);

            expect(normalizeSha256Hex(short63)).toBeNull();
            expect(normalizeSha256Hex(long65)).toBeNull();
            expect(normalizeSha256Hex(md5Length32)).toBeNull();

            expect(normalizeSha256Hex(`sha256:${short63}`)).toBeNull();
            expect(normalizeSha256Hex(`sha256:${long65}`)).toBeNull();

            const resShort = verifyRatesChecksumIntegrity(short63, HASH_A);
            expect(resShort.valid).toBe(false);
            expect(resShort.storedNormalized).toBeNull();
            expect(resShort.error).toBe('[origen: stored] [tipo: string] [longitud: 63] [motivo: Longitud inválida para digest hexadecimal puro (esperado 64, recibido 63)]');

            const resLong = verifyRatesChecksumIntegrity(HASH_A, `sha256:${long65}`);
            expect(resLong.valid).toBe(false);
            expect(resLong.computedNormalized).toBeNull();
            expect(resLong.error).toBe('[origen: computed] [tipo: string] [longitud: 72] [motivo: Longitud inválida tras prefijo sha256: (esperado 64 hex chars, recibido 65)]');
        });

        test('4.4 Rechaza caracteres no hexadecimales y corrupción de digest', () => {
            const nonHexChar = HASH_A.slice(0, 63) + 'g';
            const nonHexCharZ = HASH_A.slice(0, 63) + 'z';
            const specialChars = HASH_A.slice(0, 63) + '!';

            expect(normalizeSha256Hex(nonHexChar)).toBeNull();
            expect(normalizeSha256Hex(nonHexCharZ)).toBeNull();
            expect(normalizeSha256Hex(specialChars)).toBeNull();

            expect(normalizeSha256Hex(`sha256:${nonHexChar}`)).toBeNull();

            const resNonHex = verifyRatesChecksumIntegrity(nonHexChar, HASH_A);
            expect(resNonHex.valid).toBe(false);
            expect(resNonHex.storedNormalized).toBeNull();
            expect(resNonHex.error).toBe('[origen: stored] [tipo: string] [longitud: 64] [motivo: Caracteres no hexadecimales en digest]');

            const resNonHexPrefixed = verifyRatesChecksumIntegrity(HASH_A, `sha256:${nonHexCharZ}`);
            expect(resNonHexPrefixed.valid).toBe(false);
            expect(resNonHexPrefixed.computedNormalized).toBeNull();
            expect(resNonHexPrefixed.error).toBe('[origen: computed] [tipo: string] [longitud: 71] [motivo: Caracteres no hexadecimales tras prefijo sha256:]');
        });

        test('4.5 Rechaza prefijos inválidos, duplicados o aislados sin digest (sin stripping indiscriminado)', () => {
            expect(normalizeSha256Hex('sha256:')).toBeNull();
            expect(normalizeSha256Hex('sha256:short')).toBeNull();
            expect(normalizeSha256Hex(`sha256:sha256:${HASH_A}`)).toBeNull();
            expect(normalizeSha256Hex(`md5:${HASH_A}`)).toBeNull();
            expect(normalizeSha256Hex(`sha512:${HASH_A}`)).toBeNull();

            const resDouble = verifyRatesChecksumIntegrity(`sha256:sha256:${HASH_A}`, HASH_A);
            expect(resDouble.valid).toBe(false);
            expect(resDouble.storedNormalized).toBeNull();
            expect(resDouble.error).toContain('[origen: stored]');
            expect(resDouble.error).toContain('[tipo: string]');
        });
    });

    describe('5. Interoperabilidad directa con calibrationSessionService', () => {
        test('5.1 calibrationSessionService genera hex puro y el harness valida coincidencia canónica', () => {
            const ratesObj = {
                interior_full_colour_fixed: { '16p': 48, '32p': 80 },
                interior_full_colour_var: { '16p': 20, '32p': 35 },
                lam_fixed: { matt: 40, gloss: 40 }
            };

            // calibrationSessionService computes 64 pure hex chars
            const serviceHex = calibrationSessionService.computeRatesChecksum(ratesObj);
            expect(serviceHex).toMatch(/^[0-9a-f]{64}$/);

            // Harness computes sha256:<hex>
            const harnessPrefixed = computeCanonicalRatesChecksum(ratesObj);
            expect(harnessPrefixed).toBe(`sha256:${serviceHex}`);

            // Verification helper normalizes and confirms strict equality
            const integrity = verifyRatesChecksumIntegrity(serviceHex, harnessPrefixed);
            expect(integrity.valid).toBe(true);
            expect(integrity.storedNormalized).toBe(serviceHex);
            expect(integrity.computedNormalized).toBe(serviceHex);
        });
    });

    describe('6. Diagnósticos sanitizados sin filtración de datos sensibles (Zero Secret Leakage)', () => {
        const sensitiveCases = [
            {
                label: 'token Bearer ficticio',
                val: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkbWluIn0.superSecretSignatureDoNotLeak',
                leakSubstrings: ['Bearer', 'eyJ', 'superSecretSignatureDoNotLeak', 'Admin']
            },
            {
                label: 'contraseña ficticia de administración',
                val: 'SuperSecretAdminPassword123!#%&_database_root_master_pass',
                leakSubstrings: ['SuperSecretAdminPassword', 'database_root', 'master_pass']
            },
            {
                label: 'contenido JSON ficticio con tarifas y claves de API',
                val: JSON.stringify({ secretApiKey: 'sk-live-1234567890abcdef', rates: { price: 9999, discount: 'superSecretDiscount' } }),
                leakSubstrings: ['secretApiKey', 'sk-live', 'superSecretDiscount', '9999', 'price', 'rates']
            },
            {
                label: 'token con prefijo sha256: pero contenido sensible no hex',
                val: 'sha256:Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidTokenWithSensitiveContent',
                leakSubstrings: ['Bearer', 'invalidTokenWithSensitiveContent']
            }
        ];

        for (const item of sensitiveCases) {
            test(`6.X Diagnóstico no filtra ${item.label} cuando actúa como stored`, () => {
                const res = verifyRatesChecksumIntegrity(item.val, HASH_A);
                expect(res.valid).toBe(false);
                expect(res.storedNormalized).toBeNull();
                expect(res.computedNormalized).toBe(HASH_A);
                expect(res.error).toContain('[origen: stored]');
                expect(res.error).toContain('[tipo: string]');
                expect(res.error).toContain(`[longitud: ${item.val.length}]`);
                expect(res.error).toContain('[motivo:');
                for (const sub of item.leakSubstrings) {
                    expect(res.error).not.toContain(sub);
                }
            });

            test(`6.X Diagnóstico no filtra ${item.label} cuando actúa como computed`, () => {
                const res = verifyRatesChecksumIntegrity(HASH_A, item.val);
                expect(res.valid).toBe(false);
                expect(res.storedNormalized).toBe(HASH_A);
                expect(res.computedNormalized).toBeNull();
                expect(res.error).toContain('[origen: computed]');
                expect(res.error).toContain('[tipo: string]');
                expect(res.error).toContain(`[longitud: ${item.val.length}]`);
                expect(res.error).toContain('[motivo:');
                for (const sub of item.leakSubstrings) {
                    expect(res.error).not.toContain(sub);
                }
            });
        }
    });
});
