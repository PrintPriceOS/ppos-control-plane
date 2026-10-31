import { describe, test, expect, beforeEach, afterEach } from 'vitest';
const calibrationSessionService = require('../src/api/services/calibrationSessionService');
const {
    normalizeSha256Hex,
    describeInvalidChecksum,
    verifyRatesChecksumIntegrity,
    computeCanonicalRatesChecksum,
    canonicalStringify,
    resolveConnectedMysqlPassword,
    getDirectMysqlConnectionConfig,
    REQUIRED_MYSQL,
    parseAndValidatePointResultsJson,
    formatCurveMetricsDiagnostic,
    runCurveHarnessRegressions
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

    describe('7. Regresión de alcance de mysqlPassword y preparación de conexión MySQL', () => {
        let originalPposPass;
        let originalMysqlPass;

        beforeEach(() => {
            originalPposPass = process.env.PPOS_TEST_MYSQL_PASSWORD;
            originalMysqlPass = process.env.MYSQL_PASSWORD;
        });

        afterEach(() => {
            if (originalPposPass !== undefined) process.env.PPOS_TEST_MYSQL_PASSWORD = originalPposPass;
            else delete process.env.PPOS_TEST_MYSQL_PASSWORD;
            if (originalMysqlPass !== undefined) process.env.MYSQL_PASSWORD = originalMysqlPass;
            else delete process.env.MYSQL_PASSWORD;
        });

        test('7.1 Resuelve la contraseña desde PPOS_TEST_MYSQL_PASSWORD con alcance correcto y sin ReferenceError', () => {
            process.env.PPOS_TEST_MYSQL_PASSWORD = 'vitest_scope_pass_2026';
            delete process.env.MYSQL_PASSWORD;

            expect(() => resolveConnectedMysqlPassword()).not.toThrow();
            const pwd = resolveConnectedMysqlPassword();
            expect(pwd).toBe('vitest_scope_pass_2026');
        });

        test('7.2 getDirectMysqlConnectionConfig prepara la conexión con parámetros estrictos e identidad aislada', () => {
            process.env.PPOS_TEST_MYSQL_PASSWORD = 'vitest_scope_pass_2026';
            delete process.env.MYSQL_PASSWORD;

            const config = getDirectMysqlConnectionConfig();
            expect(config.host).toBe(REQUIRED_MYSQL.host);
            expect(config.port).toBe(REQUIRED_MYSQL.port);
            expect(config.user).toBe(REQUIRED_MYSQL.user);
            expect(config.database).toBe(REQUIRED_MYSQL.database);
            expect(config.password).toBe('vitest_scope_pass_2026');
            expect(typeof config.password).toBe('string');
        });

        test('7.3 Lanza MISSING_TEST_PASSWORD y NUNCA ReferenceError cuando la contraseña está ausente', () => {
            delete process.env.PPOS_TEST_MYSQL_PASSWORD;
            delete process.env.MYSQL_PASSWORD;

            let caught = null;
            try {
                resolveConnectedMysqlPassword();
            } catch (e) {
                caught = e;
            }

            expect(caught).not.toBeNull();
            expect(caught).toBeInstanceOf(Error);
            expect(caught).not.toBeInstanceOf(ReferenceError);
            expect(caught.message).toContain('MISSING_TEST_PASSWORD');
            expect(caught.message).toContain('PPOS_TEST_MYSQL_PASSWORD');
        });

        test('7.4 PPOS_TEST_MYSQL_PASSWORD ausente + MYSQL_PASSWORD configurada rechaza con MISSING_TEST_PASSWORD (cero fallback)', () => {
            delete process.env.PPOS_TEST_MYSQL_PASSWORD;
            process.env.MYSQL_PASSWORD = 'unauthorized_inherited_db_secret';

            let caught = null;
            try {
                resolveConnectedMysqlPassword();
            } catch (e) {
                caught = e;
            }

            expect(caught).not.toBeNull();
            expect(caught.message).toContain('MISSING_TEST_PASSWORD');
            expect(caught.message).toContain('PPOS_TEST_MYSQL_PASSWORD');
            expect(caught.message).not.toContain('unauthorized_inherited_db_secret');
        });

        test('7.5 Rechaza cadena vacía o solo espacios en PPOS_TEST_MYSQL_PASSWORD', () => {
            process.env.PPOS_TEST_MYSQL_PASSWORD = '   ';
            delete process.env.MYSQL_PASSWORD;

            expect(() => resolveConnectedMysqlPassword()).toThrowError(/MISSING_TEST_PASSWORD/);
        });

        test('7.6 Rechaza regression_mode_placeholder en preparación de conexión directa', () => {
            process.env.PPOS_TEST_MYSQL_PASSWORD = 'regression_mode_placeholder';
            delete process.env.MYSQL_PASSWORD;

            expect(() => resolveConnectedMysqlPassword()).toThrowError(/MISSING_TEST_PASSWORD/);
            expect(() => getDirectMysqlConnectionConfig()).toThrowError(/MISSING_TEST_PASSWORD/);
        });

        test('7.7 Verificación estática: scripts/test_onboarding_connected_suite.js no contiene referencias no declaradas ni fallback a MYSQL_PASSWORD', () => {
            const fs = require('fs');
            const path = require('path');
            const harnessPath = path.resolve(__dirname, '../scripts/test_onboarding_connected_suite.js');
            const harnessCode = fs.readFileSync(harnessPath, 'utf8');

            const runConnectedSuiteMatch = harnessCode.match(/async function runConnectedSuite\(\)[\s\S]*?\n\}/);
            expect(runConnectedSuiteMatch).not.toBeNull();
            const body = runConnectedSuiteMatch[0];
            expect(body).not.toMatch(/password:\s*mysqlPassword\b/);
            expect(body).toContain('getDirectMysqlConnectionConfig');

            // resolveConnectedMysqlPassword must NOT fall back to MYSQL_PASSWORD or sharedMysqlPassword
            const resolveMatch = harnessCode.match(/function resolveConnectedMysqlPassword\(\)[\s\S]*?\n\}/);
            expect(resolveMatch).not.toBeNull();
            const resolveBody = resolveMatch[0];
            expect(resolveBody).not.toContain('sharedMysqlPassword');
            expect(resolveBody).not.toMatch(/process\.env\.MYSQL_PASSWORD/);
        });
    });

    describe('8. Multi-quantity Curve Harness Regressions', () => {
        test('8.1 Ejecuta satisfactoriamente runCurveHarnessRegressions (Suites 7-11: multi-target generation, solver contract, governance gate, zero leakage, dual point_results parsing)', () => {
            expect(() => runCurveHarnessRegressions()).not.toThrow();
        });
    });

    describe('9. parseAndValidatePointResultsJson (Dual parsing, validación estricta de array y rechazo contextual)', () => {
        const fixtureArray = [
            { quantity: 100, targetManufacturingPrice: 50.0, predictedManufacturingPrice: 50.0, withinTolerance: true },
            { quantity: 500, targetManufacturingPrice: 200.0, predictedManufacturingPrice: 200.0, withinTolerance: true }
        ];

        test('9.1 Cadena JSON válida de array devuelve el array correctamente parseado con todos sus elementos', () => {
            const jsonStr = JSON.stringify(fixtureArray);
            const parsed = parseAndValidatePointResultsJson(jsonStr, 'Test 9.1 JSON String');
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed).toHaveLength(2);
            expect(parsed[0].quantity).toBe(100);
            expect(parsed[1].quantity).toBe(500);
        });

        test('9.2 Array nativo devuelto por MySQL driver es devuelto directamente sin alteración', () => {
            const result = parseAndValidatePointResultsJson(fixtureArray, 'Test 9.2 Native Array');
            expect(Array.isArray(result)).toBe(true);
            expect(result).toBe(fixtureArray);
            expect(result).toHaveLength(2);
        });

        test('9.3 JSON malformado es rechazado con error contextual que incluye diagnóstico y sin catch silencioso', () => {
            const malformed = '[{"quantity": 100, "broken":';
            expect(() => parseAndValidatePointResultsJson(malformed, 'Test 9.3 Malformed JSON')).toThrowError(
                /\[POINT_RESULTS_VALIDATION_ERROR\] Test 9.3 Malformed JSON: Malformed JSON string/
            );
        });

        test('9.4 Objeto no array (tanto cadena JSON como objeto nativo) es rechazado con diagnóstico contextual', () => {
            const nonArrayJson = '{"quantity": 100, "price": 50}';
            expect(() => parseAndValidatePointResultsJson(nonArrayJson, 'Test 9.4a JSON Object')).toThrowError(
                /\[POINT_RESULTS_VALIDATION_ERROR\] Test 9.4a JSON Object: Parsed JSON root is not an array \(received: object\)/
            );

            const nonArrayNative = { quantity: 100, price: 50 };
            expect(() => parseAndValidatePointResultsJson(nonArrayNative, 'Test 9.4b Native Object')).toThrowError(
                /\[POINT_RESULTS_VALIDATION_ERROR\] Test 9.4b Native Object: Expected string or array, received unsupported type object/
            );
        });

        test('9.5 Null y undefined son rechazados explícitamente con diagnóstico contextual claro', () => {
            expect(() => parseAndValidatePointResultsJson(null, 'Test 9.5a Null Value')).toThrowError(
                /\[POINT_RESULTS_VALIDATION_ERROR\] Test 9.5a Null Value: Value is null or undefined/
            );
            expect(() => parseAndValidatePointResultsJson(undefined, 'Test 9.5b Undefined Value')).toThrowError(
                /\[POINT_RESULTS_VALIDATION_ERROR\] Test 9.5b Undefined Value: Value is null or undefined/
            );
        });
    });

    describe('10. curveMetrics Phase-Specific Contract & Sanitized Diagnostic Regressions', () => {
        test('10.1 Solver /calculate produce métricas agregadas y NO incluye acceptedPointCount ni rejectedPointCount', () => {
            const deterministicSolver = require('../src/api/services/deterministicInversePricingSolver');
            const BOOK_SPEC = {
                format: '148x210',
                pages: 72,
                runWastePercentage: 0.05,
                copies: 1500,
                colorsFront: 4,
                colorsBack: 4,
                paper: 'offset',
                paperGsm: 90,
                coverColorsFront: 4,
                coverColorsBack: 0,
                coverPaper: 'mc',
                coverGsm: 250,
                lamination: 'matt',
                binding: 'pb'
            };
            const TARGETS = [
                { quantity: 100, targetManufacturingPrice: 50.0 },
                { quantity: 200, targetManufacturingPrice: 80.0 }
            ];
            const rates = {
                interior_full_colour_fixed: { '16p': 100 },
                interior_full_colour_var: { '16p': 50 },
                cover_fixed_by_colours: { '4': 40 },
                cover_var_per_1000_by_colours: { '4': 30 },
                lam_fixed: { matt: 20 },
                lam_var_per_1000: { matt: 15 },
                binding_pb_fixed_by_sections: { '5': 25 },
                binding_pb_var_per_1000_by_sections: { '5': 10 },
                paper_interior_fixed_by_colours: 50,
                paper_interior_var_per_1000_by_colours: 20,
                paper_cover_fixed_by_colours: 30,
                paper_cover_var_per_1000_by_colours: 15,
                paper_waste_for_binding: { pb: 0.04 },
                paper_price_interior_by_kilo: { offset: 1.2 },
                paper_price_cover_by_kilo: { mc: 1.5 }
            };

            const solverRes = deterministicSolver.solveMultiQuantity({
                bookSpec: BOOK_SPEC,
                currentRatesSnapshot: rates,
                multiTargets: TARGETS
            });

            expect(solverRes.curveMetrics).toBeDefined();
            expect(solverRes.curveMetrics.pointCount).toBe(2);
            expect(typeof solverRes.curveMetrics.meanAbsoluteResidual).toBe('number');
            expect(typeof solverRes.curveMetrics.maxAbsoluteResidual).toBe('number');
            expect(typeof solverRes.curveMetrics.meanPercentageResidual).toBe('number');
            expect(typeof solverRes.curveMetrics.maxPercentageResidual).toBe('number');
            expect(typeof solverRes.curveMetrics.objectiveValue).toBe('number');

            // Crucial: acceptance counts are strictly undefined in solver /calculate phase
            expect(solverRes.curveMetrics.acceptedPointCount).toBeUndefined();
            expect(solverRes.curveMetrics.rejectedPointCount).toBeUndefined();
        });

        test('10.2 evaluateCurveAcceptance produce métricas de aceptación de gobernanza', () => {
            const acceptanceService = require('../src/api/services/calibrationAcceptanceService');
            const session = {
                book_spec_json: { copies: 100 },
                multi_targets_json: [{ quantity: 100, targetManufacturingPrice: 50.0 }],
                target_manufacturing_price: 50.0
            };
            const run = { identifiability_json: { status: 'EXACTLY_DETERMINED' } };
            const rates = {
                interior_full_colour_fixed: { '16p': 100 },
                interior_full_colour_var: { '16p': 50 },
                cover_fixed_by_colours: { '4': 40 },
                cover_var_per_1000_by_colours: { '4': 30 },
                lam_fixed: { matt: 20 },
                lam_var_per_1000: { matt: 15 },
                binding_pb_fixed_by_sections: { '5': 25 },
                binding_pb_var_per_1000_by_sections: { '5': 10 },
                paper_interior_fixed_by_colours: 50,
                paper_interior_var_per_1000_by_colours: 20,
                paper_cover_fixed_by_colours: 30,
                paper_cover_var_per_1000_by_colours: 15,
                paper_waste_for_binding: { pb: 0.04 },
                paper_price_interior_by_kilo: { offset: 1.2 },
                paper_price_cover_by_kilo: { mc: 1.5 }
            };
            const bookSpec = { copies: 100, pages: 16 };
            const nodeConfig = { signatures: null, production_lead_days: 7, delivery_time: 2 };

            const govRes = acceptanceService.evaluateCurveAcceptance(session, run, rates, bookSpec, nodeConfig);
            expect(govRes.curveMetrics).toBeDefined();
            expect(typeof govRes.curveMetrics.acceptedPointCount).toBe('number');
            expect(typeof govRes.curveMetrics.rejectedPointCount).toBe('number');
            expect(typeof govRes.curveMetrics.allPointsWithinTolerance).toBe('boolean');
        });

        test('10.3 formatCurveMetricsDiagnostic sanitiza claves conocidas sin fugar secretos ni anidamientos no autorizados', () => {
            const rawMetrics = {
                pointCount: 8,
                meanAbsoluteResidual: 0.042,
                maxAbsoluteResidual: 0.125,
                acceptedPointCount: 8,
                rejectedPointCount: 0,
                secretPassword: 'super_secret_db_pass',
                bearerToken: 'Bearer eyJhbGciOiJIUzI1Ni...'
            };

            const diag = formatCurveMetricsDiagnostic(rawMetrics);
            expect(diag).toContain('"pointCount":8');
            expect(diag).toContain('"maxAbsoluteResidual":0.125');
            expect(diag).toContain('"acceptedPointCount":8');
            expect(diag).not.toContain('super_secret_db_pass');
            expect(diag).not.toContain('Bearer eyJhbGciOiJIUzI1Ni');

            // Handles non-object values safely
            expect(formatCurveMetricsDiagnostic(null)).toContain('null or not an object');
            expect(formatCurveMetricsDiagnostic(undefined)).toContain('null or not an object');
            expect(formatCurveMetricsDiagnostic('string_val')).toContain('null or not an object');
        });
    });
});
