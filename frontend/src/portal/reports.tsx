import { FormEvent, useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Risk, Status, api, dateText, message, risks, statuses } from '../api';
import { Empty, ErrorText, RiskBadge, StatusBadge } from '../components';
import { useApp } from '../context';
import { PageHead } from './portal';

type Row = { id: string; created_at: string; occurred_at: string; category: string; district: string; status: Status; risk: Risk | null;
  confirmations: number; denials: number; evidence: number; hours_to_decision: number | null; guide_applied: boolean; summary: string };
type Data = { generated_at: string; rows: Row[]; summary: { total: number; by_status: Partial<Record<Status, number>>; by_category: [string, number][];
  by_district: [string, number][]; by_risk: Record<string, number>; with_evidence: number; avg_hours: number | null } };

function MiniBars({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(([, value]) => value));
  return <section className="panel"><h2 className="panel-title">{title}</h2>
    {!rows.length ? <Empty>Sin datos.</Empty> : <table className="bars"><tbody>{rows.map(([label, value]) => <tr key={label} title={`${label}: ${value}`}>
      <th scope="row">{label}</th><td><span className="bar" style={{ width: `${(value / max) * 100}%` }} /></td><td className="num">{value}</td></tr>)}</tbody></table>}
  </section>;
}

export function ReportsPage() {
  const { catalog } = useApp();
  const [params, setParams] = useState(new URLSearchParams());
  const [data, setData] = useState<Data>();
  const [error, setError] = useState('');
  useEffect(() => { api<Data>('/staff/reports?' + params).then(setData, (error) => setError(message(error))); }, [params]);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) if (value) next.set(key, String(value));
    setParams(next);
  }
  const period = params.get('start') || params.get('end') ? `${params.get('start') || 'inicio'} a ${params.get('end') || 'hoy'}` : 'Todo el periodo';
  return <>
    <PageHead title="M7 · Reportes" text="Genera reportes de incidencias por periodo, distrito, categoría y estado. Puedes imprimirlos o exportarlos a Excel (CSV)."
      action={<div className="row-gap no-print">
        <a className="secondary" href={'/api/staff/reports.csv?' + params} download><Download size={15} /> Exportar CSV</a>
        <button className="primary" onClick={() => window.print()}><Printer size={15} /> Imprimir / PDF</button></div>} />
    <form className="panel report-filters no-print" onSubmit={apply}>
      <label className="field">Desde <input type="date" name="start" defaultValue={params.get('start') || ''} /></label>
      <label className="field">Hasta <input type="date" name="end" defaultValue={params.get('end') || ''} /></label>
      <label className="field">Distrito <select name="district" defaultValue=""><option value="">Todos</option>{Object.keys(catalog.districts).map((name) => <option key={name}>{name}</option>)}</select></label>
      <label className="field">Categoría <select name="category" defaultValue=""><option value="">Todas</option>{Object.entries(catalog.categories).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="field">Estado <select name="status" defaultValue=""><option value="">Todos</option>{(Object.keys(statuses) as Status[]).map((key) => <option key={key} value={key}>{statuses[key]}</option>)}</select></label>
      <div className="filter-actions"><button className="primary">Generar reporte</button><button type="reset" className="secondary" onClick={() => setParams(new URLSearchParams())}>Limpiar</button></div>
    </form>
    <ErrorText>{error}</ErrorText>
    {data && <article className="report-sheet">
      <header className="print-only"><h1>Alerta Trujillo · Reporte de incidencias</h1></header>
      <p className="muted">{period}{params.get('district') ? ` · ${params.get('district')}` : ''}{params.get('category') ? ` · ${catalog.categories[params.get('category')!]}` : ''}{params.get('status') ? ` · ${statuses[params.get('status') as Status]}` : ''} · generado {dateText.format(new Date(data.generated_at))}</p>
      <div className="stat-row compact">
        <div className="stat"><small>Reportes</small><b>{data.summary.total}</b></div>
        <div className="stat"><small>Verificados</small><b>{data.summary.by_status.verified || 0}</b></div>
        <div className="stat"><small>Sin verificar</small><b>{data.summary.by_status.community || 0}</b></div>
        <div className="stat"><small>En revisión</small><b>{data.summary.by_status.pending || 0}</b></div>
        <div className="stat"><small>Con evidencia</small><b>{data.summary.with_evidence}</b></div>
        <div className="stat"><small>Promedio hasta decisión</small><b>{data.summary.avg_hours === null ? '—' : `${data.summary.avg_hours} h`}</b></div>
      </div>
      <div className="panel-grid">
        <MiniBars title="Por categoría" rows={data.summary.by_category.map(([key, value]) => [catalog.categories[key] || key, value])} />
        <MiniBars title="Por distrito" rows={data.summary.by_district} />
        <MiniBars title="Por nivel de riesgo" rows={(['high', 'medium', 'low'] as Risk[]).map((key) => [risks[key], data.summary.by_risk[key] || 0])} />
      </div>
      {!data.rows.length ? <Empty>No hay reportes con estos filtros.</Empty> : <table className="data-table">
        <thead><tr><th>Recibido</th><th>Categoría</th><th>Distrito</th><th>Estado</th><th>Riesgo</th><th className="num">Votos (sí / no)</th><th className="num">Horas a decisión</th><th>Guía</th><th>Resumen público</th></tr></thead>
        <tbody>{data.rows.map((row) => <tr key={row.id}>
          <td><small>{dateText.format(new Date(row.created_at))}</small></td><td>{catalog.categories[row.category]}</td><td>{row.district}</td>
          <td><StatusBadge status={row.status} /></td><td><RiskBadge risk={row.risk} /></td>
          <td className="num">{row.confirmations} / {row.denials}</td><td className="num">{row.hours_to_decision ?? '—'}</td>
          <td>{row.guide_applied ? 'Sí' : '—'}</td><td><small>{row.summary || <span className="muted">Sin publicar</span>}</small></td>
        </tr>)}</tbody>
      </table>}
      <p className="small muted print-only">La información pública usa ubicación aproximada y resúmenes de moderación. Documento generado por el portal del equipo.</p>
    </article>}
  </>;
}
