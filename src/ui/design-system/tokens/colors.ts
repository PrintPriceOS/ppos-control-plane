/**
 * Canonical Design System Tokens — Colors
 * Maintains PrintPrice OS industrial identity: dark industrial zinc, operational red, pure monolith look.
 * Governs strict light/dark mode isolation to prevent mixed behaviors.
 */

export const COLORS = {
  // Base background and surface colors
  background: "#09090b", // pure industrial zinc-950
  surface: "#18181b", // pure industrial zinc-900
  surfaceMuted: "#27272a", // pure industrial zinc-800
  primary: "#dc0000",
  primaryHover: "#b90000",
  text: "#f4f4f5", // zinc-100
  textMuted: "#a1a1aa", // zinc-400
  border: "#27272a", // zinc-800

  // Centralized adaptive token classes for pure light/dark mode governance
  adaptive: {
    // Backgrounds
    background: "bg-[#fafafa] dark:bg-[#0e0e0f]",
    surface: "bg-white dark:bg-[#18181b]",
    surfaceElevated: "bg-white dark:bg-[#202024]",
    surfaceMuted: "bg-zinc-50 dark:bg-zinc-900/80",

    // Text
    textPrimary: "text-zinc-900 dark:text-zinc-100",
    textSecondary: "text-zinc-600 dark:text-zinc-400",
    textMuted: "text-zinc-400 dark:text-zinc-500",

    // Borders
    borderPrimary: "border-zinc-200 dark:border-zinc-800",
    borderSubtle: "border-zinc-100 dark:border-zinc-800/60",
    borderElevated: "border-zinc-200 dark:border-zinc-700",

    // Interactive/Hover lifts
    hoverLift: "hover:-translate-y-0.5 transition-transform duration-150",
    hoverSurface: "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors",
  },

  drawers: {
    overlay: "bg-black/60 backdrop-blur-sm",
    panel: "bg-white dark:bg-[#18181b] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl",
    header: "px-6 py-6 sm:px-8 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b]",
    body: "px-6 py-8 sm:px-8 bg-white dark:bg-[#18181b]",
    footer: "px-6 py-4 sm:px-8 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60",
    closeBtn: "p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer",
  },

  cards: {
    base: "bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 rounded-2xl shadow-2xs transition-all",
    elevated: "bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 rounded-2xl shadow-xs transition-all",
  },

  icons: {
    containerDark: "bg-zinc-800 text-zinc-200 rounded-xl",
    containerLight: "bg-zinc-100 text-zinc-900 rounded-xl",
    containerAdaptive: "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 rounded-xl",
  },

  tables: {
    headerText: "#a1a1aa",
    cellText: "#f4f4f5",
    border: "#27272a",
    zebraOdd: "#09090b",
    zebraEven: "#18181b",
    hover: "#27272a",
  },

  badges: {
    completed: { bg: "rgba(16, 185, 129, 0.1)", text: "#10B981", border: "rgba(16, 185, 129, 0.2)" },
    inProgress: { bg: "rgba(59, 130, 246, 0.1)", text: "#3B82F6", border: "rgba(59, 130, 246, 0.2)" },
    queued: { bg: "rgba(139, 92, 246, 0.1)", text: "#8B5CF6", border: "rgba(139, 92, 246, 0.2)" },
    failed: { bg: "rgba(239, 68, 68, 0.1)", text: "#EF4444", border: "rgba(239, 68, 68, 0.2)" },
    offline: { bg: "rgba(107, 114, 128, 0.1)", text: "#9CA3AF", border: "rgba(107, 114, 128, 0.2)" },
    degraded: { bg: "rgba(245, 158, 11, 0.1)", text: "#F59E0B", border: "rgba(245, 158, 11, 0.2)" },
    active: { bg: "rgba(16, 185, 129, 0.1)", text: "#10B981", border: "rgba(16, 185, 129, 0.2)" },
    pending: { bg: "rgba(245, 158, 11, 0.1)", text: "#F59E0B", border: "rgba(245, 158, 11, 0.2)" },
  }
} as const;
