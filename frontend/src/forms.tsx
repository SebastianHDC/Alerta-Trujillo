import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleHelp, Crosshair, LockKeyhole, MapPin, ShieldCheck } from 'lucide-react';
import { Account, Catalog, Position, Report, Risk, api, dateText, risks, statuses } from './api';
import { MapView } from './MapView';

function message(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la acción.';
}

export function AccountForm({ onAccount, demo }: { onAccount: (account: Account) => void; demo: boolean }) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function authenticate(path: string, fields: Record<string, FormDataEntryValue>) {
    setBusy(true);
    setError('');
    try { onAccount(await api<Account>(path, 'POST', fields)); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void authenticate(register ? '/auth/register' : '/auth/login', Object.fromEntries(new FormData(event.currentTarget)));
  }
  return <section className="panel auth-panel">
    <div className="section-icon"><LockKeyhole size={22} /></div>
    <h2>{register ? 'Crea tu cuenta' : 'Inicia sesión'}</h2>
    <p className="muted">Accede para enviar reportes y consultar su estado.</p>
    <form className="field-stack" onSubmit={submit}>
      {register && <label>Nombre <input name="name" autoComplete="name" required minLength={2} maxLength={80} /></label>}
      <label>Correo electrónico <input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <label>Contraseña <input name="password" type="password" minLength={10} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>{register ? 'Crear cuenta' : 'Entrar'} <ArrowRight size={17} /></button>
    </form>
    <button type="button" className="text-button" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Ya tengo una cuenta' : 'Crear una cuenta'}</button>
    {demo && <div className="demo-login">
      <span>Accesos de demostración</span>
      <button type="button" className="secondary" disabled={busy} onClick={() => void authenticate('/auth/login', { email: 'vecino@example.com', password: 'VecinoDemo26!' })}>Vecino</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => void authenticate('/auth/login', { email: 'moderador@example.com', password: 'ModeradorDemo26!' })}>Moderador</button>
    </div>}
  </section>;
}

function localTime() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function ReportForm({ catalog, onDone }: { catalog: Catalog; onDone: (report: Report) => void }) {
  const firstDistrict = Object.keys(catalog.districts)[0];
  const [district, setDistrict] = useState(firstDistrict);
  const [pin, setPin] = useState(catalog.districts[firstDistrict]);
  const [centerRequest, setCenterRequest] = useState<{ point: Position }>();
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function move(point: Position, center = false) {
    if (point[0] < -8.35 || point[0] > -7.8 || point[1] < -79.25 || point[1] > -78.55) {
      setError('Elige una ubicación dentro del área del piloto de Trujillo.');
      return;
    }
    setError('');
    setPin(point);
    if (center) setCenterRequest({ point });
  }
  function locate() {
    if (!navigator.geolocation) { setError('La ubicación automática no está disponible. Puedes usar el mapa.'); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => move([coords.latitude, coords.longitude], true),
      () => setError('No se pudo obtener tu ubicación. Puedes elegir el punto en el mapa.'),
      { timeout: 8000 },
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      const report = await api<Report>('/reports', 'POST', {
        ...fields, latitude: pin[0], longitude: pin[1], occurred_at: new Date(String(fields.occurred_at)).toISOString(),
      });
      onDone(report);
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <form className="panel form-panel field-stack" onSubmit={submit}>
    <div className="form-intro"><div className="section-icon"><MapPin size={22} /></div><div><h2>Datos de la incidencia</h2><p className="muted">Tu reporte entrará a revisión antes de que pueda verse en el mapa.</p></div></div>
    <div className="field-grid">
      <label>Tipo de incidencia <select name="category" required defaultValue=""><option value="" disabled>Selecciona una categoría</option>{Object.entries(catalog.categories).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Distrito <select name="district" value={district} onChange={(event) => {
        setDistrict(event.target.value); move(catalog.districts[event.target.value], true);
      }}>{Object.keys(catalog.districts).map((name) => <option key={name}>{name}</option>)}</select></label>
    </div>
    <label>Referencia del lugar <input name="location" required minLength={3} maxLength={120} placeholder="Por ejemplo, cerca de una intersección" /></label>
    <div className="form-map"><MapView pin={pin} centerRequest={centerRequest} onPin={move} /></div>
    <div className="form-map-caption"><small>El punto inicial es aproximado. Toca el mapa para ajustarlo.</small><button type="button" className="text-button" onClick={locate}><Crosshair size={15} /> Usar mi ubicación</button></div>
    <label>Fecha y hora del hecho <input name="occurred_at" type="datetime-local" defaultValue={localTime()} max={localTime()} required /></label>
    <label>Descripción <textarea name="description" minLength={10} maxLength={200} required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe qué ocurrió sin incluir nombres ni datos personales." /><small className="char-count">{description.length}/200</small></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar a revisión'} <ArrowRight size={17} /></button>
  </form>;
}

export function Sent({ report, catalog, onMap, onProfile }: { report: Report; catalog: Catalog; onMap: () => void; onProfile: () => void }) {
  return <section className="panel form-panel sent">
    <CheckCircle2 size={42} /><h2>Reporte recibido</h2>
    <p>Podrás seguir su estado en tu perfil. La información solo se publica tras una revisión.</p>
    <dl><div><dt>Incidencia</dt><dd>{catalog.categories[report.category]}</dd></div><div><dt>Distrito</dt><dd>{report.district}</dd></div><div><dt>Estado</dt><dd>{statuses[report.status]}</dd></div></dl>
    <div className="action-row"><button className="primary" onClick={onProfile}>Ver mis reportes</button><button className="secondary" onClick={onMap}>Volver al mapa</button></div>
  </section>;
}

export function ReportList({ catalog, moderation = false }: { catalog: Catalog; moderation?: boolean }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<Report[]>(moderation ? '/moderation/reports' : '/reports/mine').then(
      (items) => { if (active) setReports(items); },
      (error) => { if (active) setError(message(error)); },
    );
    return () => { active = false; };
  }, [moderation]);
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!reports) return <p className="panel empty" role="status">Cargando reportes…</p>;
  if (!reports.length) return <p className="panel empty">{moderation ? 'No hay reportes pendientes de otros usuarios.' : 'Todavía no has enviado reportes.'}</p>;
  return <div className="report-stack">{reports.map((report) => (
    <article className="panel report-item" key={report.id}>
      <div className="report-heading"><h3>{catalog.categories[report.category]}</h3><span className={'badge status-' + report.status}>{statuses[report.status]}</span></div>
      <p className="muted">{report.district} · {report.location} · {dateText.format(new Date(report.occurred_at))}</p>
      <p>{report.description}</p>
      {moderation && <ReviewForm report={report} onDone={() => setReports((current) => current?.filter((item) => item.id !== report.id) ?? null)} />}
    </article>
  ))}</div>;
}

