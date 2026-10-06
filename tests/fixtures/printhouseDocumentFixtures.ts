/**
 * tests/fixtures/printhouseDocumentFixtures.ts
 *
 * Isolated Test Fixtures derived strictly from original binary PDF documents in C:\Users\KIKE\Downloads\precios:
 * 1. Natur_31.08.2026.pdf
 * 2. Stutensee_Mit_Margot_durch_das_Gartenjahr_04.09.2026 (1).pdf
 * 3. Fussel_08.09.2026 (2).pdf
 * 4. Fährmann_(VVA_10_Muster)_07.09.2026.pdf
 * 5. Die_Mysteriösen_Steine_08.09.2026 (1).pdf
 *
 * Principles:
 * - 100% Document Fidelity: Document values are NEVER mutated to match frontend forms.
 * - Source Provenance: Every numeric field records the original text span and page number.
 * - Discrepancy Preservation: Stutensee unit price discrepancy is retained as INCONSISTENT_UNIT_PRICE.
 * - Ambiguity Preservation: Die Mysteriösen Steine retains the technical contradiction between Softcover and 2.4mm board.
 * - Transport Alternatives: Fussel records independent vs combined shipment (NOT standard vs express).
 * - Multi-variant Stability: Fährmann records 4 separate variants for the same 3,000 quantity.
 * - Isolated from Production: These fixtures must NEVER be imported or bundled into src/ui/.
 */

import { ProgressiveSpecState } from '../../src/ui/types/printhouseOnboardingTypes';

export interface DocumentProvenance {
    value: number | string;
    pageNumber: number;
    sourceText: string;
}

export interface DocumentOfferVariant {
    variantKey: string;
    quantity: number;
    manufacturingPrice: number;
    transportPrice: number;
    otherPrice?: number;
    quotedTotalPrice: number;
    quotedUnitPrice: number;
    computedTotalPrice: number;
    computedUnitPrice: number;
    validationStatus: 'CONSISTENT' | 'INCONSISTENT_TOTAL' | 'INCONSISTENT_UNIT_PRICE' | 'REQUIRES_REVIEW';
    paperVariant?: string;
    finishingVariant?: string;
    turnaroundDays?: number;
    turnaroundLabel?: string;
    logisticsOption: string;
    hasEquivalentBreakdown: boolean;
    incompleteComparisonReason?: string;
    provenance: Record<string, DocumentProvenance>;
    userCorrection?: {
        field: string;
        correctedValue: any;
        reason: string;
    };
}

export interface DocumentFixture {
    documentKey: 'NATUR' | 'STUTENSEE' | 'FUSSEL' | 'FAHRMANN' | 'MYSTERIOSEN_STEINE';
    filename: string;
    documentDate: string;
    declaredPrinthouse: string;
    clientName: string;
    bindingFamily: 'SOFTCOVER' | 'HARDCOVER' | 'WIRE_O' | 'SADDLE_STITCH';
    productTitle: string;
    format: {
        widthMm: number;
        heightMm: number;
        label?: string;
    };
    pageCount: {
        interiorPages: number;
        coverPages: number;
        insertPages?: number;
        summary: string;
    };
    materials: {
        interiorPaper: string;
        interiorGsm: number;
        interiorVolume?: number;
        interiorColors: string;
        coverPaper: string;
        coverGsm: number;
        coverColors: string;
        boardThicknessMm?: number;
        endpapers?: string;
    };
    finishingAndBinding: {
        bindingMethod: string;
        spineType?: string;
        lamination?: string;
        hasHeadband?: boolean;
        hasFlaps?: boolean;
        specialFinishing?: string;
    };
    technicalNotes: {
        hasDiscrepancy: boolean;
        discrepancyDetails?: string;
        hasTechnicalAmbiguity: boolean;
        ambiguityDetails?: string;
        coverageScopeDisclaimer: string;
    };
    offers: DocumentOfferVariant[];
}

/**
 * 1. Natur (31.08.2026)
 * Real document: Softcover with flaps (Klappenbroschur), thread sewn, gloss lamination, 148x210 mm, 592 pages interior.
 * Runs: 500, 600, 700 copies. All consistent.
 */
