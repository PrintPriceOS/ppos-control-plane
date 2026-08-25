/**
 * src/ui/types/printhousePricing.ts
 *
 * Neutral type definitions for Printhouse pricing domains and navigation.
 * Decouples helper utilities from page-level component files.
 */

export type PricingDetailTab =
    | 'Interior'
    | 'Cover & Endpapers'
    | 'Lamination & UV'
    | 'Binding'
    | 'Paper Costs'
    | 'Transport';
