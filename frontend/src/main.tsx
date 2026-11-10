import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft, ArrowRight, Bell, BookOpen, ChevronRight, CircleAlert, Clock3, Construction, Flag,
  Lightbulb, ListFilter, LocateFixed, LogOut, Map as MapIcon, MapPin, Plus, Search, Shield,
  ShieldAlert, ShieldCheck, Siren, UserRound, X,
} from 'lucide-react';
import { Account, Alert, ApiError, Catalog, Page, Report, Risk, api, dateText, risks } from './api';
import { MapView } from './MapView';
import { AccountForm, Guides, ReportForm, ReportList, Sent } from './forms';
import { DEFAULT_TRUJILLO_ALERTS } from './mockData';
import './styles.css';

const DEFAULT_CATALOG: Catalog = {
  categories: {
    robo: 'Robo o intento de robo',
    iluminacion: 'Iluminación deficiente',
    vandalismo: 'Vandalismo',
    via: 'Obstáculo en la vía',
    otro: 'Otra incidencia',
  },
  districts: {
    'Trujillo': [-8.1117, -79.0287],
    'Víctor Larco Herrera': [-8.1432, -79.0475],
    'La Esperanza': [-8.0785, -79.0501],
    'El Porvenir': [-8.0746, -79.0007],
    'Florencia de Mora': [-8.0857, -79.0217],
    'Huanchaco': [-8.0808, -79.1214],
    'Moche': [-8.1715, -79.0095],
    'Salaverry': [-8.2223, -78.9767],
    'Laredo': [-8.0890, -78.9601],
    'Poroto': [-8.0112, -78.7671],
    'Simbal': [-7.9771, -78.8136],
    'Alto Trujillo': [-8.0448, -78.9917],
  },
  demo: true,
};

const pages = {
  mapa: { label: 'Mapa', icon: MapIcon },
  alertas: { label: 'Alertas', icon: Bell },
  reportar: { label: 'Reportar', icon: Plus },
  guias: { label: 'Guías', icon: BookOpen },
  perfil: { label: 'Perfil', icon: UserRound },
  revision: { label: 'Revisión', icon: ShieldCheck },
};

const incidentIcons: Record<string, typeof Shield> = {
  robo: ShieldAlert, iluminacion: Lightbulb, vandalismo: Flag, via: Construction,
};

const headings: Record<Page, [string, string]> = {
  mapa: ['Mapa de alertas', 'Consulta las incidencias publicadas en la provincia de Trujillo.'],
  alertas: ['Alertas de Trujillo', 'Explora los reportes publicados y su contexto.'],
  reportar: ['Reportar incidencia', 'Comparte lo que observaste para que el equipo pueda revisarlo.'],
  guias: ['Guías de seguridad', 'Consulta cómo reportar y entender las alertas de tu comunidad.'],
  perfil: ['Mi perfil', 'Consulta tu cuenta y el estado de los reportes que enviaste.'],
  revision: ['Revisión de reportes', 'Revisa los aportes y redacta un resumen para los que se publiquen.'],
};

function getPage(): Page {
  const hash = location.hash.slice(1);
  return Object.hasOwn(pages, hash) ? hash as Page : 'mapa';
}

