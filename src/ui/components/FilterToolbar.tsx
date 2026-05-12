import React from 'react';

export interface FilterToolbarProps {
  children: React.ReactNode;
  onReset?: () => void;
  hasActiveFilters?: boolean;
  className?: string;
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({
  children,
  onReset,
  hasActiveFilters = false,
  className = ''
}) => {
  return (
    <div className={`flex flex-wrap items-center gap-2.5 p-3 bg-[#0B0F14] border border-[#1F2430] rounded-none ${className}`}>
      <div className="flex flex-wrap items-center gap-2 flex-1">
        {children}
      </div>
      {hasActiveFilters && onReset && (
        <button
          onClick={onReset}
          className="font-manrope text-[11px] font-bold text-[#dc0000] uppercase tracking-wider px-3 py-1.5 hover:bg-[#dc0000]/10 border border-transparent hover:border-[#dc0000]/20 transition-all flex-shrink-0 cursor-pointer"
        >
          Reset Filters
        </button>
      )}
    </div>
  );
};
