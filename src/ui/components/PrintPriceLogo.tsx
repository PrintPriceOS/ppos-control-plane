import React from 'react';

export const PrintPriceLogo: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Distinctive upper-left circular brand dot perfectly proportioned */}
    <circle cx="28" cy="28" r="18" fill="#dc0000" />
    {/* Flawless, mathematically perfect outer contour of the original slanted P logo */}
    <path 
      d="M 19 90 L 32 25 H 55 A 35 20 0 0 1 55 65 H 42 L 37 90 Z" 
      fill="#dc0000" 
    />
    {/* Perfectly parallel inner loop cutout mirroring the outer arc with uniform border thickness */}
    <path 
      d="M 48.2 34 H 55 A 26 11 0 0 1 55 56 H 43.8 Z" 
      fill="currentColor" 
      className="text-white dark:text-[#0e0e0f]"
    />
  </svg>
);