export const NATUR_FIXTURE: DocumentFixture = {
    documentKey: 'NATUR',
    filename: 'Natur_31.08.2026.pdf',
    documentDate: '2026-08-31',
    declaredPrinthouse: 'Natur',
    clientName: 'Konkursbuch Verlag Claudia Gehrke',
    bindingFamily: 'SOFTCOVER',
    productTitle: 'Natur',
    format: {
        widthMm: 148,
        heightMm: 210,
        label: '148 x 210 mm'
    },
    pageCount: {
        interiorPages: 592,
        coverPages: 4,
        summary: '592 Seiten + Umschlag'
    },
    materials: {
        interiorPaper: 'Munken Print White 1.5, 80 g',
        interiorGsm: 80,
        interiorVolume: 1.5,
        interiorColors: '4+4',
        coverPaper: 'Karton',
        coverGsm: 300,
        coverColors: '4+0'
    },
    finishingAndBinding: {
        bindingMethod: 'Klappenbroschur, Fadenheftung',
        lamination: 'Glanzlaminierung',
        hasFlaps: true,
        specialFinishing: 'nicht eingeschweißt, in Kartons auf Palette'
    },
    technicalNotes: {
        hasDiscrepancy: false,
        hasTechnicalAmbiguity: false,
        coverageScopeDisclaimer: 'Acredita exclusivamente rústica con solapas cosida en 148x210mm y Munken Print White 1.5, 80 g. No acredita tapa dura, Wire-O, grapado al caballete ni estampación.'
    },
    offers: [
        {
            variantKey: 'natur_q500_munken80_glanz_std',
            quantity: 500,
            manufacturingPrice: 4321,
            transportPrice: 325,
            quotedTotalPrice: 4646,
            quotedUnitPrice: 9.29,
            computedTotalPrice: 4646,
            computedUnitPrice: 9.292,
            validationStatus: 'CONSISTENT',
            paperVariant: 'Munken Print White 1.5, 80 g',
            finishingVariant: 'Glanzlaminierung',
            logisticsOption: 'Standard DE (325 €)',
            hasEquivalentBreakdown: true,
            provenance: {
                manufacturingPrice: { value: 4321, pageNumber: 1, sourceText: '500 Stück 4321 Euro + 325 Euro (Transport) = 4646 Euro / 9.29 Euro pro Stück' },
                transportPrice: { value: 325, pageNumber: 1, sourceText: '325 Euro (Transport)' },
                quotedTotalPrice: { value: 4646, pageNumber: 1, sourceText: '= 4646 Euro' },
                quotedUnitPrice: { value: 9.29, pageNumber: 1, sourceText: '/ 9.29 Euro pro Stück' }
            }
        },
        {
            variantKey: 'natur_q600_munken80_glanz_std',
            quantity: 600,
            manufacturingPrice: 4604,
            transportPrice: 325,
            quotedTotalPrice: 4929,
            quotedUnitPrice: 8.22,
            computedTotalPrice: 4929,
            computedUnitPrice: 8.215,
            validationStatus: 'CONSISTENT',
            paperVariant: 'Munken Print White 1.5, 80 g',
            finishingVariant: 'Glanzlaminierung',
            logisticsOption: 'Standard DE (325 €)',
            hasEquivalentBreakdown: true,
            provenance: {
                manufacturingPrice: { value: 4604, pageNumber: 1, sourceText: '600 Stück 4604 Euro + 325 Euro (Transport) = 4929 Euro / 8.22 Euro pro Stück' },
                transportPrice: { value: 325, pageNumber: 1, sourceText: '325 Euro (Transport)' },
                quotedTotalPrice: { value: 4929, pageNumber: 1, sourceText: '= 4929 Euro' },
                quotedUnitPrice: { value: 8.22, pageNumber: 1, sourceText: '/ 8.22 Euro pro Stück' }
            }
        },
        {
            variantKey: 'natur_q700_munken80_glanz_std',
            quantity: 700,
            manufacturingPrice: 4846,
            transportPrice: 325,
            quotedTotalPrice: 5171,
            quotedUnitPrice: 7.39,
            computedTotalPrice: 5171,
            computedUnitPrice: 7.387143,
            validationStatus: 'CONSISTENT',
            paperVariant: 'Munken Print White 1.5, 80 g',
            finishingVariant: 'Glanzlaminierung',
            logisticsOption: 'Standard DE (325 €)',
            hasEquivalentBreakdown: true,
            provenance: {
                manufacturingPrice: { value: 4846, pageNumber: 1, sourceText: '700 Stück 4846 Euro + 325 Euro (Transport) = 5171 Euro / 7.39 Euro pro Stück' },
                transportPrice: { value: 325, pageNumber: 1, sourceText: '325 Euro (Transport)' },
                quotedTotalPrice: { value: 5171, pageNumber: 1, sourceText: '= 5171 Euro' },
                quotedUnitPrice: { value: 7.39, pageNumber: 1, sourceText: '/ 7.39 Euro pro Stück' }
            }
        }
    ]
};

