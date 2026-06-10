const gateway = require('./preflightContractGateway');
const preflightServiceClient = require('./preflightServiceClient');
const db = require('./mysqlClient');
const governanceLedgerService = require('./preflightGovernanceLedgerService');
const artifactUxLabelService = require('./artifactUxLabelService');
const { buildReviewDecisionUx } = require('./preflightReviewDecisionUxService');
const { buildCustomerRemediationUx } = require('./customerRemediationUxService');
const { buildProofApprovalUx } = require('./proofApprovalUxService');


// Helper to determine the primary artifact
function selectPrimaryHumanArtifact(job, artifacts, artifactTrust = null) {
    if (!Array.isArray(artifacts)) return null;

    const certPdf = artifacts.find(a => (a.type === 'certified_pdf' || a.alias === 'certified_pdf'));
    const reviewPdf = artifacts.find(a => (a.type === 'review_pdf' || a.alias === 'review_pdf'));
    const fixedPdf = artifacts.find(a => (a.type === 'fixed_pdf' || a.alias === 'fixed_pdf'));
    const deltaReport = artifacts.find(a => (a.type === 'delta_report' || a.alias === 'delta_report'));
    const reportJson = artifacts.find(a => (a.type === 'report_json' || a.alias === 'report_json'));
    const analysisReport = artifacts.find(a => (a.type === 'analysis_report' || a.alias === 'analysis_report'));

    // Phase 56D: artifact_trust takes absolute priority over filename heuristics
    if (artifactTrust) {
        const pType = artifactTrust.primary_artifact_type;
        if (pType === null) return null; // explicit null means no primary artifact should be exposed
        if (pType === 'review_pdf' && reviewPdf) return reviewPdf;
        if (pType === 'fixed_pdf' && fixedPdf) return fixedPdf;
        if (pType === 'certified_pdf' && certPdf && artifactTrust.certified_pdf_allowed !== false) return certPdf;
    }

    // Rule 1: certified_pdf ONLY if production_certified=true AND customer_visible=true AND artifact_role=PRODUCTION_READY
    if (certPdf && 
        certPdf.production_certified === true && 
        certPdf.customer_visible === true && 
        certPdf.artifact_role === 'PRODUCTION_READY') {
        return certPdf;
    }

    // Rule 2: review_pdf if review_required true and downloadable
    if (job.review_required === true && reviewPdf && reviewPdf.downloadable) {
        return reviewPdf;
    }

    // Rule 3: fixed_pdf if downloadable
    if (fixedPdf && fixedPdf.downloadable) {
        return fixedPdf;
    }

    // Rule 4: delta_report if no PDF output but available
    if (deltaReport) {
        return deltaReport;
    }

    // Rule 5: analysis_report or report_json
    if (analysisReport) return analysisReport;
    if (reportJson) return reportJson;

    return null;
}

function translateFixMessage(f, isSkipped = false, colorGov = {}) {
    const code = String(f.code || f.fix_id || f || '').toUpperCase();
    if (code.includes('REBUILD_TRIMBOX')) return "Page geometry / TrimBox was rebuilt.";
    if (code.includes('APPLY_BLEED')) return "Bleed boxes were adjusted. Visual artwork was not extended automatically.";
    if (code.includes('INJECT_OUTPUT_INTENT') || code.includes('INJECT_PDFX_OUTPUTINTENT')) {
        let msg = "An OutputIntent profile was injected. No color values were rewritten.";
        if (colorGov && colorGov.review_required_color_reasons && colorGov.review_required_color_reasons.length > 0) {
            msg = "An OutputIntent profile was injected, but color profile conflicts or color risks remain and require review.";
        }
        return msg + " An OutputIntent may have been injected, but OutputIntent injection alone does not prove PDF/X compliance.";
    }
    if (code.includes('CONVERT_CMYK')) return isSkipped 
        ? "CMYK conversion was skipped because explicit review mode is required." 
        : "Color conversion to CMYK was applied. Review the corrected PDF carefully because color conversion can alter appearance, ink balance, gradients, images, and brand colors.";
    // Phase 63A Security / Interactive Object Fixes
    if (code.includes('STRIP_JAVASCRIPT')) {
        if (isSkipped) return "Embedded JavaScript removal was skipped because it could not be safely confirmed.";
        return "Embedded JavaScript was removed because it can pose a security risk in production workflows. This does not certify the file for production.";
    }
    if (code.includes('REMOVE_LAUNCH_ACTIONS')) {
        if (isSkipped) return "Launch action removal was skipped because it could not be safely confirmed.";
        return "Launch actions that could open external programs or files were removed for security. This does not certify the file for production.";
    }
    if (code.includes('REMOVE_EMBEDDED_FILES')) {
        if (isSkipped) return "Embedded file removal was skipped because it could not be safely confirmed.";
        return "Embedded files attached to the PDF were removed for security. This does not certify the file for production.";
    }
    if (code.includes('REMOVE_DOCUMENT_OPEN_ACTIONS')) {
        if (isSkipped) return "Document open action removal was skipped because it could not be safely confirmed.";
        return "Actions that automatically run when the document opens were removed for security. This does not certify the file for production.";
    }
    if (code.includes('REMOVE_PAGE_OPEN_ACTIONS')) {
        if (isSkipped) return "Page open action removal was skipped because it could not be safely confirmed.";
        return "Actions that automatically run when a page opens were removed for security. This does not certify the file for production.";
    }
    if (code.includes('FLATTEN_ANNOTATIONS')) {
        if (isSkipped) return "Annotation flattening was skipped because safe preservation of visual appearance could not be proven. The file requires human review.";
        return "Annotations were flattened into the page content for print safety. This is a visual change and requires human review before production.";
    }
    if (code.includes('FLATTEN_FORMS')) {
        if (isSkipped) return "Form flattening was skipped because safe preservation of visual appearance could not be proven. The file requires human review.";
        return "Interactive form fields were flattened into the page content for print safety. This is a visual change and requires human review before production.";
    }
    if (code.includes('REBUILD_XREF')) {
        if (f.description && f.description.includes('No structural repair was necessary')) {
            return "No structural repair was necessary.";
        }
        return "Structural sanitization applied via qpdf.";
    }
    // Font Governance (Phase 51A/B)
    if (code.includes('EMBED_FONTS') && isSkipped) {
        return "Font embedding was not applied. The PDF still requires review because some fonts may not be safely available in production.";
    }
    if (code.includes('EMBED_FONTS') && !isSkipped) {
        return "Fonts were processed with Ghostscript. Review the corrected PDF carefully because font embedding can alter glyph rendering, kerning, line breaks, or layout.";
    }
    if (code.includes('NON_EMBEDDED_FONTS')) {
        return "Automatic font embedding/substitution was not performed. Fonts remain un-embedded.";
    }
    if (code.includes('OUTLINE_FONTS')) return "Font outlining is not implemented.";
    if (code.includes('REPLACE_MISSING_FONTS')) return "Automatic missing font replacement is not implemented.";
    if (code.includes('GLYPH_REPAIR')) return "Automatic glyph repair is not implemented.";
    if (code.includes('REDUCE_TAC') && isSkipped) return "Total ink coverage reduction is not currently implemented. A print operator must review this file.";
    if (code.includes('MAP_RICH_BLACK_TEXT_TO_K_ONLY') && isSkipped) return "Rich black text remapping is not currently implemented. A print operator must review this file.";
    if (code.includes('MAP_REGISTRATION_COLOR_TO_BLACK') && isSkipped) return "Registration color remapping is not currently implemented. A print operator must review this file.";
    if (code.includes('NORMALIZE_ICC_PROFILE') && isSkipped) return "ICC/profile normalization is not currently implemented. A print operator must review this file.";

    // Phase 53D
    if (code.includes('FLATTEN_TRANSPARENCY') && isSkipped) return "Transparency flattening is not currently implemented. A print operator must review this file.";
    if (code.includes('FLATTEN_OVERPRINT') && isSkipped) return "Overprint flattening is not currently implemented. A print operator must review this file.";
    if (code.includes('FLATTEN_PDF') && isSkipped) return "PDF flattening is not currently implemented as a safe automatic operation. A print operator must review this file.";
    if (code.includes('RASTERIZE_TRANSPARENCY') && isSkipped) return "Transparency rasterization is not currently implemented. Rasterization can alter visual appearance and requires review.";
    if (code.includes('CONVERT_TO_PDFX_TRANSPARENCY_SAFE') && isSkipped) return "PDF/X transparency-safe conversion is not implemented or validated. PDF/X compliance was not claimed.";

    // Phase 54D
    if (code.includes('UPSCALE_LOW_RES_IMAGES') && isSkipped) return "Low-resolution image upscaling is not implemented as a safe automatic operation. Source images or human review may be required.";
    if (code.includes('DOWNSAMPLE_EXCESSIVE_RESOLUTION') && isSkipped) return "Image downsampling is not currently applied automatically because it can remove visual detail.";
    if (code.includes('RECOMPRESS_IMAGES') && isSkipped) return "Image recompression is not implemented as a safe automatic operation because it can introduce visible artifacts.";
    if (code.includes('REPLACE_LOW_RES_IMAGES') && isSkipped) return "Image replacement requires source assets and was not performed automatically.";
    if (code.includes('REPAIR_JPEG_ARTIFACTS') && isSkipped) return "JPEG artifact repair is not currently implemented. Human review or replacement source images may be required.";
    if (code.includes('NORMALIZE_IMAGE_COLORSPACE') && isSkipped) return "Image color space normalization is not performed automatically and must follow color governance review.";
    if (code.includes('REMOVE_IMAGE_ALPHA') && isSkipped) return "Image alpha removal is not implemented as a safe automatic operation because it can alter visual appearance.";
    if (code.includes('REPAIR_DAMAGED_IMAGE_OBJECT') && isSkipped) return "Damaged image object repair is not implemented automatically.";
    if (code.includes('VECTORIZE_BITMAP_TEXT') && isSkipped) return "Bitmap text vectorization is not implemented. This operation can alter text appearance and requires manual review.";
    if (code.includes('RESTORE_RASTERIZED_VECTOR') && isSkipped) return "Rasterized vector restoration is not implemented. Source vector artwork may be required.";

    // Phase 55D
    if (code.includes('VALIDATE_PDFX')) return "PDF/X validation was not performed because no standards validator was available.";
    if (code.includes('VALIDATE_PDFA')) return "PDF/A validation was not performed because no standards validator was available.";
    if (code.includes('GENERATE_PDFX') || code.includes('CONVERT_TO_PDFX')) return "PDF/X conversion is not implemented or validated. PDF/X compliance was not claimed.";
    if (code.includes('CONVERT_TO_PDFA')) return "PDF/A conversion is not implemented or validated. PDF/A compliance was not claimed.";
    if (code.includes('GENERATE_STANDARD_VALIDATION_REPORT_INTERNAL')) return "An internal standards governance report was generated. This is not an external validator report and cannot be used as PDF/X or PDF/A certification evidence.";
    if (code.includes('GENERATE_STANDARD_VALIDATION_REPORT')) return "A standards validation report was not generated because no validator evidence was available.";

    // Phase 61D Structural/Metadata Fixes
    if (code.includes('NORMALIZE_OBJECT_STREAMS')) return "PDF object streams were normalized using a structural rewrite process. This is a structural cleanup and does not imply PDF/X or PDF/A certification.";
    if (code.includes('REVOKE_FALSE_CERTIFICATION')) return "Unsupported or unvalidated standards claims were revoked. This prevents false PDF/X or PDF/A claims but does not certify the file.";
    if (code.includes('STRIP_INVALID_PDFX_METADATA')) return "Invalid or unsupported PDF/X metadata was removed. The PDF was not validated as PDF/X.";
    if (code.includes('STRIP_INVALID_PDFA_METADATA')) return "Invalid or unsupported PDF/A metadata was removed. The PDF was not validated as PDF/A.";
    if (code.includes('NORMALIZE_STANDARD_METADATA')) return "Standards-related metadata was normalized into an honest non-certified state. This does not create standards compliance.";

    // Phase 62D Page Mark Fixes
    if (code.includes('ADD_CROP_MARKS')) {
        if (isSkipped) return "Crop marks could not be added because the page geometry did not provide enough margin outside the TrimBox.";
        return "Crop marks were added outside the TrimBox. This changes production guidance and requires human review before production.";
    }
    if (code.includes('REMOVE_REGISTRATION_MARKS')) {
        if (isSkipped) return "Registration mark removal was skipped because safe removal could not be proven.";
        return "Registration marks were removed only where they were detected outside the TrimBox. Human review is required.";
    }
    if (code.includes('NORMALIZE_PAGE_MARKS')) {
        return "Page mark normalization was evaluated. No production certification is implied.";
    }
    if (code.includes('PAGE_MARKS_UNSAFE_GEOMETRY') || code.includes('UNSAFE_GEOMETRY')) {
        return "Page mark geometry was unsafe or uncertain. The file requires review before production.";
    }
    if (code.includes('MARKS_INSIDE_TRIM')) {
        return "Marks were detected inside the TrimBox or near live artwork. Automatic removal was not performed.";
    }
    if (code.includes('INSUFFICIENT_MARGIN')) {
        return "There was not enough margin outside the TrimBox to safely add crop marks.";
    }

    if (isSkipped) return "The issue was detected, but this correction is not currently supported automatically.";
    return `Applied structural correction: ${code}`;
}

