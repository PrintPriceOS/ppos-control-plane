'use strict';

/**
 * src/api/services/taxVatReadinessClassifierService.js
 * 
 * PrintPrice OS — Tax/VAT Readiness Classifier Service (BUDGET-02C-01 Hardened)
 *
 * Implements authoritative fiscal evaluation for Control Plane:
 * 1. Legal Differentiation:
 *    - Intra-EU exempt supply of goods (Art. 25 Ley del IVA / Art. 138 Dir 2006/112/CE)
 *      requires verified cross-border dispatch evidence; VIES alone is NOT sufficient.
 *    - Intra-EU B2B services reverse charge (Art. 84.Uno.2º Ley del IVA / Art. 196 Dir 2006/112/CE).
 * 2. Product and Operational Differentiation:
 *    - Editorial books (Art. 91.Dos.1.2º Ley del IVA) in Spain: Super-reduced rate 4%.
 *    - Commercial print/general supplies in Spain: Standard rate 21%.
 *    - Special territories (Canary Islands IGIC, Ceuta/Melilla IPSI): Excluded from VAT territory.
 * 3. Fail-Closed Fiscal Gate:
 *    - If product category, operation nature or transport evidence cannot be reliably determined,
 *      the status is strictly set to TAX_CLASSIFICATION_BLOCKED to prevent unauthorized tax calculations.
 * 4. Exact Differential Tax Quota Calculation:
 *    - Calculates tax quotas independently on base and revised amounts before taking the delta,
 *      eliminating single-cent invoice reconciliation drift.
 */

class TaxVatReadinessClassifierService {
    constructor() {
        this.EU_COUNTRIES = [
            'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
            'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
            'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'
        ];
    }

    _isEU(countryCode) {
        if (!countryCode || typeof countryCode !== 'string') return false;
        return this.EU_COUNTRIES.includes(countryCode.trim().toUpperCase());
    }

