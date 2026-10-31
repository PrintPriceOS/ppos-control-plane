const gateway = require('./preflightContractGateway');
const preflightServiceClient = require('./preflightServiceClient');
const db = require('./mysqlClient');
const governanceLedgerService = require('./preflightGovernanceLedgerService');

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
    if (code.includes('STRIP_JAVASCRIPT')) return "Interactive JavaScript was removed.";
    if (code.includes('FLATTEN_ANNOTATIONS')) return "Annotations or annotation references were flattened/removed for print safety.";
    if (code.includes('FLATTEN_FORMS')) return "Interactive form fields were flattened or removed for print safety.";
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
    if (code.includes('GENERATE_STANDARD_VALIDATION_REPORT')) return "A standards validation report was not generated because no validator evidence was available.";

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

    console.log('hasColorRisk:', hasColorRisk, 'hasTransRisk:', hasTransparencyRisk, 'hasImageRisk:', hasImageQualityRisk, 'hasStdRisk:', hasStandardsRisk, 'hasFullVal:', hasFullValidatorEvidence, 'stdGov:', stdGov); const reportPayload = {
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
        governance_summary: govSummary,
        copy_blocks: {
            customer: customerSummary,
            operator: operatorSummary
        }
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
