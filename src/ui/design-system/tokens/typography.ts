/**
 * Canonical Design System Tokens — Typography
 * Strict constraint: Only Manrope (Primary) and Inter (Secondary) allowed.
 */

export const TYPOGRAPHY = {
  fonts: {
    primary: "'Manrope', sans-serif",
    secondary: "'Inter', sans-serif",
  },
  scale: {
    h1: {
      fontSize: "28px",
      fontWeight: "700",
      fontFamily: "'Manrope', sans-serif",
      className: "text-[28px] font-bold font-manrope",
    },
    h2: {
      fontSize: "22px",
      fontWeight: "600",
      fontFamily: "'Manrope', sans-serif",
      className: "text-[22px] font-semibold font-manrope",
    },
    h3: {
      fontSize: "18px",
      fontWeight: "600",
      fontFamily: "'Manrope', sans-serif",
      className: "text-[18px] font-semibold font-manrope",
    },
    subtitle: {
      fontSize: "15px",
      fontWeight: "500",
      fontFamily: "'Manrope', sans-serif",
      className: "text-[15px] font-medium font-manrope",
    },
    body: {
      fontSize: "14px",
      fontWeight: "400",
      fontFamily: "'Manrope', sans-serif",
      className: "text-[14px] font-normal font-manrope",
    },
    small: {
      fontSize: "12px",
      fontWeight: "400",
      fontFamily: "'Manrope', sans-serif",
      className: "text-[12px] font-normal font-manrope",
    },
    caption: {
      fontSize: "11px",
      fontWeight: "400",
      fontFamily: "'Manrope', sans-serif",
      className: "text-[11px] font-normal font-manrope",
    },
    table: {
      fontSize: "13px",
      fontWeight: "400",
      fontFamily: "'Manrope', sans-serif",
      className: "text-[13px] font-normal font-manrope",
    },
  },
  usageClass: {
    manrope: "font-manrope",
    inter: "font-inter",
  }
} as const;
