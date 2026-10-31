import React from 'react';
import { useMachineDrawer } from './MachineDrawerContext';

interface FederationNodeProps {
  id: string;
  name: string;
  x: string | number;
  y: string | number;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'SATURATED';
  utilization: number;
}

export const FederationNode: React.FC<FederationNodeProps> = ({ id, name, x, y, status, utilization }) => {
  const { openMachine } = useMachineDrawer();

  const getColor = () => {
    switch (status) {
      case 'ONLINE': return '#10b981'; // Emerald
      case 'DEGRADED': return '#f59e0b'; // Amber
      case 'SATURATED': return '#ef4444'; // Red
      case 'OFFLINE': return '#4b5563'; // Slate
      default: return '#3b82f6'; // Blue
    }
  };

  const color = getColor();

  return (
    <g 
      className="cursor-pointer group/node" 
      onClick={(e) => {
        e.stopPropagation();
        openMachine(id);
      }}
    >
      {/* Interaction Area */}
      <circle cx={x} cy={y} r="1.5" fill="transparent" />
      
      {/* Outer Glow / Pulse */}
      {status !== 'OFFLINE' && (
        <circle 
          cx={x} cy={y} r="1" 
          fill={color} 
          fillOpacity="0.2"
          className={status === 'SATURATED' || status === 'DEGRADED' ? 'animate-ping' : ''}
        />
      )}

      {/* Main Node Dot */}
      <circle 
        cx={x} cy={y} r="0.6" 
        fill={color} 
        className="transition-all group-hover/node:r-1 shadow-lg"
      />

      {/* Label */}
      <text 
        x={x} y={y} 
        dy="-2.5" 
        textAnchor="middle" 
        className="text-[1.8px] font-black fill-white/80 uppercase tracking-tighter opacity-0 group-hover/node:opacity-100 transition-all pointer-events-none drop-shadow-md"
      >
        {name}
      </text>

      {/* Small utilization indicator on hover */}
      <text 
        x={x} y={y} 
        dy="2.5" 
        textAnchor="middle" 
        className="text-[1.2px] font-bold fill-zinc-500 uppercase tracking-widest opacity-0 group-hover/node:opacity-100 transition-all pointer-events-none"
      >
        {Math.round(utilization)}% UTIL
      </text>
    </g>
  );
};
