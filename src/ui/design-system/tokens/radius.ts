/**
 * Canonical Design System Tokens — Radius
 * Aligned with PrintPrice OS Guided Onboarding visual reference.
 * Replaces harsh 0px guillotine cuts with modern, accessible rounded surfaces.
 */

export const RADIUS = {
  none: "0px",
  xs: "0.25rem",   // 4px
  sm: "0.375rem",  // 6px
  md: "0.5rem",    // 8px
  lg: "0.75rem",   // 12px
  xl: "0.75rem",   // 12px (form controls, inputs, action buttons)
  "2xl": "1rem",   // 16px (primary cards, panels, modals)
  "3xl": "1.5rem", // 24px (hero cards, preview tiles)
  full: "9999px",  // pills, status indicators
} as const;
