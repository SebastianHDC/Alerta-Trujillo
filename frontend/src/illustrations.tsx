/* Ilustraciones SVG propias de Alerta Trujillo: livianas, animadas y sin dependencias externas. */
import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { CategoryIcon } from './components';

// ---------- Parallax: las capas con data-depth siguen al dedo, al mouse o la inclinación del celular ----------
export function Parallax({ children, className = '' }: { children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const set = (x: number, y: number) => {
      element.style.setProperty('--px', x.toFixed(3));
      element.style.setProperty('--py', y.toFixed(3));
    };
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      set((event.clientX - box.left) / box.width - 0.5, (event.clientY - box.top) / box.height - 0.5);
    };
    const tilt = (event: DeviceOrientationEvent) => {
      if (event.gamma === null || event.beta === null) return;
      set(Math.max(-0.5, Math.min(0.5, event.gamma / 60)), Math.max(-0.5, Math.min(0.5, (event.beta - 45) / 60)));
    };
    const reset = () => set(0, 0);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', reset);
    window.addEventListener('deviceorientation', tilt);
    return () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', reset);
      window.removeEventListener('deviceorientation', tilt);
    };
  }, []);
  return <div ref={host} className={'parallax ' + className}>{children}</div>;
}

const depth = (value: number) => ({ '--depth': value } as CSSProperties);

// ---------- Silueta de Trujillo: catedral, casonas con balcones, palmeras y monumento ----------
export function Skyline({ variant = 'line', className = '', width, height }: { variant?: 'line' | 'color' | 'silhouette'; className?: string; width?: number; height?: number }) {
  return <svg className={`skyline skyline-${variant} ${className}`} viewBox="0 0 400 120" width={width} height={height} preserveAspectRatio="xMidYMax slice" aria-hidden>
    <g className="sky-back">
      <path d="M0 120V92h22v-8h18v8h14V80h26v40z" />
      <path d="M300 120V86h16v-6h20v6h18V76h22v12h24v32z" />
    </g>
    <g className="sky-front">
      {/* Casonas con balcones */}
      <path d="M8 120V96h44v24" /><path d="M14 104h12v6H14zM32 104h12v6H32z" className="balcony" />
      <path d="M52 120V90h40v30" /><path d="M58 98h10v8H58zM76 98h10v8H76z" className="balcony" />
      {/* Monumento a la Libertad (columna) */}
      <path d="M112 120v-8h16v8" /><path d="M116 112V62h8v50" /><circle cx="120" cy="56" r="5" />
      {/* Catedral */}
      <path d="M150 120V78h100v42" />
      <path d="M150 78V52h22v26M228 78V52h22v26" />
      <path d="M150 52q11-16 22 0M228 52q11-16 22 0" />
      <path d="M161 36v-6M239 36v-6" />
      <path d="M172 78l28-22 28 22" />
      <path d="M190 120V98q10-12 20 0v22" />
      <circle cx="200" cy="72" r="5" />
      <path d="M156 60h10v10h-10zM234 60h10v10h-10z" className="window" />
      {/* Casonas derecha */}
      <path d="M258 120V94h42v26" /><path d="M264 101h12v7h-12zM282 101h12v7h-12z" className="balcony" />
      <path d="M300 120V100h36v20" /><path d="M306 106h8v8h-8zM322 106h8v8h-8z" className="window" />
      {/* Palmeras */}
      <path d="M100 120q-2-22 2-34M102 86q-12-4-18 2M102 86q10-6 18 0M102 86q-6-10-14-10M102 86q4-10 14-8" className="palm" />
      <path d="M352 120q-2-24 2-38M354 82q-12-4-18 2M354 82q10-6 18 0M354 82q-6-10-14-10M354 82q4-10 14-8" className="palm" />
    </g>
    <path d="M0 119.5h400" className="ground" />
  </svg>;
}