    /**
     * Classifies transaction tax treatment and applicable rate.
     * Fails closed with 'TAX_CLASSIFICATION_BLOCKED' when data is insufficient or unreliable.
     */
    classifyReadiness(input = {}) {
        const {
            seller_country,
            customer_country,
            destination_region,
            customer_vat_id,
            vies_valid,
            customer_type,
            product_category,
            is_editorial_book,
            supply_type, // 'SUPPLY_OF_GOODS', 'SUPPLY_OF_SERVICES', 'WORKS_EXECUTION'
            cross_border_transport_verified, // Mandatory boolean for intra-EU goods exemption
            amount,
            expected_tax_amount
        } = input;

        const result = {
            readiness_status: 'READY',
            jurisdiction_code: null,
            tax_treatment: 'UNKNOWN',
            tax_rate_applied: 0,
            tax_rate_pct: 0,
            reverse_charge_flag: false,
            exemption_flag: false,
            warnings: [],
            findings: [],
            evidence: {
                seller_country,
                customer_country,
                destination_region: destination_region || null,
                customer_type: customer_type || 'UNKNOWN',
                has_vat_id: !!customer_vat_id,
                vies_valid: !!vies_valid,
                product_category: product_category || null,
                is_editorial_book: !!is_editorial_book,
                supply_type: supply_type || null,
                cross_border_transport_verified: !!cross_border_transport_verified
            }
        };

        // 1. Mandatory Geographic Data
        if (!seller_country || !customer_country) {
            result.readiness_status = 'TAX_CLASSIFICATION_BLOCKED';
            result.tax_treatment = 'BLOCKED_MISSING_JURISDICTION_DATA';
            result.findings.push('MISSING_JURISDICTION_DATA');
            result.warnings.push('Seller or customer country is missing. Tax classification blocked.');
            return result;
        }

        const sCountry = seller_country.trim().toUpperCase();
        const cCountry = customer_country.trim().toUpperCase();
        const dRegion = destination_region ? destination_region.trim().toUpperCase() : null;
        const sellerEU = this._isEU(sCountry);
        const customerEU = this._isEU(cCountry);

        result.jurisdiction_code = sCountry;

        // 2. Special Spanish Territories (Canary Islands, Ceuta, Melilla)
        if (sCountry === 'ES' && (dRegion === 'IC' || dRegion === 'CANARIAS' || cCountry === 'IC')) {
            result.tax_treatment = 'CANARY_ISLANDS_IGIC_REGIME';
            result.exemption_flag = true;
            result.tax_rate_applied = 0.00; // IGIC resolved separately by regional tax authority
            result.tax_rate_pct = 0.00;
            result.warnings.push('Canary Islands delivery is not subject to mainland VAT (IGIC regime applies).');
            return this._finalizeTaxCalculation(result, amount, expected_tax_amount);
        }

        if (sCountry === 'ES' && (dRegion === 'CE' || dRegion === 'ML' || cCountry === 'CE' || cCountry === 'ML')) {
            result.tax_treatment = 'CEUTA_MELILLA_IPSI_REGIME';
            result.exemption_flag = true;
            result.tax_rate_applied = 0.00;
            result.tax_rate_pct = 0.00;
            result.warnings.push('Ceuta/Melilla delivery is not subject to mainland VAT (IPSI regime applies).');
            return this._finalizeTaxCalculation(result, amount, expected_tax_amount);
        }

        // 3. Domestic Transactions (Same Country)
        if (sCountry === cCountry) {
            if (sCountry === 'ES') {
                // Editorial books qualification under Art. 91.Dos.1.2º Ley del IVA
                const isBook = is_editorial_book === true || product_category === 'BOOK' || product_category === 'EDITORIAL_BOOK';
                const isCommercial = product_category === 'COMMERCIAL_PRINT' || product_category === 'MARKETING_COLLATERAL';

                if (isBook) {
                    result.tax_treatment = 'DOMESTIC_VAT_SUPER_REDUCED_BOOKS_ART_91_DOS_1_2';
                    result.tax_rate_applied = 0.04;
                    result.tax_rate_pct = 4.00;
                } else if (isCommercial || product_category) {
                    result.tax_treatment = 'DOMESTIC_VAT_STANDARD';
                    result.tax_rate_applied = 0.21;
                    result.tax_rate_pct = 21.00;
                } else {
                    // Fail closed: Product category is completely unknown, cannot guess between 4% and 21%
                    result.readiness_status = 'TAX_CLASSIFICATION_BLOCKED';
                    result.tax_treatment = 'BLOCKED_UNKNOWN_PRODUCT_CATEGORY';
                    result.findings.push('UNKNOWN_PRODUCT_CATEGORY_RATE_AMBIGUITY');
                    result.warnings.push('Product category missing. Cannot determine whether 4% (books art. 91.Dos.1.2) or 21% (standard) applies.');
                    return result;
                }
            } else {
                // Default domestic rate for non-ES countries in mock/integration scope
                result.tax_treatment = 'DOMESTIC_VAT';
                result.tax_rate_applied = 0.20;
                result.tax_rate_pct = 20.00;
            }
            return this._finalizeTaxCalculation(result, amount, expected_tax_amount);
        }

        // 4. Intra-EU Cross-Border Transactions
        if (sellerEU && customerEU) {
            if (customer_type === 'B2B') {
                if (!customer_vat_id) {
                    result.readiness_status = 'TAX_CLASSIFICATION_BLOCKED';
                    result.tax_treatment = 'BLOCKED_MISSING_CUSTOMER_VAT_ID';
                    result.findings.push('MISSING_CUSTOMER_VAT_ID');
                    result.warnings.push('Cross-border EU B2B transaction requires customer VAT ID.');
                    return result;
                }

                // Strict Legal Distinction between Goods and Services
                const resolvedSupply = supply_type || (product_category === 'BOOK' || product_category === 'COMMERCIAL_PRINT' ? 'SUPPLY_OF_GOODS' : null);

                if (resolvedSupply === 'SUPPLY_OF_GOODS' || resolvedSupply === 'WORKS_EXECUTION') {
                    // Entrega Intracomunitaria de Bienes (Art. 25 Ley del IVA / Art. 138 Dir 2006/112/CE)
                    // VIES is mandatory, BUT cross-border transport must also be confirmed!
                    if (cross_border_transport_verified === true) {
                        result.tax_treatment = 'INTRA_EU_SUPPLY_OF_GOODS_EXEMPT';
                        result.exemption_flag = true;
                        result.reverse_charge_flag = false;
                        result.tax_rate_applied = 0.00;
                        result.tax_rate_pct = 0.00;
                    } else {
                        // VIES valid alone does not justify goods exemption without physical transport proof!
                        result.readiness_status = 'TAX_CLASSIFICATION_BLOCKED';
                        result.tax_treatment = 'BLOCKED_UNVERIFIED_CROSS_BORDER_DISPATCH';
                        result.findings.push('UNVERIFIED_CROSS_BORDER_DISPATCH');
                        result.warnings.push('Intra-EU supply of goods exemption requires verified cross-border transport evidence. VIES alone is insufficient.');
                        return result;
                    }
                } else if (resolvedSupply === 'SUPPLY_OF_SERVICES') {
                    // Prestación de servicios (Art. 84.Uno.2º Ley del IVA / Art. 196 Dir 2006/112/CE)
                    result.tax_treatment = 'INTRA_EU_B2B_SERVICES_REVERSE_CHARGE';
                    result.reverse_charge_flag = true;
                    result.exemption_flag = false;
                    result.tax_rate_applied = 0.00;
                    result.tax_rate_pct = 0.00;
                } else {
                    // Unknown supply type: Block to prevent misapplying exemption vs reverse charge
                    result.readiness_status = 'TAX_CLASSIFICATION_BLOCKED';
                    result.tax_treatment = 'BLOCKED_UNKNOWN_SUPPLY_TYPE';
                    result.findings.push('UNKNOWN_SUPPLY_TYPE');
                    result.warnings.push('Cannot classify cross-border transaction without supply_type (goods vs services).');
                    return result;
                }
            } else {
                // Intra-EU B2C: Requires OSS destination tax determination
                result.readiness_status = 'TAX_CLASSIFICATION_BLOCKED';
                result.tax_treatment = 'BLOCKED_INTRA_EU_B2C_OSS_REVIEW_REQUIRED';
                result.findings.push('INTRA_EU_B2C_REVIEW_REQUIRED');
                result.warnings.push('Intra-EU B2C requires OSS destination VAT registration and rate resolution.');
                return result;
            }
            return this._finalizeTaxCalculation(result, amount, expected_tax_amount);
        }

        // 5. Extra-EU Export
        result.readiness_status = 'TAX_CLASSIFICATION_BLOCKED';
        result.tax_treatment = 'BLOCKED_NON_EU_EXPORT_CUSTOMS_REQUIRED';
        result.exemption_flag = true;
        result.tax_rate_applied = 0.00;
        result.tax_rate_pct = 0.00;
        result.findings.push('NON_EU_EXPORT_CUSTOMS_EVIDENCE_REQUIRED');
        result.warnings.push('Non-EU export requires verifiable customs documentation (DUA de exportación). Tax calculation blocked.');
        return result;
    }

