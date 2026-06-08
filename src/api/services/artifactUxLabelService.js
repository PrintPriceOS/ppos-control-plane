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

    // Phase 62D: Extract page marks governance
    const pmGov = human_report?.page_marks_governance || {};
    const crop_marks_added = pmGov.crop_marks_added === true;
    const removal_not_safe = pmGov.removal_not_safe === true;
    const pm_review_required = pmGov.review_required === true;
    const marks_inside_trim = pmGov.marks_inside_trim === true;
    const insufficient_margin = pmGov.insufficient_margin === true;
    const unsafe_geometry = pmGov.unsafe_geometry_detected === true;

    // Phase 63D: Extract security/interactivity governance
    const siGov = human_report?.security_interactivity_governance || {};
    const active_content_removed = siGov.active_content_removed === true;
    const interactive_content_reviewed = siGov.annotations_flattened === true || siGov.forms_flattened === true;
    const flatten_skipped = siGov.annotation_flatten_skipped === true || siGov.form_flatten_skipped === true || siGov.unresolved_interactive_content === true;
    const si_review_required = siGov.review_required === true;
    const security_cleanup_applied = siGov.javascript_removed === true || siGov.launch_actions_removed === true
        || siGov.embedded_files_removed === true || siGov.document_open_actions_removed === true
        || siGov.page_open_actions_removed === true;

    // Phase 64D: Extract ink / TAC / black / registration color governance
    const inkGov = human_report?.ink_governance || {};
    const ink_review_required = inkGov.review_required === true || inkGov.ink_fix_applied === true || inkGov.visual_change_expected === true;
    const ink_color_sensitive_fix = inkGov.tac_reduction_attempted === true || inkGov.tac_reduction_applied === true
        || inkGov.rich_black_text_mapped === true || inkGov.registration_color_mapped === true
        || inkGov.black_text_normalized === true || inkGov.ink_fix_applied === true;

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

    // Phase 62D: page marks warnings for operator
    if (crop_marks_added && isOperator) {
        warning = warning ? warning + " Crop marks were added and require review before production." : "Crop marks were added and require review before production.";
    }
    if (removal_not_safe && isOperator) {
        warning = warning ? warning + " Registration mark removal was skipped because safe removal could not be proven." : "Registration mark removal was skipped because safe removal could not be proven.";
    }

    // Phase 63D: security/interactivity warnings for operator
    if (active_content_removed && isOperator) {
        warning = warning ? warning + " Active/interactive content was removed for security and requires review." : "Active/interactive content was removed for security and requires review.";
    }
    if (flatten_skipped && isOperator) {
        warning = warning ? warning + " Annotation/form flattening was skipped because safe appearance preservation could not be proven." : "Annotation/form flattening was skipped because safe appearance preservation could not be proven.";
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

        // Phase 62D: Page marks overrides for certified_pdf — must stay conservative
        if (pm_review_required && type === 'certified_pdf') {
            if (isCustomer) {
                customer_visible = false;
                display_label = "Internal file";
                short_label = "Internal";
                status_badge = "Review required";
                status_tone = "warning";
                button_label = "Download file";
                tooltip = "Page mark conditions require human review. This file is not approved for production.";
            } else {
                status_badge = "Review required";
                status_tone = "warning";
                warning = warning ? warning + " Page mark review required before production." : "Page mark review required before production.";
                tooltip = "Page mark governance requires human review before this file can be released for production.";
            }
        }

        // Phase 62D: Crop marks added badge
        if (crop_marks_added && ['fixed_pdf', 'certified_pdf'].includes(type)) {
            status_badge = isCustomer ? "Crop marks added" : "Crop marks added";
            status_tone = "warning";
            if (isCustomer) {
                tooltip = "Crop marks were added to help guide trimming. The file still requires review before production.";
            } else {
                tooltip = "Crop marks were added outside the TrimBox. Human review is required before production.";
            }
        }

        // Phase 62D: removal_not_safe badge
        if (removal_not_safe && !crop_marks_added) {
            status_badge = "Review required";
            status_tone = "warning";
        }

        // Phase 63D: Security/interactivity overrides for certified_pdf — must stay
        // conservative; downgrade wins over any "applied" badge when review is required
        if (si_review_required && type === 'certified_pdf') {
            if (isCustomer) {
                customer_visible = false;
                display_label = "Internal file";
                short_label = "Internal";
                status_badge = "Review required";
                status_tone = "warning";
                button_label = "Download file";
                tooltip = "Security/interactivity conditions require human review. This file is not approved for production.";
            } else {
                status_badge = "Review required";
                status_tone = "warning";
                warning = warning ? warning + " Security/interactivity review required before production." : "Security/interactivity review required before production.";
                tooltip = "Security/interactivity governance requires human review before this file can be released for production.";
            }
        }

        // Phase 64D: Ink/color governance overrides for certified_pdf — must stay
        // conservative; downgrade wins over any "applied" badge when review is required
        if (ink_review_required && type === 'certified_pdf') {
            if (isCustomer) {
                customer_visible = false;
                display_label = "Internal file";
                short_label = "Internal";
                status_badge = "Review required";
                status_tone = "warning";
                button_label = "Download file";
                tooltip = "Ink/color conditions require human review. This file is not approved for production.";
            } else {
                status_badge = "Review required";
                status_tone = "warning";
                warning = warning ? warning + " Ink/color review required before production." : "Ink/color review required before production.";
                tooltip = "Ink/color governance requires human review before this file can be released for production.";
            }
        }

        // Phase 63D: Active content removed badge (fixed_pdf only — certified_pdf
        // is governed by the conservative downgrade above)
        if (active_content_removed && type === 'fixed_pdf') {
            status_badge = "Active content removed";
            status_tone = "warning";
            if (isCustomer) {
                tooltip = "Potentially unsafe interactive content was removed from this file for security. The file still requires review before production.";
            } else {
                tooltip = "JavaScript, launch actions, embedded files, or open actions were removed for security. Human review is required before production.";
            }
        }

        // Phase 63D: Interactive content reviewed / flattening badges
        // (review_pdf keeps its own "Needs review" badge; certified_pdf is governed
        // by the conservative downgrade above)
        if (interactive_content_reviewed && type === 'fixed_pdf') {
            status_badge = "Interactive content reviewed";
            status_tone = "warning";
            if (isCustomer) {
                tooltip = "Some interactive elements were simplified. This may change how the file looks and requires review.";
            } else {
                tooltip = "Annotations and/or form fields were flattened into the page content. Confirm appearance preservation before approving for production.";
            }
        }

        // Phase 63D: Security cleanup badge (least specific — only set if nothing more specific applied)
        if (security_cleanup_applied && !active_content_removed && type === 'fixed_pdf') {
            status_badge = "Security cleanup";
            status_tone = "info";
        }

        // Phase 63D: generic Review required badge — only when no more specific
        // security/interactivity badge already communicates the review need
        // (certified_pdf is governed by the conservative downgrade above)
        if ((si_review_required || flatten_skipped) && !active_content_removed && !interactive_content_reviewed
            && type === 'fixed_pdf') {
            status_badge = "Review required";
            status_tone = "warning";
        }

        // Phase 64D: Color-sensitive ink/TAC/rich-black/registration-color fix badge
        // (fixed_pdf only — certified_pdf is governed by the conservative downgrade above)
        if (ink_color_sensitive_fix && type === 'fixed_pdf') {
            status_badge = "Color-sensitive fix";
            status_tone = "warning";
            if (isCustomer) {
                tooltip = "Ink/color changes may affect appearance and require review.";
            } else {
                tooltip = "Total ink coverage, rich black text, registration color, or black text handling was adjusted. These are visual, color-affecting changes that require operator review before production.";
            }
        }

        // Phase 64D: Ink review required badge — least specific ink badge, only when
        // nothing more specific already communicates the review need
        if (ink_review_required && !ink_color_sensitive_fix && type === 'fixed_pdf') {
            status_badge = "Ink review required";
            status_tone = "warning";
            if (isCustomer) {
                tooltip = "Ink/color changes may affect appearance and require review.";
            } else {
                tooltip = "Ink/color governance findings were detected. Human review of color appearance is required before production.";
            }
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