function ReviewForm({ report, onDone }: { report: Report; onDone: () => void }) {
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const note = values.get('note');
    const decision = publish
      ? { status: 'published', note, risk: values.get('risk'), public_summary: values.get('public_summary') }
      : { status: 'rejected', note };
    setBusy(true);
    try { await api('/moderation/reports/' + report.id, 'PATCH', decision); onDone(); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <form className="field-stack review-form" onSubmit={submit}>
    <label>Decisión <select value={publish ? 'yes' : 'no'} onChange={(event) => setPublish(event.target.value === 'yes')}><option value="yes">Publicar</option><option value="no">No publicar</option></select></label>
    {publish && <>
      <label>Nivel de riesgo <select name="risk" required defaultValue=""><option value="" disabled>Selecciona según la revisión</option>{Object.entries(risks).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label>Resumen público <textarea name="public_summary" minLength={10} maxLength={200} required placeholder="Redacta un resumen sin nombres, domicilios exactos ni datos que identifiquen personas." /></label>
    </>}
    <label>Motivo interno <textarea name="note" minLength={5} maxLength={300} required /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary" disabled={busy}><ShieldCheck size={17} /> Guardar decisión</button>
  </form>;
}

export function Guides() {
  const guides = [
    { title: 'Cómo describir una incidencia', body: 'Indica qué ocurrió, cuándo y una referencia que permita identificar el sector. Describe lo que observaste y evita incluir datos personales de otras personas.' },
    { title: 'Cómo se publica un reporte', body: 'Un moderador revisa la categoría y el contexto. Si el caso se publica, el mapa muestra un punto aproximado y un resumen redactado para la consulta pública.' },
    { title: 'Qué significa una confirmación', body: 'Una respuesta vecinal aporta contexto para el equipo. El nivel de riesgo se asigna durante la revisión y el mapa muestra únicamente los reportes publicados.' },
    { title: 'Qué hacer en una emergencia', body: 'Busca un lugar seguro y contacta directamente a los servicios de emergencia por los canales oficiales. Los reportes de esta aplicación se revisan posteriormente.' },
  ];
  return <section className="panel form-panel guide-panel"><div className="section-icon"><CircleHelp size={23} /></div><h2>Orientación para vecinos</h2><p className="muted">Guía inicial del proyecto · Versión 1</p>
    {guides.map((guide) => <details key={guide.title}><summary>{guide.title}</summary><p>{guide.body}</p></details>)}
  </section>;
}
