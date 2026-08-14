/**
 * src/ui/components/printhouse/pricing/printhouseSuggestedRates.ts
 *
 * Phase 192 RC20B — Static Historical Reference Dataset & Suggested Defaults
 * 
 * Provides typed reference benchmarks derived from historical printhouse profiles.
 * IMPORTANT: These values are UI onboarding guidance only and are never silently persisted.
 */

export interface SuggestedFieldMeta {
    value: number;
    source: 'historical_reference_2025';
    sampleSize: number;
    min?: number;
    max?: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    unit: string;
    description: string;
    warning?: string;
}

export const SUGGESTED_RATES_METADATA: Record<string, SuggestedFieldMeta> = {
    // Interior Baseline
    'interior_pp_bw': {
        value: 0.00635,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 0.0059,
        max: 0.0066,
        confidence: 'HIGH',
        unit: '€/page',
        description: 'Suggested starting value based on historical reference data (n=13).'
    },
    'interior_pp_color': {
        value: 0.01878,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 0.01805,
        max: 0.019,
        confidence: 'HIGH',
        unit: '€/page',
        description: 'Suggested starting value based on historical reference data (n=13).'
    },
    'interior_11_fixed': {
        value: 80.31,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 78.0,
        max: 82.0,
        confidence: 'HIGH',
        unit: '€/signature',
        description: 'Base fixed setup for 1/1 color printing across signatures (n=13).'
    },
    'interior_11_var': {
        value: 8.12,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 7.8,
        max: 8.4,
        confidence: 'HIGH',
        unit: '€/1000',
        description: 'Base variable run rate for 1/1 color printing per 1000 signatures (n=13).'
    },
    'interior_44_fixed': {
        value: 120.0,
        source: 'historical_reference_2025',
        sampleSize: 3,
        min: 120.0,
        max: 120.0,
        confidence: 'MEDIUM',
        unit: '€/signature',
        description: 'Base fixed setup for 4/4 full color printing across signatures.',
        warning: 'Low sample size reference (n=3). Review before saving.'
    },
    'interior_44_var': {
        value: 18.0,
        source: 'historical_reference_2025',
        sampleSize: 3,
        min: 18.0,
        max: 18.0,
        confidence: 'MEDIUM',
        unit: '€/1000',
        description: 'Base variable run rate for 4/4 full color printing per 1000 signatures.',
        warning: 'Low sample size reference (n=3). Review before saving.'
    },

    // Cover Baseline
    'cover_1col_fixed': {
        value: 40.0,
        source: 'historical_reference_2025',
        sampleSize: 3,
        min: 40.0,
        max: 40.0,
        confidence: 'MEDIUM',
        unit: '€',
        description: 'Cover 1-color fixed setup.',
        warning: 'Low sample size reference (n=3). Review before saving.'
    },
    'cover_1col_var': {
        value: 8.0,
        source: 'historical_reference_2025',
        sampleSize: 3,
        min: 8.0,
        max: 8.0,
        confidence: 'MEDIUM',
        unit: '€/1000',
        description: 'Cover 1-color variable rate per 1000.',
        warning: 'Low sample size reference (n=3). Review before saving.'
    },
    'cover_4col_fixed': {
        value: 66.0,
        source: 'historical_reference_2025',
        sampleSize: 3,
        min: 66.0,
        max: 66.0,
        confidence: 'MEDIUM',
        unit: '€',
        description: 'Cover 4-color fixed setup.',
        warning: 'Low sample size reference (n=3). Review before saving.'
    },
    'cover_4col_var': {
        value: 12.5,
        source: 'historical_reference_2025',
        sampleSize: 3,
        min: 12.5,
        max: 12.5,
        confidence: 'MEDIUM',
        unit: '€/1000',
        description: 'Cover 4-color variable rate per 1000.',
        warning: 'Low sample size reference (n=3). Review before saving.'
    },

    // Lamination
    'lam_gloss_fixed': {
        value: 6.0,
        source: 'historical_reference_2025',
        sampleSize: 3,
        min: 6.0,
        max: 6.0,
        confidence: 'MEDIUM',
        unit: '€',
        description: 'Lamination gloss fixed setup.',
        warning: 'Low sample size reference (n=3). Review before saving.'
    },
    'lam_gloss_var': {
        value: 25.0,
        source: 'historical_reference_2025',
        sampleSize: 3,
        min: 25.0,
        max: 25.0,
        confidence: 'MEDIUM',
        unit: '€/1000',
        description: 'Lamination gloss variable rate per 1000.',
        warning: 'Low sample size reference (n=3). Review before saving.'
    },
    'lam_matt_fixed': {
        value: 6.0,
        source: 'historical_reference_2025',
        sampleSize: 3,
        min: 6.0,
        max: 6.0,
        confidence: 'MEDIUM',
        unit: '€',
        description: 'Lamination matt fixed setup.',
        warning: 'Low sample size reference (n=3). Review before saving.'
    },
    'lam_matt_var': {
        value: 25.0,
        source: 'historical_reference_2025',
        sampleSize: 3,
        min: 25.0,
        max: 25.0,
        confidence: 'MEDIUM',
        unit: '€/1000',
        description: 'Lamination matt variable rate per 1000.',
        warning: 'Low sample size reference (n=3). Review before saving.'
    },

    // Binding
    'bind_pb_fixed': {
        value: 0.164,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 0.1202,
        max: 0.302,
        confidence: 'HIGH',
        unit: '€/book',
        description: 'Perfect bound fixed rate per book (n=13).'
    },
    'bind_pb_per_section': {
        value: 0.0147,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 0.0032,
        max: 0.0475,
        confidence: 'HIGH',
        unit: '€/section',
        description: 'Perfect bound rate per section (n=13).'
    },
    'bind_wo_per_book': {
        value: 0.282,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 0.22,
        max: 0.31,
        confidence: 'HIGH',
        unit: '€/book',
        description: 'Wire-O binding per book (n=13).'
    },
    'bind_perfect_per_book': {
        value: 0.22,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 0.22,
        max: 0.22,
        confidence: 'HIGH',
        unit: '€/book',
        description: 'Perfect binding unit cost (n=13).'
    },
    'bind_thread_hc_per_book': {
        value: 1.25,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 1.25,
        max: 1.25,
        confidence: 'HIGH',
        unit: '€/book',
        description: 'Thread Hardcover binding per book (n=13).'
    },
    'bind_saddle_per_book': {
        value: 0.12,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 0.12,
        max: 0.12,
        confidence: 'HIGH',
        unit: '€/book',
        description: 'Saddle stitch per book (n=13).'
    },
    'bind_ts_fixed': {
        value: 59.85,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 55.0,
        max: 70.0,
        confidence: 'HIGH',
        unit: '€',
        description: 'Thread sewn fixed machine setup (n=13).'
    },

    // Paper Generic Baselines
    'paper_kg_interior_baseline': {
        value: 1.252,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 1.22,
        max: 1.28,
        confidence: 'HIGH',
        unit: '€/kg',
        description: 'Generic historical interior paper baseline (n=13). Not grade-specific.'
    },
    'paper_kg_cover_baseline': {
        value: 2.515,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 2.50,
        max: 2.58,
        confidence: 'HIGH',
        unit: '€/kg',
        description: 'Generic historical cover paper baseline (n=13). Not grade-specific.'
    },

    // Transport Rates
    'ship_per_kg_general': {
        value: 1.245,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 1.18,
        max: 1.28,
        confidence: 'HIGH',
        unit: '€/kg',
        description: 'General EU international shipping per kg (n=13).'
    },
    'ship_per_kg_es': {
        value: 0.95,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 0.95,
        max: 0.95,
        confidence: 'HIGH',
        unit: '€/kg',
        description: 'Domestic ES transport per kg (n=13).'
    },
    'ship_per_kg_be': {
        value: 1.145,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 1.11,
        max: 1.17,
        confidence: 'HIGH',
        unit: '€/kg',
        description: 'BE transport per kg (n=13).'
    },
    'ship_per_kg_nl': {
        value: 1.189,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 1.15,
        max: 1.22,
        confidence: 'HIGH',
        unit: '€/kg',
        description: 'NL transport per kg (n=13).'
    },
    'ship_per_kg_de': {
        value: 1.165,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 1.13,
        max: 1.20,
        confidence: 'HIGH',
        unit: '€/kg',
        description: 'DE transport per kg (n=13).'
    },
    'ship_per_kg_fr': {
        value: 1.178,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 1.14,
        max: 1.21,
        confidence: 'HIGH',
        unit: '€/kg',
        description: 'FR transport per kg (n=13).'
    },
    'ship_per_kg_at': {
        value: 1.225,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 1.17,
        max: 1.26,
        confidence: 'HIGH',
        unit: '€/kg',
        description: 'AT transport per kg (n=13).'
    },

    // Operational Setup
    'setup_fixed': {
        value: 42.0,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 42.0,
        max: 42.0,
        confidence: 'HIGH',
        unit: '€',
        description: 'Operational job setup fee (n=13).'
    },
    'min_order': {
        value: 95.0,
        source: 'historical_reference_2025',
        sampleSize: 13,
        min: 95.0,
        max: 95.0,
        confidence: 'HIGH',
        unit: '€',
        description: 'Minimum order threshold (n=13).'
    }
};

