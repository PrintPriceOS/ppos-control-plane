/**
 * src/ui/types/printhouseOnboardingTypes.ts
 *
 * Types for the Simplified Printhouse Onboarding Journey:
 * - 4 Product Families: Hardcover, Softcover, Wire-O, Saddle Stitch.
 * - 5 Family Statuses: PENDING, NOT_OFFERED, QUOTE_ADDED, REQUIRES_REVIEW, DATA_VALIDATED.
 * - Progressive sections: Producto, Interior, Cubierta, Encuadernación, Acabados, Tiradas y precios, Entrega.
 * - Multi-run and variant definitions.
 */

export type ProductFamilyId = 'HARDCOVER' | 'SOFTCOVER' | 'WIRE_O' | 'SADDLE_STITCH';

export type FamilyStatus = 
    | 'PENDING' 
    | 'NOT_OFFERED' 
    | 'QUOTE_ADDED' 
    | 'REQUIRES_REVIEW' 
    | 'DATA_VALIDATED';

export interface FamilyState {
    id: ProductFamilyId;
    status: FamilyStatus;
    quoteCount: number;
    titleKey?: string;
    descKey?: string;
    lastQuoteName?: string;
    hasInconsistencies?: boolean;
    hasAmbiguities?: boolean;
    ambiguityDetails?: string;
    discrepancyDetails?: string;
    evidenceIds?: string[];
}

export interface OfferVariantRow {
    id: string;
    variantKey?: string;
    quantity: number;
    paperVariant?: string;
    finishingVariant?: string;
    turnaroundDays?: number;
    turnaroundLabel?: string;
    logisticsOption?: string;
    deliveryOption?: string;
    manufacturingPrice?: number;
    transportPrice?: number;
    otherPrice?: number;
    otherCostsPrice?: number;
    totalPrice?: number;
    quotedTotalPrice?: number;
    unitPrice?: number;
    quotedUnitPrice?: number;
    computedTotalPrice?: number;
    computedUnitPrice?: number;
    currency?: string;
    hasEquivalentBreakdown?: boolean;
    incompleteComparisonReason?: string;
    validationStatus: 'CONSISTENT' | 'INCONSISTENT_TOTAL' | 'INCONSISTENT_UNIT_PRICE' | 'REQUIRES_REVIEW';
    notes?: string;
    sourceText?: string;
    provenance?: Record<string, any>;
    userCorrections?: Record<string, any>;
}

export interface ProgressiveSpecState {
    // 1. Producto
    family: ProductFamilyId;
    productTitle: string;
    formatWidthMm?: number;
    formatHeightMm?: number;
    widthMm?: number;
    heightMm?: number;
    formatStandardRef?: string; // Optional e.g. "A4", "A5", "Personalizado"
    currency: string;
    quoteReference?: string;
    quoteRef?: string;
    quoteDate?: string;
    evidenceId?: string;
    selectedVariantKey?: string;
    selectedVariantId?: string;
    hasAmbiguity?: boolean;
    ambiguityDetails?: string;
    ambiguityNote?: string;
    ambiguityResolved?: boolean;
    hasDiscrepancy?: boolean;
    coverageScopeDisclaimer?: string;

    // 2. Interior
    interiorPages?: number;
    pageCount?: number;
    interiorPaper?: string;
    interiorPaperType?: string;
    interiorPaperWeightGsm?: number;
    interiorWeightGsm?: number;
    interiorPaperVolume?: number; // e.g. 1.3, 1.5
    interiorVolume?: number;
    interiorColors?: string;
    interiorColorFront?: string; // e.g. "1", "4", "CMYK"
    interiorColorBack?: string; // e.g. "1", "4"
    mixedSectionsDescription?: string; // e.g. "208p 1/1 + 8p 4/4"

    // 3. Cubierta
    coverPaper?: string;
    coverPaperType?: string;
    coverPaperWeightGsm?: number;
    coverWeightGsm?: number;
    coverColors?: string;
    coverColorFront?: string;
    coverColorBack?: string;
    hasFlaps?: boolean;
    flapWidthMm?: number;
    // Hardcover specific
    boardThicknessMm?: number; // e.g. 2.0, 2.4 mm (Graupappe)
    hasEndpapers?: boolean; // Guardas
    endpapers?: string;
    endpaperPaper?: string;

    // 4. Encuadernación
    bindingMethod: 'SEWN' | 'GLUED' | 'WIRE_O' | 'SADDLE_STITCH' | 'thread_sewn' | 'adhesive_pur' | 'wire_o' | 'saddle_stitch';
    spineType?: 'SQUARE' | 'ROUND' | 'straight' | 'round';
    hasHeadband?: boolean; // Cabezadas (Hardcover)
    headbandColor?: string;
    wireColor?: string; // Wire-O
    wirePitch?: string; // e.g. "3:1", "2:1"
    stapleCount?: number; // Saddle Stitch (default 2)
    stapleType?: 'FLAT' | 'OMEGA'; // Grapas

    // 5. Acabados
    lamination?: 'NONE' | 'GLOSS' | 'MATTE' | 'SOFT_TOUCH' | 'matt' | 'gloss' | 'none';
    varnishType?: string; // e.g. "Barniz relieve" (NOT inferred as UV automatically)
    varnishCoverage?: string;
    hasFoilStamping?: boolean;
    foilColor?: string;
    hasEmbossing?: boolean;

    // 6. Tiradas y precios (multi-run)
    runs: OfferVariantRow[];

    // 7. Entrega
    deliveryCountry?: string; // ISO-2
    deliveryCity?: string;
    deliveryPostalCode?: string;
    leadTimeDays?: number;
}
