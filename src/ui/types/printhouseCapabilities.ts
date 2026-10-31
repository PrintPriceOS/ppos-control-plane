/**
 * src/ui/types/printhouseCapabilities.ts
 * 
 * TypeScript definitions for Phase 76 Printhouse Capability Onboarding.
 */

export interface Printhouse {
    id: string;
    tenant_id: string;
    name: string;
    legal_name?: string;
    country?: string;
    region?: string;
    city?: string;
    contact_email?: string;
    contact_phone?: string;
    status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED';
    onboarding_status: 'NOT_STARTED' | 'PROFILE_INCOMPLETE' | 'READY_FOR_PILOT';
    default_currency: string;
    timezone: string;
    created_at?: string;
    updated_at?: string;
    // Client-side stats calculated from children
    machine_count?: number;
    media_count?: number;
    policy_profile_count?: number;
    sla_profile_count?: number;
}

export interface Machine {
    id: string;
    printhouse_id: string;
    tenant_id: string;
    machine_name: string;
    machine_type: 'OFFSET' | 'DIGITAL' | 'FLEXO' | 'SCREEN' | 'ROTARY' | 'OTHER';
    manufacturer?: string;
    model?: string;
    status: 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE';
    max_sheet_width_mm?: number;
    max_sheet_height_mm?: number;
    min_sheet_width_mm?: number;
    min_sheet_height_mm?: number;
    max_print_width_mm?: number;
    max_print_height_mm?: number;
    supported_color_modes_json?: string[] | string;
    supported_print_methods_json?: string[] | string;
    supported_sides_json?: string[] | string;
    max_pages_per_job?: number;
    max_file_size_mb?: number;
    max_tac_percent?: number;
    supports_pdfx?: boolean;
    supports_pdfa?: boolean;
    supports_variable_data?: boolean;
    supports_white_ink?: boolean;
    supports_spot_uv?: boolean;
    supports_lamination?: boolean;
    supports_hardcover?: boolean;
    supports_softcover?: boolean;
    supports_saddle_stitch?: boolean;
    supports_perfect_binding?: boolean;
    supports_case_binding?: boolean;
    metadata_json?: any;
    created_at?: string;
    updated_at?: string;
}

export interface Media {
    id: string;
    printhouse_id: string;
    tenant_id: string;
    media_name: string;
    media_type: string;
    gsm?: number;
    thickness_microns?: number;
    finish?: string;
    color?: string;
    sheet_width_mm?: number;
    sheet_height_mm?: number;
    roll_width_mm?: number;
    grain_direction?: 'LONG' | 'SHORT' | 'NONE';
    fsc_available?: boolean;
    pefc_available?: boolean;
    recycled_content_percent?: number;
    status: 'ACTIVE' | 'INACTIVE';
    compatible_machine_ids_json?: string[] | string;
    metadata_json?: any;
    created_at?: string;
    updated_at?: string;
}

export interface PolicyProfile {
    id: string;
    printhouse_id: string;
    tenant_id: string;
    profile_name: string;
    profile_type: string;
    required_pdf_standard: 'NONE' | 'PDF/X-1a' | 'PDF/X-3' | 'PDF/X-4' | 'PDF/A-1a' | 'PDF/A-2b';
    allow_degraded_analysis?: boolean;
    require_artifact_trust_production_certified?: boolean;
    require_visual_proof_approval?: boolean;
    require_human_review_for_page_marks?: boolean;
    require_human_review_for_ink_changes?: boolean;
    require_human_review_for_font_changes?: boolean;
    require_human_review_for_transparency?: boolean;
    max_tac_percent?: number;
    min_bleed_mm?: number;
    allow_rgb?: boolean;
    allow_spot_colors?: boolean;
    allow_transparency?: boolean;
    allow_overprint?: boolean;
    allow_annotations?: boolean;
    allow_forms?: boolean;
    allow_javascript?: boolean;
    allow_embedded_files?: boolean;
    required_output_intent?: string;
    accepted_trim_box_policy?: string;
    metadata_json?: any;
    created_at?: string;
    updated_at?: string;
}

export interface SlaProfile {
    id: string;
    printhouse_id: string;
    tenant_id: string;
    profile_name: string;
    production_days_min?: number;
    production_days_max?: number;
    cutoff_time_local?: string;
    weekend_production?: boolean;
    holiday_calendar_region?: string;
    rush_available?: boolean;
    rush_surcharge_percent?: number;
    max_daily_jobs?: number;
    max_daily_pages?: number;
    metadata_json?: any;
    created_at?: string;
    updated_at?: string;
}

export interface ReadinessEvaluation {
    printhouse_id: string;
    onboarding_status: 'NOT_STARTED' | 'PROFILE_INCOMPLETE' | 'READY_FOR_PILOT';
    ready_for_pilot: boolean;
    missing_sections: string[];
    warnings: string[];
    blocking_reasons: string[];
    capability_summary: {
        machines: number;
        media: number;
        policy_profiles: number;
        sla_profiles: number;
    };
}

export interface CapabilityAuditLog {
    id: number;
    printhouse_id: string;
    tenant_id: string;
    event_type: string;
    actor_user_id: string;
    actor_role: string;
    before_json?: string;
    after_json?: string;
    created_at: string;
}
