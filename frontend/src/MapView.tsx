import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { Alert, Position, risks, statuses } from './api';

export const TRUJILLO: Position = [-8.108, -79.031];
const tiles = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const marker = (variant: string) => L.divIcon({
  className: 'map-marker', html: '<span class="map-pin ' + variant + '"></span>', iconSize: [34, 38], iconAnchor: [17, 34],
});
const heatWeight = { high: 1, medium: 0.65, low: 0.35 };

type Props = {
  alerts?: Alert[];
  selected?: Alert | null;
  onSelect?: (alert: Alert) => void;
  pin?: Position;
  centerRequest?: { point: Position; zoom?: number };
  onPin?: (position: Position) => void;
  heat?: boolean;
  user?: Position | null;
  compact?: boolean;
};

async function heatLayer(points: [number, number, number][]) {
  // leaflet.heat se registra sobre el objeto global L.
  (window as unknown as { L: typeof L }).L = L;
  await import('leaflet.heat');
  return L.heatLayer(points, { radius: 45, blur: 30, max: 0.8, maxZoom: 13, minOpacity: 0.55, gradient: { 0.2: '#43a047', 0.45: '#fbc02d', 0.7: '#fb8c00', 0.9: '#e53935' } });
}

export function MapView({ alerts, selected, onSelect, pin, centerRequest, onPin, heat, user, compact }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const heatRef = useRef<L.Layer | null>(null);
  const handlers = useRef({ onSelect, onPin });
  handlers.current = { onSelect, onPin };
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, {
      center: pin || TRUJILLO, zoom: pin ? 15 : 13, minZoom: 10, maxZoom: 18, maxBounds: [[-8.6, -79.6], [-7.6, -78.35]],
      zoomControl: false, scrollWheelZoom: !compact, attributionControl: true,
    });
    instance.attributionControl.setPrefix(false);
    L.tileLayer(tiles, {
      attribution: import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18,
    }).on('tileerror', () => setTileError(true)).on('tileload', () => setTileError(false)).addTo(instance);
    instance.on('click', ({ latlng }: L.LeafletMouseEvent) => handlers.current.onPin?.([latlng.lat, latlng.lng]));
    map.current = instance;
    markers.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
    observer.observe(host.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; markers.current = null; };
  }, []);

  useEffect(() => {
    const layer = markers.current;
    if (!layer) return;
    layer.clearLayers();
    if (pin) L.marker(pin, { icon: marker('draft'), alt: 'Ubicación del reporte' }).addTo(layer);
    if (user) L.circleMarker(user, { radius: 8, color: '#fff', weight: 3, fillColor: '#1e88e5', fillOpacity: 1 }).addTo(layer);
    if (heat) return;
    for (const alert of alerts || []) {
      const variant = alert.risk + (alert.status === 'community' ? ' unverified' : '') + (alert.id === selected?.id ? ' selected' : '');
      const label = alert.district + ' · Riesgo ' + risks[alert.risk].toLowerCase() + ' · ' + statuses[alert.status];
      L.marker([alert.latitude, alert.longitude], { icon: marker(variant), alt: label, title: label, keyboard: true })
        .on('click', () => handlers.current.onSelect?.(alert)).addTo(layer);
    }
  }, [alerts, pin, selected, heat, user]);

  useEffect(() => {
    let cancelled = false;
    heatRef.current?.remove();
    heatRef.current = null;
    if (!heat || !map.current) return;
    void heatLayer((alerts || []).map((alert) => [alert.latitude, alert.longitude, heatWeight[alert.risk]])).then((layer) => {
      if (cancelled || !map.current) return;
      heatRef.current = layer.addTo(map.current);
    });
    return () => { cancelled = true; };
  }, [alerts, heat]);

  useEffect(() => { if (selected) map.current?.panTo([selected.latitude, selected.longitude]); }, [selected]);
  useEffect(() => { if (centerRequest) map.current?.setView(centerRequest.point, centerRequest.zoom || 15); }, [centerRequest]);

  return <div className={'map-wrap' + (compact ? ' compact' : '')}>
    <div className="map-host" ref={host} role="region" aria-label={onPin ? 'Mapa para ubicar la incidencia' : 'Mapa de incidencias de Trujillo'} />
    {!compact && <div className="map-controls">
      <button type="button" aria-label="Acercar mapa" onClick={() => map.current?.zoomIn()}><Plus size={18} /></button>
      <button type="button" aria-label="Alejar mapa" onClick={() => map.current?.zoomOut()}><Minus size={18} /></button>
      <button type="button" aria-label="Centrar mapa" onClick={() => map.current?.setView(user || TRUJILLO, user ? 15 : 13)}><LocateFixed size={17} /></button>
    </div>}
    {tileError && <div className="map-warning">El mapa base no está disponible. Los puntos siguen visibles.</div>}
  </div>;
}
