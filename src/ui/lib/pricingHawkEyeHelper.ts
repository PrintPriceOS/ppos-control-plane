/**
 * src/ui/lib/pricingHawkEyeHelper.ts
 *
 * Read-only evaluation and aggregation helper for Pricing Hawk-Eye.
 * Evaluates completeness, coverage, representative anchors, and domain health
 * directly from canonical PrinthouseRates (ph.rates).
 *
 * INVARIANTS & POLICIES:
 * 1. Zero data mutations.
 * 2. Explicit numeric 0 is a VALID configured value and is NOT treated as missing.
 * 3. Empty objects {} or null/undefined/missing structures count as missing.
 * 4. Weighted Coverage: CONFIGURED = 1.0, PARTIAL = 0.5, MISSING = 0.0.
 * 5. Truthful semantics: No inference of calibration state, runtime sync, or marketplace readiness.
 */

import { PrinthouseRates } from '../pages/os/PrinthousesPage';
import { PricingDetailTab } from '../types/printhousePricing';

export type ModuleStatus = 'CONFIGURED' | 'PARTIAL' | 'MISSING' | 'NOT_APPLICABLE';

export interface ModuleHealth {
    key: string;
    label: string;
    targetTab: PricingDetailTab;
    status: ModuleStatus;
    configuredCount: number;
    totalExpected: number;
}

export interface PricingAnchorValue {
    label: string;
    fixed: number | null | undefined;
    variable?: number | null | undefined;
    unit: string;
    isConfigured: boolean;
}

export interface PricingHawkEyeState {
    coveragePercent: number;
    configuredDomains: number;
    totalDomains: number;
    missingCriticalRates: number;
    pricingState: 'Configured' | 'Partial' | 'Incomplete';
    pricingStateSubtitle: string;
    canonicalSource: 'Canonical';
    sourceSubtitle: 'printer_nodes.rates_json';
    modules: Record<string, ModuleHealth>;
    moduleList: ModuleHealth[];
    anchors: PricingAnchorValue[];
    hasRates: boolean;
    pricingReadiness: 'READY' | 'PARTIAL' | 'INCOMPLETE';
    readinessSubtitle: string;
    quoteCapability: 'Available' | 'Unavailable';
}

function isDefinedNumber(val: any): boolean {
    return typeof val === 'number' && !isNaN(val);
}

function hasDefinedNumericRates(obj: any): boolean {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    if (keys.length === 0) return false;
    return keys.some(k => isDefinedNumber(obj[k]));
}

function evaluateBindingFamilies(rates: PrinthouseRates): ModuleStatus {
    const families = [
        { fixed: rates.binding_pb_fixed_by_sections, var: rates.binding_pb_var_per_1000_by_sections },
        { fixed: rates.binding_hc_fixed_by_sections, var: rates.binding_hc_var_per_1000_by_sections },
        { fixed: rates.binding_wo_fixed_by_sections, var: rates.binding_wo_var_per_1000_by_sections },
        { fixed: rates.binding_ss_fixed_by_sections, var: rates.binding_ss_var_per_1000_by_sections }
    ];

    let hasAnyConfiguredFamily = false;
    let hasAnyPartialFamily = false;
    let hasAnyData = false;

    for (const fam of families) {
        const hasFixed = hasDefinedNumericRates(fam.fixed);
        const hasVar = hasDefinedNumericRates(fam.var);

        if (hasFixed && hasVar) {
            hasAnyConfiguredFamily = true;
            hasAnyData = true;
        } else if (hasFixed || hasVar) {
            hasAnyPartialFamily = true;
            hasAnyData = true;
        }
    }

    if (hasAnyConfiguredFamily && !hasAnyPartialFamily) {
        return 'CONFIGURED';
    }
    if (hasAnyConfiguredFamily && hasAnyPartialFamily) {
        return 'PARTIAL';
    }
    if (hasAnyPartialFamily) {
        return 'PARTIAL';
    }
    if (!hasAnyData) {
        return 'MISSING';
    }
    return 'MISSING';
}

