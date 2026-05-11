import React from 'react';

interface Route {
  id: string;
  origin: { x: string | number, y: string | number };
  destination: { x: string | number, y: string | number };
  status: string;
  intensity: number;
}

interface RoutingLayerProps {
  routes: Route[];
}

export const RoutingLayer: React.FC<RoutingLayerProps> = ({ routes }) => {
  return (
    <g className="routing-layer">
      {routes.map((route) => {
        const isDegraded = route.status === 'DEGRADED';
        const color = isDegraded ? '#f59e0b' : '#dc0000';
        
        return (
          <g key={route.id} className="routing-line">
            {/* Base Path */}
            <path 
              d={`M ${route.origin.x} ${route.origin.y} Q ${(Number(route.origin.x) + Number(route.destination.x)) / 2} ${(Number(route.origin.y) + Number(route.destination.y)) / 2 - 5}, ${route.destination.x} ${route.destination.y}`}
              fill="none" 
              stroke={color} 
              strokeWidth="0.15"
              strokeOpacity={0.3}
              strokeDasharray="0.5,0.5"
            />
            
            {/* Animated Particle */}
            <circle r="0.25" fill={color}>
              <animateMotion 
                path={`M ${route.origin.x} ${route.origin.y} Q ${(Number(route.origin.x) + Number(route.destination.x)) / 2} ${(Number(route.origin.y) + Number(route.destination.y)) / 2 - 5}, ${route.destination.x} ${route.destination.y}`}
                dur={`${4 / (route.intensity || 1)}s`} 
                repeatCount="indefinite" 
              />
            </circle>
          </g>
        );
      })}
    </g>
  );
};