// ---------- Onboarding 1: ciudad informada (mapa con señales en tiempo real) ----------
export function CityLiveArt() {
  return <Parallax className="art">
    <svg viewBox="0 0 320 240" role="img" aria-label="Ciudad con alertas en tiempo real">
      <defs>
        <linearGradient id="sky1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dbe9fb" /><stop offset="1" stopColor="#f6f9fe" /></linearGradient>
      </defs>
      <circle cx="160" cy="120" r="112" fill="url(#sky1)" />
      <g className="layer" style={depth(-10)}>
        <circle cx="250" cy="58" r="16" fill="#ffd166" className="sun" />
        <g className="cloud"><ellipse cx="80" cy="60" rx="24" ry="9" fill="#fff" /><ellipse cx="96" cy="54" rx="14" ry="9" fill="#fff" /></g>
      </g>
      <g className="layer" style={depth(6)}><g transform="translate(-40 96)"><Skyline variant="color" width={400} height={120} /></g></g>
      <g className="layer" style={depth(16)}>
        {[[96, 132, 'high'], [168, 112, 'medium'], [226, 140, 'low']].map(([x, y, risk], index) =>
          <g key={index} transform={`translate(${x} ${y})`} className={'live-pin ' + risk} style={{ animationDelay: `${index * 0.5}s` }}>
            <circle r="16" className="pulse" /><path d="M0 8c-7-7-11-11-11-16a11 11 0 0 1 22 0c0 5-4 9-11 16z" /><circle cy="-8" r="4" fill="#fff" />
          </g>)}
      </g>
    </svg>
  </Parallax>;
}

// ---------- Onboarding 2: reporte rápido desde el celular ----------
export function PhoneReportArt() {
  return <Parallax className="art">
    <svg viewBox="0 0 320 240" role="img" aria-label="Mano con un celular enviando un reporte">
      <circle cx="160" cy="120" r="112" fill="#e7eef7" />
      <g className="layer" style={depth(-8)}>
        <circle cx="160" cy="96" r="70" className="signal" /><circle cx="160" cy="96" r="50" className="signal s2" />
      </g>
      <g className="layer" style={depth(10)}>
        <rect x="118" y="34" width="84" height="150" rx="14" fill="#13233a" />
        <rect x="124" y="46" width="72" height="122" rx="6" fill="#f3f6fa" />
        <path d="M124 90h72M150 46v122M124 130h72" stroke="#d6dfea" strokeWidth="4" />
        <g className="bounce"><path d="M160 108c-8-8-13-13-13-19a13 13 0 0 1 26 0c0 6-5 11-13 19z" fill="#e53935" /><circle cx="160" cy="89" r="5" fill="#fff" /></g>
        <rect x="134" y="148" width="52" height="12" rx="6" fill="#0d3a6b" />
        <path d="M108 196c0-26 8-40 22-44l26-6c8-2 12 10 4 14l-14 6 40-2c10 0 10 14 0 14h-6c8 2 8 14-2 14h-4c6 4 2 14-6 14h-36c-18 0-24-6-24-10z" fill="#f2b38f" />
        <path d="M100 200h46v32h-46z" fill="#0d3a6b" />
      </g>
      <g className="layer" style={depth(18)}>
        <g className="float"><rect x="206" y="60" width="74" height="30" rx="10" fill="#fff" stroke="#dde3ea" /><circle cx="222" cy="75" r="6" fill="#43a047" /><path d="M234 70h36M234 80h24" stroke="#c3cfdd" strokeWidth="4" strokeLinecap="round" /></g>
      </g>
    </svg>
  </Parallax>;
}

// ---------- Onboarding 3: comunidad que valida; los pines responden al toque ----------
export function CommunityArt() {
  const [active, setActive] = useState<number | null>(null);
  const pins: [number, number, string, string][] = [[118, 86, 'high', 'Robo · verificado'], [186, 70, 'medium', 'Sin luz · 4 vecinos'], [214, 128, 'low', 'Vereda · revisión']];
  return <Parallax className="art">
    <svg viewBox="0 0 320 240" role="img" aria-label="Mapa con vecinos validando alertas. Toca un pin.">
      <circle cx="160" cy="120" r="112" fill="#e8f5ea" />
      <g className="layer" style={depth(6)}>
        <path d="M70 70l60-18 60 18 60-18v120l-60 18-60-18-60 18z" fill="#fff" stroke="#c9d7e6" strokeWidth="2" />
        <path d="M130 52v120M190 70v120" stroke="#dde6f0" strokeWidth="2" />
        <path d="M80 140q40-30 80-10t80-20" fill="none" stroke="#9ec1ec" strokeWidth="6" strokeLinecap="round" />
      </g>
      <g className="layer" style={depth(14)}>
        {pins.map(([x, y, risk, label], index) => <g key={index} transform={`translate(${x} ${y})`} className={'live-pin tap ' + risk} role="button" tabIndex={0}
          aria-label={label} onClick={() => setActive(active === index ? null : index)} onKeyDown={(event) => { if (event.key === 'Enter') setActive(index); }}>
          <circle r="18" className="pulse" /><path d="M0 8c-7-7-11-11-11-16a11 11 0 0 1 22 0c0 5-4 9-11 16z" /><circle cy="-8" r="4" fill="#fff" />
          {active === index && <g className="tip"><rect x="-46" y="-48" width="92" height="24" rx="8" fill="#13233a" /><text y="-32" textAnchor="middle" fill="#fff" fontSize="10">{label}</text></g>}
        </g>)}
      </g>
      <g className="layer" style={depth(22)}>
        <g transform="translate(236 150)"><circle r="14" fill="#f2b38f" /><path d="M-22 52q0-34 22-34t22 34z" fill="#e53935" /><circle cx="18" cy="-14" r="10" fill="#43a047" className="pop" /><path d="M13-14l4 4 7-8" stroke="#fff" strokeWidth="3" fill="none" /></g>
        <g transform="translate(78 158)"><circle r="12" fill="#8d5a3b" /><path d="M-20 46q0-30 20-30t20 30z" fill="#1e6fd9" /></g>
      </g>
    </svg>
  </Parallax>;
}

