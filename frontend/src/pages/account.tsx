import { FormEvent, ReactElement, useEffect, useState } from 'react';
import {
  AlertTriangle, Award, BookOpen, CheckCircle2, ChevronRight, Download, Eye, EyeOff, Flame, LayoutDashboard, LocateFixed, LogOut, Mail,
  Phone, Share, ShieldCheck, Siren, Star, Trophy, UserRound, XCircle,
} from 'lucide-react';
import { Account, Report, api, ago, dateText, message, roles } from '../api';
import { AppBar, CategoryIcon, Empty, ErrorText, Logo, StatusBadge } from '../components';
import { go, useApp } from '../context';
import { CityLiveArt, CommunityArt, EmptyArt, PhoneReportArt, RadarArt, Skyline } from '../illustrations';
import { isStandalone, useInstall } from '../pwa';

// ---------- Splash y onboarding ----------

export function Splash() {
  return <div className="splash" role="status" aria-label="Cargando Alerta Trujillo">
    <div className="splash-badge"><Logo size={42} /></div>
    <h1>ALERTA TRUJILLO</h1>
    <p>Seguridad ciudadana en tiempo real</p>
    <div className="splash-loader" aria-hidden><i /><i /><i /></div>
    <Skyline variant="line" className="splash-city" />
  </div>;
}

const slides = [
  { art: CityLiveArt, title: 'Mantente informado en tiempo real', text: 'Visualiza reportes ciudadanos cercanos y conoce las zonas con mayor actividad antes de desplazarte.' },
  { art: PhoneReportArt, title: 'Reporta incidentes rápidamente', text: 'Genera alertas georreferenciadas con foto o video en menos de un minuto, directamente desde la cámara.' },
  { art: CommunityArt, title: 'La seguridad comienza con la participación', text: 'Valida reportes de otros vecinos (toca los pines). Un equipo de moderación revisa cada alerta antes de darla por verificada.' },
  { art: RadarArt, title: 'Activa tu ubicación', text: 'Te mostramos las alertas cercanas y ubicamos tus reportes automáticamente. Solo la usamos mientras usas la app y nunca la publicamos exacta.' },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { locate } = useApp();
  const [index, setIndex] = useState(0);
  const [startX, setStartX] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const slide = slides[index];
  const Art = slide.art;
  const last = index === slides.length - 1;
  const goTo = (next: number) => setIndex(Math.max(0, Math.min(slides.length - 1, next)));
  async function enableLocation() {
    setAsking(true);
    await locate();
    setAsking(false);
    onDone();
  }
  return <div className="onboarding" onPointerDown={(event) => setStartX(event.clientX)}
    onPointerUp={(event) => { if (startX !== null && Math.abs(event.clientX - startX) > 50) goTo(index + (event.clientX < startX ? 1 : -1)); setStartX(null); }}>
    <button className="skip" onClick={onDone}>Saltar</button>
    <div className="onboarding-art" key={index}><Art /></div>
    <div className="onboarding-copy" key={'c' + index}>
      <h1>{slide.title}</h1>
      <p>{slide.text}</p>
    </div>
    <div className="dots" role="tablist" aria-label={`Paso ${index + 1} de ${slides.length}`}>
      {slides.map((item, i) => <button key={i} role="tab" aria-selected={i === index} aria-label={item.title} className={i === index ? 'on' : ''} onClick={() => goTo(i)} />)}
    </div>
    {last ? <>
      <button className="primary block" disabled={asking} onClick={() => void enableLocation()}><LocateFixed size={18} /> {asking ? 'Esperando permiso…' : 'Permitir ubicación'}</button>
      <button className="link center" onClick={onDone}>Ahora no</button>
    </> : <button className="primary block" onClick={() => goTo(index + 1)}>Siguiente</button>}
  </div>;
}

// ---------- Acceso ----------