/**
 * 2. Stutensee (04.09.2026)
 * Real document: Hardcover (Festeinband), round spine, sewn, Silk 150g, 104 pages interior, 170x240 mm.
 * Runs: 250 (consistent) and 300 (ARITHMETIC DISCREPANCY in unit price: 1525 / 300 = 5.08, but declared 3.05).
 */
export const STUTENSEE_FIXTURE: DocumentFixture = {
    documentKey: 'STUTENSEE',
    filename: 'Stutensee_Mit_Margot_durch_das_Gartenjahr_04.09.2026 (1).pdf',
    documentDate: '2026-09-04',
    declaredPrinthouse: 'Stutensee',
    clientName: 'Verlag Regionalkultur GmbH & Co. KG',
    bindingFamily: 'HARDCOVER',
    productTitle: 'Stutensee: Mit Margot durch das Gartenjahr',
    format: {
        widthMm: 170,
        heightMm: 240,
        label: '170 x 240 mm'
    },
    pageCount: {
        interiorPages: 104,
        coverPages: 4,
        summary: '104 Seiten + Umschlag'
    },
    materials: {
        interiorPaper: 'Silk',
        interiorGsm: 150,
        interiorColors: '4+4',
        coverPaper: 'Silk',
        coverGsm: 130,
        coverColors: '4+0',
        boardThicknessMm: 2.4,
        endpapers: 'Offset 140g, 0+0'
    },
    finishingAndBinding: {
        bindingMethod: 'Festeinband, Fadenheftung',
        spineType: 'runder Rücken',
        lamination: 'glanzlaminiert',
        hasHeadband: true,
        specialFinishing: 'Kapitalband weiß, in Kartons, auf Palette'
    },
    technicalNotes: {
        hasDiscrepancy: true,
        discrepancyDetails: 'Tirada 300 ej.: Total 1.525 € / 300 = 5.08 €/ud real. El documento declara erróneamente 3.05 €/ud.',
        hasTechnicalAmbiguity: false,
        coverageScopeDisclaimer: 'Acredita exclusivamente tapa dura cosida lomo redondo en 170x240mm con Silk 150g. No acredita lomo recto ni otras encuadernaciones.'
    },
    offers: [
        {
            variantKey: 'stutensee_q250_silk150_glanz_round_std',
            quantity: 250,
            manufacturingPrice: 1283,
            transportPrice: 190,
            quotedTotalPrice: 1473,
            quotedUnitPrice: 5.89,
            computedTotalPrice: 1473,
            computedUnitPrice: 5.892,
            validationStatus: 'CONSISTENT',
            paperVariant: 'Silk 150g',
            finishingVariant: 'glanzlaminiert, runder Rücken',
            logisticsOption: 'Standard DE (190 €)',
            hasEquivalentBreakdown: true,
            provenance: {
                manufacturingPrice: { value: 1283, pageNumber: 1, sourceText: '250 Stück 1283 Euro + 190 Euro (Transport) = 1473 Euro / 5.89 Euro pro Stück' },
                transportPrice: { value: 190, pageNumber: 1, sourceText: '190 Euro (Transport)' },
                quotedTotalPrice: { value: 1473, pageNumber: 1, sourceText: '= 1473 Euro' },
                quotedUnitPrice: { value: 5.89, pageNumber: 1, sourceText: '/ 5.89 Euro pro Stück' }
            }
        },
        {
            variantKey: 'stutensee_q300_silk150_glanz_round_std',
            quantity: 300,
            manufacturingPrice: 1335,
            transportPrice: 190,
            quotedTotalPrice: 1525,
            quotedUnitPrice: 3.05,
            computedTotalPrice: 1525,
            computedUnitPrice: 5.083333,
            validationStatus: 'INCONSISTENT_UNIT_PRICE',
            paperVariant: 'Silk 150g',
            finishingVariant: 'glanzlaminiert, runder Rücken',
            logisticsOption: 'Standard DE (190 €)',
            hasEquivalentBreakdown: true,
            provenance: {
                manufacturingPrice: { value: 1335, pageNumber: 1, sourceText: '300 Stück 1335 Euro + 190 Euro (Transport) = 1525 Euro / 3.05 Euro pro Stück' },
                transportPrice: { value: 190, pageNumber: 1, sourceText: '190 Euro (Transport)' },
                quotedTotalPrice: { value: 1525, pageNumber: 1, sourceText: '= 1525 Euro' },
                quotedUnitPrice: { value: 3.05, pageNumber: 1, sourceText: '/ 3.05 Euro pro Stück' }
            }
        }
    ]
};

