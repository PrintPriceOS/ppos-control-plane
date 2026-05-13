import React from 'react';

export const PrintPriceLogo: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Upper-left distinctive circular brand dot */}
    <circle cx="32" cy="32" r="18" fill="#dc0000" />
    {/* Perfectly proportioned, non-deformed outer contour of the slanted letter P */}
    <path 
      d="M25 85 L38 25 H65 C85 25 85 55 65 55 H48 L42 85 Z" 
      fill="#dc0000" 
    />
    {/* Inner cutout counter of the loop perfectly centered and parallel */}
    <path 
      d="M41 33 L38 47 H58 C68 47 68 33 58 33 Z" 
      fill="currentColor" 
      className="text-white dark:text-[#0e0e0f]"
    />
  </svg>
);
