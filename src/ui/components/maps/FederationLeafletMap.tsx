import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getRoutingMap } from '../../lib/adminApi';
import { toDisplayText, safeArray } from '../../lib/display';
import { useMachineDrawer } from '../federation/MachineDrawerContext';

// Override default Leaflet popups and container styles for seamless industrial dark theme
const leafletOverrideStyles = `
  .leaflet-popup-content-wrapper, .leaflet-popup-tip {
    background: #131314 !important;
    color: #f4f4f5 !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 0px !important;
    box-shadow: 0 10px 30px rgba(0,0,0,0.8) !important;
  }
  .leaflet-container {
    background: #050505 !important;
    font-family: monospace;
  }
  .leaflet-popup-content {
    margin: 10px 14px !important;
  }
  .leaflet-popup-close-button {
    color: #a1a1aa !important;
    padding: 4px !important;
  }
`;

// Helper component to auto-fit map bounds to valid operational coordinates
const BoundsFit: React.FC<{ nodes: any[] }> = ({ nodes }) => {
  const map = useMap();
  useEffect(() => {
    const validPts = nodes
      .map(n => {
        const lat = n?.lat ?? n?.latitude;
        const lng = n?.lng ?? n?.longitude;
        return (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) 
          ? [lat, lng] as [number, number] 
          : null;
      })
      .filter((pt): pt is [number, number] => pt !== null);

    if (validPts.length > 0) {
      const bounds = L.latLngBounds(validPts);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 7, animate: true });
      }
    }
  }, [map, nodes]);

  return null;
};

export const FederationLeafletMap: React.FC = () => {
  const { data: mapState, isLoading } = useAdminQuery('routing:map', getRoutingMap, 5000);
  const { openMachine } = useMachineDrawer();

  const nodes = useMemo(() => safeArray(mapState?.nodes), [mapState?.nodes]);
  const routes = useMemo(() => safeArray(mapState?.routes), [mapState?.routes]);

  const getStatusColor = (statusStr: unknown, pressure: number) => {
    const s = String(statusStr || '').toUpperCase();
    if (s === 'SATURATED' || pressure > 85) return '#ef4444'; // red
    if (s === 'DEGRADED' || s === 'MAINTENANCE' || pressure > 60) return '#f59e0b'; // amber
    if (s === 'OFFLINE') return '#71717a'; // zinc/gray
    return '#10b981'; // green/online
  };

  if (isLoading) {
    return (
      <div className="w-full h-full min-h-[600px] bg-[#050505] flex items-center justify-center border border-white/5">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-none animate-spin" />
          <span className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.3em]">Projecting Geospatial Grid...</span>
        </div>
      </div>
    );
  }

  const defaultCenter: [number, number] = [50.1109, 8.6821]; // Frankfurt Center EU

  return (
    <div className="relative w-full h-full min-h-[600px] bg-[#050505] overflow-hidden group border border-white/10 flex flex-col">
      <style>{leafletOverrideStyles}</style>

      {/* Geospatial Leaflet Base Layer */}
      <div className="flex-1 relative w-full h-full min-h-[600px]">
        <MapContainer 
          center={defaultCenter} 
          zoom={4} 
          style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, zIndex: 1 }}
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          <BoundsFit nodes={nodes} />

          {/* Dispatch Overlays / Routes Polyline Support */}
          {routes.map((route: any) => {
            const origLat = route?.origin?.lat;
            const origLng = route?.origin?.lng;
            const destLat = route?.destination?.lat;
            const destLng = route?.destination?.lng;

            if (origLat == null || origLng == null || destLat == null || destLng == null) return null;

            return (
              <Polyline
                key={route.id || Math.random()}
                positions={[[origLat, origLng], [destLat, destLng]]}
                color="#3b82f6"
                weight={2}
                opacity={route?.intensity ?? 0.6}
                dashArray="5, 5"
              />
            );
          })}

          {/* Node Markers with Popups */}
          {nodes.map((node: any) => {
            const lat = node?.lat ?? node?.latitude;
            const lng = node?.lng ?? node?.longitude;

            if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return null;

            const pressure = node?.queuePressure ?? node?.utilization ?? 0;
            const statusStr = toDisplayText(node?.status);
            const color = getStatusColor(statusStr, pressure);

            return (
              <CircleMarker
                key={node.id || Math.random()}
                center={[lat, lng]}
                radius={7 + (pressure / 20)}
                color={color}
                fillColor={color}
                fillOpacity={node?.status === 'OFFLINE' ? 0.2 : 0.6}
                weight={2}
                eventHandlers={{
                  click: () => node?.id && openMachine(node.id)
                }}
              >
                <Popup>
                  <div className="space-y-2 font-mono text-xs min-w-[180px]">
                    <div className="flex items-center justify-between border-b border-white/10 pb-1 mb-1">
                      <span className="font-bold text-white truncate max-w-[120px]">
                        {toDisplayText(node?.company_name || node?.name || 'Print Node')}
                      </span>
                      <span 
                        className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-white"
                        style={{ backgroundColor: color }}
                      >
                        {statusStr}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <span className="text-zinc-500 uppercase">Node ID:</span>
                      <span className="text-right text-zinc-300 font-bold truncate">{String(node?.id || '').slice(0, 8)}</span>
                      <span className="text-zinc-500 uppercase">Region:</span>
                      <span className="text-right text-zinc-300">{toDisplayText(node?.region || node?.country)}</span>
                      <span className="text-zinc-500 uppercase">Utilization:</span>
                      <span className="text-right text-zinc-300 font-bold">{Number(pressure || 0).toFixed(0)}%</span>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* Strategic Overlays Preserved Above Base Layer */}
      <div className="absolute top-6 left-6 pointer-events-none space-y-4 z-[1000]">
        <div className="p-4 bg-black/85 backdrop-blur-md border border-white/10 rounded-none shadow-2xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 bg-blue-500 animate-pulse" />
            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Geospatial Federation Map</span>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <span className="text-[8px] font-bold text-zinc-500 uppercase">Operational Nodes</span>
            <span className="text-[10px] font-black text-emerald-500">
              {mapState?.counts?.operationalNodes ?? mapState?.summary?.total_active_nodes ?? nodes.filter((n: any) => n?.is_active).length ?? 0}
            </span>
            <span className="text-[8px] font-bold text-zinc-500 uppercase">Active Dispatches</span>
            <span className="text-[10px] font-black text-blue-500">
              {mapState?.counts?.activeDispatches ?? mapState?.summary?.active_dispatches ?? routes.length ?? 0}
            </span>
            <span className="text-[8px] font-bold text-zinc-500 uppercase">Unmapped Assets</span>
            <span className="text-[10px] font-black text-amber-500">
              {mapState?.counts?.missingCoordinates ?? mapState?.summary?.missing_coordinates ?? 0}
            </span>
          </div>
        </div>

        <div className="p-3 bg-black/60 backdrop-blur-sm border border-white/5 rounded-none">
          <div className="flex items-center gap-4 text-[7px] font-black text-zinc-400 uppercase tracking-widest">
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

      {/* Telemetry Layer / Empty State Overlay */}
      {mapState?.source_status === 'NO_COORDINATES_AVAILABLE' && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-[2000] border border-white/10 rounded-none">
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

      {/* Geographic HUD Markers */}
      <div className="absolute bottom-6 left-6 text-[8px] font-mono text-white/30 uppercase tracking-widest pointer-events-none z-[1000]">
        Leaflet Engine / Base: Carto Dark / Clustering-Ready Architecture
      </div>
    </div>
  );
};