function PasswordInput({ name, autoComplete, placeholder }: { name: string; autoComplete: string; placeholder: string }) {
  const [show, setShow] = useState(false);
  return <div className="input-icon">
    <input name={name} type={show ? 'text' : 'password'} minLength={10} maxLength={128} required autoComplete={autoComplete} placeholder={placeholder} />
    <button type="button" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShow(!show)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
  </div>;
}

export function Login() {
  const { setAccount, catalog } = useApp();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function login(fields: Record<string, FormDataEntryValue>) {
    setBusy(true); setError('');
    try {
      const account = await api<Account>('/auth/login', 'POST', fields);
      setAccount(account);
      go(account.role === 'citizen' ? 'mapa' : 'portal');
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <div className="screen auth-screen">
    <div className="content">
      <div className="brand-card"><Logo size={30} /><div><strong>ALERTA</strong><strong>TRUJILLO</strong></div><Skyline variant="line" className="brand-city" /></div>
      <form className="card" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void login(Object.fromEntries(new FormData(event.currentTarget))); }}>
        <h1 className="card-title">Inicia sesión</h1>
        <label className="field">Correo electrónico <div className="input-icon left"><Mail size={16} /><input name="email" type="email" autoComplete="email" required placeholder="ejemplo@gmail.com" /></div></label>
        <label className="field">Contraseña <PasswordInput name="password" autoComplete="current-password" placeholder="Tu contraseña" /></label>
        <ErrorText>{error}</ErrorText>
        <button className="primary block" disabled={busy}>{busy ? 'Ingresando…' : 'Iniciar sesión'}</button>
        <p className="small muted center">¿Olvidaste tu contraseña? La recuperación por correo llegará en la siguiente versión; mientras tanto, escribe al equipo del proyecto.</p>
      </form>
      {catalog.demo && <div className="card demo-access">
        <strong>Accesos de demostración</strong>
        <div className="demo-buttons">
          <button className="secondary" disabled={busy} onClick={() => void login({ email: 'vecino@example.com', password: 'VecinoDemo26!' })}>Vecino</button>
          <button className="secondary" disabled={busy} onClick={() => void login({ email: 'moderador@example.com', password: 'ModeradorDemo26!' })}>Moderador</button>
          <button className="secondary" disabled={busy} onClick={() => void login({ email: 'gestor@example.com', password: 'GestorDemo26!' })}>Gestor</button>
        </div>
      </div>}
      <p className="center">¿No tienes cuenta? <a href="#/registro">Regístrate</a></p>
      <p className="center"><a href="#/mapa">Continuar sin cuenta</a></p>
    </div>
  </div>;
}

