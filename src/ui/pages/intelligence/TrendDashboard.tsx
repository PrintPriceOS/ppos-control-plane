import React, { useEffect, useState } from 'react';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon, MinusIcon, ChartBarIcon } from '@heroicons/react/24/outline';

export const TrendDashboard: React.FC = () => {
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/intelligence/trends')
      .then(res => res.json())
      .then(data => {
        if (data.ok) setTrends(data.trends || []);
        setLoading(false);
      });
  }, []);

  const getTrendIcon = (trend: string) => {
    if (trend === 'UP_FAST') return <ArrowTrendingUpIcon className="w-6 h-6 text-rose-600 animate-bounce" />;
    if (trend === 'UP') return <ArrowTrendingUpIcon className="w-6 h-6 text-orange-500" />;
    if (trend === 'DOWN') return <ArrowTrendingDownIcon className="w-6 h-6 text-emerald-500" />;
    return <MinusIcon className="w-6 h-6 text-gray-400" />;
  };

  const getTrendLabel = (trend: string) => {
    if (trend === 'UP_FAST') return { text: 'Accelerating', color: 'text-rose-700 font-black' };
    if (trend === 'UP') return { text: 'Increasing', color: 'text-orange-600 font-bold' };
    if (trend === 'DOWN') return { text: 'Decelerating', color: 'text-emerald-600' };
    return { text: 'Stable', color: 'text-gray-500' };
  };

  return (
    <div className="p-6">
      <div className="flex items-center space-x-3 mb-8">
        <ChartBarIcon className="w-8 h-8 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900 font-display">Predictive Trend Dashboard</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
          <div className="px-6 py-3">Entity</div>
          <div className="px-6 py-3">Metric</div>
          <div className="px-6 py-3 text-center">Trajectory</div>
          <div className="px-6 py-3 text-right">Confidence</div>
        </div>
        
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="px-6 py-12 text-center text-gray-400">Analyzing time-series data...</div>
          ) : trends.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">No active trends detected.</div>
          ) : trends.map((t, idx) => {
            const label = getTrendLabel(t.trend);
            return (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-4 items-center px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="text-sm font-semibold text-gray-800">{t.entityId}</div>
                <div className="text-xs text-gray-500 italic lowercase">{t.metric.replace('_', ' ')}</div>
                <div className="flex flex-col items-center">
                  {getTrendIcon(t.trend)}
                  <span className={`text-[10px] mt-1 ${label.color}`}>{label.text}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-gray-600 mb-1">{Math.round(t.confidence * 100)}%</div>
                  <div className="w-full bg-gray-200 rounded-full h-1 ml-auto max-w-[60px]">
                    <div className="bg-indigo-500 h-1 rounded-full" style={{ width: `${t.confidence * 100}%` }}></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 bg-indigo-50 border border-indigo-100 p-4 rounded-lg flex items-start gap-4">
        <div className="bg-indigo-100 p-2 rounded">
          <ChartBarIcon className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-indigo-900">How logic works</h4>
          <p className="text-xs text-indigo-700 leading-relaxed mt-1">
            Trends are calculated by comparing a 5-minute activity window against a 15-minute rolling baseline. 
            Acceleration is flagged when the delta exceeds 20% growth. No ML is used, ensuring 100% logic explainability.
          </p>
        </div>
      </div>
    </div>
  );
};
