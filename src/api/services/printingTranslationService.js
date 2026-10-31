/**
 * src/api/services/printingTranslationService.js
 *
 * Phase 194E — Printing Terminology Translation & Domain Normalization Service
 *
 * Responsibilities:
 * 1. Translates natural language printing terms between German, English, and Spanish.
 * 2. Preserves strict separation between ORIGINAL text, TRANSLATED text, and NORMALIZED canonical enums.
 * 3. Preserves numbers, dimensions (mm), currencies, machine/product codes, dates, and Pantone references intact.
 * 4. Deterministic glossary map prevents LLM hallucination of canonical enum values.
 */

const GLOSSARY_MAP = [
    {
        canonical: 'HARDCOVER',
        de: 'Festeinband',
        en: 'Hardcover',
        es: 'Tapa dura',
        matchRegex: /\b(festeinband|hardcover|tapa dura|hardback|casebound)\b/i
    },
    {
        canonical: 'SOFTCOVER',
        de: 'Softcover',
        en: 'Softcover',
        es: 'Rústica',
        matchRegex: /\b(softcover|broschur|rústica|rustica|paperback)\b/i
    },
    {
        canonical: 'THREAD_SEWN',
        de: 'Fadenheftung',
        en: 'Thread sewn',
        es: 'Cosido con hilo',
        matchRegex: /\b(fadenheftung|fadenheftung\b|thread sewn|sewn|cosido con hilo|cosido)\b/i
    },
    {
        canonical: 'PERFECT_BOUND',
        de: 'Klebebindung',
        en: 'Perfect bound',
        es: 'Encolado',
        matchRegex: /\b(klebebindung|perfect bound|encolado|pb)\b/i
    },
    {
        canonical: 'ROUNDED_SPINE',
        de: 'runder Rücken',
        en: 'Rounded spine',
        es: 'Lomo redondo',
        matchRegex: /\b(runder rücken|runder ruecken|rounded spine|lomo redondo)\b/i
    },
    {
        canonical: 'STRAIGHT_SPINE',
        de: 'gerader Rücken',
        en: 'Straight spine',
        es: 'Lomo recto',
        matchRegex: /\b(gerader rücken|gerader ruecken|straight spine|lomo recto)\b/i
    },
    {
        canonical: 'MATT_LAMINATED',
        de: 'matt laminiert',
        en: 'Matte laminated',
        es: 'Laminado mate',
        matchRegex: /\b(matt laminiert|matte laminated|laminado mate|mattfolie)\b/i
    },
    {
        canonical: 'GLOSS_LAMINATED',
        de: 'glanzlaminiert',
        en: 'Gloss laminated',
        es: 'Laminado brillo',
        matchRegex: /\b(glanzlaminiert|gloss laminated|laminado brillo|glanzfolie)\b/i
    },
    {
        canonical: 'SAMPLE_COPIES',
        de: 'Muster',
        en: 'Sample copies',
        es: 'Muestras',
        matchRegex: /\b(muster|sample copies|muestras|vva \d+ muster)\b/i
    },
    {
        canonical: 'DELIVERY_ADDRESS',
        de: 'Lieferadresse',
        en: 'Delivery address',
        es: 'Dirección de entrega',
        matchRegex: /\b(lieferadresse|delivery address|dirección de entrega|direccion de entrega)\b/i
    },
    {
        canonical: 'CARTONS',
        de: 'Kartons',
        en: 'Cartons',
        es: 'Cajas',
        matchRegex: /\b(kartons|cartons|cajas)\b/i
    },
    {
        canonical: 'PALLETS',
        de: 'Palette',
        en: 'Pallet',
        es: 'Palé',
        matchRegex: /\b(palette|paletten|pallet|pallets|palé|palets)\b/i
    }
];

class PrintingTranslationService {

    /**
     * Translates and normalizes printing terminology while preserving numeric spans.
     *
     * @param {string} sourceText - Original text from document
     * @param {string} sourceLang - Source language code ('de', 'en', 'es')
     * @param {string} targetLang - Target language code ('de', 'en', 'es')
     * @returns {{ original: string, translated: string, normalizedTerms: Array<{ original: string, translated: string, normalized: string }> }}
     */
    translateAndNormalize(sourceText, sourceLang = 'de', targetLang = 'en') {
        if (!sourceText || typeof sourceText !== 'string') {
            return {
                original: '',
                translated: '',
                normalizedTerms: []
            };
        }

        const original = sourceText.trim();
        let translated = original;
        const normalizedTerms = [];

        for (const entry of GLOSSARY_MAP) {
            if (entry.matchRegex.test(original)) {
                const sourceWord = (original.match(entry.matchRegex) || [])[0] || entry[sourceLang] || entry.de;
                const targetWord = entry[targetLang] || entry.en;

                normalizedTerms.push({
                    original: sourceWord,
                    translated: targetWord,
                    normalized: entry.canonical
                });

                // Replace term in translated string
                translated = translated.replace(entry.matchRegex, targetWord);
            }
        }

        return {
            original,
            translated,
            normalizedTerms
        };
    }

    /**
     * Maps raw printing term to canonical enum.
     */
    normalizeTerm(term) {
        if (!term || typeof term !== 'string') return null;
        for (const entry of GLOSSARY_MAP) {
            if (entry.matchRegex.test(term)) {
                return entry.canonical;
            }
        }
        return null;
    }
}

const serviceInstance = new PrintingTranslationService();
serviceInstance.GLOSSARY_MAP = GLOSSARY_MAP;

module.exports = serviceInstance;