async function getHumanReport(jobId, context, injectedJob = null, injectedArtifacts = null) {
    let job = injectedJob;
    let artifacts = injectedArtifacts;
    let sourceStatus = 'LOCAL';

    if (!job) {
        try {
            const upRes = await gateway.getJob(jobId, context);
            job = upRes?.job || upRes;
            sourceStatus = 'LIVE_UPSTREAM';
        } catch (err) {
            // fallback to local db
            const rows = await db.query('SELECT canonical_payload_json FROM preflight_job_registry WHERE job_id = ?', [jobId]);
            if (rows.length > 0) {
                const parsed = typeof rows[0].canonical_payload_json === 'string' ? JSON.parse(rows[0].canonical_payload_json) : rows[0].canonical_payload_json;
                job = parsed?.job || parsed;
                sourceStatus = 'LOCAL_FALLBACK';
            }
        }
    }

    if (!artifacts) {
        try {
            const liveArtifactsResponse = await preflightServiceClient.getJobArtifacts(jobId, context.Authorization, context.tenantId);
            artifacts = liveArtifactsResponse?.artifacts || [];
        } catch (err) {
            // Fallback artifacts
            artifacts = job?.artifacts || job?.artifact_list || [];
        }
    }

    if (!job) {
        return { ok: false, error: 'Job not found for human report generation' };
    }

    let appliedFixesRaw = job.applied_fixes || job.fix_summary?.applied_fixes || [];
    let skippedFixesRaw = job.skipped_fixes || job.fix_summary?.skipped_fixes || [];
    let failedFixesRaw = job.failed_fixes || job.fix_summary?.failed_fixes || [];
    const fixSummaryObj = job.fix_summary || {};

    // Fallback hydration from fix_audit
    if (appliedFixesRaw.length === 0 && skippedFixesRaw.length === 0 && 
        ((fixSummaryObj.applied_count > 0) || (fixSummaryObj.skipped_count > 0))) {
        
        let auditData = null;
        if (job.fix_audit) {
            auditData = job.fix_audit;
        } else {
            const fixAuditArtifact = artifacts.find(a => a.type === 'fix_audit' || a.alias === 'fix_audit' || a.filename === 'fix_audit.json');
            if (fixAuditArtifact) {
                if (fixAuditArtifact.metadata_json) {
                    auditData = typeof fixAuditArtifact.metadata_json === 'string' ? JSON.parse(fixAuditArtifact.metadata_json) : fixAuditArtifact.metadata_json;
                } else if (fixAuditArtifact.metadata) {
                    auditData = typeof fixAuditArtifact.metadata === 'string' ? JSON.parse(fixAuditArtifact.metadata) : fixAuditArtifact.metadata;
                } else if (fixAuditArtifact.raw) {
                    auditData = typeof fixAuditArtifact.raw === 'string' ? JSON.parse(fixAuditArtifact.raw) : fixAuditArtifact.raw;
                } else {
                    try {
                        const actualArtifactId = fixAuditArtifact.download_id || fixAuditArtifact.id || fixAuditArtifact.alias;
                        if (actualArtifactId) {
                            const streamRes = await preflightServiceClient.downloadArtifact(jobId, actualArtifactId, null, context.tenantId);
                            if (streamRes && streamRes.stream) {
                                if (typeof streamRes.stream.on === 'function') {
                                    auditData = await new Promise((resolve) => {
                                        let data = '';
                                        streamRes.stream.on('data', chunk => data += chunk.toString());
                                        streamRes.stream.on('end', () => {
                                            try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
                                        });
                                        streamRes.stream.on('error', () => resolve(null));
                                    });
                                } else {
                                    try {
                                        auditData = typeof streamRes.stream === 'string' ? JSON.parse(streamRes.stream) : streamRes.stream;
                                    } catch(e) {}
                                }
                            }
                        }
                    } catch (err) {
                        console.error('[HUMAN-REPORT] Failed to download fix_audit artifact for hydration', err.message);
                    }
                }
            }
        }

        if (auditData) {
            if (Array.isArray(auditData.applied_fixes)) {
                appliedFixesRaw = auditData.applied_fixes;
            }
            if (Array.isArray(auditData.skipped_fixes)) {
                skippedFixesRaw = auditData.skipped_fixes;
            }
            if (Array.isArray(auditData.failed_fixes)) {
                failedFixesRaw = auditData.failed_fixes;
            }
        }
    }

    // Default structural mapping
    let outcome = "UNKNOWN";
    let severity = "neutral";
    let summaryTitle = "Preflight Status Unknown";
    let customerSummary = "The PDF status could not be determined.";
    let operatorSummary = "Check raw technical details.";
    let recommendedAction = {
        action_id: "wait",
        label: "Wait for completion",
        description: "The system is still processing.",
        severity: "neutral",
        primary_artifact_type: null,
        primary_artifact_download_id: null,
        primary_artifact_filename: null,
        primary_artifact_available: false
    };

    let certLevel = job.certification_level || job.certificationLevel;
    let isReviewReq = job.review_required === true || job.reviewRequired === true;
    let isProdCert = job.production_certified === true || job.productionCertified === true;

    // Phase 52D: Defensive extraction of color_governance
    let colorGov = job.color_governance 
        || job.fix_summary?.color_governance 
        || job.fix_audit?.color_governance 
        || job.delta_summary?.color_governance 
        || job.delta_report?.color_governance;
        
    if (!colorGov) {
        const artifactsWithMeta = artifacts.find(a => a.metadata && a.metadata.color_governance);
        if (artifactsWithMeta) colorGov = artifactsWithMeta.metadata.color_governance;
    }
    if (!colorGov && job.report?.color_governance) {
        colorGov = job.report.color_governance;
    }
    if (!colorGov) colorGov = {};

    let hasColorRisk = false;
    if (colorGov.destructive_color_fix_applied || 
        colorGov.color_conversion_applied || 
        colorGov.certified_pdf_allowed === false || 
        colorGov.production_certified === false || 
        (colorGov.review_required_color_reasons && colorGov.review_required_color_reasons.length > 0)) {
        hasColorRisk = true;
    }

    if (hasColorRisk) {
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === "CERTIFIED_READY" || certLevel === "FIXED_READY") {
            certLevel = appliedFixesRaw.length > 0 ? "FIXED_REVIEW_REQUIRED" : "REVIEW_REQUIRED";
        }
        // Downgrade certified_pdf
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.production_certified = false;
                a.customer_visible = false;
            }
        });
    }

    // Phase 53D: Defensive extraction of transparency_overprint_governance
    const transSources = [
        job.transparency_overprint_governance,
        job.fix_summary?.transparency_overprint_governance,
        job.fix_audit?.transparency_overprint_governance,
        job.delta_summary?.transparency_overprint_governance,
        job.delta_report?.transparency_overprint_governance,
        job.report?.transparency_overprint_governance
    ];
    const artifactsWithTransMeta = artifacts.find(a => a.metadata && a.metadata.transparency_overprint_governance);
    if (artifactsWithTransMeta) transSources.push(artifactsWithTransMeta.metadata.transparency_overprint_governance);

    let transGov = {};
    for (const source of transSources) {
        if (!source) continue;
        if (source.review_required === true) transGov.review_required = true;
        if (source.certified_pdf_allowed === false) transGov.certified_pdf_allowed = false;
        if (source.production_certified === false) transGov.production_certified = false;
        if (source.visual_rewrite_fix_applied === true) transGov.visual_rewrite_fix_applied = true;
        if (source.transparency_present === true) transGov.transparency_present = true;
        if (source.overprint_present === true) transGov.overprint_present = true;
        if (source.soft_masks_present === true) transGov.soft_masks_present = true;
        if (source.blend_modes_present === true) transGov.blend_modes_present = true;
        if (source.rasterization_risk === true) transGov.rasterization_risk = true;
        if (source.detector_gap === true) transGov.detector_gap = true;
        if (source.deferred === true) transGov.deferred = true;
        if (source.fixture_gap === true) transGov.fixture_gap = true;
        
        if (source.highest_transparency_overprint_risk === 'critical') transGov.highest_transparency_overprint_risk = 'critical';
        else if (source.highest_transparency_overprint_risk === 'warning' && transGov.highest_transparency_overprint_risk !== 'critical') transGov.highest_transparency_overprint_risk = 'warning';
        
        if (source.review_required_reasons && source.review_required_reasons.length > 0) {
            transGov.review_required_reasons = [...new Set([...(transGov.review_required_reasons || []), ...source.review_required_reasons])];
        }
        if (source.unsupported_transparency_overprint_fixes && source.unsupported_transparency_overprint_fixes.length > 0) {
            transGov.unsupported_transparency_overprint_fixes = [...new Set([...(transGov.unsupported_transparency_overprint_fixes || []), ...source.unsupported_transparency_overprint_fixes])];
        }
    }

    let hasTransparencyRisk = false;
    if (transGov.review_required === true || 
        transGov.certified_pdf_allowed === false || 
        transGov.visual_rewrite_fix_applied === true || 
        transGov.transparency_present === true || 
        transGov.overprint_present === true || 
        transGov.soft_masks_present === true || 
        transGov.blend_modes_present === true || 
        transGov.rasterization_risk === true || 
        (transGov.review_required_reasons && transGov.review_required_reasons.length > 0)) {
        hasTransparencyRisk = true;
    }

    if (hasTransparencyRisk) {
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === "CERTIFIED_READY" || certLevel === "FIXED_READY") {
            certLevel = (appliedFixesRaw.length > 0 || transGov.visual_rewrite_fix_applied) ? "FIXED_REVIEW_REQUIRED" : "REVIEW_REQUIRED";
        }
        // Downgrade certified_pdf
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.production_certified = false;
                a.customer_visible = false;
                a.artifact_role = 'REVIEW_REQUIRED';
            }
        });
    }

    // Phase 54D: Defensive extraction of image_quality_governance
    const iqSources = [
        job.image_quality_governance,
        job.fix_summary?.image_quality_governance,
        job.fix_audit?.image_quality_governance,
        job.delta_summary?.image_quality_governance,
        job.delta_report?.image_quality_governance,
        job.report?.image_quality_governance
    ];
    const artifactsWithIqMeta = artifacts.find(a => a.metadata && a.metadata.image_quality_governance);
    if (artifactsWithIqMeta) iqSources.push(artifactsWithIqMeta.metadata.image_quality_governance);

    let iqGov = {};
    for (const source of iqSources) {
        if (!source) continue;
        if (source.review_required === true) iqGov.review_required = true;
        if (source.certified_pdf_allowed === false) iqGov.certified_pdf_allowed = false;
        if (source.production_certified === false) iqGov.production_certified = false;
        if (source.visual_image_rewrite_applied === true) iqGov.visual_image_rewrite_applied = true;
        if (source.image_rewrite_performed === true) iqGov.image_rewrite_performed = true;
        if (source.low_res_images_present === true) iqGov.low_res_images_present = true;
        if (source.excessive_resolution_present === true) iqGov.excessive_resolution_present = true;
        if (source.jpeg_artifacts_present === true) iqGov.jpeg_artifacts_present = true;
        if (source.image_replacement_required === true) iqGov.image_replacement_required = true;
        if (source.bitmap_text_risk === true) iqGov.bitmap_text_risk = true;
        if (source.rasterized_vector_risk === true) iqGov.rasterized_vector_risk = true;
        if (source.image_object_damaged === true) iqGov.image_object_damaged = true;
        
        if (source.highest_image_quality_risk === 'critical') iqGov.highest_image_quality_risk = 'critical';
        else if (source.highest_image_quality_risk === 'warning' && iqGov.highest_image_quality_risk !== 'critical') iqGov.highest_image_quality_risk = 'warning';
        
        if (source.review_required_reasons && source.review_required_reasons.length > 0) {
            iqGov.review_required_reasons = [...new Set([...(iqGov.review_required_reasons || []), ...source.review_required_reasons])];
        }
        if (source.unsupported_image_quality_fixes && source.unsupported_image_quality_fixes.length > 0) {
            iqGov.unsupported_image_quality_fixes = [...new Set([...(iqGov.unsupported_image_quality_fixes || []), ...source.unsupported_image_quality_fixes])];
        }
    }

    let hasImageQualityRisk = false;
    if (iqGov.review_required === true || 
        iqGov.certified_pdf_allowed === false || 
        iqGov.production_certified === false || 
        iqGov.visual_image_rewrite_applied === true || 
        iqGov.image_rewrite_performed === true || 
        iqGov.low_res_images_present === true || 
        iqGov.jpeg_artifacts_present === true || 
        iqGov.image_replacement_required === true || 
        iqGov.bitmap_text_risk === true || 
        iqGov.rasterized_vector_risk === true || 
        iqGov.image_object_damaged === true || 
        (iqGov.review_required_reasons && iqGov.review_required_reasons.length > 0)) {
        hasImageQualityRisk = true;
    }

    if (hasImageQualityRisk) {
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === "CERTIFIED_READY" || certLevel === "FIXED_READY") {
            certLevel = (appliedFixesRaw.length > 0 || iqGov.visual_image_rewrite_applied || iqGov.image_rewrite_performed) ? "FIXED_REVIEW_REQUIRED" : "REVIEW_REQUIRED";
        }
        // Downgrade certified_pdf
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.production_certified = false;
                a.customer_visible = false;
                a.is_primary = false;
                a.artifact_role = 'REVIEW_REQUIRED';
            }
        });
    }

    // Phase 55D: Defensive extraction of standards_certification_governance
    const stdSources = [
        job.standards_certification_governance,
        job.fix_summary?.standards_certification_governance,
        job.fix_audit?.standards_certification_governance,
        job.delta_summary?.standards_certification_governance,
        job.delta_report?.standards_certification_governance,
        job.report?.standards_certification_governance
    ];
    const artifactsWithStdMeta = artifacts.find(a => a.metadata && a.metadata.standards_certification_governance);
    if (artifactsWithStdMeta) stdSources.push(artifactsWithStdMeta.metadata.standards_certification_governance);

    let stdGov = {};
    for (const source of stdSources) {
        if (!source) continue;
        if (source.review_required === true) stdGov.review_required = true;
        if (source.certified_pdf_allowed === false) stdGov.certified_pdf_allowed = false;
        if (source.production_certified === false) stdGov.production_certified = false;
        if (source.standard_certified === false) stdGov.standard_certified = false;
        if (source.standard_certified === true) stdGov.standard_certified = true;
        if (source.compliance_claim_allowed === false) stdGov.compliance_claim_allowed = false;
        if (source.validation_required === true) stdGov.validation_required = true;
        if (source.validation_performed === true) stdGov.validation_performed = true;
        if (source.validation_passed === true) stdGov.validation_passed = true;
        if (source.validator_available === false) stdGov.validator_available = false;
        if (source.validator_available === true) stdGov.validator_available = true;
        if (source.outputintent_changed === true) stdGov.outputintent_changed = true;
        if (source.outputintent_does_not_prove_pdfx === true) stdGov.outputintent_does_not_prove_pdfx = true;
        if (source.pdfx_compliance_claimed === true) stdGov.pdfx_compliance_claimed = true;
        if (source.pdfa_compliance_claimed === true) stdGov.pdfa_compliance_claimed = true;
        if (source.standard_claimed) stdGov.standard_claimed = source.standard_claimed;
        if (source.validator_gap === true) stdGov.validator_gap = true;
        if (source.detector_gap === true) stdGov.detector_gap = true;
        if (source.fixture_gap === true) stdGov.fixture_gap = true;
        if (source.deferred === true) stdGov.deferred = true;
        
        if (source.validator_name) stdGov.validator_name = source.validator_name;
        if (source.validator_version) stdGov.validator_version = source.validator_version;
        if (source.standard_detected) stdGov.standard_detected = source.standard_detected;
        if (source.validation_report_available === true) stdGov.validation_report_available = true;
        if (source.validation_report_hash) stdGov.validation_report_hash = source.validation_report_hash;
        if (source.validation_report_path) stdGov.validation_report_path = source.validation_report_path;

        if (source.review_required_reasons && source.review_required_reasons.length > 0) {
            stdGov.review_required_reasons = [...new Set([...(stdGov.review_required_reasons || []), ...source.review_required_reasons])];
        }
        if (source.unsupported_standards_fixes && source.unsupported_standards_fixes.length > 0) {
            stdGov.unsupported_standards_fixes = [...new Set([...(stdGov.unsupported_standards_fixes || []), ...source.unsupported_standards_fixes])];
        }
    }

    let hasFullValidatorEvidence = false;
    if (stdGov.validation_performed === true &&
        stdGov.validation_passed === true &&
        stdGov.validator_name &&
        stdGov.validator_version &&
        stdGov.standard_detected &&
        (stdGov.validation_report_available === true || stdGov.validation_report_hash || stdGov.validation_report_path) &&
        stdGov.compliance_claim_allowed !== false) {
        hasFullValidatorEvidence = true;
    }

    let pdfxComplianceClaimed = job.pdfx_compliance_claimed === true || stdGov.pdfx_compliance_claimed === true;
    let pdfaComplianceClaimed = job.pdfa_compliance_claimed === true || stdGov.pdfa_compliance_claimed === true;
    let standardClaimed = job.standard_claimed || stdGov.standard_claimed || null;
    let standardCertified = job.standard_certified === true || stdGov.standard_certified === true;
    let pdfxGenerationPerformed = job.pdfx_generation_performed === true;

    // OutputIntent check
    const appliedSkippedCodes = [...appliedFixesRaw, ...skippedFixesRaw, ...failedFixesRaw].map(f => String(f.code || f.fix_id || f || '').toUpperCase());
    if (appliedSkippedCodes.some(c => c.includes('INJECT_OUTPUT_INTENT') || c.includes('INJECT_PDFX_OUTPUTINTENT'))) {
        stdGov.outputintent_changed = true;
        stdGov.outputintent_does_not_prove_pdfx = true;
    }

    // Downgrade claims if missing full validator evidence
    if (!hasFullValidatorEvidence) {
        if (pdfxComplianceClaimed || pdfaComplianceClaimed || standardCertified || standardClaimed || (stdGov.outputintent_changed && !stdGov.outputintent_does_not_prove_pdfx)) {
            stdGov.review_required = true;
            stdGov.review_required_reasons = [...new Set([...(stdGov.review_required_reasons || []), 'STANDARD_CLAIM_WITHOUT_VALIDATOR_EVIDENCE'])];
        }
        stdGov.standard_certified = false;
        stdGov.compliance_claim_allowed = false;
        pdfxComplianceClaimed = false;
        pdfaComplianceClaimed = false;
        standardCertified = false;
        standardClaimed = null;
        if (stdGov.outputintent_changed) {
             stdGov.outputintent_does_not_prove_pdfx = true;
        }
    }

    let hasStandardsRisk = false;
    if (stdGov.review_required === true || 
        stdGov.certified_pdf_allowed === false || 
        stdGov.production_certified === false || 
        stdGov.standard_certified === false ||
        stdGov.compliance_claim_allowed === false ||
        stdGov.validation_required === true ||
        stdGov.validator_available === false ||
        (stdGov.review_required_reasons && stdGov.review_required_reasons.length > 0)) {
        hasStandardsRisk = true;
    }

    if (hasStandardsRisk) {
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === "CERTIFIED_READY" || certLevel === "FIXED_READY") {
            certLevel = appliedFixesRaw.length > 0 ? "FIXED_REVIEW_REQUIRED" : "REVIEW_REQUIRED";
        }
        // Downgrade certified_pdf
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.is_primary = false;
                a.customer_visible = false;
                a.production_certified = false;
                a.standard_certified = false;
                a.artifact_role = 'REVIEW_REQUIRED';
            }
        });
    }

    const skippedFailedCodes = [...skippedFixesRaw, ...failedFixesRaw].map(f => String(f.code || f.fix_id || f || '').toUpperCase());
    const unsupportedFixes = transGov.unsupported_transparency_overprint_fixes || [];
    if (skippedFailedCodes.includes('CONVERT_TO_PDFX_TRANSPARENCY_SAFE') || unsupportedFixes.includes('CONVERT_TO_PDFX_TRANSPARENCY_SAFE')) {
        pdfxComplianceClaimed = false;
        pdfxGenerationPerformed = false;
    }

    // Phase 62D: Defensive extraction of page_marks_governance
    const pmSources = [
        job.page_marks_governance,
        job.fix_summary?.page_marks_governance,
        job.fix_audit?.page_marks_governance,
        job.delta_summary?.page_marks_governance,
        job.delta_report?.page_marks_governance,
        job.report?.page_marks_governance
    ];
    const artifactsWithPmMeta = artifacts.find(a => a.metadata && a.metadata.page_marks_governance);
    if (artifactsWithPmMeta) pmSources.push(artifactsWithPmMeta.metadata.page_marks_governance);
    if (injectedJob?.page_marks_governance) pmSources.push(injectedJob.page_marks_governance);

    let pmGov = {};
    for (const source of pmSources) {
        if (!source) continue;
        // review_required=true wins
        if (source.review_required === true) pmGov.review_required = true;
        // Conservative: false wins on certification/compliance fields
        if (source.production_certified === false) pmGov.production_certified = false;
        if (source.certified_pdf_allowed === false) pmGov.certified_pdf_allowed = false;
        if (source.standard_certified === false) pmGov.standard_certified = false;
        if (source.pdfx_compliance_claimed === false) pmGov.pdfx_compliance_claimed = false;
        if (source.pdfa_compliance_claimed === false) pmGov.pdfa_compliance_claimed = false;
        if (source.compliance_claim_allowed === false) pmGov.compliance_claim_allowed = false;
        // Additions (true wins)
        if (source.page_marks_fix_applied === true) pmGov.page_marks_fix_applied = true;
        if (source.crop_marks_added === true) pmGov.crop_marks_added = true;
        if (source.registration_marks_removed === true) pmGov.registration_marks_removed = true;
        if (source.page_marks_normalized === true) pmGov.page_marks_normalized = true;
        if (source.unsafe_geometry_detected === true) pmGov.unsafe_geometry_detected = true;
        if (source.insufficient_margin === true) pmGov.insufficient_margin = true;
        if (source.marks_inside_trim === true) pmGov.marks_inside_trim = true;
        if (source.removal_not_safe === true) pmGov.removal_not_safe = true;
        if (source.visually_sensitive === true) pmGov.visually_sensitive = true;
        // Deduplicate arrays
        if (source.review_required_reasons && source.review_required_reasons.length > 0) {
            pmGov.review_required_reasons = [...new Set([...(pmGov.review_required_reasons || []), ...source.review_required_reasons])];
        }
        if (source.warnings && source.warnings.length > 0) {
            pmGov.warnings = [...new Set([...(pmGov.warnings || []), ...source.warnings])];
        }
        // Evidence: collect but sanitize later
        if (source.evidence) {
            pmGov.evidence = { ...(pmGov.evidence || {}), ...source.evidence };
        }
    }

    // Sanitize pmGov evidence — never expose raw internals
    if (pmGov.evidence) {
        const safePmEvidence = {};
        for (const [k, v] of Object.entries(pmGov.evidence)) {
            const blocked = ['qpdf_command', 'command', 'local_path', 'raw_xmp', 'internal_id',
                'obj_', 'forensic_object_id', 'validator_command', 'parser_output', 'raw_stream'];
            if (!blocked.some(b => k.includes(b))) {
                safePmEvidence[k] = v;
            }
        }
        pmGov.evidence = Object.keys(safePmEvidence).length > 0 ? safePmEvidence : undefined;
    }

    // Propagate page mark flags conservatively
    if (pmGov.review_required === true) {
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === 'CERTIFIED_READY' || certLevel === 'FIXED_READY') {
            certLevel = (appliedFixesRaw.length > 0 || pmGov.page_marks_fix_applied) ? 'FIXED_REVIEW_REQUIRED' : 'REVIEW_REQUIRED';
        }
    }
    if (pmGov.production_certified === false) isProdCert = false;
    if (pmGov.certified_pdf_allowed === false || pmGov.review_required === true) {
        // Downgrade certified_pdf artifact
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.production_certified = false;
                a.customer_visible = false;
                a.is_primary = false;
                a.artifact_role = 'REVIEW_REQUIRED';
            }
        });
    }
    if (pmGov.pdfx_compliance_claimed === false) pdfxComplianceClaimed = false;
    if (pmGov.pdfa_compliance_claimed === false) pdfaComplianceClaimed = false;
    if (pmGov.standard_certified === false) standardCertified = false;

    // Phase 63D: Defensive extraction of security_interactivity_governance
    const siSources = [
        job.security_interactivity_governance,
        job.fix_summary?.security_interactivity_governance,
        job.fix_audit?.security_interactivity_governance,
        job.delta_summary?.security_interactivity_governance,
        job.delta_report?.security_interactivity_governance,
        job.report?.security_interactivity_governance
    ];
    const artifactsWithSiMeta = artifacts.find(a => a.metadata && a.metadata.security_interactivity_governance);
    if (artifactsWithSiMeta) siSources.push(artifactsWithSiMeta.metadata.security_interactivity_governance);
    if (injectedJob?.security_interactivity_governance) siSources.push(injectedJob.security_interactivity_governance);

    let siGov = {};
    for (const source of siSources) {
        if (!source) continue;
        // review_required=true wins
        if (source.review_required === true) siGov.review_required = true;
        // Conservative: false wins on certification/compliance fields
        if (source.production_certified === false) siGov.production_certified = false;
        if (source.certified_pdf_allowed === false) siGov.certified_pdf_allowed = false;
        if (source.standard_certified === false) siGov.standard_certified = false;
        if (source.pdfx_compliance_claimed === false) siGov.pdfx_compliance_claimed = false;
        if (source.pdfa_compliance_claimed === false) siGov.pdfa_compliance_claimed = false;
        if (source.compliance_claim_allowed === false) siGov.compliance_claim_allowed = false;
        // Additions (true wins)
        if (source.security_interactivity_fix_applied === true) siGov.security_interactivity_fix_applied = true;
        if (source.active_content_removed === true) siGov.active_content_removed = true;
        if (source.javascript_removed === true) siGov.javascript_removed = true;
        if (source.launch_actions_removed === true) siGov.launch_actions_removed = true;
        if (source.embedded_files_removed === true) siGov.embedded_files_removed = true;
        if (source.document_open_actions_removed === true) siGov.document_open_actions_removed = true;
        if (source.page_open_actions_removed === true) siGov.page_open_actions_removed = true;
        if (source.annotations_flattened === true) siGov.annotations_flattened = true;
        if (source.annotation_flatten_skipped === true) siGov.annotation_flatten_skipped = true;
        if (source.forms_flattened === true) siGov.forms_flattened = true;
        if (source.form_flatten_skipped === true) siGov.form_flatten_skipped = true;
        if (source.unresolved_interactive_content === true) siGov.unresolved_interactive_content = true;
        if (source.visually_sensitive === true) siGov.visually_sensitive = true;
        if (source.security_sensitive === true) siGov.security_sensitive = true;
        // Deduplicate arrays
        if (source.review_required_reasons && source.review_required_reasons.length > 0) {
            siGov.review_required_reasons = [...new Set([...(siGov.review_required_reasons || []), ...source.review_required_reasons])];
        }
        if (source.warnings && source.warnings.length > 0) {
            siGov.warnings = [...new Set([...(siGov.warnings || []), ...source.warnings])];
        }
        // Evidence: collect but sanitize later
        if (source.evidence) {
            siGov.evidence = { ...(siGov.evidence || {}), ...source.evidence };
        }
    }

    // Sanitize siGov evidence — never expose raw internals
    if (siGov.evidence) {
        const safeSiEvidence = {};
        for (const [k, v] of Object.entries(siGov.evidence)) {
            const blocked = ['qpdf_command', 'command', 'local_path', 'raw_xmp', 'internal_id',
                'obj_', 'forensic_object_id', 'validator_command', 'parser_output', 'raw_stream'];
            if (!blocked.some(b => k.includes(b))) {
                safeSiEvidence[k] = v;
            }
        }
        siGov.evidence = Object.keys(safeSiEvidence).length > 0 ? safeSiEvidence : undefined;
    }

    // Propagate security/interactivity flags conservatively
    if (siGov.review_required === true) {
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === 'CERTIFIED_READY' || certLevel === 'FIXED_READY') {
            certLevel = (appliedFixesRaw.length > 0 || siGov.security_interactivity_fix_applied) ? 'FIXED_REVIEW_REQUIRED' : 'REVIEW_REQUIRED';
        }
    }
    if (siGov.production_certified === false) isProdCert = false;
    if (siGov.certified_pdf_allowed === false || siGov.review_required === true) {
        // Downgrade certified_pdf artifact
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.production_certified = false;
                a.customer_visible = false;
                a.is_primary = false;
                a.artifact_role = 'REVIEW_REQUIRED';
            }
        });
    }
    if (siGov.pdfx_compliance_claimed === false) pdfxComplianceClaimed = false;
    if (siGov.pdfa_compliance_claimed === false) pdfaComplianceClaimed = false;
    if (siGov.standard_certified === false) standardCertified = false;

    // Phase 64D: Defensive extraction of ink_governance (TAC / rich black / registration color)
    const inkSources = [
        job.ink_governance,
        job.fix_summary?.ink_governance,
        job.fix_audit?.ink_governance,
        job.delta_summary?.ink_governance,
        job.delta_report?.ink_governance,
        job.report?.ink_governance
    ];
    const artifactsWithInkMeta = artifacts.find(a => a.metadata && a.metadata.ink_governance);
    if (artifactsWithInkMeta) inkSources.push(artifactsWithInkMeta.metadata.ink_governance);
    if (injectedJob?.ink_governance) inkSources.push(injectedJob.ink_governance);

    let inkGov = {};
    for (const source of inkSources) {
        if (!source) continue;
        // review_required=true wins
        if (source.review_required === true) inkGov.review_required = true;
        // Conservative: false wins on certification/compliance fields
        if (source.production_certified === false) inkGov.production_certified = false;
        if (source.certified_pdf_allowed === false) inkGov.certified_pdf_allowed = false;
        if (source.standard_certified === false) inkGov.standard_certified = false;
        if (source.pdfx_compliance_claimed === false) inkGov.pdfx_compliance_claimed = false;
        if (source.pdfa_compliance_claimed === false) inkGov.pdfa_compliance_claimed = false;
        if (source.compliance_claim_allowed === false) inkGov.compliance_claim_allowed = false;
        // Additions (true wins)
        if (source.ink_fix_applied === true) inkGov.ink_fix_applied = true;
        if (source.tac_reduction_attempted === true) inkGov.tac_reduction_attempted = true;
        if (source.tac_reduction_applied === true) inkGov.tac_reduction_applied = true;
        if (source.rich_black_text_mapped === true) inkGov.rich_black_text_mapped = true;
        if (source.registration_color_mapped === true) inkGov.registration_color_mapped = true;
        if (source.black_text_normalized === true) inkGov.black_text_normalized = true;
        if (source.small_text_rich_black_detected === true) inkGov.small_text_rich_black_detected = true;
        if (source.visual_change_expected === true) inkGov.visual_change_expected = true;
        if (source.visually_sensitive === true) inkGov.visually_sensitive = true;
        // Deduplicate arrays
        if (source.review_required_reasons && source.review_required_reasons.length > 0) {
            inkGov.review_required_reasons = [...new Set([...(inkGov.review_required_reasons || []), ...source.review_required_reasons])];
        }
        if (source.warnings && source.warnings.length > 0) {
            inkGov.warnings = [...new Set([...(inkGov.warnings || []), ...source.warnings])];
        }
        // Evidence: collect but sanitize later
        if (source.evidence) {
            inkGov.evidence = { ...(inkGov.evidence || {}), ...source.evidence };
        }
    }

    // Sanitize inkGov evidence — never expose raw internals
    if (inkGov.evidence) {
        const safeInkEvidence = {};
        for (const [k, v] of Object.entries(inkGov.evidence)) {
            const blocked = ['qpdf_command', 'command', 'local_path', 'raw_xmp', 'internal_id',
                'obj_', 'forensic_object_id', 'validator_command', 'parser_output', 'raw_stream'];
            if (!blocked.some(b => k.includes(b))) {
                safeInkEvidence[k] = v;
            }
        }
        inkGov.evidence = Object.keys(safeInkEvidence).length > 0 ? safeInkEvidence : undefined;
    }

    // Propagate ink governance conservatively — visual/color changes always require review
    if (inkGov.review_required === true || inkGov.ink_fix_applied === true || inkGov.visual_change_expected === true) {
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === 'CERTIFIED_READY' || certLevel === 'FIXED_READY') {
            certLevel = (appliedFixesRaw.length > 0 || inkGov.ink_fix_applied) ? 'FIXED_REVIEW_REQUIRED' : 'REVIEW_REQUIRED';
        }
    }
    if (inkGov.production_certified === false) isProdCert = false;
    if (inkGov.certified_pdf_allowed === false || inkGov.review_required === true) {
        // Downgrade certified_pdf artifact
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.production_certified = false;
                a.customer_visible = false;
                a.is_primary = false;
                a.artifact_role = 'REVIEW_REQUIRED';
            }
        });
    }
    if (inkGov.pdfx_compliance_claimed === false) pdfxComplianceClaimed = false;
    if (inkGov.pdfa_compliance_claimed === false) pdfaComplianceClaimed = false;
    if (inkGov.standard_certified === false) standardCertified = false;

    // Phase 65D: Defensive extraction of selective_image_governance (RGB→CMYK, ICC profiles, downsampling, low-res)
    const selImgSources = [
        job.selective_image_governance,
        job.fix_summary?.selective_image_governance,
        job.fix_audit?.selective_image_governance,
        job.delta_summary?.selective_image_governance,
        job.delta_report?.selective_image_governance,
        job.report?.selective_image_governance
    ];
    const artifactsWithSelImgMeta = artifacts.find(a => a.metadata && a.metadata.selective_image_governance);
    if (artifactsWithSelImgMeta) selImgSources.push(artifactsWithSelImgMeta.metadata.selective_image_governance);
    if (injectedJob?.selective_image_governance) selImgSources.push(injectedJob.selective_image_governance);

    let selImgGov = {};
    for (const source of selImgSources) {
        if (!source) continue;
        if (source.review_required === true) selImgGov.review_required = true;
        // Conservative: false wins on certification/compliance fields
        if (source.production_certified === false) selImgGov.production_certified = false;
        if (source.certified_pdf_allowed === false) selImgGov.certified_pdf_allowed = false;
        if (source.standard_certified === false) selImgGov.standard_certified = false;
        if (source.pdfx_compliance_claimed === false) selImgGov.pdfx_compliance_claimed = false;
        if (source.pdfa_compliance_claimed === false) selImgGov.pdfa_compliance_claimed = false;
        if (source.compliance_claim_allowed === false) selImgGov.compliance_claim_allowed = false;
        // Additions (true wins)
        if (source.image_fix_applied === true) selImgGov.image_fix_applied = true;
        if (source.rgb_images_converted === true) selImgGov.rgb_images_converted = true;
        if (source.image_profiles_normalized === true) selImgGov.image_profiles_normalized = true;
        if (source.excessive_resolution_downsampled === true) selImgGov.excessive_resolution_downsampled = true;
        if (source.low_res_unfixable === true) selImgGov.low_res_unfixable = true;
        if (source.visual_change_expected === true) selImgGov.visual_change_expected = true;
        if (source.visually_sensitive === true) selImgGov.visually_sensitive = true;
        // Deduplicate arrays
        if (source.review_required_reasons && source.review_required_reasons.length > 0) {
            selImgGov.review_required_reasons = [...new Set([...(selImgGov.review_required_reasons || []), ...source.review_required_reasons])];
        }
        if (source.warnings && source.warnings.length > 0) {
            selImgGov.warnings = [...new Set([...(selImgGov.warnings || []), ...source.warnings])];
        }
        // Evidence: collect but sanitize later
        if (source.evidence) {
            selImgGov.evidence = { ...(selImgGov.evidence || {}), ...source.evidence };
        }
    }

    // Sanitize selImgGov evidence — never expose raw internals
    if (selImgGov.evidence) {
        const safeSelImgEvidence = {};
        for (const [k, v] of Object.entries(selImgGov.evidence)) {
            const blocked = ['qpdf_command', 'command', 'local_path', 'raw_xmp', 'internal_id',
                'obj_', 'forensic_object_id', 'validator_command', 'parser_output', 'raw_stream'];
            if (!blocked.some(b => k.includes(b))) {
                safeSelImgEvidence[k] = v;
            }
        }
        selImgGov.evidence = Object.keys(safeSelImgEvidence).length > 0 ? safeSelImgEvidence : undefined;
    }

    // Propagate selective image governance conservatively — image conversions/normalizations always require review
    if (selImgGov.review_required === true || selImgGov.image_fix_applied === true || selImgGov.visual_change_expected === true) {
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === 'CERTIFIED_READY' || certLevel === 'FIXED_READY') {
            certLevel = (appliedFixesRaw.length > 0 || selImgGov.image_fix_applied) ? 'FIXED_REVIEW_REQUIRED' : 'REVIEW_REQUIRED';
        }
    }
    if (selImgGov.production_certified === false) isProdCert = false;
    if (selImgGov.certified_pdf_allowed === false || selImgGov.review_required === true) {
        // Downgrade certified_pdf artifact
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.production_certified = false;
                a.customer_visible = false;
                a.is_primary = false;
                a.artifact_role = 'REVIEW_REQUIRED';
            }
        });
    }
    if (selImgGov.pdfx_compliance_claimed === false) pdfxComplianceClaimed = false;
    if (selImgGov.pdfa_compliance_claimed === false) pdfaComplianceClaimed = false;
    if (selImgGov.standard_certified === false) standardCertified = false;

    // Phase 66D: Defensive extraction of font_governance (embedding, Type3, glyphs, encoding)
    const fontSources = [
        job.font_governance,
        job.fix_summary?.font_governance,
        job.fix_audit?.font_governance,
        job.delta_summary?.font_governance,
        job.delta_report?.font_governance,
        job.report?.font_governance
    ];
    const artifactsWithFontMeta = artifacts.find(a => a.metadata && a.metadata.font_governance);
    if (artifactsWithFontMeta) fontSources.push(artifactsWithFontMeta.metadata.font_governance);
    if (injectedJob?.font_governance) fontSources.push(injectedJob.font_governance);

    let fontGov = {};
    for (const source of fontSources) {
        if (!source) continue;
        if (source.review_required === true) fontGov.review_required = true;
        // Conservative: false wins on certification/compliance fields
        if (source.production_certified === false) fontGov.production_certified = false;
        if (source.certified_pdf_allowed === false) fontGov.certified_pdf_allowed = false;
        if (source.standard_certified === false) fontGov.standard_certified = false;
        if (source.pdfx_compliance_claimed === false) fontGov.pdfx_compliance_claimed = false;
        if (source.pdfa_compliance_claimed === false) fontGov.pdfa_compliance_claimed = false;
        if (source.compliance_claim_allowed === false) fontGov.compliance_claim_allowed = false;
        // Additions (true wins)
        if (source.font_fix_applied === true) fontGov.font_fix_applied = true;
        if (source.fonts_embedded === true) fontGov.fonts_embedded = true;
        if (source.font_embedding_skipped === true) fontGov.font_embedding_skipped = true;
        if (source.type3_fonts_detected === true) fontGov.type3_fonts_detected = true;
        if (source.type3_fonts_outlined === true) fontGov.type3_fonts_outlined = true;
        if (source.glyphs_missing_unfixable === true) fontGov.glyphs_missing_unfixable = true;
        if (source.font_encoding_repaired === true) fontGov.font_encoding_repaired = true;
        if (source.font_source_available === false) fontGov.font_source_available = false;
        if (source.visual_change_expected === true) fontGov.visual_change_expected = true;
        if (source.visually_sensitive === true) fontGov.visually_sensitive = true;
        // Deduplicate arrays
        if (source.review_required_reasons && source.review_required_reasons.length > 0) {
            fontGov.review_required_reasons = [...new Set([...(fontGov.review_required_reasons || []), ...source.review_required_reasons])];
        }
        if (source.warnings && source.warnings.length > 0) {
            fontGov.warnings = [...new Set([...(fontGov.warnings || []), ...source.warnings])];
        }
        // Evidence: collect but sanitize later
        if (source.evidence) {
            fontGov.evidence = { ...(fontGov.evidence || {}), ...source.evidence };
        }
    }

    // Sanitize fontGov evidence — never expose raw internals
    if (fontGov.evidence) {
        const safeFontEvidence = {};
        for (const [k, v] of Object.entries(fontGov.evidence)) {
            const blocked = ['qpdf_command', 'command', 'local_path', 'raw_xmp', 'internal_id',
                'obj_', 'forensic_object_id', 'validator_command', 'parser_output', 'raw_stream'];
            if (!blocked.some(b => k.includes(b))) {
                safeFontEvidence[k] = v;
            }
        }
        fontGov.evidence = Object.keys(safeFontEvidence).length > 0 ? safeFontEvidence : undefined;
    }

    // Propagate font governance conservatively — embedding/Type3/glyph findings always require review
    if (fontGov.review_required === true || fontGov.font_fix_applied === true || fontGov.font_embedding_skipped === true
        || fontGov.type3_fonts_detected === true || fontGov.glyphs_missing_unfixable === true
        || fontGov.font_source_available === false || fontGov.visual_change_expected === true) {
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === 'CERTIFIED_READY' || certLevel === 'FIXED_READY') {
            certLevel = (appliedFixesRaw.length > 0 || fontGov.font_fix_applied) ? 'FIXED_REVIEW_REQUIRED' : 'REVIEW_REQUIRED';
        }
    }
    if (fontGov.production_certified === false) isProdCert = false;
    if (fontGov.certified_pdf_allowed === false || fontGov.review_required === true) {
        // Downgrade certified_pdf artifact
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.production_certified = false;
                a.customer_visible = false;
                a.is_primary = false;
                a.artifact_role = 'REVIEW_REQUIRED';
            }
        });
    }
    if (fontGov.pdfx_compliance_claimed === false) pdfxComplianceClaimed = false;
    if (fontGov.pdfa_compliance_claimed === false) pdfaComplianceClaimed = false;
    if (fontGov.standard_certified === false) standardCertified = false;

    // Phase 67D: Defensive extraction of transparency_overprint_physical_governance
    const transPhysSources = [
        job.transparency_overprint_physical_governance,
        job.fix_summary?.transparency_overprint_physical_governance,
        job.fix_audit?.transparency_overprint_physical_governance,
        job.delta_summary?.transparency_overprint_physical_governance,
        job.delta_report?.transparency_overprint_physical_governance,
        job.report?.transparency_overprint_physical_governance
    ];
    const artifactsWithTransPhysMeta = artifacts.find(a => a.metadata && a.metadata.transparency_overprint_physical_governance);
    if (artifactsWithTransPhysMeta) transPhysSources.push(artifactsWithTransPhysMeta.metadata.transparency_overprint_physical_governance);
    if (injectedJob?.transparency_overprint_physical_governance) transPhysSources.push(injectedJob.transparency_overprint_physical_governance);

    let transPhysGov = {};
    for (const source of transPhysSources) {
        if (!source) continue;
        if (source.review_required === true) transPhysGov.review_required = true;
        // Conservative: false wins on certification/compliance fields
        if (source.production_certified === false) transPhysGov.production_certified = false;
        if (source.certified_pdf_allowed === false) transPhysGov.certified_pdf_allowed = false;
        if (source.standard_certified === false) transPhysGov.standard_certified = false;
        if (source.pdfx_compliance_claimed === false) transPhysGov.pdfx_compliance_claimed = false;
        if (source.pdfa_compliance_claimed === false) transPhysGov.pdfa_compliance_claimed = false;
        if (source.compliance_claim_allowed === false) transPhysGov.compliance_claim_allowed = false;
        // Additions (true wins)
        if (source.transparency_fix_applied === true) transPhysGov.transparency_fix_applied = true;
        if (source.transparency_flattened === true) transPhysGov.transparency_flattened = true;
        if (source.blend_modes_normalized === true) transPhysGov.blend_modes_normalized = true;
        if (source.overprint_flattened === true) transPhysGov.overprint_flattened = true;
        if (source.overprint_preview_simulated === true) transPhysGov.overprint_preview_simulated = true;
        if (source.visual_change_expected === true) transPhysGov.visual_change_expected = true;
        if (source.rendering_safety_proven === false) transPhysGov.rendering_safety_proven = false;
        if (source.visually_sensitive === true) transPhysGov.visually_sensitive = true;
        // Deduplicate arrays
        if (source.review_required_reasons && source.review_required_reasons.length > 0) {
            transPhysGov.review_required_reasons = [...new Set([...(transPhysGov.review_required_reasons || []), ...source.review_required_reasons])];
        }
        if (source.warnings && source.warnings.length > 0) {
            transPhysGov.warnings = [...new Set([...(transPhysGov.warnings || []), ...source.warnings])];
        }
        if (source.evidence) {
            transPhysGov.evidence = { ...(transPhysGov.evidence || {}), ...source.evidence };
        }
    }

    // Sanitize transPhysGov evidence — never expose raw internals
    if (transPhysGov.evidence) {
        const safeTransPhysEvidence = {};
        for (const [k, v] of Object.entries(transPhysGov.evidence)) {
            const blocked = ['qpdf_command', 'command', 'local_path', 'raw_xmp', 'internal_id',
                'obj_', 'forensic_object_id', 'validator_command', 'parser_output', 'raw_stream'];
            if (!blocked.some(b => k.includes(b))) {
                safeTransPhysEvidence[k] = v;
            }
        }
        transPhysGov.evidence = Object.keys(safeTransPhysEvidence).length > 0 ? safeTransPhysEvidence : undefined;
    }

    // Propagate physical transparency/overprint governance conservatively
    if (transPhysGov.review_required === true || transPhysGov.transparency_flattened === true
        || transPhysGov.overprint_flattened === true || transPhysGov.blend_modes_normalized === true
        || transPhysGov.overprint_preview_simulated === true || transPhysGov.visual_change_expected === true
        || transPhysGov.transparency_fix_applied === true) {
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === 'CERTIFIED_READY' || certLevel === 'FIXED_READY') {
            certLevel = (appliedFixesRaw.length > 0 || transPhysGov.transparency_fix_applied) ? 'FIXED_REVIEW_REQUIRED' : 'REVIEW_REQUIRED';
        }
    }
    if (transPhysGov.production_certified === false) isProdCert = false;
    if (transPhysGov.certified_pdf_allowed === false || transPhysGov.review_required === true) {
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.production_certified = false;
                a.customer_visible = false;
                a.is_primary = false;
                a.artifact_role = 'REVIEW_REQUIRED';
            }
        });
    }
    if (transPhysGov.pdfx_compliance_claimed === false) pdfxComplianceClaimed = false;
    if (transPhysGov.pdfa_compliance_claimed === false) pdfaComplianceClaimed = false;
    if (transPhysGov.standard_certified === false) standardCertified = false;

    // Phase 69D: Defensive extraction of visual_diff_governance
    const visualDiffSources = [
        job.visual_diff_governance,
        job.fix_summary?.visual_diff_governance,
        job.fix_audit?.visual_diff_governance,
        job.delta_summary?.visual_diff_governance,
        job.delta_report?.visual_diff_governance,
        job.report?.visual_diff_governance
    ];
    const artifactsWithVisualDiffMeta = artifacts.find(a => a.metadata && a.metadata.visual_diff_governance);
    if (artifactsWithVisualDiffMeta) visualDiffSources.push(artifactsWithVisualDiffMeta.metadata.visual_diff_governance);
    if (injectedJob?.visual_diff_governance) visualDiffSources.push(injectedJob.visual_diff_governance);

    let visualDiffGov = {};
    for (const source of visualDiffSources) {
        if (!source) continue;
        // Conservative merges — review flags can only be set, never cleared
        if (source.visual_diff_required === true) visualDiffGov.visual_diff_required = true;
        if (source.visual_diff_performed === true) visualDiffGov.visual_diff_performed = true;
        if (source.visual_change_detected === true) visualDiffGov.visual_change_detected = true;
        if (source.visual_review_required === true) visualDiffGov.visual_review_required = true;
        if (source.render_tool_gap === true) visualDiffGov.render_tool_gap = true;
        if (source.proof_artifacts_available === true) visualDiffGov.proof_artifacts_available = true;
        // Numeric: keep the max changed_pixel_ratio seen
        if (typeof source.max_changed_pixel_ratio === 'number') {
            visualDiffGov.max_changed_pixel_ratio = Math.max(visualDiffGov.max_changed_pixel_ratio || 0, source.max_changed_pixel_ratio);
        }
        if (typeof source.changed_pixel_ratio_avg === 'number') {
            visualDiffGov.changed_pixel_ratio_avg = Math.max(visualDiffGov.changed_pixel_ratio_avg || 0, source.changed_pixel_ratio_avg);
        }
        if (typeof source.pages_rendered === 'number' && source.pages_rendered > (visualDiffGov.pages_rendered || 0)) {
            visualDiffGov.pages_rendered = source.pages_rendered;
        }
        if (typeof source.pages_compared === 'number' && source.pages_compared > (visualDiffGov.pages_compared || 0)) {
            visualDiffGov.pages_compared = source.pages_compared;
        }
        if (source.dimensions_match === false) visualDiffGov.dimensions_match = false;
        else if (source.dimensions_match === true && visualDiffGov.dimensions_match !== false) visualDiffGov.dimensions_match = true;
        if (source.render_tool && !visualDiffGov.render_tool) visualDiffGov.render_tool = source.render_tool;
        if (source.render_tool_version && !visualDiffGov.render_tool_version) visualDiffGov.render_tool_version = source.render_tool_version;
        if (source.warnings && source.warnings.length > 0) {
            visualDiffGov.warnings = [...new Set([...(visualDiffGov.warnings || []), ...source.warnings])];
        }
        if (source.limitations && source.limitations.length > 0) {
            visualDiffGov.limitations = [...new Set([...(visualDiffGov.limitations || []), ...source.limitations])];
        }
        // Evidence: collect for later sanitization
        if (source.evidence) {
            visualDiffGov.evidence = { ...(visualDiffGov.evidence || {}), ...source.evidence };
        }
        // Safe thumbnail/diff image refs (IDs only, never raw paths)
        if (source.thumbnail_artifact_ids && source.thumbnail_artifact_ids.length > 0) {
            visualDiffGov.thumbnail_artifact_ids = [...new Set([...(visualDiffGov.thumbnail_artifact_ids || []), ...source.thumbnail_artifact_ids])];
        }
        if (source.diff_image_artifact_ids && source.diff_image_artifact_ids.length > 0) {
            visualDiffGov.diff_image_artifact_ids = [...new Set([...(visualDiffGov.diff_image_artifact_ids || []), ...source.diff_image_artifact_ids])];
        }
    }

    // Sanitize visualDiffGov evidence — never expose raw paths, internal IDs, or commands
    if (visualDiffGov.evidence) {
        const safeVisualDiffEvidence = {};
        const blockedKeys = ['command', 'local_path', 'raw_path', 'file_path', 'internal_id',
            'obj_', 'forensic_object_id', 'raw_stream', 'diff_images', 'thumbnails'];
        for (const [k, v] of Object.entries(visualDiffGov.evidence)) {
            if (!blockedKeys.some(b => k.includes(b))) {
                safeVisualDiffEvidence[k] = v;
            }
        }
        visualDiffGov.evidence = Object.keys(safeVisualDiffEvidence).length > 0 ? safeVisualDiffEvidence : undefined;
    }

    // Propagate visual diff governance conservatively
    if (visualDiffGov.visual_change_detected === true || visualDiffGov.visual_review_required === true
        || (visualDiffGov.visual_diff_required === true && !visualDiffGov.visual_diff_performed)) {
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === 'CERTIFIED_READY' || certLevel === 'FIXED_READY') {
            certLevel = 'FIXED_REVIEW_REQUIRED';
        }
        // Downgrade certified_pdf
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.production_certified = false;
                a.customer_visible = false;
                a.is_primary = false;
                a.artifact_role = 'REVIEW_REQUIRED';
            }
        });
    }

    // Phase 70D: Defensive extraction of proof_approval_governance
    const proofApprSources = [
        job.proof_approval_governance,
        job.fix_summary?.proof_approval_governance,
        job.fix_audit?.proof_approval_governance,
        job.delta_summary?.proof_approval_governance,
        job.delta_report?.proof_approval_governance,
        job.report?.proof_approval_governance
    ];
    const artifactsWithProofApprMeta = artifacts.find(a => a.metadata && a.metadata.proof_approval_governance);
    if (artifactsWithProofApprMeta) proofApprSources.push(artifactsWithProofApprMeta.metadata.proof_approval_governance);
    if (injectedJob?.proof_approval_governance) proofApprSources.push(injectedJob.proof_approval_governance);

    let proofApprGov = {};
    for (const source of proofApprSources) {
        if (!source) continue;
        // Conservative merges — review/block flags can only be set, never cleared
        if (source.proof_required === true) proofApprGov.proof_required = true;
        if (source.proof_available === true) proofApprGov.proof_available = true;
        if (source.visual_change_detected === true) proofApprGov.visual_change_detected = true;
        if (source.review_required === true) proofApprGov.review_required = true;
        // proof_status: APPROVED wins over PENDING, REJECTED wins over PENDING, else keep most recent
        if (source.proof_status === 'REJECTED') {
            proofApprGov.proof_status = 'REJECTED';
        } else if (source.proof_status === 'APPROVED' && proofApprGov.proof_status !== 'REJECTED') {
            proofApprGov.proof_status = 'APPROVED';
        } else if (source.proof_status === 'PENDING' && !proofApprGov.proof_status) {
            proofApprGov.proof_status = 'PENDING';
        } else if (source.proof_status && !proofApprGov.proof_status) {
            proofApprGov.proof_status = source.proof_status;
        }
        if (source.proof_id && !proofApprGov.proof_id) proofApprGov.proof_id = source.proof_id;
        if (source.customer_feedback && !proofApprGov.customer_feedback) proofApprGov.customer_feedback = source.customer_feedback;
        if (source.warnings && source.warnings.length > 0) {
            proofApprGov.warnings = [...new Set([...(proofApprGov.warnings || []), ...source.warnings])];
        }
        if (source.evidence) {
            proofApprGov.evidence = { ...(proofApprGov.evidence || {}), ...source.evidence };
        }
    }

    // Sanitize proofApprGov evidence — never expose raw paths or internal IDs
    if (proofApprGov.evidence) {
        const safeProofApprEvidence = {};
        const blockedEvidenceKeys = ['command', 'local_path', 'raw_path', 'file_path', 'internal_id',
            'obj_', 'forensic_object_id', 'raw_stream'];
        for (const [k, v] of Object.entries(proofApprGov.evidence)) {
            if (!blockedEvidenceKeys.some(b => k.includes(b))) {
                safeProofApprEvidence[k] = v;
            }
        }
        proofApprGov.evidence = Object.keys(safeProofApprEvidence).length > 0 ? safeProofApprEvidence : undefined;
    }

    // Propagate proof approval governance conservatively
    const proofApprovalBlocks = proofApprGov.proof_required === true
        && proofApprGov.proof_status !== 'APPROVED';
    if (proofApprovalBlocks || proofApprGov.review_required === true) {
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === 'CERTIFIED_READY' || certLevel === 'FIXED_READY') {
            certLevel = 'FIXED_REVIEW_REQUIRED';
        }
    }
    if (proofApprGov.proof_status === 'REJECTED') {
        // Rejected proof: downgrade certified_pdf
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.production_certified = false;
                a.customer_visible = false;
                a.is_primary = false;
                a.artifact_role = 'REVIEW_REQUIRED';
            }
        });
    }

    // Build safe public proof_approval_governance subset (no raw paths, no customer_feedback in customer view)
    const safeProofApprGov = {
        proof_required: proofApprGov.proof_required === true,
        proof_available: proofApprGov.proof_available === true,
        proof_status: proofApprGov.proof_status || 'NOT_REQUIRED',
        visual_change_detected: proofApprGov.visual_change_detected === true,
        review_required: proofApprGov.review_required === true || proofApprovalBlocks,
        production_certified: false,
        standard_certified: false,
        warnings: proofApprGov.warnings || []
        // proof_id and customer_feedback intentionally omitted here; exposed via proof_approval_ux.operator only
    };
    if (proofApprGov.evidence) {
        safeProofApprGov.evidence = proofApprGov.evidence;
    }

    // Phase 61D: Defensive extraction of structural_metadata_governance
    const structSources = [
        job.structural_metadata_governance,
        job.fix_summary?.structural_metadata_governance,
        job.fix_audit?.structural_metadata_governance,
        job.delta_summary?.structural_metadata_governance,
        job.delta_report?.structural_metadata_governance,
        job.report?.structural_metadata_governance
    ];
    const artifactsWithStructMeta = artifacts.find(a => a.metadata && a.metadata.structural_metadata_governance);
    if (artifactsWithStructMeta) structSources.push(artifactsWithStructMeta.metadata.structural_metadata_governance);
    if (injectedJob?.structural_metadata_governance) structSources.push(injectedJob.structural_metadata_governance);

    let structGov = {};
    for (const source of structSources) {
        if (!source) continue;
        if (source.review_required === true) structGov.review_required = true;
        
        // Conservative merges (false wins over true claims)
        if (source.production_certified === false) structGov.production_certified = false;
        if (source.certified_pdf_allowed === false) structGov.certified_pdf_allowed = false;
        if (source.standard_certified === false) structGov.standard_certified = false;
        if (source.pdfx_compliance_claimed === false) structGov.pdfx_compliance_claimed = false;
        if (source.pdfa_compliance_claimed === false) structGov.pdfa_compliance_claimed = false;
        if (source.compliance_claim_allowed === false) structGov.compliance_claim_allowed = false;
        if (source.validation_performed === false) structGov.validation_performed = false;
        if (source.validation_passed === false) structGov.validation_passed = false;
        if (source.standards_claim_allowed === false) structGov.standards_claim_allowed = false;

        // Additions
        if (source.structural_fix_applied === true) structGov.structural_fix_applied = true;
        if (source.metadata_cleanup_applied === true) structGov.metadata_cleanup_applied = true;
        if (source.object_streams_normalized === true) structGov.object_streams_normalized = true;
        if (source.false_certification_revoked === true) structGov.false_certification_revoked = true;
        if (source.invalid_pdfx_metadata_stripped === true) structGov.invalid_pdfx_metadata_stripped = true;
        if (source.invalid_pdfa_metadata_stripped === true) structGov.invalid_pdfa_metadata_stripped = true;
        if (source.standard_metadata_normalized === true) structGov.standard_metadata_normalized = true;
        if (source.internal_standard_report_generated === true) structGov.internal_standard_report_generated = true;
        if (source.qpdf_available === true) structGov.qpdf_available = true;

        if (source.qpdf_warnings && source.qpdf_warnings.length > 0) {
            structGov.qpdf_warnings = [...new Set([...(structGov.qpdf_warnings || []), ...source.qpdf_warnings])];
        }
        if (source.metadata_cleanup_warnings && source.metadata_cleanup_warnings.length > 0) {
            structGov.metadata_cleanup_warnings = [...new Set([...(structGov.metadata_cleanup_warnings || []), ...source.metadata_cleanup_warnings])];
        }
        if (source.warnings && source.warnings.length > 0) {
            structGov.warnings = [...new Set([...(structGov.warnings || []), ...source.warnings])];
        }
        if (source.review_required_reasons && source.review_required_reasons.length > 0) {
            structGov.review_required_reasons = [...new Set([...(structGov.review_required_reasons || []), ...source.review_required_reasons])];
        }
        if (source.evidence) {
            structGov.evidence = { ...(structGov.evidence || {}), ...source.evidence };
        }
    }

    // Sanitize structGov evidence
    if (structGov.evidence) {
        const safeEvidence = {};
        for (const [k, v] of Object.entries(structGov.evidence)) {
            // customer_summary, artifact_ux, public report payload shouldn't have raw stuff.
            if (!['qpdf_command', 'command', 'local_path', 'raw_xmp', 'internal_id', 'obj_', 'forensic_object_id', 'validator_command', 'parser_output'].some(b => k.includes(b))) {
                safeEvidence[k] = v;
            }
        }
        structGov.evidence = Object.keys(safeEvidence).length > 0 ? safeEvidence : undefined;
    }

    if (structGov.false_certification_revoked || structGov.metadata_cleanup_applied) {
        if (!hasFullValidatorEvidence) {
            standardCertified = false;
            pdfxComplianceClaimed = false;
            pdfaComplianceClaimed = false;
        }
    }

    if (structGov.review_required === true) {
        isReviewReq = true;
        // Do not upgrade production_certified or anything else here.
    }

    // Phase 56D: Defensive extraction of artifact_trust
    const trustSources = [
        job.artifact_trust,
        job.fix_summary?.artifact_trust,
        job.fix_audit?.artifact_trust,
        job.delta_summary?.artifact_trust,
        job.delta_report?.artifact_trust,
        job.report?.artifact_trust
    ];
    const artifactsWithTrustMeta = artifacts.find(a => a.metadata && a.metadata.artifact_trust);
    if (artifactsWithTrustMeta) trustSources.push(artifactsWithTrustMeta.metadata.artifact_trust);
    if (injectedJob?.artifact_trust) trustSources.push(injectedJob.artifact_trust); 

    let artTrust = {};
    for (const source of trustSources) {
        if (!source) continue;
        if (source.trust_level && !artTrust.trust_level) artTrust.trust_level = source.trust_level;
        if (source.primary_artifact_type && !artTrust.primary_artifact_type) artTrust.primary_artifact_type = source.primary_artifact_type;
        
        if (source.review_required === true) artTrust.review_required = true;
        if (source.certified_pdf_allowed === false) artTrust.certified_pdf_allowed = false;
        if (source.production_certified === false) artTrust.production_certified = false;
        else if (source.production_certified === true && artTrust.production_certified !== false) artTrust.production_certified = true;
        
        if (source.standard_certified === false) artTrust.standard_certified = false;
        else if (source.standard_certified === true && artTrust.standard_certified !== false) artTrust.standard_certified = true;
        
        if (source.customer_visible === false) artTrust.customer_visible = false;
        else if (source.customer_visible === true && artTrust.customer_visible !== false) artTrust.customer_visible = true;

        if (source.pdfx_compliance_claimed === true) artTrust.pdfx_compliance_claimed = true;
        if (source.pdfa_compliance_claimed === true) artTrust.pdfa_compliance_claimed = true;
        if (source.compliance_claim_allowed === false) artTrust.compliance_claim_allowed = false;
        if (source.outputintent_changed === true) artTrust.outputintent_changed = true;
        if (source.outputintent_does_not_prove_pdfx === true) artTrust.outputintent_does_not_prove_pdfx = true;

        if (source.blocked_by_governance_domains && source.blocked_by_governance_domains.length > 0) {
            artTrust.blocked_by_governance_domains = [...new Set([...(artTrust.blocked_by_governance_domains || []), ...source.blocked_by_governance_domains])];
        }
        if (source.warnings && source.warnings.length > 0) {
            artTrust.warnings = [...new Set([...(artTrust.warnings || []), ...source.warnings])];
        }
        if (source.primary_disallowed_reasons && source.primary_disallowed_reasons.length > 0) {
            artTrust.primary_disallowed_reasons = [...new Set([...(artTrust.primary_disallowed_reasons || []), ...source.primary_disallowed_reasons])];
        }
        if (source.certification_labels && source.certification_labels.length > 0) {
            artTrust.certification_labels = [...new Set([...(artTrust.certification_labels || []), ...source.certification_labels])];
        }
        if (source.evidence) {
            artTrust.evidence = { ...(artTrust.evidence || {}), ...source.evidence };
        }
    }

    if (artTrust.review_required === true) isReviewReq = true;
    if (artTrust.production_certified === false) isProdCert = false;
    else if (artTrust.production_certified === true && (!artTrust.blocked_by_governance_domains || artTrust.blocked_by_governance_domains.length === 0)) isProdCert = true;

    // Validator evidence cross-check
    if (artTrust.standard_certified === true) {
        let hasTrustEvidence = false;
        const ev = artTrust.evidence || {};
        if (ev.validation_performed === true &&
            ev.validation_passed === true &&
            ev.validator_name &&
            ev.validator_version &&
            ev.standard_detected &&
            (ev.validation_report_available === true || ev.validation_report_hash || ev.validation_report_path) &&
            ev.compliance_claim_allowed !== false) {
            hasTrustEvidence = true;
        }
        if (!hasTrustEvidence && !hasFullValidatorEvidence) {
            artTrust.standard_certified = false;
            artTrust.pdfx_compliance_claimed = false;
            artTrust.pdfa_compliance_claimed = false;
            if (artTrust.certification_labels) {
                artTrust.certification_labels = artTrust.certification_labels.filter(l => !['Standards validated', 'PDF/X validated', 'PDF/A validated', 'PDF/X certified', 'PDF/A certified', 'Standard-certified'].includes(l));
            }
            artTrust.warnings = [...new Set([...(artTrust.warnings || []), 'STANDARD_CLAIM_WITHOUT_VALIDATOR_EVIDENCE'])];
        } else {
            pdfxComplianceClaimed = artTrust.pdfx_compliance_claimed || pdfxComplianceClaimed;
            pdfaComplianceClaimed = artTrust.pdfa_compliance_claimed || pdfaComplianceClaimed;
            standardCertified = true;
        }
    } else if (artTrust.standard_certified === false) {
        standardCertified = false;
        pdfxComplianceClaimed = false;
        pdfaComplianceClaimed = false;
    }
    
    // Sanitize evidence before exposing to public report
    if (artTrust.evidence) {
        const safeEvidence = {};
        for (const [k, v] of Object.entries(artTrust.evidence)) {
            if (!['raw_command', 'local_path', 'internal_id', 'obj_'].some(b => k.includes(b))) {
                safeEvidence[k] = v;
            }
        }
        artTrust.evidence = safeEvidence;
    }

    // Phase 62F-D: Defensive extraction of heavy_pdf_probe_governance
    const heavyPdfSources = [
        job.heavy_pdf_probe_governance,
        job.fix_summary?.heavy_pdf_probe_governance,
        job.fix_audit?.heavy_pdf_probe_governance,
        job.delta_summary?.heavy_pdf_probe_governance,
        job.delta_report?.heavy_pdf_probe_governance,
        job.report?.heavy_pdf_probe_governance,
        job.artifact_summary?.heavy_pdf_probe_governance,
        job.analysisIntegrity?.probeSemantics,
        job.report?.analysisIntegrity?.probeSemantics
    ];
    const artifactsWithHeavyPdfMeta = artifacts.find(a => a.metadata && a.metadata.heavy_pdf_probe_governance);
    if (artifactsWithHeavyPdfMeta) heavyPdfSources.push(artifactsWithHeavyPdfMeta.metadata.heavy_pdf_probe_governance);
    if (injectedJob?.heavy_pdf_probe_governance) heavyPdfSources.push(injectedJob.heavy_pdf_probe_governance);

    let heavyPdfGov = {};
    for (const source of heavyPdfSources) {
        if (!source) continue;
        if (source.heavy_pdf_detected === true) heavyPdfGov.heavy_pdf_detected = true;
        if (typeof source.file_size_bytes === 'number') heavyPdfGov.file_size_bytes = source.file_size_bytes;
        if (typeof source.file_size_mb === 'number') heavyPdfGov.file_size_mb = source.file_size_mb;
        if (typeof source.page_count === 'number') heavyPdfGov.page_count = source.page_count;
        if (source.probe_semantics_applied === true) heavyPdfGov.probe_semantics_applied = true;
        if (source.analysis_degraded === true) heavyPdfGov.analysis_degraded = true;
        if (source.degraded_but_usable === true) heavyPdfGov.degraded_but_usable = true;
        if (source.fatal_document_failure === true) heavyPdfGov.fatal_document_failure = true;
        if (source.review_required === true) heavyPdfGov.review_required = true;

        // Conservative merges: false wins on certification/compliance flags
        if (source.certifiable === false) heavyPdfGov.certifiable = false;
        if (source.production_certified === false) heavyPdfGov.production_certified = false;
        if (source.standard_certified === false) heavyPdfGov.standard_certified = false;
        if (source.certified_pdf_allowed === false) heavyPdfGov.certified_pdf_allowed = false;
        if (source.pdfx_compliance_claimed === false) heavyPdfGov.pdfx_compliance_claimed = false;
        if (source.pdfa_compliance_claimed === false) heavyPdfGov.pdfa_compliance_claimed = false;
        if (source.compliance_claim_allowed === false) heavyPdfGov.compliance_claim_allowed = false;

        if (source.probe_summary) heavyPdfGov.probe_summary = { ...(heavyPdfGov.probe_summary || {}), ...source.probe_summary };
        if (source.tools) {
            heavyPdfGov.tools = { ...(heavyPdfGov.tools || {}) };
            for (const [toolName, toolData] of Object.entries(source.tools)) {
                heavyPdfGov.tools[toolName] = { ...(heavyPdfGov.tools[toolName] || {}), ...toolData };
            }
        }
        if (source.warnings && source.warnings.length > 0) {
            heavyPdfGov.warnings = [...new Set([...(heavyPdfGov.warnings || []), ...source.warnings])];
        }
        if (source.review_required_reasons && source.review_required_reasons.length > 0) {
            heavyPdfGov.review_required_reasons = [...new Set([...(heavyPdfGov.review_required_reasons || []), ...source.review_required_reasons])];
        }
        if (source.evidence) {
            heavyPdfGov.evidence = { ...(heavyPdfGov.evidence || {}), ...source.evidence };
        }
    }

    // Phase 62F-D: defensive extraction of related top-level governance flags
    const heavyPdfAnalysisStatus = job.analysis_status || job.report?.analysis_status
        || job.fix_audit?.analysis_status || job.delta_report?.analysis_status
        || injectedJob?.analysis_status || null;
    const heavyPdfDegradedReasons = [...new Set([
        ...(job.degraded_reasons || []),
        ...(job.report?.degraded_reasons || []),
        ...(job.fix_audit?.degraded_reasons || []),
        ...(injectedJob?.degraded_reasons || [])
    ])];
    const strictForensicMode = job.strict_forensic_mode === true || job.report?.strict_forensic_mode === true
        || job.fix_audit?.strict_forensic_mode === true || stdGov.strict_forensic_mode === true
        || injectedJob?.strict_forensic_mode === true;

    // Detect heavy PDF from raw file size even without an explicit governance flag
    const HEAVY_PDF_THRESHOLD_BYTES = 500 * 1024 * 1024;
    const heavyPdfReportedSize = heavyPdfGov.file_size_bytes
        || job.file_size_bytes || job.report?.file_size_bytes || job.fix_audit?.file_size_bytes || 0;
    if (heavyPdfGov.heavy_pdf_detected !== true && heavyPdfReportedSize >= HEAVY_PDF_THRESHOLD_BYTES) {
        heavyPdfGov.heavy_pdf_detected = true;
        heavyPdfGov.file_size_bytes = heavyPdfReportedSize;
    }
    // If degraded_but_usable was not explicit, infer it conservatively from analysis_status
    if (heavyPdfGov.heavy_pdf_detected === true && heavyPdfGov.fatal_document_failure !== true
        && heavyPdfGov.degraded_but_usable !== true
        && (heavyPdfAnalysisStatus === 'DEGRADED' || heavyPdfGov.analysis_degraded === true)) {
        heavyPdfGov.degraded_but_usable = true;
    }

    // Sanitize heavyPdfGov.evidence and per-tool evidence — strip raw transcripts, paths, and object IDs
    const HEAVY_PDF_BLOCKED_EVIDENCE_KEYS = ['qpdf_command', 'command', 'local_path', 'raw_xmp', 'internal_id',
        'obj_', 'forensic_object_id', 'validator_command', 'parser_output', 'raw_stream', 'raw_path', 'file_path'];
    const HEAVY_PDF_TEMP_PATH_PATTERN = /(\/(?:tmp|var|private|storage|root|home)\/\S*|[A-Za-z]:\\\S*)/g;

    function sanitizeHeavyPdfEvidence(evidence) {
        if (!evidence) return undefined;
        const safe = {};
        for (const [k, v] of Object.entries(evidence)) {
            if (HEAVY_PDF_BLOCKED_EVIDENCE_KEYS.some(b => k.includes(b))) continue;
            if (typeof v === 'string') {
                let sanitized = v.replace(HEAVY_PDF_TEMP_PATH_PATTERN, '[path removed]');
                if (sanitized.length > 500) sanitized = sanitized.slice(0, 500) + '... [truncated]';
                safe[k] = sanitized;
            } else {
                safe[k] = v;
            }
        }
        return Object.keys(safe).length > 0 ? safe : undefined;
    }

    function sanitizeHeavyPdfTool(toolData) {
        if (!toolData) return undefined;
        return {
            raw_status: toolData.raw_status || null,
            semantic_status: toolData.semantic_status || null,
            severity: toolData.severity || null,
            usable_output: toolData.usable_output === true,
            fatal: toolData.fatal === true,
            warning_classes: toolData.warning_classes || [],
            fatal_classes: toolData.fatal_classes || [],
            evidence: sanitizeHeavyPdfEvidence(toolData.evidence)
        };
    }

    heavyPdfGov.evidence = sanitizeHeavyPdfEvidence(heavyPdfGov.evidence);
    if (heavyPdfGov.tools) {
        const sanitizedHeavyPdfTools = {};
        for (const [toolName, toolData] of Object.entries(heavyPdfGov.tools)) {
            sanitizedHeavyPdfTools[toolName] = sanitizeHeavyPdfTool(toolData);
        }
        heavyPdfGov.tools = sanitizedHeavyPdfTools;
    }

    // Propagate heavy PDF probe governance conservatively
    const heavyPdfFatal = heavyPdfGov.fatal_document_failure === true;
    const heavyPdfReviewRequired = heavyPdfGov.review_required === true || heavyPdfGov.degraded_but_usable === true;

    if (heavyPdfFatal) {
        // Fatal document failure: require remediation/reupload, never offer production download
        isReviewReq = true;
        isProdCert = false;
        certLevel = 'BLOCKED';
    } else if (heavyPdfReviewRequired) {
        // Degraded-but-usable / explicit review required: route to operator review, never auto-certify
        isReviewReq = true;
        isProdCert = false;
        if (certLevel === 'CERTIFIED_READY' || certLevel === 'FIXED_READY') {
            certLevel = appliedFixesRaw.length > 0 ? 'FIXED_REVIEW_REQUIRED' : 'REVIEW_REQUIRED';
        }
    }

    if (heavyPdfGov.production_certified === false) isProdCert = false;
    if (heavyPdfGov.standard_certified === false) standardCertified = false;
    if (heavyPdfGov.pdfx_compliance_claimed === false) pdfxComplianceClaimed = false;
    if (heavyPdfGov.pdfa_compliance_claimed === false) pdfaComplianceClaimed = false;

    if (heavyPdfFatal || heavyPdfReviewRequired || heavyPdfGov.certified_pdf_allowed === false) {
        artifacts.forEach(a => {
            if (a.type === 'certified_pdf' || a.alias === 'certified_pdf') {
                a.production_certified = false;
                a.customer_visible = false;
                a.is_primary = false;
                a.artifact_role = 'REVIEW_REQUIRED';
            }
        });
    }

    // Build safe public heavy_pdf_probe_governance subset (no raw transcripts, paths, or object IDs)
    const safeHeavyPdfGov = {
        heavy_pdf_detected: heavyPdfGov.heavy_pdf_detected === true,
        file_size_bytes: heavyPdfGov.file_size_bytes || 0,
        file_size_mb: heavyPdfGov.file_size_mb || (heavyPdfGov.file_size_bytes ? Math.round((heavyPdfGov.file_size_bytes / (1024 * 1024)) * 100) / 100 : 0),
        page_count: heavyPdfGov.page_count || 0,
        probe_semantics_applied: heavyPdfGov.probe_semantics_applied === true,
        analysis_status: heavyPdfAnalysisStatus,
        analysis_degraded: heavyPdfGov.analysis_degraded === true,
        degraded_but_usable: heavyPdfGov.degraded_but_usable === true && !heavyPdfFatal,
        fatal_document_failure: heavyPdfFatal,
        strict_forensic_mode: strictForensicMode === true,
        review_required: heavyPdfFatal || heavyPdfReviewRequired,
        certifiable: heavyPdfGov.certifiable === true && !heavyPdfFatal,
        production_certified: false,
        standard_certified: false,
        pdfx_compliance_claimed: false,
        pdfa_compliance_claimed: false,
        compliance_claim_allowed: false,
        probe_summary: heavyPdfGov.probe_summary || {},
        tools: heavyPdfGov.tools || {},
        warnings: heavyPdfGov.warnings || [],
        review_required_reasons: heavyPdfGov.review_required_reasons || [],
        degraded_reasons: heavyPdfDegradedReasons
    };
    if (heavyPdfGov.evidence) {
        safeHeavyPdfGov.evidence = heavyPdfGov.evidence;
    }

    const primaryArtifact = selectPrimaryHumanArtifact({ ...job, review_required: isReviewReq, production_certified: isProdCert }, artifacts, artTrust);

    if (certLevel === "CERTIFIED_READY" && isProdCert && !isReviewReq && primaryArtifact?.artifact_role === 'PRODUCTION_READY') {
        outcome = "CERTIFIED_READY";
        severity = "success";
        summaryTitle = "PDF certified and ready for production";
        customerSummary = "Your PDF passed preflight and a certified production-ready file is available.";
        operatorSummary = "File is certified for immediate production routing.";
        if (colorGov && colorGov.detector_gap === true) {
            operatorSummary += " Color detection was incomplete for this fixture; no unsupported finding was inferred automatically.";
        }
        if (transGov && transGov.detector_gap === true) {
            operatorSummary += " Transparency/overprint detection was incomplete for this fixture; no unsupported finding was inferred automatically.";
        }
        if (iqGov && iqGov.detector_gap === true) {
            operatorSummary += " Image quality detection was incomplete for this fixture; no unsupported finding was inferred automatically.";
        }
        if (stdGov && stdGov.validator_gap === true) {
            operatorSummary += " Standards validation was incomplete for this fixture; no unsupported finding was inferred automatically.";
        }
        if (stdGov && stdGov.detector_gap === true) {
            operatorSummary += " Standards detection was incomplete for this fixture; no unsupported finding was inferred automatically.";
        }
        if (stdGov && stdGov.fixture_gap === true) {
            operatorSummary += " Standards fixture validation gap preserved.";
        }
        if (stdGov && stdGov.deferred === true) {
            operatorSummary += " Standards processing deferred.";
        }
        recommendedAction = {
            action_id: "use_certified",
            label: "Use Certified PDF",
            description: "Download the production-certified PDF for manufacturing.",
            severity: "success",
            primary_artifact_type: primaryArtifact?.type || null,
            primary_artifact_download_id: primaryArtifact?.download_id || primaryArtifact?.id || null,
            primary_artifact_filename: primaryArtifact?.filename || null,
            primary_artifact_available: !!primaryArtifact
        };
    } else if ((certLevel === "FIXED_REVIEW_REQUIRED" || certLevel === "REVIEW_REQUIRED") && isReviewReq) {
        outcome = certLevel;
        severity = "warning";
        summaryTitle = certLevel === "FIXED_REVIEW_REQUIRED" ? "PDF fixed, review required before production" : "PDF review required before production";
        customerSummary = certLevel === "FIXED_REVIEW_REQUIRED" ? "The PDF was corrected structurally, but it requires review before production." : "The PDF requires review before production.";
        
        let opDetails = [];
        
        const certPdf = artifacts.find(a => (a.type === 'certified_pdf' || a.alias === 'certified_pdf'));
        if (certPdf && (!certPdf.production_certified || !certPdf.customer_visible)) {
            opDetails.push("The artifact named certified.pdf exists, but the filename alone does not prove production certification or standards certification.");
        }

        const applied = appliedFixesRaw;
        const skipped = skippedFixesRaw;
        applied.forEach(f => opDetails.push(translateFixMessage(f, false, colorGov)));
        skipped.forEach(f => opDetails.push(translateFixMessage(f, true, colorGov)));
        
        if (artTrust.primary_artifact_type === 'review_pdf') {
            opDetails.push("The recommended artifact requires human/operator review before production.");
        }
        if (artTrust.primary_artifact_type === 'fixed_pdf') {
            opDetails.push("A corrected artifact exists, but this does not automatically imply production or standards certification.");
        }
        
        // Phase 51A: Add findings and review reasons to operator details
        const reasons = job.review_required_reasons || job.fix_audit?.review_required_reasons || [];
        if (reasons.includes('NON_EMBEDDED_FONTS')) opDetails.push("The PDF contains fonts that are not embedded. Output may vary across RIPs or production systems.");
        if (reasons.includes('TYPE3_FONTS')) opDetails.push("The PDF contains Type3 fonts, which can render unpredictably in print workflows and require review.");
        if (reasons.includes('MISSING_GLYPHS')) opDetails.push("Some characters may not render correctly because glyphs are missing. The source file or correct font may be required.");
        if (reasons.includes('FONT_SUBSTITUTION_RISK')) opDetails.push("Font substitution risk detected. Layout and glyph rendering may change.");
        
        const hasFontRisk = reasons.some(r => ['NON_EMBEDDED_FONTS', 'TYPE3_FONTS', 'MISSING_GLYPHS', 'FONT_SUBSTITUTION_RISK'].includes(r));
        if (hasFontRisk) {
            customerSummary = "The PDF uses fonts that may not be safely available for production. A human review is required.";
        }

        // Phase 52D Color Governance reasons
        const colorReasons = colorGov.review_required_color_reasons || [];
        if (colorReasons.includes('ICC_MISMATCH')) opDetails.push("The PDF contains ICC/profile inconsistencies. Color appearance may vary between devices or print workflows.");
        if (colorReasons.includes('MIXED_RGB_CMYK')) opDetails.push("The PDF contains mixed RGB and CMYK content. A human review is required before production.");
        if (colorReasons.includes('RGB_DEVICE_COLOR') || colorReasons.includes('RGB_IMAGES')) opDetails.push("The PDF contains RGB color content. Conversion to print CMYK may alter visual appearance.");
        if (colorReasons.includes('EXCESSIVE_TAC')) opDetails.push("The PDF may exceed total ink coverage limits. Automatic ink reduction was not applied.");
        if (colorReasons.includes('RICH_BLACK_TEXT')) opDetails.push("The PDF may contain rich black text. Automatic mapping to pure black was not applied.");
        if (colorReasons.includes('REGISTRATION_COLOR_MISUSE')) opDetails.push("The PDF may use registration color incorrectly. Automatic remapping was not applied.");

        if (hasColorRisk) {
            customerSummary = "The PDF contains color conditions that may affect print appearance. A human review is required before production.";
            if (colorGov.highest_color_risk === 'critical') {
                severity = 'critical';
            }
        }

        // Phase 53D Transparency/Overprint Governance reasons
        const findingsList = job.findings || job.analysis?.findings || [];
        if (transGov.transparency_present === true || findingsList.some(f => f.code === 'TRANSPARENCY_PRESENT')) opDetails.push("The PDF contains transparency. Transparency may render differently across print workflows and requires review.");
        if (transGov.soft_masks_present === true || findingsList.some(f => f.code === 'SOFT_MASK_PRESENT')) opDetails.push("The PDF contains soft masks. Soft masks can affect transparency rendering and require review.");
        if (transGov.blend_modes_present === true || findingsList.some(f => f.code === 'BLEND_MODE_PRESENT')) opDetails.push("The PDF uses blend modes. Blend modes may alter printed appearance and require review.");
        if (transGov.overprint_present === true || findingsList.some(f => f.code === 'OVERPRINT_PRESENT')) opDetails.push("The PDF contains overprint settings. Overprint behavior can significantly alter printed output and requires operator review.");
        if (findingsList.some(f => f.code === 'OVERPRINT_MODE_PRESENT')) opDetails.push("The PDF uses overprint mode settings. Review is required to ensure the intended print appearance.");
        if (findingsList.some(f => f.code === 'KNOCKOUT_GROUP_PRESENT')) opDetails.push("The PDF contains knockout groups. Knockout behavior may affect object interaction and requires review.");
        if (transGov.rasterization_risk === true || findingsList.some(f => f.code === 'RASTERIZATION_RISK')) opDetails.push("The PDF may require rasterization or flattening, which can alter visual appearance. Review is required.");
        
        if (transGov.visual_rewrite_fix_applied) {
             opDetails.push("Visual rewrite fix was applied. This can significantly alter appearance.");
        }

        if (pdfxComplianceClaimed === false && (skippedFailedCodes.includes('CONVERT_TO_PDFX_TRANSPARENCY_SAFE') || unsupportedFixes.includes('CONVERT_TO_PDFX_TRANSPARENCY_SAFE'))) {
            if (!skippedFailedCodes.includes('CONVERT_TO_PDFX_TRANSPARENCY_SAFE')) {
                opDetails.push("PDF/X transparency-safe conversion is not implemented or validated. PDF/X compliance was not claimed.");
            }
        }
        
        if (hasTransparencyRisk) {
            customerSummary = "The PDF contains transparency or overprint conditions that may affect print appearance. A human review is required before production.";
            if (transGov.highest_transparency_overprint_risk === 'critical') {
                severity = 'critical';
            }
        }

        // Phase 54D Image Quality Governance reasons
        const iqReasons = iqGov.review_required_reasons || [];
        if (iqGov.low_res_images_present || iqReasons.includes('LOW_RES_IMAGES') || findingsList.some(f => f.code === 'LOW_RES_IMAGES')) opDetails.push("The PDF contains low-resolution images. Print quality may be visibly degraded, and source images may be required.");
        if (iqGov.excessive_resolution_present || iqReasons.includes('EXCESSIVE_RESOLUTION') || findingsList.some(f => f.code === 'EXCESSIVE_RESOLUTION')) opDetails.push("The PDF contains images with excessive resolution. Downsampling was not applied automatically.");
        if (iqGov.jpeg_artifacts_present || iqReasons.includes('JPEG_ARTIFACTS') || findingsList.some(f => f.code === 'JPEG_ARTIFACTS')) opDetails.push("The PDF contains images with visible or suspected JPEG compression artifacts. Automatic artifact repair was not applied.");
        if (iqReasons.includes('IMAGE_COMPRESSION_RISK') || findingsList.some(f => f.code === 'IMAGE_COMPRESSION_RISK')) opDetails.push("The PDF contains image compression conditions that may affect print quality.");
        if (iqReasons.includes('IMAGE_DOWNSAMPLING_RISK') || findingsList.some(f => f.code === 'IMAGE_DOWNSAMPLING_RISK')) opDetails.push("The PDF may require image downsampling, which can remove visual detail and requires review.");
        if (iqReasons.includes('IMAGE_UPSCALING_RISK') || findingsList.some(f => f.code === 'IMAGE_UPSCALING_RISK')) opDetails.push("The PDF contains images that may require upscaling. Upscaling cannot restore true image detail and requires review.");
        if (iqGov.image_replacement_required || iqReasons.includes('IMAGE_REPLACEMENT_REQUIRED') || findingsList.some(f => f.code === 'IMAGE_REPLACEMENT_REQUIRED')) opDetails.push("The PDF may require replacement source images. Automatic image replacement was not performed.");
        if (iqGov.bitmap_text_risk || iqReasons.includes('BITMAP_TEXT_RISK') || findingsList.some(f => f.code === 'BITMAP_TEXT_RISK')) opDetails.push("The PDF appears to contain text rendered as bitmap imagery. This can reduce sharpness and requires review.");
        if (iqGov.rasterized_vector_risk || iqReasons.includes('RASTERIZED_VECTOR_RISK') || findingsList.some(f => f.code === 'RASTERIZED_VECTOR_RISK')) opDetails.push("The PDF appears to contain vector artwork rendered as raster imagery. Restoring vectors automatically is not supported.");
        if (iqReasons.includes('IMAGE_COLORSPACE_RISK') || findingsList.some(f => f.code === 'IMAGE_COLORSPACE_RISK')) opDetails.push("The PDF contains image color space risks. This must be reviewed together with color governance.");
        if (iqReasons.includes('IMAGE_ALPHA_RISK') || findingsList.some(f => f.code === 'IMAGE_ALPHA_RISK')) opDetails.push("The PDF contains image alpha/transparency conditions that may affect rendering and require review.");
        if (iqGov.image_object_damaged || iqReasons.includes('IMAGE_OBJECT_DAMAGED') || findingsList.some(f => f.code === 'IMAGE_OBJECT_DAMAGED')) opDetails.push("The PDF contains damaged or problematic image objects. Automatic repair was not performed.");

        if (iqGov.visual_image_rewrite_applied || iqGov.image_rewrite_performed) {
             opDetails.push("Visual image rewrite was applied. This can alter image appearance.");
        }

        if (hasImageQualityRisk) {
            customerSummary = "The PDF contains image quality conditions that may affect print appearance. A human review is required before production.";
            if (iqGov.highest_image_quality_risk === 'critical') {
                severity = 'critical';
            }
        }

        // Phase 55D Standards Governance reasons
        const stdReasons = stdGov.review_required_reasons || [];
        if (stdReasons.includes('PDFX_MISSING')) opDetails.push("The PDF does not declare a verified PDF/X standard. No PDF/X compliance was claimed.");
        if (stdReasons.includes('PDFX_INVALID')) opDetails.push("The PDF contains an invalid or conflicting PDF/X declaration. A standards validator is required before PDF/X compliance can be claimed.");
        if (stdReasons.includes('PDFX_CLAIMED_BUT_NOT_VALIDATED')) opDetails.push("The PDF appears to claim PDF/X compliance, but no real validator evidence is available. PDF/X compliance was not accepted.");
        if (stdReasons.includes('PDFX_METADATA_CONFLICT')) opDetails.push("The PDF contains conflicting PDF/X metadata. Standards compliance requires validation.");
        if (stdReasons.includes('PDFA_METADATA_CONFLICT')) opDetails.push("The PDF contains conflicting PDF/A metadata. PDF/A compliance was not accepted without validation.");
        if (stdReasons.includes('OUTPUTINTENT_PRESENT_NOT_PDFX')) opDetails.push("An OutputIntent is present, but OutputIntent presence alone does not prove PDF/X compliance.");
        if (stdReasons.includes('OUTPUTINTENT_MISSING_FOR_STANDARD')) opDetails.push("The PDF is missing a required OutputIntent for the declared standard.");
        if (stdReasons.includes('STANDARD_CLAIM_WITHOUT_VALIDATOR_EVIDENCE') || (artTrust.warnings && artTrust.warnings.includes('STANDARD_CLAIM_WITHOUT_VALIDATOR_EVIDENCE'))) opDetails.push("Standards certification was not accepted because required validator evidence is missing.");
        if (stdReasons.includes('OUTPUTINTENT_INVALID_FOR_STANDARD')) opDetails.push("The PDF contains an OutputIntent that is invalid or insufficient for the claimed standard.");
        if (stdReasons.includes('STANDARD_VALIDATOR_UNAVAILABLE')) opDetails.push("No standards validator was available. PDF/X or PDF/A compliance was not claimed.");
        if (stdReasons.includes('STANDARD_VALIDATION_FAILED')) opDetails.push("Standards validation failed. The PDF cannot be treated as standard-certified.");
        if (stdReasons.includes('STANDARD_VALIDATION_REQUIRED')) opDetails.push("A standards validator is required before compliance can be claimed.");
        if (stdReasons.includes('CERTIFIED_PDF_NOT_STANDARD_CERTIFIED')) opDetails.push("The generated certified.pdf artifact exists, but it is not standard-certified by PDF/X or PDF/A validation.");
        if (stdReasons.includes('PRODUCTION_CERTIFIED_WITHOUT_STANDARD_VALIDATION')) opDetails.push("A production certification claim was found without standards validation evidence. The claim was revoked or downgraded.");
        if (stdReasons.includes('STANDARD_CLAIM_WITHOUT_VALIDATOR_EVIDENCE')) opDetails.push("A standards compliance claim was present, but required validator evidence was missing. The claim was not accepted.");

        if (stdGov.validator_available === false) {
            opDetails.push("No standards validator was available.");
        }
        if (stdGov.outputintent_changed || stdGov.outputintent_does_not_prove_pdfx) {
            opDetails.push("An OutputIntent may be present or injected, but OutputIntent alone does not prove PDF/X compliance.");
        }

        if (hasStandardsRisk || stdGov.standard_certified === false || stdReasons.length > 0) {
            customerSummary = "The PDF has not been independently validated as PDF/X or PDF/A. A human review or standards validation is required before claiming standards compliance.";
        }

        if (stdGov && stdGov.validator_gap === true) {
            opDetails.push("Standards validation was incomplete for this fixture; no unsupported finding was inferred automatically.");
        }
        if (stdGov && stdGov.detector_gap === true) {
            opDetails.push("Standards detection was incomplete for this fixture; no unsupported finding was inferred automatically.");
        }
        if (stdGov && stdGov.fixture_gap === true) {
            opDetails.push("Standards fixture validation gap preserved.");
        }
        if (stdGov && stdGov.deferred === true) {
            opDetails.push("Standards processing deferred.");
        }

        if (colorGov && colorGov.detector_gap === true) {
            opDetails.push("Color detection was incomplete for this fixture; no unsupported finding was inferred automatically.");
        }

        if (transGov && transGov.detector_gap === true) {
            opDetails.push("Transparency/overprint detection was incomplete for this fixture; no unsupported finding was inferred automatically.");
        }

        if (iqGov && iqGov.detector_gap === true) {
            opDetails.push("Image quality detection was incomplete for this fixture; no unsupported finding was inferred automatically.");
        }

        // Include affected font names if evidence is in findings
        const affectedFonts = [];
        findingsList.forEach(finding => {
            if (['NON_EMBEDDED_FONTS', 'TYPE3_FONTS', 'MISSING_GLYPHS', 'FONT_SUBSTITUTION_RISK'].includes(finding.id || finding.code)) {
                if (finding.evidence && finding.evidence.font_name) {
                    affectedFonts.push(finding.evidence.font_name);
                }
            }
        });
        
        if (affectedFonts.length > 0) {
            const uniqueFonts = [...new Set(affectedFonts)];
            opDetails.push(`Affected fonts: ${uniqueFonts.join(', ')}.`);
        }
        
        operatorSummary = opDetails.length > 0 ? opDetails.join(" ") : "Review the fixed PDF and the technical change summary before releasing it.";
        
        recommendedAction = {
            action_id: "review_fixed",
            label: "Review Fixed PDF",
            description: "A fixed PDF is available, but human verification is required due to structural changes.",
            severity: "warning",
            primary_artifact_type: primaryArtifact?.type || null,
            primary_artifact_download_id: primaryArtifact?.download_id || primaryArtifact?.alias || primaryArtifact?.id || null,
            primary_artifact_filename: primaryArtifact?.filename || null,
            primary_artifact_available: !!primaryArtifact
        };
    } else if (certLevel === "FIXED_READY" && !isReviewReq && !isProdCert) {
        outcome = "FIXED_READY";
        severity = "info";
        summaryTitle = "PDF fixed and ready for operator use";
        customerSummary = "The PDF was corrected and no additional review requirement was flagged.";
        operatorSummary = "Fixed PDF available for standard routing. Not fully production-certified.";
        if (colorGov && colorGov.detector_gap === true) {
            operatorSummary += " Color detection was incomplete for this fixture; no unsupported finding was inferred automatically.";
        }
        if (transGov && transGov.detector_gap === true) {
            operatorSummary += " Transparency/overprint detection was incomplete for this fixture; no unsupported finding was inferred automatically.";
        }
        if (iqGov && iqGov.detector_gap === true) {
            operatorSummary += " Image quality detection was incomplete for this fixture; no unsupported finding was inferred automatically.";
        }
        if (stdGov && stdGov.validator_gap === true) {
            operatorSummary += " Standards validation was incomplete for this fixture; no unsupported finding was inferred automatically.";
        }
        if (stdGov && stdGov.detector_gap === true) {
            operatorSummary += " Standards detection was incomplete for this fixture; no unsupported finding was inferred automatically.";
        }
        if (stdGov && stdGov.fixture_gap === true) {
            operatorSummary += " Standards fixture validation gap preserved.";
        }
        if (stdGov && stdGov.deferred === true) {
            operatorSummary += " Standards processing deferred.";
        }
        recommendedAction = {
            action_id: "use_fixed",
            label: "Use Fixed PDF",
            description: "Download the fixed file.",
            severity: "info",
            primary_artifact_type: primaryArtifact?.type || null,
            primary_artifact_download_id: primaryArtifact?.download_id || primaryArtifact?.alias || primaryArtifact?.id || null,
            primary_artifact_filename: primaryArtifact?.filename || null,
            primary_artifact_available: !!primaryArtifact
        };
    } else if (certLevel === "ANALYSIS_ONLY") {
        outcome = "ANALYSIS_ONLY";
        severity = "info";
        summaryTitle = "PDF analyzed only";
        customerSummary = "The PDF was analyzed. No corrected production file was generated.";
        operatorSummary = "Analysis completed. Review the analysis report for findings.";
        recommendedAction = {
            action_id: "review_analysis",
            label: "Review Analysis Report",
            description: "View the diagnostic results.",
            severity: "info",
            primary_artifact_type: primaryArtifact?.type || null,
            primary_artifact_download_id: primaryArtifact?.download_id || primaryArtifact?.alias || primaryArtifact?.id || null,
            primary_artifact_filename: primaryArtifact?.filename || null,
            primary_artifact_available: !!primaryArtifact
        };
    } else if (certLevel === "BLOCKED" || job.status === "FAILED") {
        outcome = "BLOCKED";
        severity = "error";
        summaryTitle = "PDF blocked";
        customerSummary = "The PDF cannot be used for production in its current state.";
        operatorSummary = "Job is blocked. Critical failures or zero-byte artifacts detected.";
        recommendedAction = {
            action_id: "request_upload",
            label: "Request corrected file upload",
            description: "The file cannot be processed automatically. A new upload is required.",
            severity: "error",
            primary_artifact_type: null,
            primary_artifact_download_id: null,
            primary_artifact_filename: null,
            primary_artifact_available: false
        };
    } else if (['PROCESSING', 'PENDING', 'RUNNING'].includes(job.status)) {
        outcome = "PROCESSING";
        severity = "neutral";
        summaryTitle = "Preflight is still processing";
        customerSummary = "The PDF is still being checked or corrected.";
        operatorSummary = "Execution is still in progress upstream.";
        recommendedAction = {
            action_id: "wait",
            label: "Wait for completion",
            description: "Job is not yet in a terminal state.",
            severity: "neutral",
            primary_artifact_type: null,
            primary_artifact_download_id: null,
            primary_artifact_filename: null,
            primary_artifact_available: false
        };
    }

    // Process artifact recommendations for deduplication
    const groupedArtifacts = {};
    (artifacts || []).forEach(a => {
        const key = a.filename + '_' + a.size_bytes;
        if (!groupedArtifacts[key]) {
            groupedArtifacts[key] = { ...a, secondary_aliases: [] };
        } else {
            // Group the aliases
            if (a.alias && !groupedArtifacts[key].secondary_aliases.includes(a.alias)) {
                groupedArtifacts[key].secondary_aliases.push(a.alias);
            }
        }
    });

    const dedupedArtifacts = Object.values(groupedArtifacts).map((a) => {
        const isPrimary = primaryArtifact && (
            (primaryArtifact.id && primaryArtifact.id === a.id) ||
            (primaryArtifact.download_id && primaryArtifact.download_id === a.download_id) ||
            (primaryArtifact.filename === a.filename && primaryArtifact.size_bytes === a.size_bytes)
        );

        let warning = null;
        if (a.type === 'certified_pdf' && (!a.production_certified || !a.customer_visible)) {
            warning = "Not production-certified and should not be customer-visible.";
        }
        
        let customVisible = a.customer_visible === true;
        let prodCert = a.production_certified === true;
        let stdCert = a.standard_certified === true;
        
        // Phase 56D: override metadata visibility if artifactTrust conflicts
        if (artTrust && artTrust.customer_visible === false && (a.type === 'certified_pdf' || a.alias === 'certified_pdf')) {
            customVisible = false;
        }

        return {
            type: a.type || a.alias || 'OUTPUT',
            filename: a.filename || a.name || 'document.pdf',
            label: a.label || a.alias || a.type,
            downloadable: a.downloadable !== false && a.size_bytes > 0,
            production_certified: prodCert,
            standard_certified: stdCert,
            customer_visible: customVisible,
            artifact_role: a.artifact_role || 'INTERNAL',
            recommended_use: a.recommended_use || 'Internal review only.',
            is_primary: isPrimary,
            is_customer_safe: customVisible && prodCert,
            warning: warning,
            download_id: a.download_id || a.alias || a.id,
            secondary_aliases: a.secondary_aliases || []
        };
    });

    // Finalize report payload trust properties
    const safeTrust = { ...artTrust };
    if (safeTrust.evidence) {
        delete safeTrust.evidence.raw_command;
        delete safeTrust.evidence.internal_id;
        delete safeTrust.evidence.local_path;
        delete safeTrust.evidence.obj_;
    }

    // Governance
    let govSummary = { event_count: 0, source: 'UNAVAILABLE', compacted_count: 0 };
    try {
        const gov = await governanceLedgerService.getGovernanceLedger(jobId, context);
        if (gov && gov.events) {
            govSummary = {
                event_count: gov.events.length,
                source: 'LEDGER',
                compacted_count: gov.events.length
            };
        }
    } catch (err) {
        // Safe to ignore, we don't depend on it
    }



    // Phase 61D: Structural / Metadata Human Report wording
    if (structGov.metadata_cleanup_applied) {
        const msg = "The file metadata was cleaned to avoid unsupported certification claims. This does not mean the file has been independently validated as PDF/X or PDF/A.";
        customerSummary = customerSummary + " " + msg;
        operatorSummary = operatorSummary + " " + msg;
    }
    if (structGov.object_streams_normalized) {
        const msg = "The file structure was cleaned to improve compatibility. This does not change the visible artwork.";
        customerSummary = customerSummary + " " + msg;
        operatorSummary = operatorSummary + " " + msg;
    }
    if (structGov.internal_standard_report_generated) {
        const msg = "A standards review summary was generated for internal review. It is not an independent PDF/X or PDF/A validation certificate.";
        customerSummary = customerSummary + " " + msg;
        operatorSummary = operatorSummary + " " + msg;
    }

    // Phase 63D: Security / Interactive Object Human Report wording
    if (siGov.active_content_removed) {
        const customerMsg = "Potentially unsafe interactive content (such as embedded scripts, launch actions, or attached files) was removed from the PDF for security. This does not certify the file for production.";
        const operatorMsg = "Active/interactive content (JavaScript, launch actions, embedded files, or open actions) was removed for security. This is a security cleanup only and does not imply production certification or standards compliance.";
        customerSummary = customerSummary + " " + customerMsg;
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (siGov.annotations_flattened || siGov.forms_flattened) {
        const customerMsg = "Some interactive elements (annotations or form fields) were flattened into the page. This may change how the file looks and requires review before production.";
        const operatorMsg = "Annotations and/or form fields were flattened into the page content. This is a visual change — confirm appearance preservation before approving for production.";
        customerSummary = customerSummary + " " + customerMsg;
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (siGov.annotation_flatten_skipped || siGov.form_flatten_skipped || siGov.unresolved_interactive_content) {
        const customerMsg = "Some interactive content could not be safely simplified automatically and still requires review.";
        const operatorMsg = "Annotation/form flattening was skipped, or interactive content remains unresolved, because safe preservation of visual appearance could not be proven. Human review is required.";
        customerSummary = customerSummary + " " + customerMsg;
        operatorSummary = operatorSummary + " " + operatorMsg;
    }

    // Phase 64D: Ink / TAC / Black / Registration Color Human Report wording
    const inkReasons = (inkGov.review_required_reasons || []).map(r => String(r).toLowerCase());
    const inkReasonHas = (...needles) => needles.some(n => inkReasons.some(r => r.includes(n)));

    if (inkGov.ink_fix_applied === true || inkGov.review_required === true || inkGov.visual_change_expected === true) {
        const customerMsg = "Ink/color changes may affect appearance and require review.";
        customerSummary = customerSummary + " " + customerMsg;
    }
    if (inkGov.tac_reduction_attempted === true || inkGov.tac_reduction_applied === true || inkReasonHas('tac', 'total_ink')) {
        const operatorMsg = "Total Area Coverage (TAC/total ink) reduction was attempted on this file. Reducing total ink coverage changes how colors render and print and requires operator review before production.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (inkGov.rich_black_text_mapped === true || inkGov.black_text_normalized === true
        || inkGov.small_text_rich_black_detected === true || inkReasonHas('rich_black', 'black_text', 'small_text')) {
        const operatorMsg = "Rich black text or small text built from rich black was detected and/or mapped to single-channel (K-only) black. This changes how text renders and prints, especially at small sizes, and requires operator review before production.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (inkGov.registration_color_mapped === true || inkReasonHas('registration_color', 'registration_mark')) {
        const operatorMsg = "Registration color (100% all-channel black, intended for press marks only) was detected and/or mapped to standard black. Leaving registration color on body content causes severe overprinting and requires operator review before production.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (inkGov.ink_fix_applied === true || inkGov.visual_change_expected === true) {
        const operatorMsg = "Ink/color governance fixes were attempted on this file. These are visual, color-affecting changes — appearance must be confirmed before approving for production. This is not a standards or production certification.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }

    // Phase 65D: Selective Image Governance Human Report wording
    const selImgReasons = (selImgGov.review_required_reasons || []).map(r => String(r).toLowerCase());
    const selImgReasonHas = (...needles) => needles.some(n => selImgReasons.some(r => r.includes(n)));

    if (selImgGov.image_fix_applied === true || selImgGov.rgb_images_converted === true
        || selImgGov.image_profiles_normalized === true || selImgGov.excessive_resolution_downsampled === true
        || selImgGov.review_required === true || selImgGov.visual_change_expected === true
        || selImgReasonHas('rgb_to_cmyk', 'icc_profile', 'downsample', 'resolution')) {
        const customerMsg = "Some images were converted or normalized and require review.";
        customerSummary = customerSummary + " " + customerMsg;
        const operatorMsg = "Selective image governance fixes (RGB-to-CMYK conversion, ICC profile normalization, and/or downsampling of excessive resolution) were attempted on this file. These are visual, color-managed changes that affect image appearance and require operator review before production. This is not a standards or production certification.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (selImgGov.low_res_unfixable === true || selImgReasonHas('low_res', 'low-res')) {
        const customerMsg = "Low-resolution images could not be safely improved automatically.";
        customerSummary = customerSummary + " " + customerMsg;
        const operatorMsg = "Low-resolution images were detected and flagged honestly — they could not be safely upscaled or improved automatically. Upscaling cannot restore true image detail and the file requires operator review before production.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }

    // Phase 66D: Font Governance Human Report wording
    const fontReasons = (fontGov.review_required_reasons || []).map(r => String(r).toLowerCase());
    const fontReasonHas = (...needles) => needles.some(n => fontReasons.some(r => r.includes(n)));

    if (fontGov.font_embedding_skipped === true || fontGov.fonts_embedded === false
        || (fontGov.font_fix_applied === true && fontGov.font_source_available !== false)
        || fontReasonHas('embed', 'subset')) {
        const customerMsg = "Some fonts were not embedded.";
        customerSummary = customerSummary + " " + customerMsg;
        const operatorMsg = "Some fonts were not embedded or could only be partially subset-embedded. This can change how the file renders across systems and requires operator review before production.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (fontGov.font_source_available === false || fontReasonHas('font_source', 'source_unavailable')) {
        const customerMsg = "Font embedding could not be completed because font sources were unavailable.";
        customerSummary = customerSummary + " " + customerMsg;
        const operatorMsg = "Font embedding could not be completed because the original font sources were unavailable. The file was flagged honestly rather than producing a falsely certified result, and requires operator review before production.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (fontGov.type3_fonts_detected === true || fontReasonHas('type3', 'type_3')) {
        const customerMsg = "Type3 fonts require review.";
        customerSummary = customerSummary + " " + customerMsg;
        const operatorMsg = fontGov.type3_fonts_outlined === true
            ? "Type3 fonts were detected and outlined. Outlining changes how text is represented internally and requires operator review of appearance before production."
            : "Type3 fonts were detected. These fonts require special handling and operator review before production.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (fontGov.glyphs_missing_unfixable === true || fontReasonHas('missing_glyph', 'glyph')) {
        const operatorMsg = "Missing glyphs were detected and could not be safely repaired. The file was flagged honestly rather than inventing glyph data, and requires operator review before production.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (fontGov.font_encoding_repaired === true || fontReasonHas('encoding')) {
        const operatorMsg = "Font encoding issues were repaired. This is a structural, text-rendering-affecting change and requires operator review before production.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }

    // Phase 67D: Transparency/Overprint Physical Governance Human Report wording
    if (transPhysGov.transparency_flattened === true || transPhysGov.blend_modes_normalized === true
        || (transPhysGov.transparency_fix_applied === true && !transPhysGov.overprint_flattened)) {
        const customerMsg = "Transparency flattening may affect appearance and requires review.";
        customerSummary = customerSummary + " " + customerMsg;
        const operatorMsg = transPhysGov.blend_modes_normalized === true
            ? "Transparency was flattened and blend modes were normalized. Flattening can alter how colors and layers interact visually; human review of appearance is required before production."
            : "Transparency was flattened. Flattening merges transparent layers and can change how the file renders; human review of appearance is required before production.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (transPhysGov.overprint_flattened === true || transPhysGov.overprint_preview_simulated === true) {
        const customerMsg = "Overprint changes require visual verification.";
        customerSummary = customerSummary + " " + customerMsg;
        const operatorMsg = transPhysGov.overprint_preview_simulated === true
            ? "Overprint was flattened and an overprint preview was simulated. Overprint simulation changes how inks interact on press; the result must be visually verified before production."
            : "Overprint settings were flattened. Overprint changes affect how inks interact on press and can significantly alter printed output; human visual review is required before production.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }

    // Phase 68D: Standards Certificate Human Report wording
    if (hasFullValidatorEvidence && stdGov.validator_name && stdGov.validator_version) {
        if (pdfxComplianceClaimed) {
            customerSummary = customerSummary + " PDF/X validated.";
            operatorSummary = operatorSummary + ` PDF/X validation passed using ${stdGov.validator_name} ${stdGov.validator_version}.`;
        }
        if (pdfaComplianceClaimed) {
            customerSummary = customerSummary + " PDF/A validated.";
            operatorSummary = operatorSummary + ` PDF/A validation passed using ${stdGov.validator_name} ${stdGov.validator_version}.`;
        }
    }

    // Phase 69D: Visual Diff Human Report wording
    if (visualDiffGov.visual_change_detected === true) {
        const customerMsg = "Visual changes were detected in the corrected file. A human review of the visual result is required before production.";
        const operatorMsg = "Visual diff analysis detected changes between the original and corrected file. Review the rendered proof before approving for production.";
        customerSummary = customerSummary + " " + customerMsg;
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (visualDiffGov.visual_diff_required === true && !visualDiffGov.visual_diff_performed) {
        const operatorMsg = "Visual diff was required for this fix type but could not be performed. The file requires human review before production.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (visualDiffGov.render_tool_gap === true) {
        const operatorMsg = "Rendering tools were unavailable. Visual diff evidence could not be generated automatically.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }
    if (visualDiffGov.proof_artifacts_available === true && visualDiffGov.visual_diff_performed === true) {
        const operatorMsg = "Rendered proof artifacts are available for comparison.";
        operatorSummary = operatorSummary + " " + operatorMsg;
    }

    // Phase 62D: Page Marks Human Report wording
    if (pmGov.crop_marks_added === true) {
        operatorSummary = operatorSummary + " Crop marks were added outside the TrimBox. This changes production guidance and requires human review before production.";
        customerSummary = customerSummary + " Crop marks were added to help guide trimming. The file still requires review before production.";
    }
    if (pmGov.insufficient_margin === true) {
        operatorSummary = operatorSummary + " There was not enough margin outside the TrimBox to safely add crop marks.";
        customerSummary = customerSummary + " Crop marks could not be safely added because the page geometry did not provide enough space.";
    }
    if (pmGov.removal_not_safe === true && pmGov.registration_marks_removed !== true) {
        operatorSummary = operatorSummary + " Registration mark removal was skipped because safe removal could not be proven.";
        customerSummary = customerSummary + " Some marks could not be safely removed automatically. A human review is required.";
    }
    if (pmGov.registration_marks_removed === true) {
        operatorSummary = operatorSummary + " Registration marks were removed only where they were detected outside the TrimBox. Human review is required.";
        customerSummary = customerSummary + " Some marks could not be safely removed automatically. A human review is required.";
    }
    if (pmGov.marks_inside_trim === true) {
        operatorSummary = operatorSummary + " Marks were detected inside the TrimBox or near live artwork. Automatic removal was not performed.";
        customerSummary = customerSummary + " The file includes page mark conditions that may affect trimming or production setup. A human review is required.";
    }
    if (pmGov.unsafe_geometry_detected === true) {
        operatorSummary = operatorSummary + " Page mark geometry was unsafe or uncertain. The file requires review before production.";
        customerSummary = customerSummary + " The file includes page mark conditions that may affect trimming or production setup. A human review is required.";
    }
    if (pmGov.page_marks_normalized === true) {
        operatorSummary = operatorSummary + " Page mark normalization was evaluated. No production certification is implied.";
    }
    if (pmGov.review_required === true && !pmGov.crop_marks_added && !pmGov.insufficient_margin && !pmGov.marks_inside_trim && !pmGov.unsafe_geometry_detected) {
        customerSummary = customerSummary + " The file includes page mark conditions that may affect trimming or production setup. A human review is required.";
    }

    // Phase 62F-D: Heavy PDF Probe Governance Human Report wording
    if (heavyPdfGov.heavy_pdf_detected === true) {
        if (heavyPdfFatal) {
            const customerMsg = "The PDF could not be reliably inspected because a critical probe failed. Re-exporting or repairing the source PDF is recommended.";
            const operatorMsg = "The PDF could not be reliably inspected because a critical heavy-PDF probe failed. Re-exporting or repairing the source PDF is recommended before this job can proceed.";
            customerSummary = customerSummary + " " + customerMsg;
            operatorSummary = operatorSummary + " " + operatorMsg;
        } else if (heavyPdfGov.degraded_but_usable === true) {
            const operatorMsg = "Analysis completed, but some heavy-PDF probes returned warnings. The file requires review before production approval.";
            const customerMsg = "The file was uploaded and analyzed, but the analysis found technical warnings in the PDF structure. The file is not automatically approved for production. A review is required before this file can proceed.";
            customerSummary = customerSummary + " " + customerMsg;
            operatorSummary = operatorSummary + " " + operatorMsg;
        }

        const heavyPdfQpdfStatus = heavyPdfGov.tools?.qpdf?.semantic_status;
        if (heavyPdfQpdfStatus === 'WARNING_ONLY' || heavyPdfQpdfStatus === 'SUCCESS_WITH_WARNINGS') {
            operatorSummary = operatorSummary + " qpdf reported structural warnings, such as linearization or hint-table inconsistencies. These do not necessarily mean the file is unreadable, but they prevent automatic certification.";
        }

        const heavyPdfImagesStatus = heavyPdfGov.tools?.pdfimages?.semantic_status;
        if (heavyPdfImagesStatus === 'WARNING_ONLY' || heavyPdfImagesStatus === 'SUCCESS_WITH_WARNINGS') {
            operatorSummary = operatorSummary + " Image extraction reported warnings. The analysis continued, but image-related results should be reviewed.";
        }

        if (strictForensicMode === true) {
            operatorSummary = operatorSummary + " Strict forensic mode prevents automatic certification when probe warnings reduce analysis confidence.";
        }

        if (heavyPdfFatal) {
            customerSummary = customerSummary + " If requested, please re-export the PDF from the source application and upload it again.";
        } else if (heavyPdfReviewRequired && !customerSummary.includes("A review is required before this file can proceed")) {
            customerSummary = customerSummary + " The file is not automatically approved for production. A review is required before this file can proceed.";
        }
    }

    // Clean up extra spaces
    customerSummary = customerSummary.trim();
    operatorSummary = operatorSummary.trim();

    const artifact_ux = {
        primary: {},
        artifacts: [],
        customer_labels: [],
        operator_labels: [],
        forbidden_claims_removed: [],
        warnings: []
    };

    // Phase 62D: page marks artifact_ux warnings
    if (pmGov.crop_marks_added === true) {
        const w = "Crop marks were added and require review before production.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (pmGov.removal_not_safe === true) {
        const w = "Registration mark removal was skipped because safe removal could not be proven.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (pmGov.review_required === true) {
        const w = "Page mark conditions require human review before production.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }

    // Phase 63D: security/interactivity artifact_ux warnings
    if (siGov.active_content_removed === true) {
        const w = "Active/interactive content was removed for security and requires review.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (siGov.annotation_flatten_skipped === true || siGov.form_flatten_skipped === true || siGov.unresolved_interactive_content === true) {
        const w = "Annotation/form flattening was skipped because safe appearance preservation could not be proven.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (siGov.review_required === true) {
        const w = "Security/interactivity findings require human review before production.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }

    // Phase 65D: selective image governance artifact_ux warnings
    if (selImgGov.image_fix_applied === true || selImgGov.rgb_images_converted === true
        || selImgGov.image_profiles_normalized === true || selImgGov.excessive_resolution_downsampled === true) {
        const w = "Some images were converted or normalized and require review.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (selImgGov.low_res_unfixable === true) {
        const w = "Low-resolution images could not be safely improved automatically.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (selImgGov.review_required === true) {
        const w = "Selective image governance findings require human review before production.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }

    // Phase 66D: font governance artifact_ux warnings
    if (fontGov.font_embedding_skipped === true || fontGov.fonts_embedded === false || fontGov.font_fix_applied === true) {
        const w = "Some fonts were not embedded.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (fontGov.font_source_available === false) {
        const w = "Font embedding could not be completed because font sources were unavailable.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (fontGov.type3_fonts_detected === true) {
        const w = "Type3 fonts require review.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (fontGov.review_required === true) {
        const w = "Font governance findings require human review before production.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }

    // Phase 67D: transparency/overprint physical governance artifact_ux warnings
    if (transPhysGov.transparency_flattened === true || transPhysGov.blend_modes_normalized === true) {
        const w = "Transparency flattening may affect appearance and requires review.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (transPhysGov.overprint_flattened === true || transPhysGov.overprint_preview_simulated === true) {
        const w = "Overprint changes require visual verification.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (transPhysGov.review_required === true) {
        const w = "Transparency/overprint physical findings require human review before production.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }

    // Phase 69D: visual_diff_governance artifact_ux warnings
    if (visualDiffGov.visual_change_detected === true) {
        const w = "Visual changes detected — rendered proof review required before production.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (visualDiffGov.visual_diff_required === true && !visualDiffGov.visual_diff_performed) {
        const w = "Visual diff was required but not performed. Human review is required.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }
    if (visualDiffGov.render_tool_gap === true) {
        const w = "Rendering tools were unavailable. Visual proof could not be generated.";
        if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
    }

    // Phase 62F-D: heavy_pdf_probe_governance artifact_ux warnings
    if (heavyPdfGov.heavy_pdf_detected === true) {
        if (heavyPdfFatal) {
            const w = "The PDF could not be reliably inspected; re-exporting or repairing the source file is recommended.";
            if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
        } else {
            if (heavyPdfGov.degraded_but_usable === true) {
                const w = "Heavy PDF analysis completed with probe warnings and requires review.";
                if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
            }
            const heavyPdfQpdfStatus = heavyPdfGov.tools?.qpdf?.semantic_status;
            if (heavyPdfQpdfStatus === 'WARNING_ONLY' || heavyPdfQpdfStatus === 'SUCCESS_WITH_WARNINGS') {
                const w = "qpdf reported structural warnings that require review before certification.";
                if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
            }
            const heavyPdfImagesStatus = heavyPdfGov.tools?.pdfimages?.semantic_status;
            if (heavyPdfImagesStatus === 'WARNING_ONLY' || heavyPdfImagesStatus === 'SUCCESS_WITH_WARNINGS') {
                const w = "pdfimages reported warnings during image extraction that require review.";
                if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
            }
        }
        if (heavyPdfReviewRequired || heavyPdfFatal) {
            const w = "Heavy PDF probe warnings require human review before production.";
            if (!artifact_ux.warnings.includes(w)) artifact_ux.warnings.push(w);
        }
    }

    // Phase 68D: Build safe public standards_certification_governance subset (no raw paths)
    const safeStdCertGov = {
        validation_performed: stdGov.validation_performed === true,
        validation_passed: stdGov.validation_passed === true,
        standard_certified: hasFullValidatorEvidence && stdGov.standard_certified === true,
        compliance_claim_allowed: hasFullValidatorEvidence && stdGov.compliance_claim_allowed !== false,
        standard_detected: stdGov.standard_detected || null,
        validator_name: stdGov.validator_name || null,
        validator_version: stdGov.validator_version || null,
        validation_report_hash: stdGov.validation_report_hash || null,
        // validation_report_path intentionally omitted
        pdfx_compliance_claimed: pdfxComplianceClaimed,
        pdfa_compliance_claimed: pdfaComplianceClaimed,
        review_required_reasons: stdGov.review_required_reasons || []
    };

    // Phase 69D: Build safe public visual_diff_governance subset (no raw paths, no local file refs)
    const safeVisualDiffGov = {
        visual_diff_required: visualDiffGov.visual_diff_required === true,
        visual_diff_performed: visualDiffGov.visual_diff_performed === true,
        visual_change_detected: visualDiffGov.visual_change_detected === true,
        visual_review_required: visualDiffGov.visual_review_required === true
            || visualDiffGov.visual_change_detected === true
            || (visualDiffGov.visual_diff_required === true && !visualDiffGov.visual_diff_performed),
        render_tool_gap: visualDiffGov.render_tool_gap === true,
        max_changed_pixel_ratio: visualDiffGov.max_changed_pixel_ratio || 0,
        changed_pixel_ratio_avg: visualDiffGov.changed_pixel_ratio_avg || 0,
        pages_rendered: visualDiffGov.pages_rendered || 0,
        pages_compared: visualDiffGov.pages_compared || 0,
        dimensions_match: visualDiffGov.dimensions_match !== false ? (visualDiffGov.dimensions_match === true ? true : null) : false,
        render_tool: visualDiffGov.render_tool || null,
        render_tool_version: visualDiffGov.render_tool_version || null,
        proof_artifacts_available: visualDiffGov.proof_artifacts_available === true,
        // thumbnail_artifact_ids: safe references by ID only (no paths)
        thumbnail_artifact_ids: visualDiffGov.thumbnail_artifact_ids || [],
        diff_image_artifact_ids: visualDiffGov.diff_image_artifact_ids || [],
        production_certified: false,
        standard_certified: false,
        warnings: visualDiffGov.warnings || [],
        limitations: visualDiffGov.limitations || []
        // evidence.raw paths intentionally omitted; sanitized evidence attached via visualDiffGov.evidence
    };
    if (visualDiffGov.evidence) {
        safeVisualDiffGov.evidence = visualDiffGov.evidence;
    }

    dedupedArtifacts.forEach(a => {
        const cLabel = artifactUxLabelService.buildArtifactUxLabels({ artifact: a, artifact_trust: safeTrust, human_report: { structural_metadata_governance: structGov, page_marks_governance: pmGov, security_interactivity_governance: siGov, ink_governance: inkGov, selective_image_governance: selImgGov, font_governance: fontGov, transparency_overprint_physical_governance: transPhysGov, standards_certification_governance: safeStdCertGov, visual_diff_governance: safeVisualDiffGov, proof_approval_governance: safeProofApprGov, heavy_pdf_probe_governance: safeHeavyPdfGov }, audience: 'customer' });
        const oLabel = artifactUxLabelService.buildArtifactUxLabels({ artifact: a, artifact_trust: safeTrust, human_report: { structural_metadata_governance: structGov, page_marks_governance: pmGov, security_interactivity_governance: siGov, ink_governance: inkGov, selective_image_governance: selImgGov, font_governance: fontGov, transparency_overprint_physical_governance: transPhysGov, standards_certification_governance: safeStdCertGov, visual_diff_governance: safeVisualDiffGov, proof_approval_governance: safeProofApprGov, heavy_pdf_probe_governance: safeHeavyPdfGov }, audience: 'operator' });
        
        artifact_ux.customer_labels.push(cLabel);
        artifact_ux.operator_labels.push(oLabel);
        
        cLabel.forbidden_claims.forEach(c => {
            if (!artifact_ux.forbidden_claims_removed.includes(c)) artifact_ux.forbidden_claims_removed.push(c);
        });
        if (structGov.false_certification_revoked) {
             if (!artifact_ux.forbidden_claims_removed.includes("False standard claims")) artifact_ux.forbidden_claims_removed.push("False standard claims");
        }

        if (oLabel.warning && !artifact_ux.warnings.includes(oLabel.warning)) artifact_ux.warnings.push(oLabel.warning);
        if (cLabel.warning && !artifact_ux.warnings.includes(cLabel.warning)) artifact_ux.warnings.push(cLabel.warning);
        
        const combined = { ...a, ux: { customer: cLabel, operator: oLabel } };
        artifact_ux.artifacts.push(combined);
        if (a.is_primary) artifact_ux.primary = combined;
    });

    // Build safe public page_marks_governance subset (no raw internals)
    const safePmGov = {
        review_required: pmGov.review_required === true,
        production_certified: pmGov.production_certified !== false ? undefined : false,
        certified_pdf_allowed: pmGov.certified_pdf_allowed !== false ? undefined : false,
        page_marks_fix_applied: pmGov.page_marks_fix_applied === true,
        crop_marks_added: pmGov.crop_marks_added === true,
        registration_marks_removed: pmGov.registration_marks_removed === true,
        page_marks_normalized: pmGov.page_marks_normalized === true,
        unsafe_geometry_detected: pmGov.unsafe_geometry_detected === true,
        insufficient_margin: pmGov.insufficient_margin === true,
        marks_inside_trim: pmGov.marks_inside_trim === true,
        removal_not_safe: pmGov.removal_not_safe === true,
        visually_sensitive: pmGov.visually_sensitive === true,
        standard_certified: false,
        pdfx_compliance_claimed: false,
        pdfa_compliance_claimed: false,
        compliance_claim_allowed: false,
        review_required_reasons: pmGov.review_required_reasons || [],
        warnings: pmGov.warnings || []
        // evidence intentionally omitted from public payload
    };
    // Clean up undefined fields for cleanliness
    if (safePmGov.production_certified === undefined) delete safePmGov.production_certified;
    if (safePmGov.certified_pdf_allowed === undefined) delete safePmGov.certified_pdf_allowed;

    // Build safe public security_interactivity_governance subset (no raw internals)
    const safeSiGov = {
        review_required: siGov.review_required === true,
        production_certified: siGov.production_certified !== false ? undefined : false,
        certified_pdf_allowed: siGov.certified_pdf_allowed !== false ? undefined : false,
        security_interactivity_fix_applied: siGov.security_interactivity_fix_applied === true,
        active_content_removed: siGov.active_content_removed === true,
        javascript_removed: siGov.javascript_removed === true,
        launch_actions_removed: siGov.launch_actions_removed === true,
        embedded_files_removed: siGov.embedded_files_removed === true,
        document_open_actions_removed: siGov.document_open_actions_removed === true,
        page_open_actions_removed: siGov.page_open_actions_removed === true,
        annotations_flattened: siGov.annotations_flattened === true,
        annotation_flatten_skipped: siGov.annotation_flatten_skipped === true,
        forms_flattened: siGov.forms_flattened === true,
        form_flatten_skipped: siGov.form_flatten_skipped === true,
        unresolved_interactive_content: siGov.unresolved_interactive_content === true,
        visually_sensitive: siGov.visually_sensitive === true,
        security_sensitive: siGov.security_sensitive === true,
        standard_certified: false,
        pdfx_compliance_claimed: false,
        pdfa_compliance_claimed: false,
        compliance_claim_allowed: false,
        review_required_reasons: siGov.review_required_reasons || [],
        warnings: siGov.warnings || []
        // evidence intentionally omitted from public payload
    };
    if (safeSiGov.production_certified === undefined) delete safeSiGov.production_certified;
    if (safeSiGov.certified_pdf_allowed === undefined) delete safeSiGov.certified_pdf_allowed;

    // Build safe public ink_governance subset (no raw internals)
    const safeInkGov = {
        review_required: inkGov.review_required === true || inkGov.ink_fix_applied === true || inkGov.visual_change_expected === true,
        production_certified: inkGov.production_certified !== false ? undefined : false,
        certified_pdf_allowed: inkGov.certified_pdf_allowed !== false ? undefined : false,
        ink_fix_applied: inkGov.ink_fix_applied === true,
        tac_reduction_attempted: inkGov.tac_reduction_attempted === true,
        tac_reduction_applied: inkGov.tac_reduction_applied === true,
        rich_black_text_mapped: inkGov.rich_black_text_mapped === true,
        registration_color_mapped: inkGov.registration_color_mapped === true,
        black_text_normalized: inkGov.black_text_normalized === true,
        small_text_rich_black_detected: inkGov.small_text_rich_black_detected === true,
        visual_change_expected: inkGov.visual_change_expected === true,
        visually_sensitive: inkGov.visually_sensitive === true,
        standard_certified: false,
        pdfx_compliance_claimed: false,
        pdfa_compliance_claimed: false,
        compliance_claim_allowed: false,
        review_required_reasons: inkGov.review_required_reasons || [],
        warnings: inkGov.warnings || []
        // evidence intentionally omitted from public payload
    };
    if (safeInkGov.production_certified === undefined) delete safeInkGov.production_certified;
    if (safeInkGov.certified_pdf_allowed === undefined) delete safeInkGov.certified_pdf_allowed;

    // Build safe public selective_image_governance subset (no raw internals)
    const safeSelImgGov = {
        review_required: selImgGov.review_required === true || selImgGov.image_fix_applied === true || selImgGov.visual_change_expected === true,
        production_certified: selImgGov.production_certified !== false ? undefined : false,
        certified_pdf_allowed: selImgGov.certified_pdf_allowed !== false ? undefined : false,
        image_fix_applied: selImgGov.image_fix_applied === true,
        rgb_images_converted: selImgGov.rgb_images_converted === true,
        image_profiles_normalized: selImgGov.image_profiles_normalized === true,
        excessive_resolution_downsampled: selImgGov.excessive_resolution_downsampled === true,
        low_res_unfixable: selImgGov.low_res_unfixable === true,
        visual_change_expected: selImgGov.visual_change_expected === true,
        visually_sensitive: selImgGov.visually_sensitive === true,
        standard_certified: false,
        pdfx_compliance_claimed: false,
        pdfa_compliance_claimed: false,
        compliance_claim_allowed: false,
        review_required_reasons: selImgGov.review_required_reasons || [],
        warnings: selImgGov.warnings || []
        // evidence intentionally omitted from public payload
    };
    if (safeSelImgGov.production_certified === undefined) delete safeSelImgGov.production_certified;
    if (safeSelImgGov.certified_pdf_allowed === undefined) delete safeSelImgGov.certified_pdf_allowed;

    // Build safe public font_governance subset (no raw internals)
    const safeFontGov = {
        review_required: fontGov.review_required === true || fontGov.font_fix_applied === true
            || fontGov.font_embedding_skipped === true || fontGov.type3_fonts_detected === true
            || fontGov.glyphs_missing_unfixable === true || fontGov.font_source_available === false
            || fontGov.visual_change_expected === true,
        production_certified: fontGov.production_certified !== false ? undefined : false,
        certified_pdf_allowed: fontGov.certified_pdf_allowed !== false ? undefined : false,
        font_fix_applied: fontGov.font_fix_applied === true,
        fonts_embedded: fontGov.fonts_embedded === true,
        font_embedding_skipped: fontGov.font_embedding_skipped === true,
        type3_fonts_detected: fontGov.type3_fonts_detected === true,
        type3_fonts_outlined: fontGov.type3_fonts_outlined === true,
        glyphs_missing_unfixable: fontGov.glyphs_missing_unfixable === true,
        font_encoding_repaired: fontGov.font_encoding_repaired === true,
        font_source_available: fontGov.font_source_available === false ? false : undefined,
        visual_change_expected: fontGov.visual_change_expected === true,
        visually_sensitive: fontGov.visually_sensitive === true,
        standard_certified: false,
        pdfx_compliance_claimed: false,
        pdfa_compliance_claimed: false,
        compliance_claim_allowed: false,
        review_required_reasons: fontGov.review_required_reasons || [],
        warnings: fontGov.warnings || []
        // evidence intentionally omitted from public payload
    };
    if (safeFontGov.production_certified === undefined) delete safeFontGov.production_certified;
    if (safeFontGov.certified_pdf_allowed === undefined) delete safeFontGov.certified_pdf_allowed;
    if (safeFontGov.font_source_available === undefined) delete safeFontGov.font_source_available;

    // Build safe public transparency_overprint_physical_governance subset (no raw internals)
    const safeTransPhysGov = {
        review_required: transPhysGov.review_required === true || transPhysGov.transparency_flattened === true
            || transPhysGov.overprint_flattened === true || transPhysGov.blend_modes_normalized === true
            || transPhysGov.overprint_preview_simulated === true || transPhysGov.visual_change_expected === true
            || transPhysGov.transparency_fix_applied === true,
        production_certified: transPhysGov.production_certified !== false ? undefined : false,
        certified_pdf_allowed: transPhysGov.certified_pdf_allowed !== false ? undefined : false,
        transparency_fix_applied: transPhysGov.transparency_fix_applied === true,
        transparency_flattened: transPhysGov.transparency_flattened === true,
        blend_modes_normalized: transPhysGov.blend_modes_normalized === true,
        overprint_flattened: transPhysGov.overprint_flattened === true,
        overprint_preview_simulated: transPhysGov.overprint_preview_simulated === true,
        visual_change_expected: transPhysGov.visual_change_expected === true,
        rendering_safety_proven: transPhysGov.rendering_safety_proven === false ? false : undefined,
        visually_sensitive: transPhysGov.visually_sensitive === true,
        standard_certified: false,
        pdfx_compliance_claimed: false,
        pdfa_compliance_claimed: false,
        compliance_claim_allowed: false,
        review_required_reasons: transPhysGov.review_required_reasons || [],
        warnings: transPhysGov.warnings || []
        // evidence intentionally omitted from public payload
    };
    if (safeTransPhysGov.production_certified === undefined) delete safeTransPhysGov.production_certified;
    if (safeTransPhysGov.certified_pdf_allowed === undefined) delete safeTransPhysGov.certified_pdf_allowed;
    if (safeTransPhysGov.rendering_safety_proven === undefined) delete safeTransPhysGov.rendering_safety_proven;

    const reportPayload = {
        outcome,
        severity,
        summary_title: summaryTitle,
        customer_summary: customerSummary,
        operator_summary: operatorSummary,
        pdfx_compliance_claimed: pdfxComplianceClaimed,
        pdfa_compliance_claimed: pdfaComplianceClaimed,
        standard_claimed: standardClaimed,
        standard_certified: standardCertified,
        validation_performed: stdGov.validation_performed === true,
        validation_passed: stdGov.validation_passed === true,
        validator_name: stdGov.validator_name || null,
        validator_version: stdGov.validator_version || null,
        pdfx_generation_performed: pdfxGenerationPerformed,
        technical_summary: job.summary || job.analysis?.summary || '',
        recommended_next_action: recommendedAction,
        artifact_recommendations: dedupedArtifacts,
        artifact_ux: artifact_ux,
        fix_summary: {
            requested_count: fixSummaryObj.requested_count || job.requested_fixes?.length || 0,
            applied_count: fixSummaryObj.applied_count || appliedFixesRaw.length || 0,
            skipped_count: fixSummaryObj.skipped_count || skippedFixesRaw.length || 0,
            failed_count: fixSummaryObj.failed_count || failedFixesRaw.length || 0,
            applied_fixes: appliedFixesRaw.map(f => translateFixMessage(f, false, colorGov)),
            skipped_fixes: skippedFixesRaw.map(f => translateFixMessage(f, true, colorGov)),
            failed_fixes: failedFixesRaw.map(f => {
                if (String(f.code || f).includes('EMBED_FONTS')) return "Font embedding failed or could not be completed. The source file or correct font files may be required.";
                return f.code || f;
            }),
            review_required: isReviewReq,
            production_certified: isProdCert,
            highest_risk_level: job.risk_level || 'UNKNOWN'
        },
        findings_summary: {
            critical: job.issue_count || 0,
            warning: 0,
            info: 0,
            review_required: isReviewReq
        },
        artifact_trust: safeTrust,
        structural_metadata_governance: structGov,
        page_marks_governance: safePmGov,
        security_interactivity_governance: safeSiGov,
        ink_governance: safeInkGov,
        selective_image_governance: safeSelImgGov,
        font_governance: safeFontGov,
        transparency_overprint_physical_governance: safeTransPhysGov,
        standards_certification_governance: safeStdCertGov,
        visual_diff_governance: safeVisualDiffGov,
        proof_approval_governance: safeProofApprGov,
        heavy_pdf_probe_governance: safeHeavyPdfGov,
        governance_summary: govSummary,
        copy_blocks: {
            customer: customerSummary,
            operator: operatorSummary
        }
    };

    const review_decision = job.review_decision || null; 
    // Use job ID as fallback for snapshot ID in this local emulation if necessary, 
    // but ideally humanReportSnapshotService provides it.
    const snapshot_id = job.human_report_snapshot_id || job.snapshot_id || null;

    reportPayload.review_decision_ux = {
        operator: buildReviewDecisionUx({ 
            human_report: reportPayload, 
            artifact_trust: safeTrust, 
            artifact_ux, 
            readiness: null, 
            review_decision, 
            audience: 'operator', 
            snapshot_id 
        }),
        customer: buildReviewDecisionUx({ 
            human_report: reportPayload, 
            artifact_trust: safeTrust, 
            artifact_ux, 
            readiness: null, 
            review_decision, 
            audience: 'customer', 
            snapshot_id 
        })
    };

    // Phase 70D: Proof Approval UX
    reportPayload.proof_approval_ux = {
        operator: buildProofApprovalUx({
            proof_approval_governance: proofApprGov,
            visual_diff_governance: visualDiffGov,
            audience: 'operator'
        }),
        customer: buildProofApprovalUx({
            proof_approval_governance: proofApprGov,
            visual_diff_governance: visualDiffGov,
            audience: 'customer'
        })
    };

    // Phase 59: Remediation UX
    let order = null;
    let readiness = null;
    let customer_action = null;

    const orderId = job.metadata?.orderId || job.orderId || null;

    if (orderId) {
        try {
            const marketplaceOrderService = require('./marketplaceOrderService');
            const marketplaceCustomerActionService = require('./marketplaceCustomerActionService');
            // We use simple gets. Avoid throwing if order doesn't exist
            const orderRes = await marketplaceOrderService.getOrder(orderId).catch(e => null);
            if (orderRes) {
                order = orderRes;
                try {
                    const readyRes = await marketplaceOrderService.computeReadiness(orderId);
                    readiness = { blockers: readyRes.blockers, warnings: readyRes.warnings };
                } catch (e) {
                    // Ignore
                }
                try {
                    const actionRes = await marketplaceCustomerActionService.getCustomerAction(orderId);
                    if (actionRes && actionRes.customerAction) {
                        customer_action = actionRes.customerAction;
                        customer_action.expired = actionRes.expired;
                    }
                } catch (e) {
                    // Ignore
                }
            }
        } catch (e) {
            // Ignore if order mapping fails or is mocked
        }
    }

    console.log("==> review_decision in HR service: ", review_decision);
    reportPayload.remediation_ux = {
        operator: buildCustomerRemediationUx({
            order,
            readiness,
            review_decision,
            review_decision_ux: reportPayload.review_decision_ux.operator,
            human_report: reportPayload,
            artifact_trust: safeTrust,
            artifact_ux,
            customer_action,
            files: dedupedArtifacts,
            audience: 'operator'
        }),
        customer: buildCustomerRemediationUx({
            order,
            readiness,
            review_decision,
            review_decision_ux: reportPayload.review_decision_ux.customer,
            human_report: reportPayload,
            artifact_trust: safeTrust,
            artifact_ux,
            customer_action,
            files: dedupedArtifacts,
            audience: 'customer'
        })
    };

    return {
        ok: true,
        job_id: jobId,
        generated_at: new Date().toISOString(),
        source_status: sourceStatus,
        report: reportPayload
    };
}

module.exports = {
    getHumanReport,
    selectPrimaryHumanArtifact
};
