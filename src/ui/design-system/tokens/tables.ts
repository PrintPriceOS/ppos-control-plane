/**
 * Canonical Design System Tokens — Tables
 * Enforces unified premium industrial tables across light and dark modes.
 */

export const TABLES = {
  header: {
    fontFamily: "'Manrope', sans-serif",
    fontSize: "13px",
    fontWeight: "600",
    letterSpacing: "0.4px",
    textTransform: "uppercase",
    color: "#a1a1aa", // zinc-400
    className: "font-manrope text-[13px] font-semibold tracking-[0.4px] uppercase text-zinc-600 dark:text-zinc-400 px-4 py-3 text-left border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900",
  },
  cell: {
    fontFamily: "'Manrope', sans-serif",
    fontSize: "13px",
    fontWeight: "400",
    lineHeight: "18px",
    color: "#f4f4f5",
    className: "font-manrope text-[13px] font-normal leading-[18px] text-zinc-900 dark:text-zinc-100 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800",
  },
  row: {
    minHeight: "48px",
    className: "min-h-[48px] bg-white dark:bg-zinc-950 even:bg-zinc-50 dark:even:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors border-b border-zinc-200 dark:border-zinc-800",
  },
  wrapperClassName: "w-full overflow-x-auto border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950",
  alignment: {
    left: "text-left",
    right: "text-right",
    center: "text-center",
  }
} as const;