export function getPricingHawkEyeState(rates?: PrinthouseRates | null): PricingHawkEyeState {
    const emptyModules: ModuleHealth[] = [
        { key: 'interior', label: 'Interior', targetTab: 'Interior', status: 'MISSING', configuredCount: 0, totalExpected: 6 },
        { key: 'coverEndpapers', label: 'Cover & Endpapers', targetTab: 'Cover & Endpapers', status: 'MISSING', configuredCount: 0, totalExpected: 2 },
        { key: 'laminationUv', label: 'Lamination & UV', targetTab: 'Lamination & UV', status: 'MISSING', configuredCount: 0, totalExpected: 3 },
        { key: 'binding', label: 'Binding', targetTab: 'Binding', status: 'MISSING', configuredCount: 0, totalExpected: 2 },
        { key: 'paperCosts', label: 'Paper Costs', targetTab: 'Paper Costs', status: 'MISSING', configuredCount: 0, totalExpected: 2 },
        { key: 'transport', label: 'Transport', targetTab: 'Transport', status: 'MISSING', configuredCount: 0, totalExpected: 1 }
    ];

    if (!rates || Object.keys(rates).length === 0) {
        return {
            coveragePercent: 0,
            configuredDomains: 0,
            totalDomains: 6,
            missingCriticalRates: 8,
            pricingState: 'Incomplete',
            pricingStateSubtitle: 'Requires pricing setup',
            canonicalSource: 'Canonical',
            sourceSubtitle: 'printer_nodes.rates_json',
            modules: emptyModules.reduce((acc, m) => ({ ...acc, [m.key]: m }), {}),
            moduleList: emptyModules,
            anchors: [
                { label: 'Interior Full Colour 16p', fixed: null, variable: null, unit: 'per section', isConfigured: false },
                { label: 'Cover 4C', fixed: null, variable: null, unit: 'per section', isConfigured: false },
                { label: 'Perfect Bound Section 4', fixed: null, variable: null, unit: 'per section', isConfigured: false },
                { label: 'Interior Paper Offset', fixed: null, unit: '€/kg', isConfigured: false },
                { label: 'Cover Paper MC', fixed: null, unit: '€/kg', isConfigured: false }
            ],
            hasRates: false,
            pricingReadiness: 'INCOMPLETE',
            readinessSubtitle: 'Pricing configuration required',
            quoteCapability: 'Unavailable'
        };
    }

    // ── 1. Evaluate Individual Domain Completeness with strict structural rules ──

    // A. Interior: 6 structural groups (1c fixed/var, 2c fixed/var, full fixed/var)
    const hasIntOneFixed = hasDefinedNumericRates(rates.interior_one_colour_fixed);
    const hasIntOneVar = hasDefinedNumericRates(rates.interior_one_colour_var);
    const hasIntTwoFixed = hasDefinedNumericRates(rates.interior_two_colour_fixed);
    const hasIntTwoVar = hasDefinedNumericRates(rates.interior_two_colour_var);
    const hasIntFullFixed = hasDefinedNumericRates(rates.interior_full_colour_fixed);
    const hasIntFullVar = hasDefinedNumericRates(rates.interior_full_colour_var);
    const interiorChecks = [hasIntOneFixed, hasIntOneVar, hasIntTwoFixed, hasIntTwoVar, hasIntFullFixed, hasIntFullVar];
    const interiorCount = interiorChecks.filter(Boolean).length;
    const interiorStatus: ModuleStatus = interiorCount === 6 ? 'CONFIGURED' : interiorCount > 0 ? 'PARTIAL' : 'MISSING';

    // B. Cover & Endpapers: cover fixed & cover var
    const hasCoverFixed = hasDefinedNumericRates(rates.cover_fixed_by_colours);
    const hasCoverVar = hasDefinedNumericRates(rates.cover_var_per_1000_by_colours);
    const coverChecks = [hasCoverFixed, hasCoverVar];
    const coverCount = coverChecks.filter(Boolean).length;
    const coverStatus: ModuleStatus = coverCount === 2 ? 'CONFIGURED' : coverCount > 0 ? 'PARTIAL' : 'MISSING';

    // C. Lamination & UV: lam fixed, lam var, uv varnish
    const hasLamFixed = hasDefinedNumericRates(rates.lam_fixed);
    const hasLamVar = hasDefinedNumericRates(rates.lam_var_per_1000);
    const hasUv = rates.uv_varnish && (isDefinedNumber(rates.uv_varnish.fixed) && isDefinedNumber(rates.uv_varnish.var));
    const lamChecks = [hasLamFixed, hasLamVar, Boolean(hasUv)];
    const lamCount = lamChecks.filter(Boolean).length;
    const lamStatus: ModuleStatus = lamCount === 3 ? 'CONFIGURED' : lamCount > 0 ? 'PARTIAL' : 'MISSING';

    // D. Binding: paired fixed & var across supported family sets
    const bindingStatus = evaluateBindingFamilies(rates);
    const bindingCount = bindingStatus === 'CONFIGURED' ? 2 : bindingStatus === 'PARTIAL' ? 1 : 0;

    // E. Paper Costs: interior paper & cover paper
    const hasPaperInt = hasDefinedNumericRates(rates.paper_price_interior_by_kilo);
    const hasPaperCov = hasDefinedNumericRates(rates.paper_price_cover_by_kilo);
    const paperChecks = [hasPaperInt, hasPaperCov];
    const paperCount = paperChecks.filter(Boolean).length;
    const paperStatus: ModuleStatus = paperCount === 2 ? 'CONFIGURED' : paperCount > 0 ? 'PARTIAL' : 'MISSING';

    // F. Transport: transport_costs or technical_costs_for_transport
    const hasTransCosts = hasDefinedNumericRates(rates.transport_costs);
    const hasTechTrans = rates.technical_costs_for_transport !== undefined && rates.technical_costs_for_transport !== null;
    const transportStatus: ModuleStatus = (hasTransCosts || hasTechTrans) ? 'CONFIGURED' : 'MISSING';

    const moduleList: ModuleHealth[] = [
        { key: 'interior', label: 'Interior', targetTab: 'Interior', status: interiorStatus, configuredCount: interiorCount, totalExpected: 6 },
        { key: 'coverEndpapers', label: 'Cover & Endpapers', targetTab: 'Cover & Endpapers', status: coverStatus, configuredCount: coverCount, totalExpected: 2 },
        { key: 'laminationUv', label: 'Lamination & UV', targetTab: 'Lamination & UV', status: lamStatus, configuredCount: lamCount, totalExpected: 3 },
        { key: 'binding', label: 'Binding', targetTab: 'Binding', status: bindingStatus, configuredCount: bindingCount, totalExpected: 2 },
        { key: 'paperCosts', label: 'Paper Costs', targetTab: 'Paper Costs', status: paperStatus, configuredCount: paperCount, totalExpected: 2 },
        { key: 'transport', label: 'Transport', targetTab: 'Transport', status: transportStatus, configuredCount: transportStatus === 'CONFIGURED' ? 1 : 0, totalExpected: 1 }
    ];

    const modules = moduleList.reduce((acc, m) => ({ ...acc, [m.key]: m }), {} as Record<string, ModuleHealth>);
    const configuredDomains = moduleList.filter(m => m.status === 'CONFIGURED').length;
    const totalDomains = moduleList.length;

    // Weighted Coverage Calculation: CONFIGURED = 1.0, PARTIAL = 0.5, MISSING = 0.0
    const coverageWeightSum = moduleList.reduce((sum, m) => {
        if (m.status === 'CONFIGURED') return sum + 1.0;
        if (m.status === 'PARTIAL') return sum + 0.5;
        return sum;
    }, 0);
    const coveragePercent = Math.round((coverageWeightSum / totalDomains) * 100);

    // ── 2. Critical Anchor Extraction & Zero-Safe Check ──
    const intFixed16 = rates.interior_full_colour_fixed?.['16p'];
    const intVar16 = rates.interior_full_colour_var?.['16p'];
    const covFixed4 = rates.cover_fixed_by_colours?.['4'];
    const covVar4 = rates.cover_var_per_1000_by_colours?.['4'];
    const pbFixed4 = rates.binding_pb_fixed_by_sections?.['4'];
    const pbVar4 = rates.binding_pb_var_per_1000_by_sections?.['4'];
    const paperOffset = rates.paper_price_interior_by_kilo?.offset;
    const paperCoverMc = rates.paper_price_cover_by_kilo?.mc;

    const criticalValues = [
        intFixed16, intVar16,
        covFixed4, covVar4,
        pbFixed4, pbVar4,
        paperOffset, paperCoverMc
    ];

    // Explicit 0 is valid; only null / undefined is missing
    const missingCriticalRates = criticalValues.filter(v => !isDefinedNumber(v)).length;

    const anchors: PricingAnchorValue[] = [
        {
            label: 'Interior Full Colour 16p',
            fixed: intFixed16,
            variable: intVar16,
            unit: 'per section',
            isConfigured: isDefinedNumber(intFixed16) && isDefinedNumber(intVar16)
        },
        {
            label: 'Cover 4C',
            fixed: covFixed4,
            variable: covVar4,
            unit: 'per section',
            isConfigured: isDefinedNumber(covFixed4) && isDefinedNumber(covVar4)
        },
        {
            label: 'Perfect Bound Section 4',
            fixed: pbFixed4,
            variable: pbVar4,
            unit: 'per section',
            isConfigured: isDefinedNumber(pbFixed4) && isDefinedNumber(pbVar4)
        },
        {
            label: 'Interior Paper Offset',
            fixed: paperOffset,
            unit: '€/kg',
            isConfigured: isDefinedNumber(paperOffset)
        },
        {
            label: 'Cover Paper MC',
            fixed: paperCoverMc,
            unit: '€/kg',
            isConfigured: isDefinedNumber(paperCoverMc)
        }
    ];

    let pricingState: 'Configured' | 'Partial' | 'Incomplete' = 'Configured';
    let pricingStateSubtitle = 'Rate card structurally complete';
    let pricingReadiness: 'READY' | 'PARTIAL' | 'INCOMPLETE' = 'READY';
    let readinessSubtitle = 'Canonical pricing structure complete';

    if (coveragePercent === 100 && missingCriticalRates === 0) {
        pricingState = 'Configured';
        pricingStateSubtitle = 'Rate card structurally complete';
        pricingReadiness = 'READY';
        readinessSubtitle = 'Canonical pricing structure complete';
    } else if (coveragePercent >= 50) {
        pricingState = 'Partial';
        pricingStateSubtitle = 'Some pricing domains incomplete';
        pricingReadiness = 'PARTIAL';
        readinessSubtitle = 'Some pricing domains incomplete';
    } else {
        pricingState = 'Incomplete';
        pricingStateSubtitle = 'Requires pricing setup';
        pricingReadiness = 'INCOMPLETE';
        readinessSubtitle = 'Pricing configuration required';
    }

    const quoteCapability: 'Available' | 'Unavailable' =
        pricingReadiness === 'READY' ? 'Available' : 'Unavailable';

    return {
        coveragePercent,
        configuredDomains,
        totalDomains,
        missingCriticalRates,
        pricingState,
        pricingStateSubtitle,
        canonicalSource: 'Canonical',
        sourceSubtitle: 'printer_nodes.rates_json',
        modules,
        moduleList,
        anchors,
        hasRates: true,
        pricingReadiness,
        readinessSubtitle,
        quoteCapability
    };
}