export function Register() {
  const { setAccount, catalog } = useApp();
  const [documentType, setDocumentType] = useState<'dni' | 'pasaporte' | 'ce'>('dni');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (fields.password !== fields.confirm) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true); setError('');
    try {
      setAccount(await api<Account>('/auth/register', 'POST', {
        nickname: fields.nickname, email: fields.email, password: fields.password, document_type: documentType,
        document_number: fields.document_number, district: fields.district || null, accept_terms: fields.accept_terms === 'on',
      }));
      go('mapa');
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <div className="screen">
    <AppBar title="Crear cuenta" back={() => history.back()} />
    <form className="content" onSubmit={submit}>
      <section className="card">
        <h2 className="card-title">Tipo de documento</h2>
        <div className="segmented" role="radiogroup" aria-label="Tipo de documento">
          {([['dni', 'DNI'], ['pasaporte', 'Pasaporte'], ['ce', 'CE']] as const).map(([value, label]) =>
            <button type="button" role="radio" key={value} aria-checked={documentType === value} aria-pressed={documentType === value} onClick={() => setDocumentType(value)}>{label}</button>)}
        </div>
        <label className="field">N.º de documento
          <input name="document_number" required inputMode={documentType === 'dni' ? 'numeric' : 'text'} minLength={documentType === 'dni' ? 8 : 6}
            maxLength={documentType === 'dni' ? 8 : 15} pattern={documentType === 'dni' ? '[0-9]{8}' : '[A-Za-z0-9]{6,15}'} placeholder={documentType === 'dni' ? 'Ej.: 71017888' : 'Número del documento'} />
        </label>
        <p className="small muted"><ShieldCheck size={13} /> Solo lo usamos para evitar cuentas duplicadas: guardamos una huella cifrada, no el número.</p>
        <label className="field">Nickname <input name="nickname" required minLength={3} maxLength={40} placeholder="Así te verán otros vecinos" /></label>
        <label className="field">Distrito (opcional)
          <select name="district" defaultValue=""><option value="">Prefiero no indicarlo</option>{Object.keys(catalog.districts).map((name) => <option key={name}>{name}</option>)}</select>
        </label>
        <label className="field">Correo electrónico <input name="email" type="email" required autoComplete="email" placeholder="ejemplo@gmail.com" /></label>
        <label className="field">Contraseña <PasswordInput name="password" autoComplete="new-password" placeholder="Mínimo 10 caracteres" /></label>
        <label className="field">Confirmar contraseña <PasswordInput name="confirm" autoComplete="new-password" placeholder="Repite tu contraseña" /></label>
        <label className="check"><input type="checkbox" name="accept_terms" required />
          <span>Acepto los <a href="#/guias">términos y la política de privacidad</a>: mis reportes se revisan antes de publicarse y nunca se muestran mis datos personales.</span></label>
      </section>
      <ErrorText>{error}</ErrorText>
      <button className="primary block" disabled={busy}>{busy ? 'Creando…' : 'Registrarme'}</button>
      <p className="center">¿Ya tienes cuenta? <a href="#/login">Inicia sesión</a></p>
    </form>
  </div>;
}

export function RequireAccount({ children }: { children: ReactElement }) {
  const { account } = useApp();
  if (account) return children;
  return <div className="screen"><AppBar title="Alerta Trujillo" /><div className="content center-stack">
    <UserRound size={44} className="muted" /><h2>Inicia sesión para continuar</h2>
    <p className="muted">Necesitas una cuenta para reportar, validar alertas y ver tu actividad.</p>
    <button className="primary block" onClick={() => go('login')}>Iniciar sesión</button>
    <button className="secondary block" onClick={() => go('registro')}>Crear cuenta</button>
  </div></div>;
}

// ---------- Perfil ----------

type Profile = { sent: number; verified: number; in_review: number; votes: number; points: number; top_percent: number; rank: number; ranked: number;
  activity: { kind: 'report' | 'vote'; status?: Report['status']; category: string; district: string; at: string; points: number }[] };

