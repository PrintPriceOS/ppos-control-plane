import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getRoutingMap } from '../../lib/adminApi';
import { toDisplayText, safeArray } from '../../lib/display';
import { useMachineDrawer } from '../federation/MachineDrawerContext';
import { useTheme } from '../../hooks/useTheme';
import { useLocale } from '../../i18n';
import { CpuChipIcon, MapPinIcon, WrenchIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

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
  const { data: mapState, status } = useAdminQuery('routing:map', getRoutingMap, 5000);
  const isLoading = status === 'loading';
  const { openMachine } = useMachineDrawer();
  const theme = useTheme();
  const { t } = useLocale();
  const isLight = theme === 'light';

  // Tile provider detection
  const cartoApiKey = (import.meta as any).env?.VITE_CARTO_API_KEY;
  const customTileUrl = (import.meta as any).env?.VITE_MAP_TILE_URL;
  const hasTileConfig = Boolean(cartoApiKey || customTileUrl);

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
          <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${isLight ? 'text-zinc-500' : 'text-zinc-600'}`}>
            {t('industrial.verifyingStatus') || 'Projecting Geospatial Grid...'}
          </span>
        </div>
      </div>
    );
  }

  const defaultCenter: [number, number] = [50.1109, 8.6821]; // Frankfurt Center EU

  const tileUrl = customTileUrl || (cartoApiKey 
    ? (isLight 
        ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?api_key=${cartoApiKey}` 
        : `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${cartoApiKey}`)
    : null);

  return (
    <div className={`relative w-full h-full min-h-[650px] overflow-hidden group border flex flex-col ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-[#050505] border-white/10'}`}>
      <style>{getLeafletOverrideStyles(theme)}</style>

      {/* Explicit Provider Status Header */}
      {!hasTileConfig && (
        <div className={`p-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-3 ${isLight ? 'bg-amber-500/10 border-amber-500/20 text-zinc-900' : 'bg-amber-500/10 border-amber-500/20 text-white'}`}>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 mt-1 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-500">
                {t('map.unconfiguredProvider') || 'Proveedor geoespacial Carto sin clave de API configurada'}
              </h4>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                {t('map.unconfiguredProviderHint') || 'Para evitar la carga de teselas con errores o marcas de agua ("API KEY REQUIRED"), la infraestructura se visualiza en modo táctico estructurado con inspección directa de nodos.'}
              </p>
            </div>
          </div>
          <div className="px-2.5 py-1 text-[9px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-widest shrink-0 self-start md:self-auto">
            PROVIDER: UNCONFIGURED
          </div>
        </div>
      )}

      {/* Tactical Surface Area */}
      <div className="flex-1 relative w-full h-full min-h-[550px] flex flex-col">
        {hasTileConfig && tileUrl ? (
          <MapContainer 
            key={theme}
            center={defaultCenter} 
            zoom={4} 
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, zIndex: 1 }}
            zoomControl={true}
            attributionControl={false}
          >
            <TileLayer url={tileUrl} />
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
        ) : (
          /* Tactical Node Registry Fallback View */
          <div className="p-6 overflow-y-auto max-h-[620px] space-y-4 custom-scrollbar">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b ppos-border">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                  <CpuChipIcon className="w-4 h-4 text-blue-500" />
                  {t('map.nodeRegistry') || 'Registro Táctico de Nodos'}
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  {nodes.length} {t('industrial.nodesConnected') || 'Nodos registrados en la federación'}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Online: {nodes.filter((n: any) => n?.status === 'ONLINE' || n?.is_active).length}
                </span>
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Unmapped: {nodes.filter((n: any) => n?.lat == null || n?.latitude == null).length}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nodes.map((node: any) => {
                const lat = node?.lat ?? node?.latitude;
                const lng = node?.lng ?? node?.longitude;
                const hasCoords = typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);
                const pressure = node?.queuePressure ?? node?.utilization ?? 0;
                const statusStr = toDisplayText(node?.status || (node?.is_active ? 'ONLINE' : 'OFFLINE'));
                const color = getStatusColor(statusStr, pressure, isLight);

                return (
                  <div 
                    key={node?.id || Math.random()}
                    className="p-4 ppos-card border rounded transition-all hover:border-zinc-400 dark:hover:border-zinc-600 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
                            {toDisplayText(node?.company_name || node?.name || 'Print Node')}
                          </h4>
                          <span className="text-[9px] font-mono text-zinc-500 uppercase">
                            ID: {String(node?.id || '').slice(0, 10)}
                          </span>
                        </div>
                        <span 
                          className="px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-white shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {statusStr}
                        </span>
                      </div>

                      <div className="space-y-1 text-[11px] font-mono mt-3">
                        <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                          <span>{t('setup.region') || 'Región'}:</span>
                          <span className="text-slate-800 dark:text-zinc-200 font-bold">{toDisplayText(node?.region || node?.country || 'EU')}</span>
                        </div>
                        <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                          <span>Utilización:</span>
                          <span className="text-slate-800 dark:text-zinc-200 font-bold">{Number(pressure).toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between items-center text-zinc-500 dark:text-zinc-400 pt-1">
                          <span>GPS:</span>
                          {hasCoords ? (
                            <span className="text-emerald-500 text-[9px] flex items-center gap-1">
                              <MapPinIcon className="w-3 h-3" />
                              {lat.toFixed(2)}, {lng.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-amber-500 text-[9px] flex items-center gap-1">
                              <MapPinIcon className="w-3 h-3 opacity-40" />
                              {t('map.coordinatesMissing') || 'Sin coordenadas'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t ppos-border flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => node?.id && openMachine(node.id)}
                        className="text-[10px] font-bold text-blue-500 hover:text-blue-400 flex items-center gap-1 transition-colors uppercase tracking-wider"
                      >
                        <WrenchIcon className="w-3 h-3" />
                        {t('map.inspectMachine') || 'Inspeccionar Máquina'}
                        <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5 ml-0.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {nodes.length === 0 && (
                <div className="col-span-full py-16 text-center text-zinc-500 font-mono text-xs">
                  No registered federation nodes detected in current operational segment.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Strategic Overlays (Visible when tile map is active) */}
        {hasTileConfig && (
          <div className="absolute top-20 left-6 pointer-events-none space-y-4 z-20">
            <div className={`p-4 backdrop-blur-md border rounded-none pointer-events-auto shadow-none ${isLight ? 'bg-white/90 border-zinc-200 text-zinc-900' : 'bg-black/85 border-white/10 text-white shadow-2xl'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 bg-blue-500 animate-pulse" />
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  {t('map.tacticalSurface') || 'Geospatial Federation Map'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                <span className="text-[8px] font-bold text-zinc-500 uppercase">{t('industrial.nodesConnected') || 'Operational Nodes'}</span>
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
        )}

        {/* Telemetry Layer / Empty State Overlay */}
        {hasTileConfig && mapState?.source_status === 'NO_COORDINATES_AVAILABLE' && (
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
      </div>

      {/* Geographic HUD Markers */}
      <div className={`p-2.5 px-4 text-[8px] font-mono uppercase tracking-widest border-t flex items-center justify-between z-20 ${isLight ? 'bg-zinc-100/70 border-zinc-200 text-zinc-500' : 'bg-zinc-950/60 border-white/10 text-white/40'}`}>
        <span>Leaflet Engine / Mode: {hasTileConfig ? 'Carto Geospatial Layer' : 'Structured Tactical Grid (Safe Mode)'}</span>
        <span>Federation Registry: {nodes.length} Nodes</span>
      </div>
    </div>
  );
};
