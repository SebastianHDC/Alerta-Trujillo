import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Clock3, Crosshair, HelpCircle, MapPin, Navigation, Search, SlidersHorizontal, ThumbsDown, ThumbsUp, X, XCircle } from 'lucide-react';
import { Alert, Risk, api, ago, dateText, defaultFilters, distanceKm, filterAlerts, message, risks, timeRanges } from '../api';
import { AppBar, BellButton, CategoryIcon, Empty, ErrorText, Modal, RiskBadge, StatusBadge } from '../components';
import { go, useApp } from '../context';
import { MapView } from '../MapView';

function activeFilters(filters: typeof defaultFilters) {
  return filters.categories.length + (filters.risk ? 1 : 0) + (filters.hours !== defaultFilters.hours ? 1 : 0);
}

export function MapPage() {
  const { catalog, alerts, alertsError, reloadAlerts, filters, setFilters, position, locate, unread, account } = useApp();
  const [heat, setHeat] = useState(false);
  const [selected, setSelected] = useState<Alert | null>(null);
  const [center, setCenter] = useState<{ point: [number, number] }>();
  const visible = useMemo(() => filterAlerts(alerts || [], filters, catalog), [alerts, filters, catalog]);
  const count = activeFilters(filters);
  return <div className="screen map-screen">
    <AppBar title="Alerta Trujillo" action={<BellButton unread={unread} onClick={() => go(account ? 'notificaciones' : 'login')} />} />
    <div className="map-stage">
      <MapView alerts={visible} heat={heat} selected={selected} onSelect={setSelected} user={position} centerRequest={center} />
      <div className="map-overlay-top">
        <div className="mode-toggle" role="group" aria-label="Tipo de mapa">
          <button aria-pressed={!heat} onClick={() => setHeat(false)}>Normal</button>
          <button aria-pressed={heat} onClick={() => { setHeat(true); setSelected(null); }}>Térmico</button>
        </div>
        <div className="searchbar">
          <Search size={17} />
          <input aria-label="Buscar incidente" placeholder="Buscar incidente o distrito" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
          <button aria-label={count ? `Filtros, ${count} activos` : 'Filtros'} onClick={() => go('filtros')}><SlidersHorizontal size={17} />{count > 0 && <span className="dot-badge">{count}</span>}</button>
        </div>
      </div>
      <div className="legend-card" aria-label="Leyenda de riesgo">
        <strong>Nivel de riesgo</strong>
        {(['high', 'medium', 'low'] as Risk[]).map((risk) => <span key={risk}><i className={'dot ' + risk} />{risks[risk]}</span>)}
        {!heat && <span><i className="dot ring" />Sin verificar</span>}
      </div>
      <button className="locate-fab" aria-label="Usar mi ubicación" onClick={() => void locate().then((point) => point && setCenter({ point }))}><Crosshair size={20} /></button>
      {selected && <AlertSheet alert={selected} onClose={() => setSelected(null)} />}
      {!selected && <div className="map-count">{alerts === undefined ? 'Cargando alertas…' : `${visible.length} alertas en el mapa`}</div>}
    </div>
    <ErrorText retry={reloadAlerts}>{alertsError}</ErrorText>
    <ValidatePrompt />
  </div>;
}

function AlertSheet({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const { catalog } = useApp();
  return <div className="sheet">
    <button className="modal-close" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
    <div className="sheet-row">
      <span className={'incident-icon ' + alert.risk}><CategoryIcon category={alert.category} /></span>
      <div><div className="tags"><RiskBadge risk={alert.risk} /><StatusBadge status={alert.status} />{alert.sample && <span className="badge sample">Ejemplo</span>}</div>
        <strong>{catalog.categories[alert.category]}</strong>
        <small className="muted"><MapPin size={13} /> {alert.district} · {ago(alert.occurred_at)}</small></div>
    </div>
    <button className="primary block" onClick={() => go('alerta/' + alert.id)}>Ver detalle <ChevronRight size={17} /></button>
  </div>;
}

const dismissedKey = 'alerta-validate-dismissed';
function ValidatePrompt() {
  const { alerts, position, account, reloadAlerts, catalog } = useApp();
  const [dismissed, setDismissed] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem(dismissedKey) || '[]'); } catch { return []; } });
  const [done, setDone] = useState('');
  const candidate = useMemo(() => {
    if (!position || account?.role !== 'citizen') return null;
    return (alerts || []).find((alert) => alert.status === 'community' && !alert.own && !alert.my_vote && !dismissed.includes(alert.id)
      && distanceKm(position, [alert.latitude, alert.longitude]) <= 1.5) || null;
  }, [alerts, position, account, dismissed]);
  function close() {
    if (!candidate) return;
    const next = [...dismissed, candidate.id];
    setDismissed(next); setDone('');
    try { sessionStorage.setItem(dismissedKey, JSON.stringify(next)); } catch { /* opcional */ }
  }
  if (!candidate) return null;
  return <Modal label="Validar incidente cercano" onClose={close}>
    {done ? <div className="center-stack"><CheckCircle2 size={44} className="ok" /><h2>¡Gracias!</h2><p>{done}</p><button className="primary block" onClick={close}>Continuar</button></div> : <>
      <h2 className="center">¿Este incidente es verdadero?</h2>
      <p className="center muted">{catalog.categories[candidate.category]} en {candidate.district} · {ago(candidate.occurred_at)}</p>
      <p className="center">{candidate.description}</p>
      <div className="mini-map"><MapView compact alerts={[candidate]} centerRequest={{ point: [candidate.latitude, candidate.longitude] }} /></div>
      <p className="center small">Tu respuesta ayuda al equipo a priorizar la revisión. La decisión final la toma moderación.</p>
      <VoteButtons alert={candidate} onVoted={(text) => { setDone(text); reloadAlerts(); }} stacked />
    </>}
  </Modal>;
}