/**
 * 3. Fussel (08.09.2026)
 * Real document: Hardcover (Festeinband), straight spine, sewn, Arctic Vol w 150g, 32 pages interior, 206x264 mm, 3mm board.
 * Runs: Same run of 2,000 copies with TWO LOGISTICS ALTERNATIVES:
 * - Option A: Separate shipment (600 € transport -> 3,695 € total)
 * - Option B: Combined shipment with Bayernlesebüchern (200 € transport -> 3,295 € total).
 */
export const FUSSEL_FIXTURE: DocumentFixture = {
    documentKey: 'FUSSEL',
    filename: 'Fussel_08.09.2026 (2).pdf',
    documentDate: '2026-09-08',
    declaredPrinthouse: 'Fussel',
    clientName: 'Morisken Verlag / Thomas Peters',
    bindingFamily: 'HARDCOVER',
    productTitle: 'Fussel',
    format: {
        widthMm: 206,
        heightMm: 264,
        label: '206 x 264 mm'
    },
    pageCount: {
        interiorPages: 32,
        coverPages: 4,
        summary: '32 Seiten + VNS Umschlag'
    },
    materials: {
        interiorPaper: 'Arctic Vol w 1.1 Vol',
        interiorGsm: 150,
        interiorVolume: 1.1,
        interiorColors: '4+4',
        coverPaper: 'Silk',
        coverGsm: 135,
        coverColors: '4+0',
        boardThicknessMm: 3.0,
        endpapers: 'Offset 140g, 0+0'
    },
    finishingAndBinding: {
        bindingMethod: 'Festeinband, Fadenheftung',
        spineType: 'gerader Rücken',
        lamination: 'matt kratzfest laminiert',
        hasHeadband: false,
        specialFinishing: 'nicht kapitalt, matt kratzfest laminiert, 100 Ex. an Verlag, Rest Palette'
    },
    technicalNotes: {
        hasDiscrepancy: false,
        hasTechnicalAmbiguity: false,
        coverageScopeDisclaimer: 'Acredita exclusivamente tapa dura cartón 3mm con Arctic Vol 150g en 206x264mm. Las dos alternativas corresponden a envío individual vs combinado.'
    },
    offers: [
        {
            variantKey: 'fussel_q2000_arctic150_matt_straight_transp_individual',
            quantity: 2000,
            manufacturingPrice: 3095,
            transportPrice: 600,
            quotedTotalPrice: 3695,
            quotedUnitPrice: 1.85,
            computedTotalPrice: 3695,
            computedUnitPrice: 1.8475,
            validationStatus: 'CONSISTENT',
            paperVariant: 'Arctic Vol w 150g',
            finishingVariant: 'matt kratzfest, gerader Rücken, MGP 3mm',
            logisticsOption: 'Transporte Individual (600 €)',
            hasEquivalentBreakdown: true,
            provenance: {
                manufacturingPrice: { value: 3095, pageNumber: 1, sourceText: '2000 Stück 3095 Euro + 600 Euro (Transport) = 3695 Euro / 1.85 Euro pro Stück' },
                transportPrice: { value: 600, pageNumber: 1, sourceText: '600 Euro (Transport)' },
                quotedTotalPrice: { value: 3695, pageNumber: 1, sourceText: '= 3695 Euro' },
                quotedUnitPrice: { value: 1.85, pageNumber: 1, sourceText: '/ 1.85 Euro pro Stück' }
            }
        },
        {
            variantKey: 'fussel_q2000_arctic150_matt_straight_transp_kombiniert',
            quantity: 2000,
            manufacturingPrice: 3095,
            transportPrice: 200,
            quotedTotalPrice: 3295,
            quotedUnitPrice: 1.65,
            computedTotalPrice: 3295,
            computedUnitPrice: 1.6475,
            validationStatus: 'CONSISTENT',
            paperVariant: 'Arctic Vol w 150g',
            finishingVariant: 'matt kratzfest, gerader Rücken, MGP 3mm',
            logisticsOption: 'Transporte Combinado / Zusammenversand (200 €)',
            hasEquivalentBreakdown: true,
            provenance: {
                manufacturingPrice: { value: 3095, pageNumber: 1, sourceText: '2000 Stück 3095 Euro + 200 Euro (Transport) = 3295 Euro / 1.65 Euro pro Stück bei Zusammenversand mit Bayernlesebüchern!' },
                transportPrice: { value: 200, pageNumber: 1, sourceText: '200 Euro (Transport)' },
                quotedTotalPrice: { value: 3295, pageNumber: 1, sourceText: '= 3295 Euro' },
                quotedUnitPrice: { value: 1.65, pageNumber: 1, sourceText: '/ 1.65 Euro pro Stück' }
            }
        }
    ]
};

