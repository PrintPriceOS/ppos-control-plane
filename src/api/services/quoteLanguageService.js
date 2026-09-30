/**
 * src/api/services/quoteLanguageService.js
 *
 * Phase 194E — Multilingual Quote Language Detection Service
 *
 * Responsibilities:
 * 1. Detects document and user message language deterministically (German 'de', English 'en', Spanish 'es').
 * 2. Uses domain printing terminology, stopwords, and character frequency distributions.
 * 3. Returns language code, confidence score, and status ('CONFIDENT' vs 'REQUIRES_REVIEW').
 * 4. Extensible to additional languages (fr, it, pt, nl, pl).
 */

const GERMAN_KEYWORDS = [
    'auflage', 'angebot', 'abstand', 'festeinband', 'softcover', 'fadenheftung',
    'klebebindung', 'umschlag', 'inhalt', 'vorsatz', 'ruecken', 'rücken', 'kapitalband',
    'laminiert', 'stueck', 'stück', 'versand', 'fracht', 'gesamtpreis', 'einzelpreis',
    'lieferadresse', 'muster', 'seiten', 'papier', 'kartons', 'palette', 'nicht'
];

const ENGLISH_KEYWORDS = [
    'quantity', 'quote', 'quotation', 'hardcover', 'softcover', 'thread sewn',
    'perfect bound', 'cover', 'interior', 'endpapers', 'spine', 'headband',
    'laminated', 'copies', 'shipping', 'freight', 'total price', 'unit price',
    'delivery address', 'sample', 'pages', 'paper', 'cartons', 'pallet', 'not'
];

const SPANISH_KEYWORDS = [
    'tirada', 'presupuesto', 'cotizacion', 'cotización', 'tapa dura', 'rustica', 'rústica',
    'cosido', 'encolado', 'cubierta', 'interior', 'guardas', 'lomo', 'cabezada',
    'laminado', 'ejemplares', 'envio', 'envío', 'transporte', 'precio total', 'precio unitario',
    'direccion', 'dirección', 'muestras', 'paginas', 'páginas', 'papel', 'cajas', 'pale', 'palé'
];

class QuoteLanguageService {

    /**
     * Detects language of input text.
     *
     * @param {string} text - Raw or extracted text
     * @returns {{ detectedLanguage: string, confidence: number, status: string }}
     */
    detectLanguage(text) {
        if (!text || typeof text !== 'string' || !text.trim()) {
            return {
                detectedLanguage: 'en',
                confidence: 0,
                status: 'REQUIRES_REVIEW'
            };
        }

        const normalized = text.toLowerCase();

        let deScore = 0;
        let enScore = 0;
        let esScore = 0;

        for (const kw of GERMAN_KEYWORDS) {
            const count = (normalized.match(new RegExp(`\\b${kw}\\b`, 'g')) || []).length;
            deScore += count * 2;
        }

        for (const kw of ENGLISH_KEYWORDS) {
            const count = (normalized.match(new RegExp(`\\b${kw}\\b`, 'g')) || []).length;
            enScore += count * 2;
        }

        for (const kw of SPANISH_KEYWORDS) {
            const count = (normalized.match(new RegExp(`\\b${kw}\\b`, 'g')) || []).length;
            esScore += count * 2;
        }

        // Additional character frequency features (e.g. ä, ö, ü, ß for DE; ñ, ¡, ¿ for ES)
        if (/[äöüß]/.test(normalized)) deScore += 5;
        if (/[ñáéíóú¿¡]/.test(normalized)) esScore += 5;

        const totalScore = deScore + enScore + esScore;

        if (totalScore === 0) {
            return {
                detectedLanguage: 'en',
                confidence: 0.33,
                status: 'REQUIRES_REVIEW'
            };
        }

        let bestLang = 'en';
        let maxScore = enScore;

        if (deScore > maxScore) {
            bestLang = 'de';
            maxScore = deScore;
        }
        if (esScore > maxScore) {
            bestLang = 'es';
            maxScore = esScore;
        }

        const confidence = Number((maxScore / totalScore).toFixed(2));
        const status = confidence >= 0.50 ? 'CONFIDENT' : 'REQUIRES_REVIEW';

        return {
            detectedLanguage: bestLang,
            confidence,
            status
        };
    }
}

module.exports = new QuoteLanguageService();
