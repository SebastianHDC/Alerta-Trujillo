import { useEffect, useState } from 'react';
import { Position } from './api';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferred = event as InstallEvent;
  listeners.forEach((listener) => listener());
});
window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((listener) => listener()); });

export function registerServiceWorker() {
  // En desarrollo el service worker interferiría con la recarga de Vite; se activa con ?sw=1 para probarlo.
  const enabled = import.meta.env.PROD || new URLSearchParams(location.search).has('sw');
  if (!enabled || !('serviceWorker' in navigator)) return;
  const register = () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); };
  if (document.readyState === 'complete') register(); else window.addEventListener('load', register);
}

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const update = () => force((value) => value + 1);
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);
  return {
    canInstall: !!deferred,
    installed: isStandalone(),
    iosHint: isIos() && !isStandalone(),
    async install() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      listeners.forEach((listener) => listener());
      return outcome === 'accepted';
    },
  };
}

export async function permissionState(name: 'geolocation' | 'camera'): Promise<PermissionState | 'unsupported'> {
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName });
    return status.state;
  } catch { return 'unsupported'; }
}

export function nearestDistrict(point: Position, districts: Record<string, Position>) {
  let best = Object.keys(districts)[0];
  let bestDistance = Infinity;
  for (const [name, [lat, lon]] of Object.entries(districts)) {
    const distance = (lat - point[0]) ** 2 + (lon - point[1]) ** 2;
    if (distance < bestDistance) { best = name; bestDistance = distance; }
  }
  return best;
}

export const insidePilot = ([lat, lon]: Position) => lat >= -8.35 && lat <= -7.8 && lon >= -79.25 && lon <= -78.55;
