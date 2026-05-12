import React from 'react';
import { TYPOGRAPHY } from '../design-system/tokens';

export interface EmptyStateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = "No Records Found",
  description,
  action,
  icon,
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center bg-[#0B0F14] border border-[#1F2430] ${className}`}>
      {icon && (
        <div className="mb-4 text-[#8F96A3] opacity-60">
          {icon}
        </div>
      )}
      <span className={TYPOGRAPHY.scale.h3.className} style={{ color: '#E6E6EB' }}>
        {title}
      </span>
      {description && (
        <p className="mt-2 max-w-md font-inter text-[13px] text-[#8F96A3] leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-5">
          {action}
        </div>
      )}
    </div>
  );
};