// ---------- Permiso de ubicación: radar ----------
export function RadarArt() {
  return <Parallax className="art">
    <svg viewBox="0 0 320 240" role="img" aria-label="Radar que ubica tu posición">
      <circle cx="160" cy="120" r="112" fill="#e7eef7" />
      <g className="layer" style={depth(8)}>
        {[90, 64, 38].map((r) => <circle key={r} cx="160" cy="120" r={r} fill="none" stroke="#b9cde6" strokeDasharray="4 6" />)}
        <path d="M160 120L160 30A90 90 0 0 1 238 75z" fill="url(#sweep)" className="sweep" />
        <defs><linearGradient id="sweep" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1e6fd9" stopOpacity=".45" /><stop offset="1" stopColor="#1e6fd9" stopOpacity="0" /></linearGradient></defs>
      </g>
      <g className="layer" style={depth(16)}>
        <circle cx="160" cy="120" r="20" fill="#1e6fd9" opacity=".25" className="pulse-soft" /><circle cx="160" cy="120" r="9" fill="#1e6fd9" stroke="#fff" strokeWidth="4" />
        <g className="live-pin high" transform="translate(212 84)"><path d="M0 8c-7-7-11-11-11-16a11 11 0 0 1 22 0c0 5-4 9-11 16z" /></g>
        <g className="live-pin low" transform="translate(110 158)"><path d="M0 8c-7-7-11-11-11-16a11 11 0 0 1 22 0c0 5-4 9-11 16z" /></g>
      </g>
    </svg>
  </Parallax>;
}

// ---------- Éxito y estado vacío ----------
export function SuccessArt() {
  return <svg className="success-art" viewBox="0 0 200 160" role="img" aria-label="Alerta enviada">
    <circle cx="100" cy="80" r="62" fill="#e8f5ea" className="pulse-soft" />
    <path d="M100 30l40 14v30c0 26-18 42-40 52-22-10-40-26-40-52V44z" fill="#2e8b3e" className="pop" />
    <path d="M80 80l14 14 28-30" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" className="draw" />
    {[[30, 40], [168, 52], [40, 126], [164, 120]].map(([x, y], i) => <path key={i} d={`M${x} ${y - 6}v12M${x - 6} ${y}h12`} stroke="#f4b400" strokeWidth="3" strokeLinecap="round" className="twinkle" style={{ animationDelay: `${i * 0.3}s` }} />)}
  </svg>;
}

export function EmptyArt({ text }: { text: string }) {
  return <div className="empty-art">
    <svg viewBox="0 0 160 110" aria-hidden>
      <path d="M20 30l40-12 40 12 40-12v70l-40 12-40-12-40 12z" fill="#fff" stroke="#c9d7e6" strokeWidth="2" />
      <g className="float"><circle cx="92" cy="54" r="20" fill="#e7eef7" stroke="#0d3a6b" strokeWidth="5" /><path d="M106 68l16 16" stroke="#0d3a6b" strokeWidth="7" strokeLinecap="round" /></g>
    </svg>
    <p>{text}</p>
  </div>;
}

// ---------- Portada del detalle de alerta cuando no hay foto pública ----------
export function CategoryScene({ category, risk }: { category: string; risk: string }) {
  return <Parallax className={'category-scene ' + risk}>
    <div className="layer scene-sky" style={depth(-6)} />
    <div className="layer scene-city" style={depth(4)}><Skyline variant="silhouette" /></div>
    <div className="layer scene-badge" style={depth(14)}><span className="scene-pulse" /><CategoryIcon category={category} size={42} /></div>
  </Parallax>;
}
