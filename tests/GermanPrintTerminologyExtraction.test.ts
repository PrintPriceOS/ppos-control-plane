import { describe, it, expect } from 'vitest';
import quoteInterpretationService from '../src/api/services/quoteDocumentInterpretationService';
import printingTranslationService from '../src/api/services/printingTranslationService';
import calibrationAssistantService from '../src/api/services/calibrationAssistantService';
import {
    normalizeLamination,
    canonicalizeToEngineBookSpec
} from '../src/ui/lib/bookSpecCanonicalizer';

describe('German (DE) Print Terminology Extraction & Normalization', () => {
    it('1. Extracts Mattfolienkaschierung, inline cover paper/weight, and 4/0-farbig from real DE quote line', () => {
        const text = [
            'Produkt: Bildband Hardcover',
            'Format: 210 x 297 mm',
            'Inhalt: 160 Seiten, 135g Bilderdruck matt, 4/4-farbig',
            'Umschlag: 300g Bilderdruck matt, 4/0-farbig, inkl. Mattfolienkaschierung',
            'Bindung: Festeinband, Fadenheftung'
        ].join('\n');

        const spec = quoteInterpretationService.extractTechnicalSpecification(text);
        expect(spec.family).toBe('HARDCOVER');
        expect(spec.bindingMethod).toBe('thread sewn');
        expect(spec.interiorPages).toBe(160);
        expect(spec.interiorWeightGsm).toBe(135);
        expect(spec.interiorColors).toBe('4/4');
        expect(spec.coverWeightGsm).toBe(300);
        expect(spec.coverColors).toBe('4/0');
        expect(spec.lamination).toBe('matt');
    });

    it('2. Maps all German matt, gloss, varnish, and explicit-none finishing terms accurately', () => {
        const mattCases = [
            'Mattfolie',
            'Mattfolienkaschierung',
            'Cellophanierung matt',
            'matt cellophaniert',
            'Mattkaschierung',
            'Samtfolie',
            'Soft-Touch-Folie'
        ];
        for (const term of mattCases) {
            const spec = quoteInterpretationService.extractTechnicalSpecification(`Umschlag: 300g Bilderdruck, ${term}`);
            expect(spec.lamination, `Expected matt for "${term}"`).toBe('matt');
            expect(normalizeLamination(term), `Expected canonical matt for "${term}"`).toBe('matt');
        }

        const glossCases = [
            'Glanzfolie',
            'Glanzfolienkaschierung',
            'Cellophanierung glänzend',
            'glänzend cellophaniert',
            'Glanzkaschierung'
        ];
        for (const term of glossCases) {
            const spec = quoteInterpretationService.extractTechnicalSpecification(`Umschlag: 300g Bilderdruck, ${term}`);
            expect(spec.lamination, `Expected gloss for "${term}"`).toBe('gloss');
            expect(normalizeLamination(term), `Expected canonical gloss for "${term}"`).toBe('gloss');
        }

        const varnishCases = [
            'Dispersionslack',
            'Schutzlack',
            'UV-Lack',
            'Offsetlack',
            'Drucklack',
            'matt lackiert',
            'glänzend lackiert'
        ];
        for (const term of varnishCases) {
            const spec = quoteInterpretationService.extractTechnicalSpecification(`Umschlag: 300g Bilderdruck, ${term}`);
            expect(spec.lamination, `Expected varnish for "${term}"`).toBe('varnish');
            expect(normalizeLamination(term), `Expected canonical varnish for "${term}"`).toBe('varnish');
        }

        const noneCases = [
            'ohne Veredelung',
            'keine Veredelung',
            'unveredelt',
            'ohne Kaschierung',
            'ohne Lack'
        ];
        for (const term of noneCases) {
            const spec = quoteInterpretationService.extractTechnicalSpecification(`Umschlag: 300g Bilderdruck matt, 4/0-farbig, ${term}`);
            expect(spec.lamination, `Expected none for "${term}"`).toBe('none');
            expect(normalizeLamination(term), `Expected canonical null for "${term}"`).toBeNull();
        }
    });

    it('3. Golden rule: NEVER assumes lamination when PDF only mentions matt paper without finishing', () => {
        const text = [
            'Format: 170 x 240 mm',
            'Inhalt: 200 Seiten, 115g Bilderdruck matt, 1/1-farbig',
            'Umschlag: 300g Bilderdruck matt, 4/0-farbig',
            'Bindung: Broschur, PUR-Bindung'
        ].join('\n');

        const spec = quoteInterpretationService.extractTechnicalSpecification(text);
        expect(spec.lamination).toBeUndefined();
        expect(spec.family).toBe('SOFTCOVER');
        expect(spec.bindingMethod).toBe('perfect bound');
        expect(spec.interiorColors).toBe('1/1');
        expect(spec.coverColors).toBe('4/0');
    });

    it('4. Maps German binding methods (Rückstichheftung, Drahtheftung, Spiralbindung, PUR-Bindung)', () => {
        const saddle = quoteInterpretationService.extractTechnicalSpecification('Bindung: Rückstichheftung, 32 Seiten, 4/4-farbig');
        expect(saddle.family).toBe('SADDLE_STITCH');
        expect(saddle.bindingMethod).toBe('saddle stitch');

        const wire = quoteInterpretationService.extractTechnicalSpecification('Bindung: Drahtheftung, 48 Seiten, 1/1-farbig');
        expect(wire.family).toBe('SADDLE_STITCH');
        expect(wire.bindingMethod).toBe('saddle stitch');

        const spiral = quoteInterpretationService.extractTechnicalSpecification('Bindung: Spiralbindung / Wire-O, 120 Seiten');
        expect(spiral.family).toBe('WIRE_O');
        expect(spiral.bindingMethod).toBe('wire-o');

        const pur = quoteInterpretationService.extractTechnicalSpecification('Broschur mit PUR-Bindung, 160 Seiten');
        expect(pur.family).toBe('SOFTCOVER');
        expect(pur.bindingMethod).toBe('perfect bound');
    });

    it('5. Canonicalizes DE offer specs cleanly in bookSpecCanonicalizer and calibrationAssistantService', () => {
        const canonical = canonicalizeToEngineBookSpec(
            {
                family: 'SOFTCOVER',
                interiorPages: 160,
                formatWidthMm: 170,
                formatHeightMm: 240,
                interiorColors: '4/4-farbig',
                coverColors: '4/0-farbig',
                interiorPaper: 'Bilderdruck matt',
                interiorWeightGsm: 115,
                coverPaper: 'Bilderdruckkarton',
                coverWeightGsm: 300,
                bindingMethod: 'PUR-Bindung',
                lamination: 'Dispersionslack',
                deliveryCountry: 'DE'
            },
            { quantity: 1000, manufacturingPrice: 2400 }
        );

        expect(canonical.valid).toBe(true);
        expect(canonical.bookSpec?.interior_print).toBe('4/4');
        expect(canonical.bookSpec?.cover_print).toBe('4/0');
        expect(canonical.bookSpec?.paper_type_interior).toBe('mc');
        expect(canonical.bookSpec?.paper_type_cover).toBe('artboard');
        expect(canonical.bookSpec?.binding_method).toBe('perfect bound');
        expect(canonical.bookSpec?.lamination).toBe('varnish');

        // Verify calibrationAssistantService AI validation gate normalizes German terms & preserves explicit null
        const aiNormalized = calibrationAssistantService._validateAndNormalizeAIResponse(
            {
                intent: 'SPEC_EXTRACTION',
                specPatch: {
                    copies: 1000,
                    interior_print: '1/1-farbig',
                    cover_print: '4/0-farbig',
                    binding_method: 'Fadenheftung',
                    paper_type_interior: 'Bilderdruck',
                    lamination: 'ohne Veredelung'
                },
                declaredCommercials: {},
                clarificationQuestions: [],
                explanation: 'OK',
                warnings: [],
                readyForValidation: true
            },
            'Umschlag 4/0-farbig ohne Veredelung',
            null,
            null
        );

        expect(aiNormalized.specPatch.interior_print).toBe('1/1');
        expect(aiNormalized.specPatch.cover_print).toBe('4/0');
        expect(aiNormalized.specPatch.binding_method).toBe('thread sewn');
        expect(aiNormalized.specPatch.paper_type_interior).toBe('mc');
        expect(aiNormalized.specPatch.lamination).toBeNull();

        // Verify glossary translation service recognizes German finishing terms
        const translated = printingTranslationService.translateAndNormalize(
            'Umschlag: 300g Bilderdruck, inkl. Mattfolienkaschierung, PUR-Bindung',
            'de',
            'en'
        );
        expect(translated.normalizedTerms.some((t: any) => t.normalized === 'MATT_LAMINATED')).toBe(true);
        expect(translated.normalizedTerms.some((t: any) => t.normalized === 'PERFECT_BOUND')).toBe(true);
    });
});
