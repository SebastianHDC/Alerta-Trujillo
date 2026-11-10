import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, RefreshCw, XCircle } from 'lucide-react';
import { api, dateText, message } from '../api';
import { ErrorText } from '../components';
import { PageHead } from './portal';

type Indicator = { id: string; name: string; group: string; value: number | null; unit: string; target: number; higher_is_better: boolean;
  status: 'ok' | 'alerta' | 'critico' | 'sin_datos'; formula: string };
type Point = { week: string; value: number };
type Data = { generated_at: string; indicators: Indicator[]; series: { received: Point[]; decided: Point[]; uses: Point[] } };

const statusInfo = {
  ok: ['Cumple la meta', CheckCircle2], alerta: ['Cerca de la meta', AlertTriangle], critico: ['Lejos de la meta', XCircle], sin_datos: ['Sin datos', CircleSlash],
} as const;

function WeeklyBars({ title, points }: { title: string; points: Point[] }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const label = (week: string) => new Date(week + 'T12:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  return <figure className="weekly">
    <figcaption>{title}</figcaption>
    <div className="weekly-bars" role="img" aria-label={`${title}: ${points.map((p) => `semana del ${label(p.week)}, ${p.value}`).join('; ')}`}>
      {points.map((p) => <div key={p.week} className="weekly-col" title={`Semana del ${label(p.week)}: ${p.value}`}>
        <span className="weekly-value">{p.value || ''}</span>
        <span className="weekly-bar" style={{ height: `${(p.value / max) * 100}%` }} />
        <small>{label(p.week)}</small>
      </div>)}
    </div>
  </figure>;
}

export function IndicatorsPage() {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState('');
  const load = () => api<Data>('/staff/indicators').then(setData, (error) => setError(message(error)));
  useEffect(() => { void load(); }, []);
  const groups = data ? [...new Set(data.indicators.map((i) => i.group))] : [];
  const counts = data ? data.indicators.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.status]: (acc[i.status] || 0) + 1 }), {}) : {};
  return <>
    <PageHead title="M6 · Indicadores" text="Cada indicador muestra su fórmula, la meta propuesta y un semáforo. Las metas son propuestas del proyecto y se ajustarán con la línea base del piloto."
      action={<button className="secondary" onClick={() => void load()}><RefreshCw size={15} /> Actualizar</button>} />
    <ErrorText>{error}</ErrorText>
    {data && <>
      <div className="stat-row compact">
        {(['ok', 'alerta', 'critico', 'sin_datos'] as const).map((key) => { const [label, Icon] = statusInfo[key];
          return <div key={key} className={'stat light-' + key}><small><Icon size={14} /> {label}</small><b>{counts[key] || 0}</b></div>; })}
      </div>
      {groups.map((group) => <section key={group}>
        <h2 className="section-title">{group}</h2>
        <div className="indicator-grid">{data.indicators.filter((i) => i.group === group).map((indicator) => { const [label, Icon] = statusInfo[indicator.status];
          return <article key={indicator.id} className={'indicator light-' + indicator.status}>
            <header><span className="light-pill"><Icon size={14} /> {label}</span></header>
            <h3>{indicator.name}</h3>
            <div className="indicator-value"><b>{indicator.value === null ? '—' : indicator.value}</b><span>{indicator.unit}</span></div>
            <p className="small">Meta: {indicator.higher_is_better ? '≥' : '≤'} {indicator.target}{indicator.unit}</p>
            {indicator.value !== null && indicator.unit === '%' && <div className="gauge" aria-hidden><span style={{ width: `${Math.min(100, indicator.value)}%` }} /><i style={{ left: `${indicator.target}%` }} /></div>}
            <details><summary>Fórmula</summary><p className="small">{indicator.formula}</p></details>
          </article>; })}</div>
      </section>)}
      <h2 className="section-title">Evolución semanal</h2>
      <div className="panel-grid">
        <section className="panel"><WeeklyBars title="Reportes recibidos por semana" points={data.series.received} /></section>
        <section className="panel"><WeeklyBars title="Decisiones finales por semana" points={data.series.decided} /></section>
        <section className="panel"><WeeklyBars title="Usos del conocimiento por semana" points={data.series.uses} /></section>
      </div>
      <p className="small muted">Calculado {dateText.format(new Date(data.generated_at))} a partir de los datos registrados en la plataforma.</p>
    </>}
  </>;
}
