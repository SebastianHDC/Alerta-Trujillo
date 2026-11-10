import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, ClipboardCheck, LayoutDashboard, Phone, RefreshCw, Shield } from 'lucide-react';
import { Report, Risk, api, ago, dateText, message, risks, roles } from '../api';
import { CategoryIcon, Empty, ErrorText, RiskBadge, StatusBadge } from '../components';
import { go, useApp } from '../context';
import { MapView } from '../MapView';
import { KnowledgeEditor, KnowledgeList, useCurrentKnowledge } from './knowledge';
import { isStandalone } from '../pwa';

export function Portal({ section, id }: { section: string; id?: string }) {
  const { account } = useApp();
  if (!account || account.role === 'citizen') {
    return <div className="portal-denied"><Shield size={40} /><h1>Portal interno</h1><p>Disponible para el equipo de moderación y gestión del conocimiento.</p>
      <button className="primary" onClick={() => go(account ? 'mapa' : 'login')}>{account ? 'Volver a la app' : 'Iniciar sesión'}</button></div>;
  }
  const links: [string, string, typeof Shield][] = [
    ['portal', 'Dashboard', LayoutDashboard], ['portal/revision', 'Revisión', ClipboardCheck],
    ['portal/conocimiento', 'Conocimiento', BookOpen], ['portal/contactos', 'Directorio', Phone],
  ];
  const current = section ? 'portal/' + section : 'portal';
  return <div className="portal">
    <aside className="portal-nav">
      <div className="portal-brand"><Shield size={20} /><div><strong>Alerta Trujillo</strong><small>Portal del equipo · modo web</small></div></div>
      <nav>{links.map(([path, label, Icon]) => <a key={path} href={'#/' + path} className={current === path ? 'current' : ''} aria-current={current === path ? 'page' : undefined}><Icon size={18} />{label}</a>)}</nav>
      <div className="portal-user"><strong>{account.name}</strong><small>{roles[account.role]}</small><a href="#/mapa"><ArrowLeft size={14} /> Volver a la app</a></div>
    </aside>
    <main className="portal-main">
      {(isStandalone() || window.matchMedia('(max-width: 700px)').matches) && <div className="hint web-hint">
        El portal del equipo está pensado para usarse en modo web, en una computadora. <a href="/#/portal" target="_blank" rel="noreferrer">Abrir en el navegador</a>
      </div>}
      {section === '' && <Dashboard />}
      {section === 'revision' && <ReviewQueue />}
      {section === 'conocimiento' && (id ? <KnowledgeEditor id={id} /> : <KnowledgeList />)}
      {section === 'contactos' && <ContactsAdmin />}
    </main>
  </div>;
}

