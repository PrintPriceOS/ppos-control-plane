import React from 'react';

export const PrintPriceLogo: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Upper-left distinctive circular brand dot */}
    <circle cx="34" cy="30" r="22" fill="#dc0000" />
    {/* Stylized custom thick outer contour of the letter P */}
    <path 
      d="M36 32H62C78 32 86 42 82 58C78 72 68 76 56 76H52L48 90H22L36 32Z" 
      fill="#dc0000" 
    />
    {/* Inner transparent/white cutout counter of the loop */}
    <path 
      d="M43 45L39 64H53C61 64 66 60 67 54C68 48 64 45 56 45H43Z" 
      fill="currentColor" 
      className="text-white dark:text-[#0e0e0f]"
    />
  </svg>
);
