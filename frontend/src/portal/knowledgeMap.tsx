import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api, message, roles, Role } from '../api';
import { ErrorText } from '../components';
import { useApp } from '../context';
import { KindIcon } from './knowledge';
import { PageHead } from './portal';

type Person = { id: string; name: string; role: Role; function: string | null; owned: string[]; backup: string[]; categories: string[] };
type Fn = { id: string; label: string; process: string; category: string; knowledge: string; people: string[] };
type Area = { id: string; label: string; items: number; current: number; uses: number; people: number; functions: string[]; coverage: 'cubierta' | 'dependencia' | 'sin_suplente' | 'sin_recursos' };
type Resource = { id: string; title: string; kind: string; category: string; status: string; owner_id: string; backup_id: string | null; uses: number };
type External = { id: string; label: string; process: string; knowledge: string; category: string };
type MapData = { people: Person[]; functions: Fn[]; areas: Area[]; resources: Resource[]; external: External[] };

const coverage = {
  cubierta: ['Cubierta', 'Hay responsable y suplente distintos.'],
  dependencia: ['Dependencia', 'Todo el conocimiento depende de una sola persona.'],
  sin_suplente: ['Sin suplente', 'Ningún recurso del área tiene suplente.'],
  sin_recursos: ['Sin recursos', 'No hay conocimiento documentado en esta área.'],
};

const W = 860, COL = 210, ROW = 64, TOP = 40;
const X = { person: 6, fn: 325, area: 644 };