export function VoteButtons({ alert, onVoted, stacked }: { alert: Alert; onVoted: (text: string) => void; stacked?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function vote(answer: 'yes' | 'no' | 'unsure') {
    setBusy(true); setError('');
    try {
      await api('/alerts/' + alert.id + '/vote', 'PUT', { answer });
      onVoted(answer === 'unsure' ? 'Registramos que no estás seguro.' : 'Tu validación quedó registrada. Si coincide con la revisión final ganarás puntos.');
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <>
    <div className={stacked ? 'vote-stack' : 'vote-grid'}>
      <button className={'vote yes' + (alert.my_vote === 'yes' ? ' chosen' : '')} disabled={busy} onClick={() => void vote('yes')}>
        <ThumbsUp size={18} /><span>{stacked ? 'Sí, es verdadero' : 'Es real'}</span>{!stacked && <small>{alert.confirmations} confirmaciones</small>}
      </button>
      <button className={'vote no' + (alert.my_vote === 'no' ? ' chosen' : '')} disabled={busy} onClick={() => void vote('no')}>
        <ThumbsDown size={18} /><span>{stacked ? 'No, es falso' : 'Es falso'}</span>{!stacked && <small>{alert.denials} reportes</small>}
      </button>
      <button className={'vote unsure' + (alert.my_vote === 'unsure' ? ' chosen' : '')} disabled={busy} onClick={() => void vote('unsure')}>
        <HelpCircle size={18} /><span>No estoy seguro</span>
      </button>
    </div>
    <ErrorText>{error}</ErrorText>
  </>;
}

export function FiltersPage() {
  const { catalog, filters, setFilters } = useApp();
  const [draft, setDraft] = useState(filters);
  const toggle = (category: string) => setDraft({ ...draft, categories: draft.categories.includes(category) ? draft.categories.filter((item) => item !== category) : [...draft.categories, category] });
  const rangeIndex = Math.max(0, timeRanges.findIndex(([hours]) => hours === draft.hours));
  return <div className="screen">
    <AppBar title="Filtros avanzados" back={() => history.back()} action={<button className="appbar-text" onClick={() => setDraft({ ...defaultFilters, query: draft.query })}>Limpiar</button>} />
    <div className="content">
      <section className="card">
        <h2 className="card-title">Tipo de incidencia</h2>
        <div className="chip-grid">
          {Object.entries(catalog.categories).map(([id, label]) => <label key={id} className={'chip-tile' + (draft.categories.includes(id) ? ' on' : '')}>
            <input type="checkbox" checked={draft.categories.includes(id)} onChange={() => toggle(id)} />
            <CategoryIcon category={id} size={18} /><span>{label}</span>
          </label>)}
        </div>
      </section>
      <section className="card">
        <h2 className="card-title">Nivel de riesgo</h2>
        <div className="segmented" role="group" aria-label="Nivel de riesgo">
          <button aria-pressed={!draft.risk} onClick={() => setDraft({ ...draft, risk: '' })}>Todos</button>
          {(['high', 'medium', 'low'] as Risk[]).map((risk) => <button key={risk} aria-pressed={draft.risk === risk} onClick={() => setDraft({ ...draft, risk })}>{risks[risk]}</button>)}
        </div>
      </section>
      <section className="card">
        <h2 className="card-title">Rango de tiempo <span className="muted">· últimas {timeRanges[rangeIndex][1]}</span></h2>
        <input className="range" type="range" min={0} max={timeRanges.length - 1} step={1} value={rangeIndex} aria-label="Rango de tiempo"
          aria-valuetext={timeRanges[rangeIndex][1]} onChange={(event) => setDraft({ ...draft, hours: timeRanges[Number(event.target.value)][0] })} />
        <div className="range-labels">{timeRanges.map(([hours, label]) => <span key={hours}>{label}</span>)}</div>
      </section>
      <button className="primary block" onClick={() => { setFilters(draft); history.back(); }}>Aplicar filtros</button>
    </div>
  </div>;
}

export function AlertsPage() {
  const { catalog, alerts, alertsError, reloadAlerts, filters, position, locate, unread, account } = useApp();
  const [locating, setLocating] = useState(false);
  useEffect(() => { if (!position) { setLocating(true); void locate().finally(() => setLocating(false)); } }, []);
  const list = useMemo(() => {
    const items = filterAlerts(alerts || [], filters, catalog).map((alert) => ({ alert, km: position ? distanceKm(position, [alert.latitude, alert.longitude]) : null }));
    return items.sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || b.alert.occurred_at.localeCompare(a.alert.occurred_at));
  }, [alerts, filters, catalog, position]);
  return <div className="screen">
    <AppBar title={position ? 'Alertas cercanas' : 'Alertas recientes'} action={<BellButton unread={unread} onClick={() => go(account ? 'notificaciones' : 'login')} />} />
    <div className="content">
      {!position && <p className="hint"><Navigation size={15} /> {locating ? 'Buscando tu ubicación…' : 'Activa tu ubicación para ordenar las alertas por cercanía.'}</p>}
      <ErrorText retry={reloadAlerts}>{alertsError}</ErrorText>
      {alerts === undefined && !alertsError && <Empty>Cargando alertas…</Empty>}
      {alerts && !list.length && <Empty>No hay alertas con los filtros actuales.</Empty>}
      <div className="stack">
        {list.map(({ alert, km }) => <button key={alert.id} className={'alert-card risk-' + alert.risk} onClick={() => go('alerta/' + alert.id)}>
          <div className="alert-card-main">
            <strong className={'risk-text ' + alert.risk}>Riesgo {risks[alert.risk].toLowerCase()}</strong>
            <span className="alert-card-title"><CategoryIcon category={alert.category} size={16} /> {catalog.categories[alert.category]}</span>
            <small className="muted"><MapPin size={13} /> {alert.district}</small>
            <small className="muted"><Clock3 size={13} /> {ago(alert.occurred_at)}</small>
          </div>
          <div className="alert-card-side"><StatusBadge status={alert.status} />{km !== null && <small>{km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}</small>}</div>
        </button>)}
      </div>
      <button className="secondary block" onClick={() => go('mapa')}>Volver al mapa</button>
    </div>
  </div>;
}

export function AlertDetail({ id }: { id: string }) {
  const { catalog, account, reloadAlerts } = useApp();
  const [alert, setAlert] = useState<Alert>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = () => api<Alert>('/alerts/' + id).then(setAlert, (error) => setError(message(error)));
  useEffect(() => { void load(); }, [id]);
  if (error) return <div className="screen"><AppBar title="Detalle de alerta" back={() => history.back()} /><div className="content"><ErrorText>{error}</ErrorText></div></div>;
  if (!alert) return <div className="screen"><AppBar title="Detalle de alerta" back={() => history.back()} /><div className="content"><Empty>Cargando…</Empty></div></div>;
  return <div className="screen">
    <AppBar title="Detalle de alerta" back={() => history.back()} />
    <div className="detail-hero">
      {alert.photo ? <img src={alert.photo} alt={'Foto de la incidencia: ' + catalog.categories[alert.category]} />
        : <div className={'hero-placeholder ' + alert.risk}><CategoryIcon category={alert.category} size={48} /></div>}
    </div>
    <div className="content">
      <section className="card">
        <div className="tags"><RiskBadge risk={alert.risk} /><StatusBadge status={alert.status} />{alert.sample && <span className="badge sample">Ejemplo ficticio</span>}</div>
        <h2>{catalog.categories[alert.category]}</h2>
        <p className="muted"><MapPin size={14} /> {alert.district} · ubicación aproximada</p>
        <p className="muted"><Clock3 size={14} /> {dateText.format(new Date(alert.occurred_at))} (hora aproximada)</p>
        <h3 className="card-title">Descripción</h3>
        <p>{alert.description}</p>
        <p className="small muted">Resumen redactado por el equipo de moderación para proteger la identidad de las personas.</p>
      </section>
      <section className="card">
        <h3 className="card-title">Validar reporte</h3>
        {alert.status === 'verified' ? <p className="ok-text"><CheckCircle2 size={16} /> El equipo verificó esta alerta. {alert.confirmations} vecinos la confirmaron.</p>
          : alert.own ? <p className="muted">Es tu reporte: otros vecinos pueden validarlo. Llevas {alert.confirmations} confirmaciones y {alert.denials} reportes de falso.</p>
          : !account ? <button className="link" onClick={() => go('login')}>Inicia sesión para validar esta alerta</button>
          : account.role !== 'citizen' ? <p className="muted">El equipo decide desde el portal interno. Votos: {alert.confirmations} reales, {alert.denials} falsos.</p>
          : <>
            <p className="small muted">¿Viste esta incidencia? Tu respuesta ayuda a priorizar la revisión; la decisión final es de moderación.</p>
            <VoteButtons alert={alert} onVoted={(text) => { setNotice(text); void load(); reloadAlerts(); }} />
          </>}
        {notice && <p role="status" className="ok-text">{notice}</p>}
      </section>
      <div className="mini-map"><MapView compact alerts={[alert]} centerRequest={{ point: [alert.latitude, alert.longitude] }} /></div>
    </div>
  </div>;
}

export function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? <CheckCircle2 size={16} className="ok" /> : <XCircle size={16} className="bad" />;
}