export function ProfilePage() {
  const { account, setAccount, catalog } = useApp();
  const [profile, setProfile] = useState<Profile>();
  const [reports, setReports] = useState<Report[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    api<Profile>('/profile').then(setProfile, (error) => setError(message(error)));
    api<Report[]>('/reports/mine').then(setReports, (error) => setError(message(error)));
  }, []);
  async function logout() {
    try { await api('/auth/logout', 'POST'); setAccount(null); go('mapa'); } catch (error) { setError(message(error)); }
  }
  if (!account) return null;
  const initials = account.name.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  return <div className="screen">
    <header className="profile-head">
      <Skyline variant="line" className="head-city" />
      <span className="avatar">{initials}</span>
      <div><strong>{account.name}</strong><small>{account.district ? `${account.district}, Trujillo` : 'Trujillo'}</small>
        <span className="pill"><ShieldCheck size={13} /> {account.role === 'citizen' ? (profile && profile.sent + profile.votes > 0 ? 'Ciudadano activo' : 'Ciudadano') : roles[account.role]}</span></div>
    </header>
    <div className="content">
      <ErrorText>{error}</ErrorText>
      <section className="card">
        <h2 className="card-title">Resumen de tu participación</h2>
        <div className="stats-grid">
          <div><AlertTriangle size={18} className="bad" /><b>{profile?.sent ?? '–'}</b><small>Alertas enviadas</small></div>
          <div><CheckCircle2 size={18} className="ok" /><b>{profile?.verified ?? '–'}</b><small>Alertas verificadas</small></div>
          <div><Star size={18} className="accent" /><b>{profile?.points ?? '–'}</b><small>Puntos acumulados</small></div>
          <div><Trophy size={18} className="warn" /><b>{!profile ? '–' : profile.ranked >= 10 ? `Top ${profile.top_percent}%` : `#${profile.rank} de ${profile.ranked}`}</b><small>Ranking de vecinos</small></div>
        </div>
        <p className="small muted">Ganas 10 puntos por cada alerta verificada, 2 por validar y 5 extra cuando tu validación coincide con la revisión final.</p>
      </section>
      <section className="card">
        <h2 className="card-title">Actividad reciente</h2>
        {profile && !profile.activity.length && <EmptyArt text="Aún no tienes actividad. Valida una alerta cercana para empezar a sumar puntos." />}
        <ul className="activity">
          {profile?.activity.map((item, index) => <li key={index}>
            {item.kind === 'vote' ? <Flame size={16} className="accent" /> : item.status === 'verified' ? <CheckCircle2 size={16} className="ok" /> : item.status === 'discarded' || item.status === 'rejected' ? <XCircle size={16} className="bad" /> : <Siren size={16} className="warn" />}
            <div><strong>{item.kind === 'vote' ? 'Validaste una alerta' : item.status === 'verified' ? 'Alerta verificada' : 'Alerta enviada'}</strong>
              <small>{catalog.categories[item.category]} en {item.district}</small></div>
            <div className="activity-side"><small>{ago(item.at)}</small>{item.points > 0 && <small className="ok">+{item.points} pts</small>}</div>
          </li>)}
        </ul>
      </section>
      <section className="card">
        <h2 className="card-title">Mis reportes</h2>
        {reports && !reports.length && <EmptyArt text="Todavía no has enviado reportes." />}
        <div className="stack">{reports?.map((report) => <article key={report.id} className="mini-report">
          <CategoryIcon category={report.category} size={18} />
          <div><strong>{catalog.categories[report.category]}</strong><small className="muted">{report.district} · {dateText.format(new Date(report.occurred_at))}</small></div>
          <StatusBadge status={report.status} />
        </article>)}</div>
      </section>
      <nav className="menu-list card">
        <a href="#/notificaciones"><Award size={18} /> Notificaciones <ChevronRight size={16} /></a>
        <a href="#/guias"><BookOpen size={18} /> Guías y privacidad <ChevronRight size={16} /></a>
        <InstallItem />
        {account.role !== 'citizen' && <a href="/#/portal" target={isStandalone() ? '_blank' : undefined} rel="noreferrer"><LayoutDashboard size={18} /> Portal interno (modo web) <ChevronRight size={16} /></a>}
        <button onClick={() => void logout()}><LogOut size={18} /> Cerrar sesión</button>
      </nav>
    </div>
  </div>;
}

// ---------- Notificaciones ----------

type Note = { id: string; kind: string; text: string; report_id: string | null; read: boolean; created_at: string };
const noteIcons: Record<string, ReactElement> = {
  sent: <Siren size={18} className="accent" />, community: <ShieldCheck size={18} className="accent" />, verified: <CheckCircle2 size={18} className="ok" />,
  discarded: <XCircle size={18} className="bad" />, rejected: <XCircle size={18} className="bad" />, points: <Star size={18} className="warn" />, welcome: <Award size={18} className="accent" />,
};