export function KnowledgeMapPage() {
  const { catalog } = useApp();
  const [data, setData] = useState<MapData>();
  const [error, setError] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => { api<MapData>('/staff/knowledge-map').then(setData, (error) => setError(message(error))); }, []);

  const graph = useMemo(() => {
    if (!data) return null;
    const people = [...data.people.map((p) => ({ id: p.id, label: p.name, sub: catalog.functions[p.function || ''] || roles[p.role] })),
      ...data.external.map((e) => ({ id: e.id, label: e.label, sub: 'Fuente externa' }))];
    const pos: Record<string, { x: number; y: number }> = {};
    people.forEach((node, i) => { pos[node.id] = { x: X.person, y: TOP + i * ROW }; });
    data.functions.forEach((node, i) => { pos[node.id] = { x: X.fn, y: TOP + i * ROW }; });
    data.areas.forEach((node, i) => { pos[node.id] = { x: X.area, y: TOP + i * ROW + ROW / 2 }; });
    const edges: { from: string; to: string; kind: 'function' | 'process' | 'owns' }[] = [];
    data.people.forEach((p) => {
      if (p.function) edges.push({ from: p.id, to: p.function, kind: 'function' });
      p.categories.forEach((category) => edges.push({ from: p.id, to: category, kind: 'owns' }));
    });
    data.functions.forEach((fn) => edges.push({ from: fn.id, to: fn.category, kind: 'process' }));
    data.external.forEach((e) => edges.push({ from: e.id, to: e.category, kind: 'owns' }));
    const height = TOP + Math.max(people.length, data.functions.length, data.areas.length + 1) * ROW;
    return { people, pos, edges, height };
  }, [data, catalog]);

  const linked = useMemo(() => {
    if (!focus || !graph) return null;
    const set = new Set([focus]);
    graph.edges.forEach((edge) => { if (edge.from === focus) set.add(edge.to); if (edge.to === focus) set.add(edge.from); });
    return set;
  }, [focus, graph]);

  const matches = useMemo(() => {
    if (!data || query.trim().length < 3) return [];
    const term = query.trim().toLowerCase();
    const name = (id: string | null) => data.people.find((p) => p.id === id)?.name;
    const fromResources = data.resources.filter((r) => r.title.toLowerCase().includes(term)).map((r) => ({
      topic: r.title, kind: r.kind, who: name(r.owner_id), backup: name(r.backup_id), area: catalog.knowledge_categories[r.category] }));
    const fromFunctions = data.functions.filter((f) => (f.knowledge + ' ' + f.process + ' ' + f.label).toLowerCase().includes(term)).map((f) => ({
      topic: f.knowledge, kind: '', who: f.people.map(name).join(', ') || 'Sin persona asignada', backup: null, area: f.label }));
    return [...fromResources, ...fromFunctions].slice(0, 8);
  }, [data, query, catalog]);

  const detail = focus && data ? (
    data.areas.find((a) => a.id === focus) ? { type: 'area' as const, area: data.areas.find((a) => a.id === focus)! }
      : data.functions.find((f) => f.id === focus) ? { type: 'fn' as const, fn: data.functions.find((f) => f.id === focus)! }
      : data.people.find((p) => p.id === focus) ? { type: 'person' as const, person: data.people.find((p) => p.id === focus)! }
      : data.external.find((e) => e.id === focus) ? { type: 'external' as const, external: data.external.find((e) => e.id === focus)! } : null
  ) : null;

  const nodeClass = (id: string) => 'kmap-node' + (linked ? (linked.has(id) ? ' lit' : ' dim') : '') + (focus === id ? ' focus' : '');
  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const x1 = a.x + COL, y1 = a.y + 22, x2 = b.x, y2 = b.y + 22, mid = (x1 + x2) / 2;
    return `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
  };

  return <>
    <PageHead title="M5 · Mapa de conocimiento" text="Quién tiene cada conocimiento, en qué función y proceso, y qué áreas dependen de una sola persona. Toca un nodo para ver sus conexiones." />
    <ErrorText>{error}</ErrorText>
    <div className="filter-row">
      <label className="input-icon left"><Search size={15} /><input aria-label="¿A quién pregunto?" placeholder="¿A quién pregunto? Escribe un tema: duplicados, indicadores, privacidad…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>
    {matches.length > 0 && <section className="panel ask">
      <h2 className="panel-title">¿A quién pregunto sobre «{query.trim()}»?</h2>
      <ul>{matches.map((match, index) => <li key={index}>{match.kind && <KindIcon kind={match.kind} />} <span>{match.topic}</span>
        <small className="muted">{match.area}</small><b>{match.who || '—'}</b>{match.backup && <small>suplente: {match.backup}</small>}</li>)}</ul>
    </section>}
    {graph && data && <div className="kmap-layout">
      <div className="panel kmap-panel">
        <svg viewBox={`0 0 ${W} ${graph.height}`} className="kmap" role="img" aria-label="Mapa de conocimiento: personas, funciones y áreas">
          <text x={X.person} y={20} className="kmap-col">Personas y grupos</text>
          <text x={X.fn} y={20} className="kmap-col">Funciones y procesos</text>
          <text x={X.area} y={20} className="kmap-col">Áreas de conocimiento</text>
          {graph.edges.map((edge, index) => {
            const a = graph.pos[edge.from], b = graph.pos[edge.to];
            if (!a || !b) return null;
            if (edge.kind === 'owns' && edge.from !== focus && edge.to !== focus) return null;
            const from = a;
            const lit = linked ? linked.has(edge.from) && linked.has(edge.to) && (edge.from === focus || edge.to === focus) : false;
            return <path key={index} d={edge.kind === 'owns' ? curve(from, { x: X.area, y: b.y }) : curve(a, b)}
              className={`kmap-edge ${edge.kind}${lit ? ' lit' : ''}${linked && !lit ? ' dim' : ''}`} />;
          })}
          {graph.people.map((node) => { const p = graph.pos[node.id]; return <g key={node.id} className={nodeClass(node.id) + (node.id === 'vecinos' ? ' external' : ' person')} tabIndex={0} role="button"
            aria-label={node.label} onClick={() => setFocus(focus === node.id ? null : node.id)} onKeyDown={(event) => { if (event.key === 'Enter') setFocus(node.id); }}>
            <rect x={p.x} y={p.y} width={COL} height={46} rx={12} /><circle cx={p.x + 22} cy={p.y + 23} r={13} className="avatar-dot" />
            <text x={p.x + 22} y={p.y + 28} textAnchor="middle" className="avatar-text">{node.label.split(' ').map((w) => w[0]).join('').slice(0, 2)}</text>
            <text x={p.x + 44} y={p.y + 20} className="kmap-label">{node.label}</text><text x={p.x + 44} y={p.y + 36} className="kmap-sub">{node.sub}</text></g>; })}
          {data.functions.map((node) => { const p = graph.pos[node.id]; return <g key={node.id} className={nodeClass(node.id) + ' fn' + (node.people.length ? '' : ' empty')} tabIndex={0} role="button"
            aria-label={node.label} onClick={() => setFocus(focus === node.id ? null : node.id)} onKeyDown={(event) => { if (event.key === 'Enter') setFocus(node.id); }}>
            <rect x={p.x} y={p.y} width={COL} height={46} rx={12} />
            <text x={p.x + 14} y={p.y + 20} className="kmap-label">{node.label}</text><text x={p.x + 14} y={p.y + 36} className="kmap-sub">{node.process}{node.people.length ? '' : ' · sin persona'}</text></g>; })}
          {data.areas.map((node) => { const p = graph.pos[node.id]; return <g key={node.id} className={nodeClass(node.id) + ' area ' + node.coverage} tabIndex={0} role="button"
            aria-label={`${node.label}: ${coverage[node.coverage][0]}`} onClick={() => setFocus(focus === node.id ? null : node.id)} onKeyDown={(event) => { if (event.key === 'Enter') setFocus(node.id); }}>
            <rect x={p.x} y={p.y} width={COL} height={46} rx={12} /><circle cx={p.x + COL - 16} cy={p.y + 16} r={6} className="cov-dot" />
            <text x={p.x + 14} y={p.y + 20} className="kmap-label">{node.label}</text><text x={p.x + 14} y={p.y + 36} className="kmap-sub">{node.items} recursos · {node.people} personas · {node.uses} usos</text></g>; })}
        </svg>
        <div className="kmap-legend">
          <span><i className="ln function" /> Cumple la función</span><span><i className="ln process" /> El proceso usa el área</span><span><i className="ln owns" /> Es responsable o suplente (al seleccionar)</span>
          {Object.entries(coverage).map(([key, [label]]) => <span key={key}><i className={'cov ' + key} /> {label}</span>)}
        </div>
      </div>
      <aside className="panel kmap-detail">
        {!detail && <><h2 className="panel-title">Cómo leer el mapa</h2><p className="small muted">Selecciona una persona, función o área. Se resaltan sus conexiones y aquí verás el conocimiento crítico, los recursos y el riesgo de continuidad.</p>
          <ul className="risk-list">{data.areas.filter((a) => a.coverage !== 'cubierta').map((a) => <li key={a.id}><i className={'cov ' + a.coverage} /> <b>{a.label}</b>: {coverage[a.coverage][1]}</li>)}
            {data.functions.filter((f) => !f.people.length).map((f) => <li key={f.id}><i className="cov sin_recursos" /> <b>{f.label}</b>: función sin persona asignada.</li>)}</ul></>}
        {detail?.type === 'area' && <AreaDetail area={detail.area} data={data} />}
        {detail?.type === 'fn' && <><small className="muted">Función</small><h2>{detail.fn.label}</h2><p><b>Proceso:</b> {detail.fn.process}</p>
          <p><b>Conocimiento crítico:</b> {detail.fn.knowledge}</p>
          <p><b>Personas:</b> {detail.fn.people.map((id) => data.people.find((p) => p.id === id)?.name).join(', ') || 'Ninguna asignada'}</p></>}
        {detail?.type === 'person' && <><small className="muted">{roles[detail.person.role]}</small><h2>{detail.person.name}</h2>
          <p><b>Función:</b> {catalog.functions[detail.person.function || ''] || '—'}</p>
          <ResourceList title="Responsable de" ids={detail.person.owned} data={data} />
          <ResourceList title="Suplente de" ids={detail.person.backup} data={data} /></>}
        {detail?.type === 'external' && <><small className="muted">Fuente externa</small><h2>{detail.external.label}</h2>
          <p><b>Proceso:</b> {detail.external.process}</p><p><b>Conocimiento:</b> {detail.external.knowledge}</p>
          <p className="small muted">Se captura con la validación vecinal y el enlace de participación (socialización en el modelo SECI).</p></>}
      </aside>
    </div>}
    {data && <section className="panel">
      <h2 className="panel-title">Tabla del mapa de conocimiento (informe, tabla 9)</h2>
      <table className="data-table plain">
        <thead><tr><th>Persona o grupo</th><th>Área de participación</th><th>Proceso relacionado</th><th>Conocimiento crítico</th></tr></thead>
        <tbody>
          {data.external.map((e) => <tr key={e.id}><td>{e.label}</td><td>{catalog.knowledge_categories[e.category]}</td><td>{e.process}</td><td>{e.knowledge}</td></tr>)}
          {data.functions.map((f) => <tr key={f.id}><td>{f.people.map((id) => data.people.find((p) => p.id === id)?.name).join(', ') || <span className="bad">Sin asignar</span>}</td>
            <td>{f.label}</td><td>{f.process}</td><td>{f.knowledge}</td></tr>)}
        </tbody>
      </table>
    </section>}
  </>;
}

function ResourceList({ title, ids, data }: { title: string; ids: string[]; data: MapData }) {
  if (!ids.length) return <p className="small muted">{title}: ningún recurso.</p>;
  return <><h3 className="panel-title">{title}</h3><ul className="mini-list">{ids.map((id) => { const r = data.resources.find((item) => item.id === id)!;
    return <li key={id}><KindIcon kind={r.kind} /> <a href={'#/portal/conocimiento/' + id}>{r.title}</a> <small className="muted">{r.uses} usos</small></li>; })}</ul></>;
}

function AreaDetail({ area, data }: { area: Area; data: MapData }) {
  const items = data.resources.filter((r) => r.category === area.id);
  const name = (id: string | null) => data.people.find((p) => p.id === id)?.name || '—';
  return <><small className="muted">Área de conocimiento</small><h2>{area.label}</h2>
    <p><span className={'badge cov-badge ' + area.coverage}>{coverage[area.coverage][0]}</span> {coverage[area.coverage][1]}</p>
    <p className="small">{area.current} vigentes de {area.items} · {area.uses} usos registrados</p>
    <ul className="mini-list">{items.map((r) => <li key={r.id}><KindIcon kind={r.kind} /> <a href={'#/portal/conocimiento/' + r.id}>{r.title}</a>
      <small className="muted block">{name(r.owner_id)} · suplente: {name(r.backup_id)}</small></li>)}</ul></>;
}
