/**
 * src/ui/types/printhousePricing.ts
 *
 * Neutral type definitions for Printhouse pricing domains, governance metadata,
 * and navigation. Decouples helper utilities from page-level component files.
 */

export type PricingDetailTab =
    | 'Interior'
    | 'Cover & Endpapers'
    | 'Lamination & UV'
    | 'Binding'
    | 'Paper Costs'
    | 'Transport';

export interface PrinthousePricingGovernance {
    activeRevisionId: string | null;
    activeRevisionChecksum: string | null;
    latestRevisionId: string | null;
    lastCalibrationAt: string | null;
    lastAcceptedRunId: string | null;
    lastAcceptanceId: string | null;
    lastVerifiedManufacturingPrice: number | null;
    lastVerifiedManufacturingPriceAt: string | null;
}