// Exact Step Matrix for Thread Sewn Section Scales (Steps 4 to 24)
export const BINDING_TS_STEP_MEANS: Record<number, number> = {
    4: 67.65,
    5: 78.46,
    6: 89.27,
    7: 105.85,
    8: 116.08,
    9: 127.17,
    10: 138.27,
    11: 135.96,
    12: 144.20,
    13: 152.44,
    14: 160.68,
    15: 168.92,
    16: 177.16,
    17: 185.40,
    18: 193.64,
    19: 201.88,
    20: 210.12,
    21: 218.36,
    22: 226.60,
    23: 234.84,
    24: 243.08
};

// Common configuration benchmarks (categorized by mode, not arithmetic mean)
export const COMMON_OPERATIONAL_CONFIG = {
    signatures: {
        value: [16],
        label: '16-page signatures (Common historical standard: 77% of reference nodes)'
    },
    productionLeadDays: {
        value: 11,
        label: '11 production lead days (Common historical standard: 77% of reference nodes)'
    },
    deliveryTime: {
        value: '14 days',
        label: '14 days estimated delivery (Common historical standard: 77% of reference nodes)'
    },
    minCopies: {
        value: 50,
        label: '50 copies minimum run (77% of reference nodes)'
    },
    maxPages: {
        value: 1500,
        label: '1500 pages maximum book thickness (100% of reference nodes)'
    }
};
