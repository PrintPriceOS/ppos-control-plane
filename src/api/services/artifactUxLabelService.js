function buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience }) {
    const isCustomer = audience === 'customer';
    const isOperator = audience === 'operator' || audience === 'admin';
    const type = artifact.type || artifact.alias;

    let display_label = "";
    let short_label = "";
    let status_badge = "";
    let status_tone = "neutral";
    let button_label = "";
    let tooltip = "";
    let description = "";
    let customer_visible = artifact.customer_visible === true;
    let operator_visible = true;
    let is_primary = artifact.is_primary === true;
    let download_allowed = artifact.downloadable !== false;
    let warning = null;
    let forbidden_claims = [];
    let allowed_claims = [];

    const trust = artifact_trust || {};
    const review_required = trust.review_required === true;
    const production_certified = trust.production_certified === true;
    const standard_certified = trust.standard_certified === true;
    
    // Helper to evaluate standards evidence
    const ev = trust.evidence || {};
    const hasStandardsEvidence = ev.validation_performed === true && ev.validation_passed === true;

    // Phase 61D: Extract structural governance
    const structGov = human_report?.structural_metadata_governance || {};
    const metadata_cleanup = structGov.metadata_cleanup_applied === true;
    const object_streams_normalized = structGov.object_streams_normalized === true;
    const internal_report = structGov.internal_standard_report_generated === true;

    const stripClaims = (str) => {
        if (!str) return str;
        const forbidden = ["Certified PDF", "Print-ready", "PDF/X certified", "PDF/A certified", "Standards certified", "Production ready", "Guaranteed fixed", "Fully corrected", "PDF/X validated", "PDF/A validated", "Standards validated"];
        let result = str;
        forbidden.forEach(c => {
            const regex = new RegExp(c, 'gi');
            if (regex.test(result)) {
                forbidden_claims.push(c);
                result = result.replace(regex, '');
            }
        });
        return result.trim();
    };
    
    // Check initial label for forbidden claims
    if (isCustomer || metadata_cleanup) {
        stripClaims(artifact.label || "");
    }

    if (metadata_cleanup) {
        warning = "Metadata cleanup does not prove PDF/X or PDF/A compliance.";
    }

    if (type === 'review_pdf') {
        if (isCustomer) {
            display_label = "Review file";
            short_label = "Review";
            status_badge = "Needs review";
            status_tone = "warning";
            button_label = "Download review file";
            tooltip = "This file shows the corrected result for review. It is not yet approved for production.";
            if (review_required) {
                // explicit marking
            }
        } else {
            display_label = "Review PDF";
            short_label = "Review";
            status_badge = "Human review required";
            status_tone = "warning";
            button_label = "Download Review PDF";
            tooltip = "Use this artifact to inspect visual or governance-sensitive changes before approval.";
            if (trust.primary_artifact_type === 'review_pdf') is_primary = true;
        }
        allowed_claims.push("Needs review");
    } else if (type === 'fixed_pdf') {
        if (isCustomer) {
            display_label = "Corrected file";
            short_label = "Corrected";
            status_badge = "Corrected";
            status_tone = "info";
            button_label = "Download corrected file";
            tooltip = "This file includes automated corrections, but it may still require approval before production.";
        } else {
            display_label = "Fixed PDF";
            short_label = "Fixed";
            status_badge = "Fix output";
            status_tone = "info";
            button_label = "Download Fixed PDF";
            tooltip = "This is the automated fix output. It is not necessarily production-approved.";
        }
        allowed_claims.push("Corrected");
    } else if (type === 'certified_pdf') {
        if (!production_certified) {
            if (isCustomer) {
                customer_visible = false;
                display_label = "Internal file";
                short_label = "Internal";
                status_badge = "Internal";
                button_label = "Download file";
                tooltip = "This file is not production approved.";
            } else {
                display_label = "Certified PDF artifact";
                short_label = "Artifact";
                status_badge = "Not production certified";
                status_tone = "danger";
                button_label = "Download Artifact";
                tooltip = "The artifact exists, but artifact_trust does not allow production certification.";
                warning = "artifact_trust does not allow production certification. Filename alone does not certify it.";
            }
        } else if (production_certified && !standard_certified) {
            if (isCustomer) {
                display_label = "Production-approved file";
                short_label = "Approved";
                status_badge = "Production approved";
                status_tone = "success";
                button_label = "Download production-approved file";
                tooltip = "This file is approved by internal preflight checks. It has not been independently validated as PDF/X or PDF/A.";
            } else {
                display_label = "Production-approved PDF";
                short_label = "Approved";
                status_badge = "Internal production approval";
                status_tone = "success";
                button_label = "Download Production-approved PDF";
                tooltip = "Approved by internal preflight governance. Not independently validated as PDF/X or PDF/A.";
            }
            allowed_claims.push("Production approved");
            allowed_claims.push("Not yet validated as PDF/X or PDF/A");
        } else if (production_certified && standard_certified) {
            if (!hasStandardsEvidence) {
                // Downgrade to production approved
                if (isCustomer) {
                    display_label = "Production-approved file";
                    status_badge = "Production approved";
                    button_label = "Download production-approved file";
                    tooltip = "This file is approved by internal preflight checks. It has not been independently validated as PDF/X or PDF/A.";
                } else {
                    display_label = "Production-approved PDF";
                    status_badge = "Internal production approval";
                    button_label = "Download Production-approved PDF";
                    tooltip = "Standards claim present but validator evidence is missing.";
                    warning = "STANDARD_CLAIM_WITHOUT_VALIDATOR_EVIDENCE";
                }
            } else {
                const detected = ev.standard_detected || "PDF/X";
                if (isCustomer) {
                    display_label = "Standards-validated file";
                    short_label = "Validated";
                    status_badge = `${detected} validated`;
                    status_tone = "success";
                    button_label = "Download validated file";
                    tooltip = "This file includes standards validation evidence.";
                } else {
                    display_label = "Standards-validated PDF";
                    short_label = "Validated";
                    status_badge = "Standards validated";
                    status_tone = "success";
                    button_label = "Download Standards-validated PDF";
                    tooltip = "Validator evidence is available. Check validation report for details.";
                }
                allowed_claims.push("Standards validated");
            }
        }
        
        if (trust.outputintent_changed && !trust.outputintent_does_not_prove_pdfx) {
            if (isOperator) {
                warning = warning ? warning + " OutputIntent does not prove PDF/X." : "OutputIntent does not prove PDF/X.";
            }
        }
    } else if (type === 'audit_json' || type === 'fix_audit') {
        display_label = "Fix Audit JSON";
        short_label = "Audit";
        status_badge = "Technical metadata";
        button_label = "Download Fix Audit JSON";
        tooltip = "Technical audit trail showing fixes attempted, skipped fixes, governance decisions, and artifact trust.";
        if (isCustomer) {
            customer_visible = false;
        }
    } else if (type === 'delta_report') {
        display_label = "Delta Report";
        short_label = "Delta";
        status_badge = "Differences";
        button_label = "Download Delta Report";
        tooltip = "Structured report showing what changed between the original and corrected files.";
        if (isCustomer) {
            customer_visible = false;
        }
    } else if (type === 'human_report' || type === 'report_json') {
        if (internal_report) {
            display_label = "Internal standards report";
            short_label = "Internal Report";
            status_badge = "Internal Governance";
            button_label = "Download Internal Report";
            tooltip = "Internal governance report only. Not a PDF/X or PDF/A validator certificate.";
        } else {
            display_label = "Human Report";
            short_label = "Report";
            status_badge = "Summary";
            button_label = "Download Human Report";
            tooltip = "Readable summary for operators and customers, including review requirements and safe recommendations.";
        }
        if (isCustomer) {
            customer_visible = false;
        }
    } else if (type === 'validation_report') {
        if (internal_report) {
            display_label = "Internal standards report";
            short_label = "Internal Report";
            status_badge = "Internal Governance";
            button_label = "Download Internal Report";
            tooltip = "Internal governance report only. Not a PDF/X or PDF/A validator certificate.";
        } else {
            display_label = "Standards Validation Report";
            short_label = "Validation";
            status_badge = "Independent Validation";
            button_label = "Download Validation Report";
            tooltip = "Independent validator evidence for PDF/X or PDF/A compliance, if available.";
        }
        if (isCustomer) {
            customer_visible = false;
        }
    } else {
        display_label = artifact.label || "Artifact";
        status_badge = "Available";
        button_label = "Download";
        tooltip = "Download artifact.";
    }

    // Apply metadata cleanup / structural cleanup overrides for PDF artifacts
    if (['certified_pdf', 'fixed_pdf', 'review_pdf'].includes(type)) {
        if (metadata_cleanup && (!production_certified || !standard_certified || !hasStandardsEvidence)) {
            if (type === 'certified_pdf') {
                if (isCustomer) {
                    display_label = "Corrected file";
                    short_label = "Corrected";
                } else {
                    display_label = "Corrected artifact with metadata cleanup";
                    short_label = "Corrected";
                }
                button_label = isCustomer ? "Download corrected file" : "Download Corrected artifact";
            }
            status_badge = isCustomer ? "Metadata cleaned" : "Structural cleanup";
            status_tone = "info";
            tooltip = "Metadata was cleaned to avoid unsupported certification claims. This does not prove PDF/X or PDF/A compliance.";
        } else if (object_streams_normalized && !metadata_cleanup && (!production_certified || !standard_certified || !hasStandardsEvidence)) {
            status_badge = "Structure cleaned";
            tooltip = "PDF object streams were normalized. This is a structural cleanup, not standards validation.";
        }
    }

    // Sanitize any remaining forbidden claims if customer
    if (isCustomer) {
        display_label = stripClaims(display_label);
        button_label = stripClaims(button_label);
        status_badge = stripClaims(status_badge);
        tooltip = stripClaims(tooltip);
    }

    return {
        artifact_type: type,
        display_label,
        short_label,
        status_badge,
        status_tone,
        button_label,
        tooltip,
        description,
        customer_visible,
        operator_visible,
        is_primary,
        download_allowed,
        warning,
        forbidden_claims: [...new Set(forbidden_claims)],
        allowed_claims: [...new Set(allowed_claims)]
    };
}

module.exports = {
    buildArtifactUxLabels
};
