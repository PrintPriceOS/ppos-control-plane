/**
 * Canonical Design System Tokens — Tables
 * Enforces unified premium industrial tables.
 */

export const TABLES = {
  header: {
    fontFamily: "'Manrope', sans-serif",
    fontSize: "13px",
    fontWeight: "600",
    letterSpacing: "0.4px",
    textTransform: "uppercase",
    color: "#8F96A3",
    className: "font-manrope text-[13px] font-semibold tracking-[0.4px] uppercase text-[#8F96A3] px-4 py-3 text-left border-b border-[#1F2430]",
  },
  cell: {
    fontFamily: "'Manrope', sans-serif",
    fontSize: "13px",
    fontWeight: "400",
    lineHeight: "18px",
    color: "#E6E6EB",
    className: "font-manrope text-[13px] font-normal leading-[18px] text-[#E6E6EB] px-4 py-3 border-b border-[#1F2430]",
  },
  row: {
    minHeight: "48px",
    className: "min-h-[48px] odd:bg-[#0F1319] even:bg-[#0B0F14] hover:bg-[#11161D] transition-colors border-b border-[#1F2430]",
  },
  wrapperClassName: "w-full overflow-x-auto border border-[#1F2430] bg-[#0B0F14]",
  alignment: {
    left: "text-left",
    right: "text-right",
    center: "text-center",
  }
} as const;
