import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getRoutingMap } from '../../lib/adminApi';
import { toDisplayText, safeArray } from '../../lib/display';
import { useMachineDrawer } from '../federation/MachineDrawerContext';
import { useTheme } from '../../hooks/useTheme';

// Override default Leaflet popups and container styles dynamically per theme
const getLeafletOverrideStyles = (theme: 'dark' | 'light') => `
  .leaflet-popup-content-wrapper, .leaflet-popup-tip {
    background: ${theme === 'dark' ? '#131314' : '#ffffff'} !important;
    color: ${theme === 'dark' ? '#f4f4f5' : '#18181b'} !important;
    border: 1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'} !important;
    border-radius: 0px !important;
    box-shadow: ${theme === 'dark' ? '0 10px 30px rgba(0,0,0,0.8)' : '0 10px 30px rgba(0,0,0,0.08)'} !important;
  }
  .leaflet-container {
    background: ${theme === 'dark' ? '#050505' : '#f4f4f5'} !important;
    font-family: monospace;
  }
  .leaflet-popup-content {
    margin: 10px 14px !important;
  }
  .leaflet-popup-close-button {
    color: ${theme === 'dark' ? '#a1a1aa' : '#71717a'} !important;
    padding: 4px !important;
  }
  /* Ensure zoom controls z-index is superior to custom overlays */
  .leaflet-control-container,
  .leaflet-top,
  .leaflet-left,
  .leaflet-control-zoom {
    z-index: 50 !important;
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
  const theme = useTheme();
  const isLight = theme === 'light';

  const nodes = useMemo(() => safeArray(mapState?.nodes), [mapState?.nodes]);
  const routes = useMemo(() => safeArray(mapState?.routes), [mapState?.routes]);

  const getStatusColor = (statusStr: unknown, pressure: number, lightMode: boolean) => {
    const s = String(statusStr || '').toUpperCase();
    if (s === 'SATURATED' || pressure > 85) return lightMode ? '#dc0000' : '#ef4444'; // red
    if (s === 'DEGRADED' || s === 'MAINTENANCE' || pressure > 60) return lightMode ? '#d97706' : '#f59e0b'; // amber
    if (s === 'OFFLINE') return lightMode ? '#a1a1aa' : '#71717a'; // zinc/gray
    return lightMode ? '#059669' : '#10b981'; // green/online
  };

  if (isLoading) {
    return (
      <div className={`w-full h-full min-h-[600px] flex items-center justify-center border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-[#050505] border-white/5'}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-none animate-spin" />
          <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${isLight ? 'text-zinc-500' : 'text-zinc-600'}`}>Projecting Geospatial Grid...</span>
        </div>
      </div>
    );
  }

  const defaultCenter: [number, number] = [50.1109, 8.6821]; // Frankfurt Center EU

  return (
    <div className={`relative w-full h-full min-h-[600px] overflow-hidden group border flex flex-col ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-[#050505] border-white/10'}`}>
      <style>{getLeafletOverrideStyles(theme)}</style>

      {/* Geospatial Leaflet Base Layer */}
      <div className="flex-1 relative w-full h-full min-h-[600px]">
        <MapContainer 
          key={theme} // Force complete tile/container synchronization when theme changes
          center={defaultCenter} 
          zoom={4} 
          style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, zIndex: 1 }}
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer
            url={isLight 
              ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" 
              : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"}
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
                color={isLight ? "#2563eb" : "#3b82f6"}
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
            const color = getStatusColor(statusStr, pressure, isLight);

            return (
              <CircleMarker
                key={node.id || Math.random()}
                center={[lat, lng]}
                radius={7 + (pressure / 20)}
                color={color}
                fillColor={color}
                fillOpacity={node?.status === 'OFFLINE' ? 0.2 : (isLight ? 0.75 : 0.6)}
                weight={2}
                eventHandlers={{
                  click: () => node?.id && openMachine(node.id)
                }}
              >
                <Popup>
                  <div className="space-y-2 font-mono text-xs min-w-[180px]">
                    <div className={`flex items-center justify-between border-b pb-1 mb-1 ${isLight ? 'border-zinc-200' : 'border-white/10'}`}>
                      <span className={`font-bold truncate max-w-[120px] ${isLight ? 'text-zinc-900' : 'text-white'}`}>
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
                      <span className={`text-right font-bold truncate ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>{String(node?.id || '').slice(0, 8)}</span>
                      <span className="text-zinc-500 uppercase">Region:</span>
                      <span className={`text-right ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>{toDisplayText(node?.region || node?.country)}</span>
                      <span className="text-zinc-500 uppercase">Utilization:</span>
                      <span className={`text-right font-bold ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>{Number(pressure || 0).toFixed(0)}%</span>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* Strategic Overlays Preserved Below Zoom Controls using stacking context */}
      <div className="absolute top-20 left-6 pointer-events-none space-y-4 z-20">
        <div className={`p-4 backdrop-blur-md border rounded-none pointer-events-auto shadow-none ${isLight ? 'bg-white/90 border-zinc-200 text-zinc-900' : 'bg-black/85 border-white/10 text-white shadow-2xl'}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 bg-blue-500 animate-pulse" />
            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-zinc-900' : 'text-white'}`}>Geospatial Federation Map</span>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <span className="text-[8px] font-bold text-zinc-500 uppercase">Operational Nodes</span>
            <span className={`text-[10px] font-black ${isLight ? 'text-emerald-600' : 'text-emerald-500'}`}>
              {mapState?.counts?.operationalNodes ?? mapState?.summary?.total_active_nodes ?? nodes.filter((n: any) => n?.is_active).length ?? 0}
            </span>
            <span className="text-[8px] font-bold text-zinc-500 uppercase">Active Dispatches</span>
            <span className={`text-[10px] font-black ${isLight ? 'text-blue-600' : 'text-blue-500'}`}>
              {mapState?.counts?.activeDispatches ?? mapState?.summary?.active_dispatches ?? routes.length ?? 0}
            </span>
            <span className="text-[8px] font-bold text-zinc-500 uppercase">Unmapped Assets</span>
            <span className={`text-[10px] font-black ${isLight ? 'text-amber-600' : 'text-amber-500'}`}>
              {mapState?.counts?.missingCoordinates ?? mapState?.summary?.missing_coordinates ?? 0}
            </span>
          </div>
        </div>

        <div className={`p-3 backdrop-blur-sm border rounded-none pointer-events-auto ${isLight ? 'bg-white/90 border-zinc-200' : 'bg-black/60 border-white/5'}`}>
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
        <div className={`absolute inset-0 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-[2000] border rounded-none ${isLight ? 'bg-zinc-50/95 border-zinc-200' : 'bg-black/95 border-white/10'}`}>
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
      <div className={`absolute bottom-6 left-6 text-[8px] font-mono uppercase tracking-widest pointer-events-none z-20 ${isLight ? 'text-zinc-400' : 'text-white/30'}`}>
        Leaflet Engine / Base: {isLight ? 'Carto Positron Light' : 'Carto Dark'} / Clustering-Ready Architecture
      </div>
    </div>
  );
};