export function NotificationsPage() {
  const { refreshUnread } = useApp();
  const [items, setItems] = useState<Note[]>();
  const [error, setError] = useState('');
  const load = () => api<Note[]>('/notifications').then(setItems, (error) => setError(message(error)));
  useEffect(() => { void load(); }, []);
  async function readAll() {
    try { await api('/notifications/read', 'POST'); await load(); refreshUnread(); } catch (error) { setError(message(error)); }
  }
  return <div className="screen">
    <AppBar title="Notificaciones" back={() => history.back()} />
    <div className="content">
      <ErrorText>{error}</ErrorText>
      {items && !items.length && <EmptyArt text="No tienes notificaciones." />}
      <ul className="notes card">
        {items?.map((item) => <li key={item.id} className={item.read ? '' : 'unread'}>
          {noteIcons[item.kind] || <Award size={18} />}
          <div><p>{item.text}</p><small className="muted">{ago(item.created_at)}</small></div>
        </li>)}
      </ul>
      {items?.some((item) => !item.read) && <button className="link center" onClick={() => void readAll()}>Marcar todas como leídas</button>}
    </div>
  </div>;
}

// ---------- Contactos y guías ----------

type ContactItem = { id: string; name: string; description: string; phone: string; kind: string; verified_at: string | null };

export function ContactsPage() {
  const [items, setItems] = useState<ContactItem[]>();
  const [error, setError] = useState('');
  useEffect(() => { api<ContactItem[]>('/contacts').then(setItems, (error) => setError(message(error))); }, []);
  return <div className="screen">
    <AppBar title="Contactos de emergencia" back={() => history.back()} />
    <div className="content">
      <p className="hint"><Siren size={15} /> Ante una emergencia en curso llama directamente. Alerta Trujillo no reemplaza a los canales oficiales.</p>
      <ErrorText>{error}</ErrorText>
      <div className="contact-grid">
        {items?.map((item) => <article key={item.id} className="card contact">
          <strong>{item.name}</strong>
          <small className="muted">{item.description}</small>
          {item.verified_at ? <a className="primary call" href={'tel:' + item.phone.replace(/\s/g, '')}><Phone size={16} /> {item.phone}</a>
            : <span className="badge status-pending">Número por confirmar</span>}
          <small className="muted tiny">{item.verified_at ? `Verificado el ${new Date(item.verified_at + 'T12:00').toLocaleDateString('es-PE')}` : 'Pendiente de validación con la entidad'}</small>
        </article>)}
      </div>
    </div>
  </div>;
}

type Guide = { id: string; title: string; body: string; version: number; updated_at: string };

export function GuidesPage() {
  const [items, setItems] = useState<Guide[]>();
  const [error, setError] = useState('');
  useEffect(() => { api<Guide[]>('/guides').then(setItems, (error) => setError(message(error))); }, []);
  return <div className="screen">
    <AppBar title="Guías y privacidad" back={() => history.back()} />
    <div className="content">
      <ErrorText>{error}</ErrorText>
      <section className="card guides">
        {items?.map((guide) => <details key={guide.id}><summary>{guide.title}</summary><p>{guide.body}</p>
          <small className="muted">Versión {guide.version} · revisada por el equipo</small></details>)}
        <details><summary>Privacidad de tus datos</summary><p>
          No publicamos tu nombre, correo ni documento. Del documento solo guardamos una huella cifrada para evitar cuentas duplicadas.
          Las alertas muestran un resumen escrito por moderación, una ubicación aproximada (unos 100 m) y la hora redondeada.
          Tus fotos y videos solo los ve el equipo, salvo que moderación publique una foto sin rostros ni placas.
        </p></details>
      </section>
    </div>
  </div>;
}

export function InstallItem() {
  const { canInstall, installed, iosHint, install } = useInstall();
  const [hint, setHint] = useState(false);
  if (installed) return null;
  if (canInstall) return <button className="install-item" onClick={() => void install()}><Download size={18} /> Instalar la app en este dispositivo</button>;
  if (iosHint) return <>
    <button className="install-item" onClick={() => setHint(!hint)}><Download size={18} /> Instalar la app en tu iPhone</button>
    {hint && <p className="small muted">Toca <Share size={13} /> Compartir y luego «Agregar a pantalla de inicio».</p>}
  </>;
  return null;
}
