import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { Alert, Position, risks } from './api';

const center: Position = [-8.108, -79.031];
const tiles = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const marker = (variant: string) => L.divIcon({
  className: 'map-marker',
  html: '<span class="map-pin ' + variant + '"></span>',
  iconSize: [34, 38], iconAnchor: [17, 34],
});

type Props = {
  alerts?: Alert[];
  selected?: Alert | null;
  onSelect?: (alert: Alert) => void;
  pin?: Position;
  centerRequest?: { point: Position };
  onPin?: (position: Position) => void;
};

export function MapView({ alerts, selected, onSelect, pin, centerRequest, onPin }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const handlers = useRef({ onSelect, onPin });
  handlers.current = { onSelect, onPin };
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, {
      center: pin || center, zoom: pin ? 14 : 13, minZoom: 10, maxZoom: 18,
      maxBounds: [[-8.6, -79.6], [-7.6, -78.35]],
      zoomControl: false, scrollWheelZoom: false, attributionControl: true,
    });
    instance.attributionControl.setPrefix(false);
    L.tileLayer(tiles, {
      attribution: import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).on('tileerror', () => setTileError(true)).on('tileload', () => setTileError(false)).addTo(instance);
    instance.on('click', ({ latlng }: L.LeafletMouseEvent) => handlers.current.onPin?.([latlng.lat, latlng.lng]));
    map.current = instance;
    markers.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      markers.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = markers.current;
    if (!layer) return;
    layer.clearLayers();
    if (pin) L.marker(pin, { icon: marker('draft'), alt: 'Ubicación del reporte' }).addTo(layer);
    const clusters = new Map<string, Alert[]>();
    for (const alert of alerts || []) {
      const key = alert.latitude + ',' + alert.longitude;
      clusters.set(key, [...(clusters.get(key) || []), alert]);
    }
    for (const group of clusters.values()) {
      const alert = group.find((item) => item.id === selected?.id) || group[0];
      const label = group.length > 1 ? group.length + ' alertas en este punto aproximado' : alert.district + ' · Riesgo ' + risks[alert.risk].toLowerCase();
      const item = L.marker([alert.latitude, alert.longitude], { icon: marker(alert.risk), alt: label, title: label });
      const popup = document.createElement('div');
      for (const report of group) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'map-popup-button';
        button.textContent = report.district + ' · ' + report.description;
        button.addEventListener('click', () => handlers.current.onSelect?.(report));
        popup.append(button);
      }
      if (group.length > 1) item.bindPopup(popup);
      else item.on('click', () => handlers.current.onSelect?.(alert));
      item.addTo(layer);
    }
  }, [alerts, pin, selected]);

  useEffect(() => {
    if (selected) map.current?.panTo([selected.latitude, selected.longitude]);
  }, [selected]);
  useEffect(() => {
    if (centerRequest) map.current?.setView(centerRequest.point, 14);
  }, [centerRequest]);

  return (
    <div className="map-wrap">
      <div className="map-host" ref={host} role="region" aria-label={onPin ? 'Mapa para ubicar la incidencia' : 'Mapa de incidencias de Trujillo'} />
      <div className="map-controls">
        <button type="button" aria-label="Acercar mapa" onClick={() => map.current?.zoomIn()}><Plus size={18} /></button>
        <button type="button" aria-label="Alejar mapa" onClick={() => map.current?.zoomOut()}><Minus size={18} /></button>
        <button type="button" aria-label="Centrar mapa en Trujillo" onClick={() => map.current?.setView(center, 13)}><LocateFixed size={17} /></button>
      </div>
      {tileError && <div className="map-warning">El mapa base no está disponible. Los puntos siguen visibles.</div>}
    </div>
  );
}
