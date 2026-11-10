import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, Search } from 'lucide-react';
import { api, ago, message } from '../api';
import { Empty, ErrorText } from '../components';
import { go, useApp } from '../context';

type Item = {
  id: string; title: string; category: string; kind: string; audience: 'public' | 'internal'; status: 'draft' | 'review' | 'current' | 'obsolete';
  version: number; owner: string; owner_id: string; backup: string | null; backup_id: string | null; review_due: string | null;
  updated_at: string; last_editor_id: string; uses: number;
};
type FullItem = Item & {
  body: string; problem: string | null; action: string | null; result: string | null; limits: string | null; report_id: string | null;
  approved_by: string | null; last_editor: string;
  versions: { version: number; note: string; editor: string; at: string }[];
  use_log: { user: string; version: number; useful: boolean; note: string; report_id: string | null; at: string }[];
};
type Member = { id: string; name: string; role: string };

const itemStatus = { draft: 'Borrador', review: 'En revisión', current: 'Vigente', obsolete: 'Obsoleto' };
const statusClass = { draft: 'pending', review: 'pending', current: 'verified', obsolete: 'rejected' };

export function useCurrentKnowledge() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => { api<Item[]>('/staff/knowledge').then((list) => setItems(list.filter((item) => item.status === 'current')), () => setItems([])); }, []);
  return items;
}

