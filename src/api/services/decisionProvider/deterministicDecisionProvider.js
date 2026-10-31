/**
 * src/api/services/decisionProvider/deterministicDecisionProvider.js
 *
 * Phase 194F — Deterministic Decision Provider (Rule-Based Fallback)
 *
 * Always available, 100% predictable decision provider.
 */

const PRINT_TERMINOLOGY_MAP = {
  // German
  'festeinband': 'HARDCOVER',
  'hardcover': 'HARDCOVER',
  'broschur': 'PERFECT_BOUND',
  'softcover': 'PERFECT_BOUND',
  'fadenheftung': 'THREAD_SEWN',
  'klebebindung': 'PERFECT_BOUND',
  'rückendrahtheftung': 'SADDLE_STITCH',
  'runder rücken': 'ROUNDED_SPINE',
  'gerader rücken': 'FLAT_SPINE',
  'mattfolie': 'MATT_LAMINATION',
  'glanzfolie': 'GLOSS_LAMINATION',
  'inhalts papier': 'INTERIOR_PAPER',
  'umschlag': 'COVER_PAPER',
  'vorsatz': 'ENDPAPERS',

  // Spanish
  'tapa dura': 'HARDCOVER',
  'tapa blanda': 'PERFECT_BOUND',
  'cosido': 'THREAD_SEWN',
  'rústica': 'PERFECT_BOUND',
  'lomo redondo': 'ROUNDED_SPINE',
  'lomo plano': 'FLAT_SPINE',
  'plastificado mate': 'MATT_LAMINATION',
  'plastificado brillo': 'GLOSS_LAMINATION',
  'tripa': 'INTERIOR_PAPER',
  'cubierta': 'COVER_PAPER',
  'guardas': 'ENDPAPERS',

  // English
  'casebound': 'HARDCOVER',
  'perfect bound': 'PERFECT_BOUND',
  'thread sewn': 'THREAD_SEWN',
  'saddle stitched': 'SADDLE_STITCH',
  'rounded spine': 'ROUNDED_SPINE',
  'flat spine': 'FLAT_SPINE',
  'matt lamination': 'MATT_LAMINATION',
  'gloss lamination': 'GLOSS_LAMINATION',
  'interior': 'INTERIOR_PAPER',
  'cover': 'COVER_PAPER',
  'endpapers': 'ENDPAPERS'
};

class DeterministicDecisionProvider {
  constructor() {
    this.name = 'DETERMINISTIC';
  }

  async evaluateDecision({ task, state = {}, choices = [], context = {} }) {
    const requestedAt = new Date().toISOString();
    let decision = null;
    let confidence = 1.0;
    let requiresReview = false;

    switch (task) {
      case 'TERMINOLOGY_DISAMBIGUATION': {
        const rawWording = (context.snippet || context.term || '').toLowerCase().trim();
        let matched = null;
        for (const [key, canon] of Object.entries(PRINT_TERMINOLOGY_MAP)) {
          if (rawWording.includes(key)) {
            matched = canon;
            break;
          }
        }
        if (matched && (choices.length === 0 || choices.includes(matched))) {
          decision = matched;
          confidence = 0.95;
        } else {
          decision = choices[0] || 'UNKNOWN';
          confidence = 0.40;
          requiresReview = true;
        }
        break;
      }

      case 'OFFER_GROUP_CLASSIFICATION': {
        const text = (context.snippet || '').toLowerCase();
        if (text.includes('munken print')) {
          decision = choices.find(c => String(c).toLowerCase().includes('munken print')) || choices[0] || 'MUNKEN_PRINT';
          confidence = 0.95;
        } else if (text.includes('munken premium')) {
          decision = choices.find(c => String(c).toLowerCase().includes('munken premium')) || choices[0] || 'MUNKEN_PREMIUM';
          confidence = 0.95;
        } else {
          decision = choices[0] || 'DEFAULT_VARIANT';
          confidence = 0.60;
          requiresReview = choices.length > 1;
        }
        break;
      }

      case 'QUOTE_FIELD_CLASSIFICATION': {
        const hint = (context.fieldHint || '').toLowerCase();
        if (hint.includes('transport') || hint.includes('versand') || hint.includes('fracht')) {
          decision = 'transport';
        } else if (hint.includes('total') || hint.includes('gesamt')) {
          decision = 'total';
        } else if (hint.includes('mfg') || hint.includes('herstellung') || hint.includes('druck')) {
          decision = 'manufacturing';
        } else {
          decision = choices[0] || 'manufacturing';
          confidence = 0.70;
          requiresReview = true;
        }
        break;
      }

      case 'AMBIGUITY_ROUTING': {
        const hasWarnings = (state.warnings && state.warnings.length > 0) || (context.warnings && context.warnings.length > 0);
        const isInconsistent = state.validationStatus && state.validationStatus !== 'CONSISTENT';
        requiresReview = Boolean(hasWarnings || isInconsistent);
        decision = requiresReview ? 'REQUIRES_REVIEW' : 'AUTO_ACCEPT';
        confidence = 0.90;
        break;
      }

      case 'EVIDENCE_ELIGIBILITY_ASSIST': {
        const cleanArithmetic = !state.validationStatus || state.validationStatus === 'CONSISTENT';
        const hasCopies = Boolean(state.quantity || state.copies);
        requiresReview = !(cleanArithmetic && hasCopies);
        decision = requiresReview ? 'REQUIRES_REVIEW' : 'ELIGIBLE';
        confidence = cleanArithmetic ? 0.95 : 0.60;
        break;
      }

      default: {
        decision = choices[0] || 'UNKNOWN';
        confidence = 0.50;
        requiresReview = true;
      }
    }

    const completedAt = new Date().toISOString();

    return {
      provider: 'DETERMINISTIC',
      task,
      decision,
      confidence,
      rawProviderMetadata: { ruleEngine: 'deterministic-v1' },
      requiresReview,
      auditMetadata: {
        provider: 'DETERMINISTIC',
        providerModel: 'rule-engine-v1',
        task,
        decision,
        confidence,
        requestedAt,
        completedAt,
        fallbackUsed: false
      }
    };
  }
}

module.exports = DeterministicDecisionProvider;
