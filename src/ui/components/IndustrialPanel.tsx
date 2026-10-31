import React from 'react';

export interface IndustrialPanelProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  accent?: boolean;
  className?: string;
  bodyClassName?: string;
}

export const IndustrialPanel: React.FC<IndustrialPanelProps> = ({
  children,
  header,
  footer,
  accent = false,
  className = '',
  bodyClassName = 'p-4'
}) => {
  return (
    <div className={`bg-[#131314] border border-[#1F2430] rounded-none flex flex-col relative overflow-hidden ${accent ? 'border-t-2 border-t-[#dc0000]' : ''} ${className}`}>
      {header && (
        <div className="px-4 py-3 bg-[#0B0F14] border-b border-[#1F2430] flex items-center justify-between font-manrope text-[13px] font-semibold text-[#E6E6EB]">
          {header}
        </div>
      )}
      <div className={`flex-1 ${bodyClassName}`}>
        {children}
      </div>
      {footer && (
        <div className="px-4 py-3 bg-[#0B0F14] border-t border-[#1F2430] flex items-center justify-between font-manrope text-xs text-[#8F96A3]">
          {footer}
        </div>
      )}
    </div>
  );
};