export function KnowledgeList() {
  const { catalog } = useApp();
  const [items, setItems] = useState<Item[]>();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState('');
  useEffect(() => { api<Item[]>('/staff/knowledge').then(setItems, (error) => setError(message(error))); }, []);
  const visible = useMemo(() => (items || []).filter((item) => (!category || item.category === category) && (!kind || item.kind === kind)
    && item.title.toLowerCase().includes(query.trim().toLowerCase())), [items, category, kind, query]);
  return <>
    <div className="portal-head"><div><h1>Base de conocimiento</h1><p className="muted">Guías, manuales, preguntas frecuentes y lecciones aprendidas, con responsable, suplente, versión y fecha de revisión.</p></div>
      <button className="primary" onClick={() => go('portal/conocimiento/nuevo')}><Plus size={16} /> Nuevo recurso</button></div>
    <div className="filter-row">
      <label className="input-icon left"><Search size={15} /><input aria-label="Buscar por título" placeholder="Buscar por título" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <select aria-label="Categoría" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todas las categorías</option>{Object.entries(catalog.knowledge_categories).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      <select aria-label="Tipo" value={kind} onChange={(event) => setKind(event.target.value)}><option value="">Todos los tipos</option>{Object.entries(catalog.knowledge_kinds).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
    </div>
    <ErrorText>{error}</ErrorText>
    {items && !visible.length && <Empty>No hay recursos con esos filtros.</Empty>}
    {visible.length > 0 && <table className="data-table">
      <thead><tr><th>Título</th><th>Tipo</th><th>Categoría</th><th>Estado</th><th>Responsable / suplente</th><th>Revisión</th><th className="num">Usos</th></tr></thead>
      <tbody>{visible.map((item) => <tr key={item.id} onClick={() => go('portal/conocimiento/' + item.id)} className="clickable">
        <td><a href={'#/portal/conocimiento/' + item.id}>{item.title}</a><small className="muted block">v{item.version} · {item.audience === 'public' ? 'Público' : 'Interno'} · {ago(item.updated_at)}</small></td>
        <td>{catalog.knowledge_kinds[item.kind]}</td>
        <td>{catalog.knowledge_categories[item.category]}</td>
        <td><span className={'badge status-' + statusClass[item.status]}>{itemStatus[item.status]}</span></td>
        <td>{item.owner}<small className="muted block">{item.backup || <span className="bad">Sin suplente</span>}</small></td>
        <td className={item.review_due && item.review_due < new Date().toISOString().slice(0, 10) ? 'bad' : ''}>{item.review_due || '–'}</td>
        <td className="num">{item.uses}</td>
      </tr>)}</tbody>
    </table>}
  </>;
}

export function KnowledgeEditor({ id }: { id: string }) {
  const { catalog, account } = useApp();
  const isNew = id.startsWith('nuevo');
  const lessonFor = isNew ? new URLSearchParams(id.split('?')[1] || '').get('leccion') : null;
  const [item, setItem] = useState<FullItem>();
  const [members, setMembers] = useState<Member[]>([]);
  const [kind, setKind] = useState(lessonFor ? 'leccion' : 'guia');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Member[]>('/staff/members').then(setMembers, () => setMembers([]));
    if (!isNew) api<FullItem>('/staff/knowledge/' + id).then((data) => { setItem(data); setKind(data.kind); }, (error) => setError(message(error)));
  }, [id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const text = (key: string) => (values[key] ? String(values[key]) : null);
    const body = {
      title: values.title, category: values.category, kind, audience: kind === 'leccion' ? 'internal' : values.audience, body: text('body') || '',
      problem: text('problem'), action: text('action'), result: text('result'), limits: text('limits'), report_id: text('report_id'),
      owner_id: values.owner_id, backup_id: text('backup_id'), review_due: text('review_due'), change_note: values.change_note,
    };
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await api<FullItem>(isNew ? '/staff/knowledge' : '/staff/knowledge/' + id, isNew ? 'POST' : 'PUT', body);
      if (isNew) go('portal/conocimiento/' + saved.id);
      else { setItem(saved); setNotice('Guardado como nueva versión. Otra persona del equipo debe aprobarla.'); }
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  async function act(path: string, body?: unknown) {
    setError(''); setNotice('');
    try { setItem(await api<FullItem>(`/staff/knowledge/${id}/${path}`, 'POST', body)); setNotice('Cambios registrados.'); }
    catch (error) { setError(message(error)); }
  }
  async function registerUse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    await act('uses', { useful: values.useful === 'yes', note: values.note, report_id: values.report_id || null });
    form.reset();
  }

  if (!isNew && !item) return <><ErrorText>{error}</ErrorText>{!error && <Empty>Cargando…</Empty>}</>;
  const canApprove = item?.status === 'review' && item.last_editor_id !== account?.id;
  return <>
    <div className="portal-head"><div>
      <a href="#/portal/conocimiento" className="link">← Base de conocimiento</a>
      <h1>{isNew ? (kind === 'leccion' ? 'Nueva lección aprendida' : 'Nuevo recurso') : item!.title}</h1>
      {item && <p className="muted"><span className={'badge status-' + statusClass[item.status]}>{itemStatus[item.status]}</span> Versión {item.version} · editada por {item.last_editor}{item.approved_by && ` · aprobada por ${item.approved_by}`}</p>}
    </div>
      {item && <div className="row-gap">
        {item.status === 'review' && <button className="primary" disabled={!canApprove} title={canApprove ? '' : 'La aprueba una persona distinta de quien la redactó'} onClick={() => void act('approve')}><CheckCircle2 size={16} /> Aprobar versión</button>}
        {item.status !== 'obsolete' && <button className="secondary" onClick={() => void act('obsolete')}>Marcar obsoleto</button>}
      </div>}
    </div>
    <ErrorText>{error}</ErrorText>
    {notice && <p className="ok-text" role="status">{notice}</p>}
    <div className="editor-layout">
      <form className="panel" onSubmit={save} key={item?.version ?? 'new'}>
        <div className="field-grid">
          <label className="field">Tipo
            <select value={kind} onChange={(event) => setKind(event.target.value)}>{Object.entries(catalog.knowledge_kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label className="field">Categoría
            <select name="category" defaultValue={item?.category || (lessonFor ? 'aprendizaje' : 'incidencias')}>{Object.entries(catalog.knowledge_categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
        </div>
        <label className="field">Título <input name="title" required minLength={5} maxLength={120} defaultValue={item?.title} /></label>
        {kind === 'leccion' ? <>
          <label className="field">Problema <textarea name="problem" required defaultValue={item?.problem || ''} /></label>
          <label className="field">Acción tomada <textarea name="action" required defaultValue={item?.action || ''} /></label>
          <label className="field">Resultado documentado <textarea name="result" required defaultValue={item?.result || ''} /></label>
          <label className="field">Límites de aplicación <textarea name="limits" required defaultValue={item?.limits || ''} /></label>
          <label className="field">Reporte de origen (ID) <input name="report_id" defaultValue={item?.report_id || lessonFor || ''} /></label>
        </> : <>
          <label className="field">Audiencia
            <select name="audience" defaultValue={item?.audience || 'internal'}><option value="internal">Interno (equipo)</option><option value="public">Público (aparece en Guías de la app)</option></select>
          </label>
          <label className="field">Contenido <textarea name="body" rows={8} required minLength={20} maxLength={6000} defaultValue={item?.body} /></label>
        </>}
        <div className="field-grid">
          <label className="field">Responsable
            <select name="owner_id" required defaultValue={item?.owner_id || account?.id}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
          </label>
          <label className="field">Suplente
            <select name="backup_id" defaultValue={item?.backup_id || ''}><option value="">Sin suplente</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
          </label>
          <label className="field">Próxima revisión <input name="review_due" type="date" defaultValue={item?.review_due || ''} /></label>
        </div>
        <label className="field">Nota del cambio <input name="change_note" required minLength={3} maxLength={200} placeholder={isNew ? 'Versión inicial' : 'Qué cambió y por qué'} /></label>
        <button className="primary" disabled={busy}>{isNew ? 'Crear y enviar a revisión' : 'Guardar nueva versión'}</button>
      </form>
      {item && <aside className="stack">
        <section className="panel">
          <h2 className="panel-title">Registrar uso (transferencia)</h2>
          {item.status !== 'current' ? <p className="muted small">Solo se registran usos de la versión vigente.</p> :
            <form className="stack" onSubmit={(event) => void registerUse(event)}>
              <label className="field">¿Te sirvió? <select name="useful" defaultValue="yes"><option value="yes">Sí</option><option value="no">No, necesita ajustes</option></select></label>
              <label className="field">Reporte relacionado (ID, opcional) <input name="report_id" /></label>
              <label className="field">Observación <textarea name="note" required minLength={3} maxLength={300} placeholder="Qué decidiste con esta guía y qué le faltó" /></label>
              <button className="secondary">Registrar uso</button>
            </form>}
          <ul className="history">{item.use_log.map((use, index) => <li key={index}>{use.useful ? '✔' : '✖'} <b>{use.user}</b> (v{use.version}): {use.note} <small className="muted">{ago(use.at)}</small></li>)}</ul>
        </section>
        <section className="panel">
          <h2 className="panel-title">Historial de versiones</h2>
          <ul className="history">{item.versions.map((version) => <li key={version.version}><b>v{version.version}</b> · {version.note} <small className="muted">({version.editor}, {ago(version.at)})</small></li>)}</ul>
        </section>
      </aside>}
    </div>
  </>;
}
