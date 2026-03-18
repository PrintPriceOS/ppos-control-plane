import React from 'react';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  showScore?: boolean;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level, score, showScore = true }) => {
  const styles: Record<RiskLevel, string> = {
    LOW: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    MEDIUM: 'bg-amber-100 text-amber-800 border-amber-200',
    HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
    CRITICAL: 'bg-rose-100 text-rose-800 border-rose-200 animate-pulse'
  };

  return (
    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[level]}`}>
      <span className="mr-1">{level}</span>
      {showScore && score !== undefined && (
        <span className="opacity-70">({score})</span>
      )}
    </div>
  );
};