function PageHead({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="portal-head"><div><h1>{title}</h1><p className="muted">{text}</p></div>{action}</div>;
}

// ---------- Dashboard gerencial ----------

type DashboardData = {
  generated_at: string;
  totals: Record<'reports' | 'pending' | 'community' | 'verified' | 'discarded' | 'rejected', number>;
  median_hours_to_decision: number | null; community_participation: number | null;
  by_category: [string, number][]; by_district: [string, number][]; pending_age: Record<string, number>; last_30_days: [string, number][];
  knowledge: { current: number; in_review: number; lessons: number; overdue: number; without_backup: number; uses: number; useful_percent: number | null; reused_items: number };
};

function Bars({ title, rows, unit = 'reportes' }: { title: string; rows: [string, number][]; unit?: string }) {
  const max = Math.max(1, ...rows.map(([, value]) => value));
  return <section className="panel">
    <h2 className="panel-title">{title}</h2>
    {!rows.length ? <Empty>Sin datos en el periodo.</Empty> : <table className="bars">
      <caption className="sr-only">{title}</caption>
      <tbody>{rows.map(([label, value]) => <tr key={label} title={`${label}: ${value} ${unit}`}>
        <th scope="row">{label}</th>
        <td><span className="bar" style={{ width: `${(value / max) * 100}%` }} /></td>
        <td className="num">{value}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return <div className="stat"><small>{label}</small><b>{value}</b>{note && <span className="muted tiny">{note}</span>}</div>;
}

function Dashboard() {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState('');
  const load = () => api<DashboardData>('/staff/dashboard').then(setData, (error) => setError(message(error)));
  useEffect(() => { void load(); }, []);
  return <>
    <PageHead title="Dashboard gerencial" text="Volumen, estado de revisión y reutilización del conocimiento. Los datos de demostración son ficticios."
      action={<button className="secondary" onClick={() => void load()}><RefreshCw size={15} /> Actualizar</button>} />
    <ErrorText>{error}</ErrorText>
    {data && <>
      <div className="stat-row">
        <Stat label="Reportes recibidos" value={data.totals.reports} />
        <Stat label="Por revisar (datos sensibles)" value={data.totals.pending} />
        <Stat label="En validación vecinal" value={data.totals.community} />
        <Stat label="Verificados" value={data.totals.verified} note={`${data.totals.discarded} descartados · ${data.totals.rejected} no publicados`} />
        <Stat label="Mediana hasta la decisión" value={data.median_hours_to_decision === null ? '–' : `${data.median_hours_to_decision} h`} />
        <Stat label="Alertas con votos vecinales" value={data.community_participation === null ? '–' : `${data.community_participation}%`} />
      </div>
      <div className="panel-grid">
        <Bars title="Reportes por categoría" rows={data.by_category} />
        <Bars title="Reportes por distrito (top 8)" rows={data.by_district} />
        <Bars title="Antigüedad de casos abiertos" rows={['Menos de 24 h', '1 a 3 días', 'Más de 3 días'].map((key) => [key, data.pending_age[key] || 0])} unit="casos" />
        <Bars title="Reportes de los últimos 30 días" rows={data.last_30_days.map(([day, value]) => [new Date(day + 'T12:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }), value])} />
      </div>
      <h2 className="section-title">Gestión del conocimiento</h2>
      <div className="stat-row">
        <Stat label="Recursos vigentes" value={data.knowledge.current} note={`${data.knowledge.in_review} en revisión`} />
        <Stat label="Lecciones aprendidas" value={data.knowledge.lessons} />
        <Stat label="Usos registrados" value={data.knowledge.uses} note={`${data.knowledge.reused_items} recursos reutilizados`} />
        <Stat label="Usos calificados como útiles" value={data.knowledge.useful_percent === null ? '–' : `${data.knowledge.useful_percent}%`} />
        <Stat label="Revisión vencida" value={data.knowledge.overdue} note="Recursos con fecha de revisión pasada" />
        <Stat label="Sin suplente" value={data.knowledge.without_backup} note="Riesgo de continuidad" />
      </div>
      <p className="small muted">Generado {dateText.format(new Date(data.generated_at))}. Una lectura aislada no prueba reutilización: solo cuentan los usos registrados con decisión y observación.</p>
    </>}
  </>;
}

// ---------- Revisión ----------

type QueueItem = Report & { priority: number; history: { stage: string; decision: string; note: string; at: string; reviewer: string }[] };

function ReviewQueue() {
  const { catalog, reloadAlerts } = useApp();
  const [items, setItems] = useState<QueueItem[]>();
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState('');
  const load = () => api<QueueItem[]>('/staff/queue').then((list) => { setItems(list); setSelectedId((id) => list.some((item) => item.id === id) ? id : list[0]?.id); }, (error) => setError(message(error)));
  useEffect(() => { void load(); }, []);
  const selected = items?.find((item) => item.id === selectedId);
  return <>
    <PageHead title="Revisión de reportes" text="1) Revisa datos sensibles y publica como «Sin verificar». 2) Con los votos vecinales y el contexto, verifica o descarta." />
    <ErrorText retry={() => void load()}>{error}</ErrorText>
    {items && !items.length && <Empty>No hay reportes por revisar. Los reportes que tú enviaste los revisa otra persona.</Empty>}
    {items && items.length > 0 && <div className="review-layout">
      <ul className="queue">{items.map((item) => <li key={item.id}>
        <button className={item.id === selectedId ? 'on' : ''} onClick={() => setSelectedId(item.id)}>
          <CategoryIcon category={item.category} size={18} />
          <div><strong>{catalog.categories[item.category]}</strong><small className="muted">{item.district} · {ago(item.created_at)}</small></div>
          <div className="queue-side"><StatusBadge status={item.status} /><small className="muted">Prioridad {item.priority}</small></div>
        </button>
      </li>)}</ul>
      {selected && <ReviewPanel key={selected.id} item={selected} onDone={() => { void load(); reloadAlerts(); }} />}
    </div>}
  </>;
}

function ReviewPanel({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const { catalog } = useApp();
  const knowledge = useCurrentKnowledge();
  const [publish, setPublish] = useState(true);
  const [checks, setChecks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const screening = item.status === 'pending';
  const photo = item.evidence.some((evidence) => evidence.kind === 'photo');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const guide = values.knowledge_item_id ? String(values.knowledge_item_id) : null;
    const body = screening
      ? publish ? { decision: 'publish', note: values.note, risk: values.risk, public_summary: values.public_summary, show_photo: values.show_photo === 'on', checklist: checks, knowledge_item_id: guide }
        : { decision: 'reject', note: values.note, knowledge_item_id: guide }
      : { decision: values.decision, note: values.note, risk: values.risk || null, knowledge_item_id: guide };
    setBusy(true); setError('');
    try { await api(`/staff/reports/${item.id}/${screening ? 'screening' : 'decision'}`, 'POST', body); onDone(); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <section className="panel review-panel">
    <div className="tags"><StatusBadge status={item.status} /><RiskBadge risk={item.risk} /><span className="badge">Prioridad {item.priority}</span></div>
    <h2>{catalog.categories[item.category]} · {item.district}</h2>
    <p className="muted">{item.location} · ocurrió {dateText.format(new Date(item.occurred_at))} · recibido {ago(item.created_at)}</p>
    <h3 className="panel-title">Texto original (privado)</h3>
    <blockquote>{item.description}</blockquote>
    {item.public_summary && <><h3 className="panel-title">Resumen público</h3><p>{item.public_summary}</p></>}
    {item.evidence.length > 0 && <div className="evidence-row">{item.evidence.map((evidence) => evidence.kind === 'photo'
      ? <a key={evidence.id} href={evidence.url} target="_blank" rel="noreferrer"><img src={evidence.url} alt="Evidencia adjunta" /></a>
      : <video key={evidence.id} src={evidence.url} controls preload="metadata" />)}</div>}
    <div className="review-map"><MapView compact pin={[item.latitude, item.longitude]} /></div>
    {!screening && <p><b>Votos vecinales:</b> {item.confirmations} reales · {item.denials} falsos · {item.unsure} no seguros</p>}
    {item.history.length > 0 && <ul className="history">{item.history.map((entry, index) => <li key={index}><b>{entry.stage === 'screening' ? 'Revisión de datos' : 'Decisión final'}:</b> {entry.decision} — {entry.note} <small className="muted">({entry.reviewer}, {ago(entry.at)})</small></li>)}</ul>}

    <form className="review-form" onSubmit={submit}>
      {screening ? <>
        <div className="segmented" role="group" aria-label="Decisión">
          <button type="button" aria-pressed={publish} onClick={() => setPublish(true)}>Publicar sin verificar</button>
          <button type="button" aria-pressed={!publish} onClick={() => setPublish(false)}>No publicar</button>
        </div>
        {publish && <>
          <fieldset className="checklist"><legend>Lista de control de datos sensibles</legend>
            {Object.entries(catalog.checklist).map(([key, label]) => <label key={key} className="check">
              <input type="checkbox" checked={checks.includes(key)} onChange={(event) => setChecks(event.target.checked ? [...checks, key] : checks.filter((value) => value !== key))} /><span>{label}</span>
            </label>)}
          </fieldset>
          <label className="field">Nivel de riesgo
            <select name="risk" required defaultValue=""><option value="" disabled>Selecciona</option>{(Object.keys(risks) as Risk[]).map((risk) => <option key={risk} value={risk}>{risks[risk]}</option>)}</select>
          </label>
          <label className="field">Resumen público <textarea name="public_summary" required minLength={10} maxLength={200} placeholder="Tipo de hecho + referencia general + franja horaria, sin datos personales." /></label>
          {photo && <label className="check"><input type="checkbox" name="show_photo" /><span>Mostrar la primera foto en la alerta (sin rostros ni placas legibles)</span></label>}
        </>}
      </> : <>
        <label className="field">Decisión final
          <select name="decision" required defaultValue=""><option value="" disabled>Selecciona</option><option value="verified">Verificar</option><option value="discarded">Descartar</option></select>
        </label>
        <label className="field">Ajustar riesgo (opcional)
          <select name="risk" defaultValue=""><option value="">Mantener {item.risk ? risks[item.risk].toLowerCase() : ''}</option>{(Object.keys(risks) as Risk[]).map((risk) => <option key={risk} value={risk}>{risks[risk]}</option>)}</select>
        </label>
      </>}
      <label className="field">Guía aplicada (registra la reutilización)
        <select name="knowledge_item_id" defaultValue=""><option value="">Ninguna</option>{knowledge.map((guide) => <option key={guide.id} value={guide.id}>{guide.title} (v{guide.version})</option>)}</select>
      </label>
      <label className="field">Motivo interno <textarea name="note" required minLength={5} maxLength={300} /></label>
      <ErrorText>{error}</ErrorText>
      <div className="row-between">
        <button className="primary" disabled={busy || (screening && publish && checks.length !== Object.keys(catalog.checklist).length)}>Guardar decisión</button>
        <a href={`#/portal/conocimiento/nuevo?leccion=${item.id}`} className="link">Registrar lección aprendida</a>
      </div>
    </form>
  </section>;
}

// ---------- Directorio ----------

type ContactItem = { id: string; name: string; description: string; phone: string; verified_at: string | null };

function ContactsAdmin() {
  const { account } = useApp();
  const [items, setItems] = useState<ContactItem[]>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const load = () => api<ContactItem[]>('/contacts').then(setItems, (error) => setError(message(error)));
  useEffect(() => { void load(); }, []);
  const canEdit = account?.role === 'manager';
  async function save(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError(''); setSaved('');
    try { await api('/staff/contacts/' + id, 'PUT', { phone: values.phone, description: values.description, verified: values.verified === 'on' }); setSaved(id); void load(); }
    catch (error) { setError(message(error)); }
  }
  return <>
    <PageHead title="Directorio de derivación" text="Competencias y números confirmados con fecha de vigencia. Un número sin verificar no se muestra para llamar." />
    <ErrorText>{error}</ErrorText>
    {!canEdit && <p className="hint">Solo el rol de gestión puede editar el directorio.</p>}
    <div className="panel-grid">{items?.map((item) => <form key={item.id} className="panel" onSubmit={(event) => void save(event, item.id)}>
      <h2 className="panel-title">{item.name}</h2>
      <label className="field">Teléfono <input name="phone" defaultValue={item.phone} disabled={!canEdit} required pattern="[0-9 +\-]{3,20}" /></label>
      <label className="field">Descripción <input name="description" defaultValue={item.description} disabled={!canEdit} required minLength={3} maxLength={160} /></label>
      <label className="check"><input type="checkbox" name="verified" defaultChecked={!!item.verified_at} disabled={!canEdit} /><span>Confirmado con la entidad{item.verified_at ? ` (${item.verified_at})` : ''}</span></label>
      {canEdit && <button className="secondary">Guardar</button>}
      {saved === item.id && <small className="ok-text">Guardado.</small>}
    </form>)}</div>
  </>;
}
