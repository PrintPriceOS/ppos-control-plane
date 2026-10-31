export function getArtifactUxForArtifact(artifact: any, reportArtifactUx: any, audience: string = "operator") {
    if (reportArtifactUx) {
        const labels = audience === "customer" ? reportArtifactUx.customer_labels : reportArtifactUx.operator_labels;
        if (labels && Array.isArray(labels)) {
            const found = labels.find((l: any) => 
                l.artifact_type === artifact.type || 
                l.artifact_type === artifact.alias || 
                l.artifact_type === artifact.artifact_type || 
                l.artifact_type === artifact.filename
            );
            if (found) return found;
        }
    }

    const type = artifact.type || artifact.alias || artifact.artifact_type || '';

    // Fallbacks
    if (type === 'review_pdf') {
        return {
            artifact_type: 'review_pdf',
            display_label: "Review file",
            short_label: "Review",
            status_badge: "Needs review",
            status_tone: "warning",
            button_label: "Download review file",
            tooltip: "This file requires review before production.",
            customer_visible: true,
            operator_visible: true,
            is_primary: false,
            download_allowed: true,
            warning: null,
            forbidden_claims: [], allowed_claims: []
        };
    }
    if (type === 'fixed_pdf') {
        return {
            artifact_type: 'fixed_pdf',
            display_label: "Corrected file",
            short_label: "Corrected",
            status_badge: "Corrected",
            status_tone: "info",
            button_label: "Download corrected file",
            tooltip: "This file includes corrections but is not automatically production-approved.",
            customer_visible: true,
            operator_visible: true,
            is_primary: false,
            download_allowed: true,
            warning: null,
            forbidden_claims: [], allowed_claims: []
        };
    }
    if (type === 'certified_pdf') {
        return {
            artifact_type: 'certified_pdf',
            display_label: "Corrected artifact",
            short_label: "Artifact",
            status_badge: "Trust not confirmed",
            status_tone: "danger",
            button_label: "Download artifact",
            tooltip: "This artifact exists, but its filename alone does not prove production or standards certification.",
            customer_visible: false,
            operator_visible: true,
            is_primary: false,
            download_allowed: true,
            warning: "Trust not confirmed.",
            forbidden_claims: [], allowed_claims: []
        };
    }
    if (type === 'audit_json' || type === 'fix_audit') {
        return {
            artifact_type: type,
            display_label: "Fix Audit JSON",
            short_label: "Audit",
            status_badge: "Technical",
            status_tone: "neutral",
            button_label: "Download audit JSON",
            tooltip: "Technical audit trail showing fixes, skipped fixes, governance decisions, and artifact trust.",
            customer_visible: false,
            operator_visible: true,
            is_primary: false,
            download_allowed: true,
            warning: null,
            forbidden_claims: [], allowed_claims: []
        };
    }
    if (type === 'delta_report') {
        return {
            artifact_type: type,
            display_label: "Delta Report",
            short_label: "Delta",
            status_badge: "Technical",
            status_tone: "neutral",
            button_label: "Download delta report",
            tooltip: "Structured report showing what changed between input and output artifacts.",
            customer_visible: false,
            operator_visible: true,
            is_primary: false,
            download_allowed: true,
            warning: null,
            forbidden_claims: [], allowed_claims: []
        };
    }
    if (type === 'human_report' || type === 'report_json') {
        return {
            artifact_type: type,
            display_label: "Human Report",
            short_label: "Report",
            status_badge: "Report",
            status_tone: "neutral",
            button_label: "View human report",
            tooltip: "Readable summary of findings, fixes, warnings, and review requirements.",
            customer_visible: false,
            operator_visible: true,
            is_primary: false,
            download_allowed: true,
            warning: null,
            forbidden_claims: [], allowed_claims: []
        };
    }
    if (type === 'validation_report') {
        return {
            artifact_type: type,
            display_label: "Standards Validation Report",
            short_label: "Validation",
            status_badge: "Validation",
            status_tone: "neutral",
            button_label: "Download validation report",
            tooltip: "Independent validator evidence for PDF/X or PDF/A compliance, if available.",
            customer_visible: false,
            operator_visible: true,
            is_primary: false,
            download_allowed: true,
            warning: null,
            forbidden_claims: [], allowed_claims: []
        };
    }

    return {
        artifact_type: type,
        display_label: artifact.filename || artifact.label || "Artifact",
        short_label: "Artifact",
        status_badge: "Available",
        status_tone: "neutral",
        button_label: "Download",
        tooltip: "Download artifact",
        customer_visible: false,
        operator_visible: true,
        is_primary: false,
        download_allowed: true,
        warning: null,
        forbidden_claims: [], allowed_claims: []
    };
}
