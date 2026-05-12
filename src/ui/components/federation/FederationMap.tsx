import React, { useMemo } from 'react';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getRoutingMap, getRoutingHeatmap } from '../../lib/adminApi';
import { FederationLayer } from './FederationLayer';
import { FederationNode } from './FederationNode';
import { RoutingLayer } from './RoutingLayer';

export const FederationMap: React.FC = () => {
  const { data: mapState, isLoading, status } = useAdminQuery('routing:map', getRoutingMap, 5000);
  const { data: heatmap } = useAdminQuery('routing:heatmap', getRoutingHeatmap, 10000);

  // Coordinate Projection Logic
  // Focus: Europe (Lat 35 to 70, Lng -15 to 40)
  const project = (lat: number, lng: number) => {
    const x = ((lng + 15) / 55) * 100;
    const y = 100 - (((lat - 35) / 35) * 100);
    return { x, y };
  };

  const processedNodes = useMemo(() => {
    if (!mapState?.nodes) return [];
    return mapState.nodes.map((node: any) => ({
      ...node,
      coords: project(node.lat || node.latitude, node.lng || node.longitude)
    }));
  }, [mapState?.nodes]);

  const processedRoutes = useMemo(() => {
    if (!mapState?.routes) return [];
    return mapState.routes.map((route: any) => ({
      id: route.id,
      origin: project(route.origin.lat, route.origin.lng),
      destination: project(route.destination.lat, route.destination.lng),
      status: route.status,
      intensity: route.intensity
    }));
  }, [mapState?.routes]);

  if (isLoading) {
    return (
      <div className="w-full h-full bg-[#050505] flex items-center justify-center border border-white/5">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-red-600/20 border-t-red-600 rounded-none animate-spin" />
          <span className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.3em]">Synching Federation Grid...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#050505] overflow-hidden group">
      {/* Background Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
           style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <svg className="absolute inset-0 w-full h-full p-8" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <FederationLayer />
        
        {/* Heatmap Layer */}
        {Array.isArray(heatmap) && heatmap.map((h: any) => {
          const pos = project(h.center.lat, h.center.lng);
          return (
            <circle 
              key={h.region}
              cx={pos.x} cy={pos.y}
              r={2 + (h.pressure / 25)}
              fill={h.status === 'SATURATED' ? '#ef4444' : '#3b82f6'}
              fillOpacity={0.05}
              className={h.status === 'SATURATED' ? 'animate-pulse' : ''}
            />
          );
        })}

        <RoutingLayer routes={processedRoutes} />

        {processedNodes.map((node: any) => (
          <FederationNode 
            key={node.id}
            id={node.id}
            name={node.name || node.company_name}
            x={node.coords.x}
            y={node.coords.y}
            status={node.status}
            utilization={node.utilization || node.capacity_utilization_pct || 0}
          />
        ))}
      </svg>

      {/* Map HUD Overlay */}
      <div className="absolute top-6 left-6 pointer-events-none space-y-4 z-30">
        <div className="p-4 bg-black/80 backdrop-blur-md border border-white/10 rounded-none">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 bg-red-600" />
            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Live Federation Map</span>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <span className="text-[8px] font-bold text-zinc-500 uppercase">Operational Nodes</span>
            <span className="text-[10px] font-black text-emerald-500">{mapState?.counts?.operationalNodes || mapState?.summary?.total_active_nodes || 0}</span>
            <span className="text-[8px] font-bold text-zinc-500 uppercase">Active Dispatches</span>
            <span className="text-[10px] font-black text-red-600">{mapState?.counts?.activeDispatches || mapState?.summary?.active_dispatches || 0}</span>
            <span className="text-[8px] font-bold text-zinc-500 uppercase">Unmapped Assets</span>
            <span className="text-[10px] font-black text-amber-500">{mapState?.counts?.missingCoordinates || mapState?.counts?.MISSING_COORDINATES || mapState?.summary?.missing_coordinates || 0}</span>
          </div>
        </div>

        <div className="p-3 bg-black/40 backdrop-blur-sm border border-white/5 rounded-none">
          <div className="flex items-center gap-4 text-[7px] font-black text-zinc-500 uppercase tracking-widest">
            <div className="flex items-center gap-1.5">
               <div className="w-1 h-1 bg-emerald-500" />
               <span>Online</span>
            </div>
            <div className="flex items-center gap-1.5">
               <div className="w-1 h-1 bg-amber-500" />
               <span>Degraded</span>
            </div>
            <div className="flex items-center gap-1.5">
               <div className="w-1 h-1 bg-red-500" />
               <span>Saturation</span>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State Overlay */}
      {mapState?.source_status === 'NO_COORDINATES_AVAILABLE' && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 border border-white/10 rounded-none">
          <div className="w-10 h-10 border border-amber-500/30 flex items-center justify-center mb-3">
            <div className="w-3 h-3 bg-amber-500 animate-pulse" />
          </div>
          <span className="text-[12px] font-black text-amber-500 uppercase tracking-widest mb-1">
            NO MAPPABLE FEDERATION NODES — coordinates required
          </span>
          <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider max-w-xs mt-1">
            Operational payload lacks physical GPS resolution
          </p>
        </div>
      )}

      {/* Geographic Markers */}
      <div className="absolute bottom-6 left-6 text-[8px] font-mono text-white/20 uppercase tracking-widest pointer-events-none z-10">
        Projection: Web Mercator / Focus: EU-CENTRAL
      </div>
    </div>
  );
};