/**
 * 4. Fährmann (07.09.2026)
 * Real document: Hardcover, straight spine, sewn, 139x212 mm, 208p 1/1 + 8p 4/4 = 216 pages interior, MGP 2.4mm.
 * Runs: Same run of 3,000 copies with 4 COMBINED VARIANTS of paper (Munken Print 1.5 90g vs Munken Premium 1.3 90g)
 * and turnaround / lead time (Normal LT 28.10 vs Urgente LT 15.10).
 */
export const FAHRMANN_FIXTURE: DocumentFixture = {
    documentKey: 'FAHRMANN',
    filename: 'Fährmann_(VVA_10_Muster)_07.09.2026.pdf',
    documentDate: '2026-09-07',
    declaredPrinthouse: 'Fährmann',
    clientName: 'DIE WERKSTATT Medien-Produktion',
    bindingFamily: 'HARDCOVER',
    productTitle: 'Fährmann (VVA/10 Muster)',
    format: {
        widthMm: 139,
        heightMm: 212,
        label: '139 x 212 mm'
    },
    pageCount: {
        interiorPages: 216,
        coverPages: 4,
        insertPages: 8,
        summary: '208 (1+1) + 8 (4+4) Seiten + Umschlag'
    },
    materials: {
        interiorPaper: 'Munken Print Cream 1.5 / Munken Premium Cream 1.3',
        interiorGsm: 90,
        interiorColors: '208p 1+1 Pantone + 8p 4+4 CMYK',
        coverPaper: 'Silk',
        coverGsm: 130,
        coverColors: '4+0',
        boardThicknessMm: 2.4,
        endpapers: 'Munken 115g, 0+0'
    },
    finishingAndBinding: {
        bindingMethod: 'Hardcover, Fadenheftung',
        spineType: 'gerader Rücken',
        lamination: 'Mattfolie',
        hasHeadband: true,
        specialFinishing: 'partieller Relieflack (Relief varnish)'
    },
    technicalNotes: {
        hasDiscrepancy: false,
        hasTechnicalAmbiguity: false,
        coverageScopeDisclaimer: 'Acredita interior mixto 208p 1/1 + 8p 4/4 y barniz relieve en 139x212mm. No acredita barniz UV estándar ni rústica.'
    },
    offers: [
        {
            variantKey: 'fahrmann_q3000_munken_print_standard_delivery',
            quantity: 3000,
            manufacturingPrice: 6048,
            transportPrice: 435,
            quotedTotalPrice: 6483,
            quotedUnitPrice: 2.16,
            computedTotalPrice: 6483,
            computedUnitPrice: 2.161,
            validationStatus: 'CONSISTENT',
            paperVariant: 'Munken Print Cream 1.5 90g',
            turnaroundLabel: 'Plazo Estándar (LT 28.10.)',
            logisticsOption: 'Standard DE (435 €)',
            hasEquivalentBreakdown: true,
            provenance: {
                manufacturingPrice: { value: 6048, pageNumber: 1, sourceText: 'LT 28.10. Munken Print Cream 1.5 6048 Euro + 435 Euro (Transport) = 6483 Euro / 2.16 Euro pro Stück' },
                transportPrice: { value: 435, pageNumber: 1, sourceText: '435 Euro (Transport)' },
                quotedTotalPrice: { value: 6483, pageNumber: 1, sourceText: '= 6483 Euro' },
                quotedUnitPrice: { value: 2.16, pageNumber: 1, sourceText: '/ 2.16 Euro pro Stück' }
            }
        },
        {
            variantKey: 'fahrmann_q3000_munken_premium_standard_delivery',
            quantity: 3000,
            manufacturingPrice: 6184,
            transportPrice: 435,
            quotedTotalPrice: 6619,
            quotedUnitPrice: 2.21,
            computedTotalPrice: 6619,
            computedUnitPrice: 2.206333,
            validationStatus: 'CONSISTENT',
            paperVariant: 'Munken Premium Cream 1.3 90g',
            turnaroundLabel: 'Plazo Estándar (LT 28.10.)',
            logisticsOption: 'Standard DE (435 €)',
            hasEquivalentBreakdown: true,
            provenance: {
                manufacturingPrice: { value: 6184, pageNumber: 1, sourceText: 'LT 28.10. Munken Premium Cream 1.3 6184 Euro + 435 Euro (Transport) = 6619 Euro / 2.21 Euro pro Stück' },
                transportPrice: { value: 435, pageNumber: 1, sourceText: '435 Euro (Transport)' },
                quotedTotalPrice: { value: 6619, pageNumber: 1, sourceText: '= 6619 Euro' },
                quotedUnitPrice: { value: 2.21, pageNumber: 1, sourceText: '/ 2.21 Euro pro Stück' }
            }
        },
        {
            variantKey: 'fahrmann_q3000_munken_print_express_delivery',
            quantity: 3000,
            manufacturingPrice: 6298,
            transportPrice: 435,
            quotedTotalPrice: 6733,
            quotedUnitPrice: 2.24,
            computedTotalPrice: 6733,
            computedUnitPrice: 2.244333,
            validationStatus: 'CONSISTENT',
            paperVariant: 'Munken Print Cream 1.5 90g',
            turnaroundLabel: 'Plazo Urgente (LT 15.10.)',
            logisticsOption: 'Standard DE (435 €)',
            hasEquivalentBreakdown: true,
            provenance: {
                manufacturingPrice: { value: 6298, pageNumber: 1, sourceText: 'LT 15.10. Munken Print Cream 1.5 6298 Euro + 435 Euro (Transport) = 6733 Euro / 2.24 Euro pro Stück' },
                transportPrice: { value: 435, pageNumber: 1, sourceText: '435 Euro (Transport)' },
                quotedTotalPrice: { value: 6733, pageNumber: 1, sourceText: '= 6733 Euro' },
                quotedUnitPrice: { value: 2.24, pageNumber: 1, sourceText: '/ 2.24 Euro pro Stück' }
            }
        },
        {
            variantKey: 'fahrmann_q3000_munken_premium_express_delivery',
            quantity: 3000,
            manufacturingPrice: 6582,
            transportPrice: 435,
            quotedTotalPrice: 7017,
            quotedUnitPrice: 2.34,
            computedTotalPrice: 7017,
            computedUnitPrice: 2.339,
            validationStatus: 'CONSISTENT',
            paperVariant: 'Munken Premium Cream 1.3 90g',
            turnaroundLabel: 'Plazo Urgente (LT 15.10.)',
            logisticsOption: 'Standard DE (435 €)',
            hasEquivalentBreakdown: true,
            provenance: {
                manufacturingPrice: { value: 6582, pageNumber: 1, sourceText: 'LT 15.10. Munken Premium Cream 1.3 6582 Euro + 435 Euro (Transport) = 7017 Euro / 2.34 Euro pro Stück' },
                transportPrice: { value: 435, pageNumber: 1, sourceText: '435 Euro (Transport)' },
                quotedTotalPrice: { value: 7017, pageNumber: 1, sourceText: '= 7017 Euro' },
                quotedUnitPrice: { value: 2.34, pageNumber: 1, sourceText: '/ 2.34 Euro pro Stück' }
            }
        }
    ]
};

