class TaxVatReadinessClassifierService {
    constructor() {
        this.EU_COUNTRIES = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
    }

    _isEU(countryCode) {
        return this.EU_COUNTRIES.includes(countryCode);
    }

    classifyReadiness(input) {
        const { seller_country, customer_country, customer_vat_id, customer_type, amount, expected_tax_amount } = input;
        
        const result = {
            readiness_status: 'READY',
            jurisdiction_code: null,
            tax_treatment: 'UNKNOWN',
            tax_rate_applied: 0,
            reverse_charge_flag: false,
            exemption_flag: false,
            warnings: [],
            findings: [],
            evidence: {
                seller_country,
                customer_country,
                customer_type,
                has_vat_id: !!customer_vat_id
            }
        };

        if (!seller_country || !customer_country) {
            result.readiness_status = 'MANUAL_REVIEW_REQUIRED';
            result.findings.push('MISSING_JURISDICTION_DATA');
            result.warnings.push('Seller or customer country is missing. Cannot classify.');
            return result;
        }

        const sellerEU = this._isEU(seller_country);
        const customerEU = this._isEU(customer_country);

        result.jurisdiction_code = seller_country;

        if (seller_country === customer_country) {
            result.tax_treatment = 'DOMESTIC_VAT';
            result.tax_rate_applied = 0.20; // Default mock rate
        } else if (sellerEU && customerEU) {
            if (customer_type === 'B2B') {
                if (customer_vat_id) {
                    result.tax_treatment = 'INTRA_EU_B2B_REVERSE_CHARGE';
                    result.reverse_charge_flag = true;
                    result.tax_rate_applied = 0;
                } else {
                    result.readiness_status = 'MANUAL_REVIEW_REQUIRED';
                    result.tax_treatment = 'INTRA_EU_B2B_MISSING_VAT_ID';
                    result.findings.push('MISSING_CUSTOMER_VAT_ID');
                    result.warnings.push('Cross-border EU B2B transaction requires valid VAT ID for reverse charge.');
                }
            } else {
                result.readiness_status = 'MANUAL_REVIEW_REQUIRED';
                result.tax_treatment = 'INTRA_EU_B2C_OSS_CANDIDATE';
                result.findings.push('INTRA_EU_B2C_REVIEW_REQUIRED');
                result.warnings.push('Intra-EU B2C may require OSS reporting. Manual review required.');
            }
        } else {
            result.readiness_status = 'MANUAL_REVIEW_REQUIRED';
            result.tax_treatment = 'EXPORT_NON_EU';
            result.exemption_flag = true;
            result.tax_rate_applied = 0;
            result.findings.push('NON_EU_EXPORT_REVIEW_REQUIRED');
            result.warnings.push('Non-EU export requires customs evidence. Manual review required.');
        }

        const calculatedTax = amount * result.tax_rate_applied;
        if (expected_tax_amount !== undefined && Math.abs(calculatedTax - expected_tax_amount) > 0.01) {
            result.readiness_status = 'MANUAL_REVIEW_REQUIRED';
            result.findings.push('TAX_AMOUNT_MISMATCH');
            result.warnings.push(`Invoice tax amount ${expected_tax_amount} does not match estimated ${calculatedTax}`);
        }

        result.readiness_note = 'This is a readiness classification only and does not represent a legal tax filing.';
        return result;
    }
}

module.exports = TaxVatReadinessClassifierService;
