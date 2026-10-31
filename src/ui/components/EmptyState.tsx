import React from 'react';
import { TYPOGRAPHY, COLORS } from '../design-system/tokens';

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
    <div className={`flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-zinc-950 border ${COLORS.adaptive.borderPrimary} ${className}`}>
      {icon && (
        <div className={`mb-4 ${COLORS.adaptive.textMuted}`}>
          {icon}
        </div>
      )}
      <span className={`${TYPOGRAPHY.scale.h3.className} ${COLORS.adaptive.textPrimary}`}>
        {title}
      </span>
      {description && (
        <p className={`mt-2 max-w-md font-inter text-[13px] ${COLORS.adaptive.textSecondary} leading-relaxed`}>
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