/**
 * 5. Die Mysteriösen Steine (08.09.2026)
 * Real document: 170x240 mm, 72 pages interior, Arctic Volumen 150g, 4+4.
 * CRITICAL TECHNICAL AMBIGUITY:
 * Header states "Softcover, Fadenheftung, matt laminiert", but materials section lists "MGP 2,4 mm" (greyboard for hardcover).
 * Cannot be used to calibrate rates until operator explicitly confirms whether it is Softcover (no board) or Hardcover (2.4mm board).
 */
export const MYSTERIOSEN_STEINE_FIXTURE: DocumentFixture = {
    documentKey: 'MYSTERIOSEN_STEINE',
    filename: 'Die_Mysteriösen_Steine_08.09.2026 (1).pdf',
    documentDate: '2026-09-08',
    declaredPrinthouse: 'Die Mysteriösen Steine',
    clientName: 'DIE WERKSTATT Medien-Produktion',
    bindingFamily: 'SOFTCOVER', // As declared in header, but ambiguous with MGP 2.4mm
    productTitle: 'Die Mysteriösen Steine',
    format: {
        widthMm: 170,
        heightMm: 240,
        label: '170 x 240 mm'
    },
    pageCount: {
        interiorPages: 72,
        coverPages: 4,
        summary: '72 Seiten + Umschlag'
    },
    materials: {
        interiorPaper: 'Arctic Volumen',
        interiorGsm: 150,
        interiorColors: '4+4',
        coverPaper: 'Silk',
        coverGsm: 130,
        coverColors: '4+0',
        boardThicknessMm: 2.4 // The contradictory field
    },
    finishingAndBinding: {
        bindingMethod: 'Softcover, Fadenheftung',
        lamination: 'matt laminiert',
        specialFinishing: 'nicht eingeschweißt, lose auf Palette'
    },
    technicalNotes: {
        hasDiscrepancy: false,
        hasTechnicalAmbiguity: true,
        ambiguityDetails: 'Contradicción documental: El encabezado declara Softcover, pero la especificación técnica incluye cartón MGP 2,4 mm (Tapa dura). Requiere confirmación explícita del operario.',
        coverageScopeDisclaimer: 'Bloqueado para calibración automática hasta confirmación de encuadernación (Rústica vs Tapa dura).'
    },
    offers: [
        {
            variantKey: 'mysteriosen_q1500_arctic150_matt_ambiguous_binding',
            quantity: 1500,
            manufacturingPrice: 1792,
            transportPrice: 415,
            quotedTotalPrice: 2207,
            quotedUnitPrice: 1.47,
            computedTotalPrice: 2207,
            computedUnitPrice: 1.471333,
            validationStatus: 'REQUIRES_REVIEW',
            paperVariant: 'Arctic Volumen 150g',
            finishingVariant: 'matt laminiert (ambiguo: Softcover vs MGP 2,4mm)',
            logisticsOption: 'Zusammenversand (415 €)',
            hasEquivalentBreakdown: true,
            provenance: {
                manufacturingPrice: { value: 1792, pageNumber: 1, sourceText: 'Softcover 1792 Euro + 415 Euro (Zusammenversand) = 2207 Euro / 1.47 Euro pro Stück' },
                transportPrice: { value: 415, pageNumber: 1, sourceText: '415 Euro (Zusammenversand)' },
                quotedTotalPrice: { value: 2207, pageNumber: 1, sourceText: '= 2207 Euro' },
                quotedUnitPrice: { value: 1.47, pageNumber: 1, sourceText: '/ 1.47 Euro pro Stück' }
            }
        }
    ]
};

