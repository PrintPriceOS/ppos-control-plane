import { describe, it, expect } from 'vitest';
import { de } from '../src/ui/de';
import { en } from '../src/ui/en';
import { es } from '../src/ui/es';

function flattenDict(obj: Record<string, any>, prefix = ''): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj || {})) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            Object.assign(out, flattenDict(v, key));
        } else {
            out[key] = String(v ?? '');
        }
    }
    return out;
}

describe('Trilingual Parity Guardrail (DE / EN / ES) — Control Plane', () => {
    const fDe = flattenDict(de);
    const fEn = flattenDict(en);
    const fEs = flattenDict(es);

    const keysDe = Object.keys(fDe).sort();
    const keysEn = Object.keys(fEn).sort();
    const keysEs = Object.keys(fEs).sort();

    it('1. de.ts, en.ts, and es.ts have exact 1:1 structural key parity with zero missing keys', () => {
        const missingInDe = keysEs.filter((k) => !(k in fDe));
        const missingInEn = keysEs.filter((k) => !(k in fEn));
        const missingInEs = keysDe.filter((k) => !(k in fEs));

        expect(missingInDe, `Keys missing in de.ts: ${missingInDe.join(', ')}`).toEqual([]);
        expect(missingInEn, `Keys missing in en.ts: ${missingInEn.join(', ')}`).toEqual([]);
        expect(missingInEs, `Keys missing in es.ts: ${missingInEs.join(', ')}`).toEqual([]);
        expect(keysDe.length).toBe(keysEn.length);
        expect(keysDe.length).toBe(keysEs.length);
    });

    it('2. No translation value is empty or whitespace-only across DE, EN, and ES', () => {
        const emptyDe = keysDe.filter((k) => !fDe[k].trim());
        const emptyEn = keysEn.filter((k) => !fEn[k].trim());
        const emptyEs = keysEs.filter((k) => !fEs[k].trim());

        expect(emptyDe, `Empty values in de.ts: ${emptyDe.join(', ')}`).toEqual([]);
        expect(emptyEn, `Empty values in en.ts: ${emptyEn.join(', ')}`).toEqual([]);
        expect(emptyEs, `Empty values in es.ts: ${emptyEs.join(', ')}`).toEqual([]);
    });

    it('3. Critical printhouse onboarding, pricing, machines, and materials sections are genuinely localized in DE (no untranslated ES/EN copies)', () => {
        const CRITICAL_PREFIXES = [
            'guided.',
            'compare.',
            'accept.',
            'review.',
            'form.',
            'setup.machines.',
            'setup.materials.',
            'setup.pricing.',
            'setup.readiness.',
            'procurement.document.'
        ];

        // Short international technical acronyms/terms allowed to match across languages
        const ALLOWED_TECHNICAL_IDENTICAL = new Set([
            'PDF', 'CMYK', 'ISO', 'CTP', 'PUR', 'Wire-O', 'SLA', 'API', 'MCP',
            'EUR', 'USD', 'GBP', 'Softcover', 'Hardcover', 'Offset', 'Digital',
            'Standard', 'Express', 'Format:', 'Status:', 'System', 'Munken',
            'CMYK Standard', 'Rev #', 'Volumen', 'Preflight'
        ]);

        const untranslatedDeVsEs: string[] = [];
        const untranslatedDeVsEn: string[] = [];

        for (const k of keysDe) {
            if (!CRITICAL_PREFIXES.some((p) => k.startsWith(p))) continue;
            const vDe = fDe[k].trim();
            const vEn = fEn[k].trim();
            const vEs = fEs[k].trim();
            if (ALLOWED_TECHNICAL_IDENTICAL.has(vDe) || vDe.length <= 4) continue;

            if (vDe === vEs) untranslatedDeVsEs.push(`${k}="${vDe}"`);
            if (vDe === vEn) untranslatedDeVsEn.push(`${k}="${vDe}"`);
        }

        expect(untranslatedDeVsEs, `Untranslated DE keys identical to ES: ${untranslatedDeVsEs.join('; ')}`).toEqual([]);
        expect(untranslatedDeVsEn, `Untranslated DE keys identical to EN: ${untranslatedDeVsEn.join('; ')}`).toEqual([]);
    });
});
