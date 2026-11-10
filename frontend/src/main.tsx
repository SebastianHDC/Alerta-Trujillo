import { ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Account, Alert, ApiError, Catalog, Filters, Position, api, defaultFilters, message } from './api';
import { BottomNav, ErrorText } from './components';
import { AppContext, AppState } from './context';
import { AlertDetail, AlertsPage, FiltersPage, MapPage } from './pages/explore';
import { CreateAlert } from './pages/report';
import {
  ContactsPage, GuidesPage, Login, NotificationsPage, Onboarding, ProfilePage, Register, RequireAccount, Splash,
} from './pages/account';
import { Portal } from './portal/portal';
import { permissionState, registerServiceWorker } from './pwa';
import './styles.css';
import './visual.css';
import './modules.css';

function readRoute() {
  const [path, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { path: path || 'mapa', rest: rest.join('/') };
}

const storage = {
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* opcional */ } },
};

function App() {
  const [route, setRoute] = useState(readRoute);
  const [catalog, setCatalog] = useState<Catalog>();
  const [account, setAccount] = useState<Account | null | undefined>();
  const [bootError, setBootError] = useState('');
  const [retry, setRetry] = useState(0);
  const [splash, setSplash] = useState(true);
  const [onboarded, setOnboarded] = useState(() => storage.get('alerta-onboarded') === '1');
  const [alerts, setAlerts] = useState<Alert[]>();
  const [alertsError, setAlertsError] = useState('');
  const [alertsVersion, setAlertsVersion] = useState(0);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [position, setPosition] = useState<Position | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const change = () => { setRoute(readRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', change);
    const timer = window.setTimeout(() => setSplash(false), 900);
    return () => { window.removeEventListener('hashchange', change); window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    setBootError('');
    void Promise.all([
      api<Catalog>('/catalog'),
      api<Account>('/auth/me').catch((error) => { if (error instanceof ApiError && error.status === 401) return null; throw error; }),
    ]).then(([data, user]) => { if (active) { setCatalog(data); setAccount(user); } }, (error) => { if (active) setBootError(message(error)); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (account === undefined) return;
    let active = true;
    setAlertsError('');
    api<Alert[]>('/alerts').then((items) => { if (active) setAlerts(items); }, (error) => { if (active) setAlertsError(message(error)); });
    return () => { active = false; };
  }, [account, alertsVersion]);

  const refreshUnread = useCallback(() => {
    if (!account) { setUnread(0); return; }
    api<{ read: boolean }[]>('/notifications').then((items) => setUnread(items.filter((item) => !item.read).length), () => undefined);
  }, [account]);
  useEffect(refreshUnread, [refreshUnread, route.path]);

  const locate = useCallback(() => new Promise<Position | null>((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { const point: Position = [coords.latitude, coords.longitude]; setPosition(point); resolve(point); },
      () => resolve(null), { timeout: 8000, maximumAge: 60_000 },
    );
  }), []);
  // Si el vecino ya dio permiso, la app arranca centrada en su ubicación (acceso directo «cerca de mí»).
  useEffect(() => { void permissionState('geolocation').then((state) => { if (state === 'granted') void locate(); }); }, [locate]);

  const state = useMemo<AppState | null>(() => catalog && account !== undefined ? {
    catalog, account, setAccount, alerts, alertsError, reloadAlerts: () => setAlertsVersion((value) => value + 1),
    filters, setFilters, position, locate, unread, refreshUnread,
  } : null, [catalog, account, alerts, alertsError, filters, position, locate, unread, refreshUnread]);

  if (bootError) return <div className="phone"><div className="content"><ErrorText retry={() => setRetry(retry + 1)}>{bootError}</ErrorText></div></div>;
  if (!state || (splash && route.path !== 'portal')) return <div className="phone"><Splash /></div>;
  if (!onboarded && route.path !== 'portal') {
    return <AppContext.Provider value={state}><div className="phone"><Onboarding onDone={() => { storage.set('alerta-onboarded', '1'); setOnboarded(true); }} /></div></AppContext.Provider>;
  }

  const { path, rest } = route;
  if (path === 'portal') {
    const [section = '', ...id] = rest.split('/');
    return <AppContext.Provider value={state}><Portal section={section} id={id.join('/') || undefined} /></AppContext.Provider>;
  }
  const screens: Record<string, () => ReactElement> = {
    mapa: () => <MapPage />,
    filtros: () => <FiltersPage />,
    alertas: () => <AlertsPage />,
    alerta: () => <AlertDetail id={rest} />,
    reportar: () => <RequireAccount><CreateAlert /></RequireAccount>,
    contactos: () => <ContactsPage />,
    perfil: () => <RequireAccount><ProfilePage /></RequireAccount>,
    notificaciones: () => <RequireAccount><NotificationsPage /></RequireAccount>,
    guias: () => <GuidesPage />,
    login: () => <Login />,
    registro: () => <Register />,
  };
  const screen = (screens[path] || screens.mapa)();
  const withNav = !['login', 'registro', 'filtros'].includes(path);
  return <AppContext.Provider value={state}>
    <div className={'phone' + (withNav ? ' with-nav' : '')}>
      {catalog?.demo && <div className="demo-ribbon">Modo demostración · datos ficticios</div>}
      {screen}
      {withNav && <BottomNav current={path === 'alerta' ? 'alertas' : path} />}
    </div>
  </AppContext.Provider>;
}

registerServiceWorker();
createRoot(document.getElementById('root')!).render(<App />);
