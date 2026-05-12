/**
 * Canonical Design System Tokens — Colors
 * Maintains PrintPrice OS industrial identity: dark industrial, operational red, pure monolith look.
 */

export const COLORS = {
  background: "#0e0e0f",
  surface: "#131314",
  surfaceMuted: "#1a1a1b",
  primary: "#dc0000",
  primaryHover: "#b90000",
  text: "#E6E6EB",
  textMuted: "#8F96A3",
  border: "#1F2430",
  tables: {
    headerText: "#8F96A3",
    cellText: "#E6E6EB",
    border: "#1F2430",
    zebraOdd: "#0F1319",
    zebraEven: "#0B0F14",
    hover: "#11161D",
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
