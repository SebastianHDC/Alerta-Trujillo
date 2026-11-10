import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { HeatLayer as LeafletHeatLayer } from 'leaflet.heat';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { Alert, Position, risks } from './api';
import { DEFAULT_TRUJILLO_ALERTS } from './mockData';

type HeatLayerInstance = L.Layer & {
  setLatLngs: (latlngs: [number, number, number][]) => HeatLayerInstance;
  redraw?: () => HeatLayerInstance;
};

const center: Position = [-8.1117, -79.0287];
const tiles = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const marker = (variant: string) => L.divIcon({
  className: 'map-marker',
  html: '<span class="map-pin ' + variant + '"></span>',
  iconSize: [34, 38], iconAnchor: [17, 34],
});

const riskWeights: Record<string, number> = {
  high: 1.0,
  medium: 0.65,
  low: 0.35,
};

type Props = {
  alerts?: Alert[];
  selected?: Alert | null;
  onSelect?: (alert: Alert) => void;
  pin?: Position;
  centerRequest?: { point: Position };
  onPin?: (position: Position) => void;
  mode?: 'normal' | 'heat';
  onModeChange?: (mode: 'normal' | 'heat') => void;
};

export function MapView({
  alerts,
  selected,
  onSelect,
  pin,
  centerRequest,
  onPin,
  mode,
  onModeChange,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const heatLayer = useRef<HeatLayerInstance | null>(null);
  const handlers = useRef({ onSelect, onPin });
  handlers.current = { onSelect, onPin };

  const [tileError, setTileError] = useState(false);
  const [internalMode, setInternalMode] = useState<'normal' | 'heat'>('heat');

  const currentMode = mode ?? internalMode;
  const setMode = (next: 'normal' | 'heat') => {
    setInternalMode(next);
    onModeChange?.(next);
  };

  // Si no hay alertas provistas y no estamos fijando un pin, usamos los datos locales de prueba
  const effectiveAlerts = (alerts && alerts.length > 0) ? alerts : (onPin ? [] : DEFAULT_TRUJILLO_ALERTS);

  // Inicialización del mapa Leaflet
  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, {
      center: pin || center,
      zoom: pin ? 14 : 14,
      minZoom: 10,
      maxZoom: 18,
      maxBounds: [[-8.6, -79.6], [-7.6, -78.35]],
      zoomControl: false,
      scrollWheelZoom: false,
      attributionControl: true,
    });

    instance.attributionControl.setPrefix(false);
    L.tileLayer(tiles, {
      attribution: import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    })
      .on('tileerror', () => setTileError(true))
      .on('tileload', () => setTileError(false))
      .addTo(instance);

    instance.on('click', ({ latlng }: L.LeafletMouseEvent) => handlers.current.onPin?.([latlng.lat, latlng.lng]));

    map.current = instance;
    markers.current = L.layerGroup().addTo(instance);

    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
    observer.observe(host.current);

    return () => {
      observer.disconnect();
      if (heatLayer.current && (instance as any).hasLayer(heatLayer.current)) {
        (instance as any).removeLayer(heatLayer.current);
      }
      instance.remove();
      map.current = null;
      markers.current = null;
      heatLayer.current = null;
    };
  }, []);

  // Sincronización de capas según el modo: 'normal' (pines) vs 'heat' (mapa de calor)
  useEffect(() => {
    const instance = map.current;
    const markerGroup = markers.current;
    if (!instance || !markerGroup) return;

    if (currentMode === 'heat') {
      // Modo Térmico: limpiar marcadores convencionales y mostrar capa térmica
      markerGroup.clearLayers();

      // Si hay un pin en borrador o una alerta seleccionada, mostrar solo ese pin de referencia
      if (pin) {
        L.marker(pin, { icon: marker('draft'), alt: 'Ubicación seleccionada' }).addTo(markerGroup);
      }
      if (selected) {
        const item = L.marker([selected.latitude, selected.longitude], {
          icon: marker(selected.risk),
          alt: selected.district + ' · ' + risks[selected.risk],
          title: selected.district + ' · ' + risks[selected.risk],
        });
        item.addTo(markerGroup);
      }

      // Generar puntos térmicos [lat, lng, intensidad]
      const points = effectiveAlerts.map((alert) => [
        alert.latitude,
        alert.longitude,
        riskWeights[alert.risk] ?? 0.6,
      ] as [number, number, number]);

      if (heatLayer.current) {
        heatLayer.current.setLatLngs(points);
        if (!(instance as any).hasLayer(heatLayer.current)) {
          (instance as any).addLayer(heatLayer.current);
        }
      } else {
        const newHeat = new (LeafletHeatLayer as any)(points, {
          radius: 36,
          blur: 24,
          minOpacity: 0.22,
          maxZoom: 16,
          max: 1.0,
          gradient: {
            0.2: '#22c55e', // Verde / Lima exterior
            0.4: '#a3e635', // Lima vibrante
            0.6: '#facc15', // Amarillo
            0.8: '#fb923c', // Naranja
            1.0: '#ef4444', // Rojo intenso en zonas calientes
          },
        }) as HeatLayerInstance;
        (instance as any).addLayer(newHeat);
        heatLayer.current = newHeat;
      }
    } else {
      // Modo Normal: quitar capa térmica y mostrar todos los marcadores individuales
      if (heatLayer.current && (instance as any).hasLayer(heatLayer.current)) {
        (instance as any).removeLayer(heatLayer.current);
      }

      markerGroup.clearLayers();
      if (pin) {
        L.marker(pin, { icon: marker('draft'), alt: 'Ubicación del reporte' }).addTo(markerGroup);
      }

      const clusters = new Map<string, Alert[]>();
      for (const alert of effectiveAlerts) {
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
        item.addTo(markerGroup);
      }
    }
  }, [effectiveAlerts, currentMode, pin, selected]);

  useEffect(() => {
    if (selected) map.current?.panTo([selected.latitude, selected.longitude]);
  }, [selected]);

  useEffect(() => {
    if (centerRequest) map.current?.setView(centerRequest.point, 14);
  }, [centerRequest]);

  return (
    <div className="map-wrap">
      <div
        className="map-host"
        ref={host}
        role="region"
        aria-label={onPin ? 'Mapa para ubicar la incidencia' : 'Mapa de incidencias de Trujillo'}
      />

      {/* Switch selector flotante Normal / Térmico */}
      {!onPin && (
        <div className="map-mode-pill-wrap">
          <div className="map-mode-pill" role="radiogroup" aria-label="Modo de visualización del mapa">
            <button
              type="button"
              role="radio"
              aria-checked={currentMode === 'normal'}
              className={`map-mode-btn ${currentMode === 'normal' ? 'active' : ''}`}
              onClick={() => setMode('normal')}
              title="Ver mapa normal con marcadores"
            >
              <span className="mode-icon-symbol diamond">◆</span>
              <span>Normal</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={currentMode === 'heat'}
              className={`map-mode-btn ${currentMode === 'heat' ? 'active' : ''}`}
              onClick={() => setMode('heat')}
              title="Ver mapa de calor térmico"
            >
              <span className="mode-icon-symbol circle">●</span>
              <span>Térmico</span>
            </button>
          </div>
        </div>
      )}

      {/* Controles de zoom y centrado */}
      <div className="map-controls">
        <button type="button" aria-label="Acercar mapa" onClick={() => map.current?.zoomIn()}><Plus size={18} /></button>
        <button type="button" aria-label="Alejar mapa" onClick={() => map.current?.zoomOut()}><Minus size={18} /></button>
        <button type="button" aria-label="Centrar mapa en Trujillo" onClick={() => map.current?.setView(center, 14)}><LocateFixed size={17} /></button>
      </div>

      {tileError && <div className="map-warning">El mapa base no está disponible. Los datos siguen visibles.</div>}
    </div>
  );
}