function App() {
  const [page, setPage] = useState<Page>(getPage);
  const [catalog, setCatalog] = useState<Catalog>();
  const [account, setAccount] = useState<Account | null | undefined>();
  const [incidents, setIncidents] = useState<Alert[]>();
  const [selected, setSelected] = useState<Alert | null>(null);
  const [sent, setSent] = useState<Report | null>(null);
  const [loadError, setLoadError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [retry, setRetry] = useState(0);
  const [sessionMessage, setSessionMessage] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [risk, setRisk] = useState<Risk | ''>('');
  const [days, setDays] = useState(30);
  const [mapMode, setMapMode] = useState<'normal' | 'heat'>('heat');
  const detailPanel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selected && window.matchMedia('(max-width: 630px)').matches) {
      detailPanel.current?.scrollIntoView({ block: 'start' });
    }
  }, [selected]);

  useEffect(() => {
    const change = () => {
      setPage(getPage()); setSelected(null); setSent(null); setSessionMessage(''); window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    let active = true;
    setLoadError('');
    void Promise.all([
      api<Catalog>('/catalog').catch(() => DEFAULT_CATALOG),
      api<Account>('/auth/me').catch((error) => {
        if (error instanceof ApiError && error.status === 401) return null;
        return null;
      }),
    ]).then(([data, user]) => {
      if (active) { setCatalog(data || DEFAULT_CATALOG); setAccount(user); }
    }).catch(() => {
      if (active) setCatalog(DEFAULT_CATALOG);
    });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (page !== 'mapa' && page !== 'alertas') return;
    let active = true;
    setRequestError('');
    void api<Alert[]>('/reports?days=30').then(
      (items) => {
        if (active) {
          // Si el backend aún no tiene alertas registradas o está vacío, usamos las de demostración locales
          setIncidents(items && items.length > 0 ? items : DEFAULT_TRUJILLO_ALERTS);
        }
      },
      () => {
        if (active) {
          // Si falla la conexión con el backend, mantenemos los reportes de demostración locales
          setIncidents(DEFAULT_TRUJILLO_ALERTS);
        }
      },
    );
    return () => { active = false; };
  }, [page, retry]);

  function navigate(next: Page) {
    setSelected(null); setSent(null); setSessionMessage('');
    if (page !== next) location.hash = next;
    else window.scrollTo(0, 0);
  }

  async function logout() {
    setLoggingOut(true);
    try { await api('/auth/logout', 'POST'); setAccount(null); navigate('perfil'); }
    catch (error) { setSessionMessage((error as Error).message); }
    finally { setLoggingOut(false); }
  }

  const normalized = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const search = normalized(query.trim());
  const alerts = (incidents || []).filter((alert) => (
    (!category || alert.category === category) &&
    (!risk || alert.risk === risk) &&
    (new Date(alert.occurred_at).getTime() >= Date.now() - days * 86_400_000) &&
    (!search || normalized(alert.district + ' ' + (catalog?.categories[alert.category] || '') + ' ' + alert.description).includes(search))
  ));
  const isExplore = page === 'mapa' || page === 'alertas';
  const showAccount = (page === 'reportar' || page === 'perfil') && account === null;
  const navigation: Page[] = ['mapa', 'alertas', 'reportar', 'guias', 'perfil'];
  if (account?.role === 'moderator') navigation.push('revision');

  return <>
    <aside className="sidebar">
      <a className="brand" href="#mapa" onClick={() => navigate('mapa')}>
        <span className="brand-mark"><Shield size={22} strokeWidth={2.2} /></span>
        <span>Alerta<span className="brand-accent"> Trujillo</span><small>SEGURIDAD CIUDADANA</small></span>
      </a>
      <p className="nav-label">COMUNIDAD</p>
      <nav aria-label="Navegación principal">
        {navigation.map((item) => {
          const Icon = pages[item].icon;
          return <a className={'nav-item ' + (item === page ? 'current' : '')} href={'#' + item}
            key={item} aria-current={item === page ? 'page' : undefined} onClick={() => navigate(item)}>
            <span className="nav-icon"><Icon size={19} /></span><span>{pages[item].label}</span>
          </a>;
        })}
      </nav>
      <div className="sidebar-foot"><span className="sidebar-pin"><MapPin size={17} /></span><div>Trujillo, Perú<small>Proyecto universitario</small></div></div>
    </aside>
    <main className="shell">
      <header className="topbar">
        <div className="top-location"><MapPin size={17} /> <strong>Trujillo</strong><span> / </span><span>La Libertad</span></div>
        <a className="mobile-brand" href="#mapa" onClick={() => navigate('mapa')}><Shield size={17} /> Alerta Trujillo</a>
        <a href="#perfil" className="account-link" onClick={() => navigate('perfil')}><UserRound size={17} /><span>{account ? account.name : 'Iniciar sesión'}</span></a>
      </header>
      <div className="content">
        {catalog?.demo && <div className="demo-banner"><span></span><strong>Modo demostración</strong><span>Las alertas de ejemplo son ficticias.</span></div>}
        <div className="page-title">
          <div><div className="eyebrow"><span></span> SEGURIDAD CIUDADANA</div><h1>{headings[page][0]}</h1><p>{headings[page][1]}</p></div>
          {isExplore && <button className="primary desktop-report" onClick={() => navigate('reportar')}><Plus size={19} /> Reportar incidencia</button>}
        </div>
        {loadError && <p className="error" role="alert">{loadError} <button className="text-button" onClick={() => setRetry(retry + 1)}>Reintentar</button></p>}
        {isExplore && catalog && <>
          <div className="filters panel" aria-label="Filtros de alertas">
            <label className="search"><Search size={18} /><input aria-label="Buscar por distrito o incidencia" placeholder="Buscar por distrito o incidencia" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} /></label>
            <div className="filter-selects"><ListFilter size={18} />
              <select aria-label="Categoría" value={category} onChange={(event) => { setCategory(event.target.value); setSelected(null); }}><option value="">Categoría</option>{Object.entries(catalog.categories).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
              <select aria-label="Riesgo" value={risk} onChange={(event) => { setRisk(event.target.value as Risk | ''); setSelected(null); }}><option value="">Riesgo</option>{Object.entries(risks).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
              <select aria-label="Periodo" value={days} onChange={(event) => { setDays(Number(event.target.value)); setSelected(null); }}><option value={30}>30 días</option><option value={7}>7 días</option><option value={1}>24 horas</option></select>
            </div>
          </div>
          {requestError && <p className="error" role="alert">{requestError} <button className="text-button" onClick={() => setRetry(retry + 1)}>Reintentar</button></p>}
          <div className={'explorer ' + (page === 'alertas' ? 'list-page' : '')}>
            {page === 'mapa' && <section className="panel map-panel">
              <div className="map-title"><div className="section-icon"><LocateFixed size={19} /></div><div><h2>Mapa de incidencias</h2><p>Ubicaciones aproximadas</p></div></div>
              <MapView alerts={alerts} selected={selected} onSelect={setSelected} mode={mapMode} onModeChange={setMapMode} />
              {mapMode === 'heat' ? (
                <div className="map-legend heat-legend">
                  <strong>Concentración</strong>
                  <span className="heat-bar-wrap">
                    <span className="heat-label">Baja</span>
                    <span className="heat-gradient-bar" />
                    <span className="heat-label">Alta</span>
                  </span>
                  <span className="heat-hint">Modo térmico activo</span>
                </div>
              ) : (
                <div className="map-legend"><strong>Riesgo</strong>{Object.entries(risks).map(([id, label]) => <span key={id}><i className={'dot ' + id}></i>{label}</span>)}</div>
              )}
            </section>}
            <section className="panel alert-panel" aria-label="Alertas publicadas" ref={detailPanel}>
              <div className="alert-panel-head"><div><h2>{selected ? 'Detalle de alerta' : 'Alertas publicadas'}</h2><p>{selected ? 'Información revisada' : 'Según tu búsqueda'}</p></div>
                {selected ? <button className="icon-button" aria-label="Cerrar detalle" onClick={() => setSelected(null)}><X size={20} /></button> : <span className="total">{alerts.length}</span>}
              </div>
              {selected ? <Detail key={selected.id} alert={selected} title={catalog.categories[selected.category]} account={account}
                onBack={() => setSelected(null)} onAccount={() => navigate('perfil')} /> :
                <div className="alert-list" aria-live="polite">
                  {incidents === undefined && !requestError && <p className="empty">Cargando alertas…</p>}
                  {incidents !== undefined && !alerts.length && <p className="empty">No hay alertas con estos filtros.</p>}
                  {alerts.map((alert) => <AlertCard key={alert.id} alert={alert} title={catalog.categories[alert.category]} onOpen={() => setSelected(alert)} />)}
                </div>}
            </section>
          </div>
        </>}
        {showAccount && catalog && <AccountForm key={page} onAccount={setAccount} demo={catalog.demo} />}
        {catalog && page === 'reportar' && account && (sent
          ? <Sent report={sent} catalog={catalog} onMap={() => navigate('mapa')} onProfile={() => navigate('perfil')} />
          : <ReportForm catalog={catalog} onDone={setSent} />)}
        {page === 'perfil' && account && catalog && <>
          <div className="panel account-panel"><div className="section-icon"><UserRound size={23} /></div><div><h2>{account.name}</h2><p className="muted">{account.email}</p></div>
            <button type="button" className="secondary" onClick={logout} disabled={loggingOut}><LogOut size={17} /> Salir</button>
          </div>
          {sessionMessage && <p role="alert" className="error">{sessionMessage}</p>}
          <h2 className="subhead">Mis reportes</h2><ReportList catalog={catalog} />
        </>}
        {page === 'revision' && catalog && (account?.role === 'moderator' ? <ReportList catalog={catalog} moderation /> :
          <p className="panel empty">El panel de revisión está disponible para el equipo de moderación.</p>)}
        {page === 'guias' && <Guides />}
        <footer className="scope"><CircleAlert size={17} /><span>Proyecto universitario para reportes ciudadanos. Ante una emergencia, comunícate directamente con los servicios oficiales.</span></footer>
      </div>
    </main>
  </>;
}

function AlertCard({ alert, title, onOpen }: { alert: Alert; title: string; onOpen: () => void }) {
  const Icon = incidentIcons[alert.category] || Siren;
  return <button className="alert-card" onClick={onOpen}>
    <span className={'incident-icon ' + alert.risk}><Icon size={20} /></span>
    <span className="alert-card-copy">
      <span className="card-tags"><span className={'badge ' + alert.risk}>{risks[alert.risk]}</span>{alert.sample && <span className="sample-tag">Ejemplo</span>}</span>
      <strong>{title}</strong>
      <span className="card-location"><MapPin size={14} />{alert.district}</span>
      <span className="card-date"><Clock3 size={13} />{dateText.format(new Date(alert.occurred_at))}</span>
    </span>
    <ChevronRight size={17} className="card-arrow" />
  </button>;
}

function Detail({ alert, title, account, onBack, onAccount }: { alert: Alert; title: string; account: Account | null | undefined; onBack: () => void; onAccount: () => void }) {
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function respond(answer: string) {
    setBusy(true);
    try { await api('/reports/' + alert.id + '/vote', 'PUT', { answer }); setNotice('Tu respuesta quedó registrada.'); }
    catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="detail">
    <button className="text-button" onClick={onBack}><ArrowLeft size={16} /> Volver a las alertas</button>
    <div className="card-tags"><span className={'badge ' + alert.risk}>Riesgo {risks[alert.risk].toLowerCase()}</span>{alert.sample && <span className="sample-tag">Ejemplo ficticio</span>}</div>
    <h3>{title}</h3><p className="card-location"><MapPin size={16} />{alert.district}</p>
    <p className="card-date"><Clock3 size={15} />{dateText.format(new Date(alert.occurred_at))}</p>
    <p>{alert.description}</p>
    <div className="detail-response"><strong>¿Observaste esta incidencia?</strong>
      {account ? <div className="action-row">{[['yes', 'Sí'], ['no', 'No'], ['unsure', 'No estoy seguro']].map(([answer, label]) =>
        <button key={answer} className="secondary" onClick={() => void respond(answer)} disabled={busy}>{label}</button>)}</div> :
        <button className="text-button" onClick={onAccount}>Inicia sesión para responder <ArrowRight size={16} /></button>}
      {notice && <p role="status" className="muted">{notice}</p>}
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
