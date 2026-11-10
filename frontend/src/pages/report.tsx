import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { Camera, Crosshair, MapPin, Paperclip, Send, Video, X } from 'lucide-react';
import { Position, Report, api, dateText, message, statuses } from '../api';
import { AppBar, CategoryIcon, ErrorText } from '../components';
import { go, useApp } from '../context';
import { MapView } from '../MapView';

function localTime(offsetMinutes = 0) {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const inPilot = ([lat, lon]: Position) => lat >= -8.35 && lat <= -7.8 && lon >= -79.25 && lon <= -78.55;

export function CreateAlert() {
  const { catalog, locate, reloadAlerts, account } = useApp();
  const firstDistrict = account?.district || Object.keys(catalog.districts)[0];
  const [category, setCategory] = useState('');
  const [district, setDistrict] = useState(firstDistrict);
  const [pin, setPin] = useState<Position>(catalog.districts[firstDistrict]);
  const [center, setCenter] = useState<{ point: Position }>();
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ report: Report; failed: number } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  function move(point: Position, recenter = false) {
    if (!inPilot(point)) { setError('Elige una ubicación dentro de la provincia de Trujillo.'); return; }
    setError(''); setPin(point);
    if (recenter) setCenter({ point });
  }
  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files || []);
    event.target.value = '';
    const tooBig = chosen.find((file) => file.size > (file.type.startsWith('video/') ? 25 : 8) * 1024 * 1024);
    if (tooBig) { setError('Cada foto puede pesar hasta 8 MB y cada video hasta 25 MB.'); return; }
    setFiles((current) => [...current, ...chosen].slice(0, 3));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category) { setError('Selecciona el tipo de incidencia.'); return; }
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try {
      const report = await api<Report>('/reports', 'POST', {
        category, district, location: fields.location, description, latitude: pin[0], longitude: pin[1],
        occurred_at: new Date(String(fields.occurred_at)).toISOString(),
      });
      let failed = 0;
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        await api('/reports/' + report.id + '/evidence', 'POST', form).catch(() => { failed += 1; });
      }
      setSent({ report, failed });
      window.scrollTo(0, 0);
      reloadAlerts();
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }

  if (sent) return <Sent report={sent.report} failed={sent.failed} />;
  return <div className="screen">
    <AppBar title="Crear alerta" back={() => history.back()} />
    <form className="content" onSubmit={submit}>
      <section className="card">
        <h2 className="card-title">Tipo de incidente</h2>
        <div className="category-grid" role="radiogroup" aria-label="Tipo de incidente">
          {Object.entries(catalog.categories).map(([id, label]) => <button type="button" role="radio" aria-checked={category === id} key={id}
            className={'category-tile' + (category === id ? ' on' : '')} onClick={() => setCategory(id)}>
            <CategoryIcon category={id} size={20} /><span>{label}</span>
          </button>)}
        </div>
      </section>
      <section className="card">
        <h2 className="card-title">Ubicación</h2>
        <label className="field">Distrito
          <select value={district} onChange={(event) => { setDistrict(event.target.value); move(catalog.districts[event.target.value], true); }}>
            {Object.keys(catalog.districts).map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <div className="form-map"><MapView pin={pin} centerRequest={center} onPin={(point) => move(point)} compact /></div>
        <div className="row-between">
          <small className="muted"><MapPin size={13} /> Toca el mapa para ajustar el punto.</small>
          <button type="button" className="link" onClick={() => void locate().then((point) => point ? move(point, true) : setError('No se pudo obtener tu ubicación. Usa el mapa.'))}><Crosshair size={14} /> Usar mi ubicación</button>
        </div>
        <label className="field">Referencia del lugar <input name="location" required minLength={3} maxLength={120} placeholder="Ej.: cruce de Av. España con Jr. Pizarro" /></label>
      </section>
      <section className="card">
        <label className="field">Descripción
          <textarea minLength={10} maxLength={300} required value={description} onChange={(event) => setDescription(event.target.value)}
            placeholder="Cuéntanos qué pasó. No incluyas nombres, placas ni datos de otras personas." />
          <small className="char-count">{description.length}/300</small>
        </label>
        <label className="field">Cuándo sucedió <input name="occurred_at" type="datetime-local" defaultValue={localTime()} max={localTime(5)} min={localTime(-30 * 24 * 60)} required /></label>
      </section>
      <section className="card">
        <h2 className="card-title">Adjuntar evidencia <span className="muted">(opcional, hasta 3)</span></h2>
        <div className="evidence-buttons">
          <button type="button" className="secondary" onClick={() => photoInput.current?.click()} disabled={files.length >= 3}><Camera size={17} /> Tomar foto</button>
          <button type="button" className="secondary" onClick={() => videoInput.current?.click()} disabled={files.length >= 3}><Video size={17} /> Grabar video</button>
        </div>
        <input ref={photoInput} hidden type="file" accept="image/*" capture="environment" onChange={addFiles} />
        <input ref={videoInput} hidden type="file" accept="video/mp4,video/webm,video/*" capture="environment" onChange={addFiles} />
        {files.map((file, index) => <div key={index} className="file-chip"><Paperclip size={14} /><span>{file.name}</span>
          <button type="button" aria-label={'Quitar ' + file.name} onClick={() => setFiles(files.filter((_, i) => i !== index))}><X size={14} /></button></div>)}
        <p className="small muted">Las evidencias son privadas: solo las ve el equipo. Una foto se muestra en la alerta únicamente si moderación confirma que no expone rostros ni placas. Eliminamos la ubicación GPS guardada en la foto.</p>
      </section>
      <ErrorText>{error}</ErrorText>
      <button className="primary block" disabled={busy}>{busy ? 'Enviando…' : <><Send size={17} /> Enviar reporte</>}</button>
    </form>
  </div>;
}

function Sent({ report, failed }: { report: Report; failed: number }) {
  const { catalog } = useApp();
  return <div className="screen success-screen">
    <div className="confetti" aria-hidden>{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 8) * 0.15}s` }} />)}</div>
    <div className="content center-stack">
      <div className="success-badge"><Send size={34} /></div>
      <h1>¡Alerta enviada!</h1>
      <p>Gracias por contribuir a un Trujillo más seguro.</p>
      <section className="card summary">
        <h2 className="card-title">Resumen de tu alerta</h2>
        <dl>
          <div><dt>Tipo de incidente</dt><dd><CategoryIcon category={report.category} size={15} /> {catalog.categories[report.category]}</dd></div>
          <div><dt>Ubicación</dt><dd>{report.location}, {report.district}</dd></div>
          <div><dt>Descripción</dt><dd>{report.description}</dd></div>
          <div><dt>Fecha y hora</dt><dd>{dateText.format(new Date(report.occurred_at))}</dd></div>
          <div><dt>Estado</dt><dd>{statuses[report.status]}</dd></div>
        </dl>
      </section>
      <p className="small muted">El equipo revisará que no tenga datos sensibles; luego la comunidad podrá validarla en el mapa.</p>
      {failed > 0 && <p className="error">{failed} archivo(s) no se pudieron adjuntar.</p>}
      <button className="primary block" onClick={() => go('mapa')}>Volver al mapa</button>
      <button className="secondary block" onClick={() => go('perfil')}>Volver a tu perfil</button>
    </div>
  </div>;
}