export const ALL_REAL_DOCUMENT_FIXTURES: Record<string, DocumentFixture> = {
    NATUR: NATUR_FIXTURE,
    STUTENSEE: STUTENSEE_FIXTURE,
    FUSSEL: FUSSEL_FIXTURE,
    FAHRMANN: FAHRMANN_FIXTURE,
    MYSTERIOSEN_STEINE: MYSTERIOSEN_STEINE_FIXTURE
};

export function fixtureToSpec(fixture: DocumentFixture): ProgressiveSpecState {
    return {
        family: fixture.bindingFamily,
        productTitle: fixture.productTitle,
        formatWidthMm: fixture.format.widthMm,
        formatHeightMm: fixture.format.heightMm,
        widthMm: fixture.format.widthMm,
        heightMm: fixture.format.heightMm,
        interiorPages: fixture.pageCount.interiorPages,
        pageCount: fixture.pageCount.interiorPages,
        interiorPaper: fixture.materials.interiorPaper,
        interiorPaperType: fixture.materials.interiorPaper,
        interiorWeightGsm: fixture.materials.interiorGsm,
        interiorColors: fixture.materials.interiorColors,
        coverPaper: fixture.materials.coverPaper,
        coverWeightGsm: fixture.materials.coverGsm,
        coverColors: fixture.materials.coverColors,
        boardThicknessMm: fixture.materials.boardThicknessMm,
        bindingMethod: fixture.bindingFamily === 'HARDCOVER' ? 'thread_sewn' : fixture.bindingFamily === 'SOFTCOVER' ? 'adhesive_pur' : fixture.bindingFamily === 'WIRE_O' ? 'wire_o' : 'saddle_stitch',
        hasAmbiguity: fixture.technicalNotes.hasTechnicalAmbiguity,
        ambiguityDetails: fixture.technicalNotes.ambiguityDetails,
        ambiguityNote: fixture.technicalNotes.ambiguityDetails,
        hasDiscrepancy: fixture.technicalNotes.hasDiscrepancy,
        currency: 'EUR',
        deliveryCountry: 'DE',
        runs: fixture.offers.map((o, idx) => ({
            id: `run-${idx + 1}`,
            variantKey: o.variantKey,
            quantity: o.quantity,
            paperVariant: o.paperVariant,
            finishingVariant: o.finishingVariant,
            turnaroundDays: o.turnaroundDays,
            turnaroundLabel: o.turnaroundLabel,
            logisticsOption: o.logisticsOption,
            deliveryOption: o.logisticsOption,
            manufacturingPrice: o.manufacturingPrice,
            transportPrice: o.transportPrice,
            otherPrice: o.otherPrice,
            totalPrice: o.quotedTotalPrice,
            quotedTotalPrice: o.quotedTotalPrice,
            unitPrice: o.quotedUnitPrice,
            quotedUnitPrice: o.quotedUnitPrice,
            computedTotalPrice: o.computedTotalPrice,
            computedUnitPrice: o.computedUnitPrice,
            validationStatus: o.validationStatus,
            currency: 'EUR',
            hasEquivalentBreakdown: o.hasEquivalentBreakdown
        }))
    };
}

export const NATUR_DOCUMENT_FIXTURE = {
    fixture: NATUR_FIXTURE,
    spec: fixtureToSpec(NATUR_FIXTURE)
};

export const STUTENSEE_DOCUMENT_FIXTURE = {
    fixture: STUTENSEE_FIXTURE,
    spec: fixtureToSpec(STUTENSEE_FIXTURE)
};

export const FUSSEL_DOCUMENT_FIXTURE = {
    fixture: FUSSEL_FIXTURE,
    spec: fixtureToSpec(FUSSEL_FIXTURE)
};

export const FAHRMANN_DOCUMENT_FIXTURE = {
    fixture: FAHRMANN_FIXTURE,
    spec: fixtureToSpec(FAHRMANN_FIXTURE)
};

export const MYSTERIOSEN_STEINE_DOCUMENT_FIXTURE = {
    fixture: MYSTERIOSEN_STEINE_FIXTURE,
    spec: fixtureToSpec(MYSTERIOSEN_STEINE_FIXTURE)
};