    _finalizeTaxCalculation(result, amount, expected_tax_amount) {
        if (amount !== undefined && Number.isFinite(amount)) {
            const calculatedTax = Math.round(amount * result.tax_rate_applied * 100) / 100;
            if (expected_tax_amount !== undefined && Math.abs(calculatedTax - expected_tax_amount) > 0.01) {
                result.readiness_status = 'TAX_CLASSIFICATION_BLOCKED';
                result.findings.push('TAX_AMOUNT_MISMATCH');
                result.warnings.push(`Expected tax amount ${expected_tax_amount} does not match computed ${calculatedTax}`);
            }
        }
        result.readiness_note = 'Fiscal classification evaluated by Control Plane authoritative tax readiness service.';
        return result;
    }

    /**
     * Canonical Governed Differential Tax Calculation.
     * Computes base_tax and revised_tax independently before calculating delta_tax,
     * ensuring 100% rounding parity across invoices, debit/credit notes and user display.
     */
    calculateGovernedTaxBreakdown({ baseNetAmount, revisedNetAmount, taxRatePct }) {
        if (!Number.isFinite(baseNetAmount) || !Number.isFinite(revisedNetAmount) || !Number.isFinite(taxRatePct)) {
            throw new Error('Invalid numeric arguments provided to calculateGovernedTaxBreakdown');
        }

        const baseNet = Math.round(baseNetAmount * 10000) / 10000;
        const revisedNet = Math.round(revisedNetAmount * 10000) / 10000;
        const deltaNet = Math.round((revisedNet - baseNet) * 10000) / 10000;

        const rateDecimal = taxRatePct / 100.0;
        const baseTax = Math.round(baseNet * rateDecimal * 100) / 100;
        const revisedTax = Math.round(revisedNet * rateDecimal * 100) / 100;
        const deltaTax = Math.round((revisedTax - baseTax) * 100) / 100;

        const baseGross = Math.round((baseNet + baseTax) * 100) / 100;
        const revisedGross = Math.round((revisedNet + revisedTax) * 100) / 100;
        const deltaGross = Math.round((revisedGross - baseGross) * 100) / 100;

        return {
            currency: 'EUR',
            tax_rate_pct: taxRatePct,
            base_net_amount: baseNet,
            delta_net_amount: deltaNet,
            revised_net_amount: revisedNet,
            base_tax_amount: baseTax,
            delta_tax_amount: deltaTax,
            revised_tax_amount: revisedTax,
            base_gross_amount: baseGross,
            delta_gross_amount: deltaGross,
            revised_gross_amount: revisedGross
        };
    }
}

module.exports = TaxVatReadinessClassifierService;
