import { FormEvent, useEffect, useState } from 'react';
import { Copy, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { Role, api, dateText, message, roles } from '../api';
import { Empty, ErrorText, Modal } from '../components';
import { useApp } from '../context';
import { PageHead } from './portal';

type User = {
  id: string; name: string; email: string; role: Role; function: string | null; district: string | null; active: boolean;
  created_at: string; reports: number; reviews: number; owned: number;
};
type UsersResponse = { totals: Partial<Record<Role, number>>; users: User[] };

const permissions: [string, Role[]][] = [
  ['Reportar y validar alertas en la app', ['citizen']],
  ['Revisar datos sensibles y decidir alertas', ['moderator', 'manager']],
  ['Crear y editar recursos de conocimiento', ['moderator', 'manager']],
  ['Aprobar versiones redactadas por otra persona', ['moderator', 'manager']],
  ['Ver indicadores, mapa de conocimiento y reportes', ['moderator', 'manager']],
  ['Crear cuentas del equipo y cambiar roles', ['manager']],
  ['Editar el directorio de contactos', ['manager']],
];

export function UsersPage() {
  const { account, catalog } = useApp();
  const [data, setData] = useState<UsersResponse>();
  const [role, setRole] = useState<Role | ''>('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const canEdit = account?.role === 'manager';
  const load = () => api<UsersResponse>(`/staff/users?${new URLSearchParams({ ...(role ? { role } : {}), q: query })}`).then(setData, (error) => setError(message(error)));
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [role, query]);

  async function save(user: User, change: Partial<Pick<User, 'role' | 'function' | 'active'>>) {
    setError('');
    const next = { ...user, ...change };
    if (next.role !== 'citizen' && !next.function) next.function = Object.keys(catalog.functions)[0];
    try { await api(`/staff/users/${user.id}`, 'PATCH', { role: next.role, function: next.role === 'citizen' ? null : next.function, active: next.active }); await load(); }
    catch (error) { setError(message(error)); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError('');
    try {
      const result = await api<{ user: User; temporary_password: string }>('/staff/users', 'POST', values);
      setCreating(false); setCreated({ email: result.user.email, password: result.temporary_password }); await load();
    } catch (error) { setError(message(error)); }
  }

  return <>
    <PageHead title="M2 · Usuarios y roles" text="Cuentas de vecinos y del equipo, con su rol, función en el SGC y estado de acceso."
      action={canEdit ? <button className="primary" onClick={() => setCreating(true)}><UserPlus size={16} /> Nueva cuenta del equipo</button> : undefined} />
    {!canEdit && <p className="hint">Solo el rol de gestión puede crear cuentas o cambiar roles. Tú puedes consultar la lista.</p>}
    <ErrorText>{error}</ErrorText>
    {data && <div className="stat-row compact">
      {(Object.keys(roles) as Role[]).map((key) => <button key={key} className={'stat clickable' + (role === key ? ' on' : '')} onClick={() => setRole(role === key ? '' : key)}>
        <small>{roles[key]}</small><b>{data.totals[key] || 0}</b></button>)}
    </div>}
    <div className="filter-row">
      <label className="input-icon left"><Search size={15} /><input aria-label="Buscar por nombre o correo" placeholder="Buscar por nombre o correo" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>
    {data && !data.users.length && <Empty>No hay cuentas con esos filtros.</Empty>}
    {data && data.users.length > 0 && <table className="data-table">
      <thead><tr><th>Cuenta</th><th>Rol</th><th>Función en el equipo</th><th className="num">Actividad</th><th>Alta</th><th>Estado</th></tr></thead>
      <tbody>{data.users.map((user) => <tr key={user.id} className={user.active ? '' : 'inactive'}>
        <td><strong>{user.name}</strong><small className="muted block">{user.email}{user.id === account?.id ? ' · tú' : ''}</small></td>
        <td>{canEdit ? <select aria-label={'Rol de ' + user.name} value={user.role} onChange={(event) => void save(user, { role: event.target.value as Role })}>
          {(Object.keys(roles) as Role[]).map((key) => <option key={key} value={key}>{roles[key]}</option>)}</select> : roles[user.role]}</td>
        <td>{user.role === 'citizen' ? <span className="muted">—</span> : canEdit
          ? <select aria-label={'Función de ' + user.name} value={user.function || ''} onChange={(event) => void save(user, { function: event.target.value })}>
            {Object.entries(catalog.functions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          : catalog.functions[user.function || ''] || '—'}</td>
        <td className="num"><small className="muted block">{user.role === 'citizen' ? `${user.reports} reportes` : `${user.reviews} revisiones · ${user.owned} recursos`}</small></td>
        <td><small>{dateText.format(new Date(user.created_at)).split(',')[0]}</small></td>
        <td>{canEdit ? <label className="switch"><input type="checkbox" checked={user.active} onChange={(event) => void save(user, { active: event.target.checked })} />
          <span>{user.active ? 'Activa' : 'Desactivada'}</span></label> : <span className={'badge ' + (user.active ? 'status-verified' : 'status-rejected')}>{user.active ? 'Activa' : 'Desactivada'}</span>}</td>
      </tr>)}</tbody>
    </table>}

    <section className="panel">
      <h2 className="panel-title"><ShieldCheck size={16} /> Matriz de permisos por rol</h2>
      <table className="matrix">
        <thead><tr><th>Permiso</th>{(Object.keys(roles) as Role[]).map((key) => <th key={key}>{roles[key]}</th>)}</tr></thead>
        <tbody>{permissions.map(([label, allowed]) => <tr key={label}><th scope="row">{label}</th>
          {(Object.keys(roles) as Role[]).map((key) => <td key={key} aria-label={allowed.includes(key) ? 'Permitido' : 'No permitido'}>{allowed.includes(key) ? '✔' : '—'}</td>)}</tr>)}</tbody>
      </table>
      <p className="small muted">Reglas: nadie revisa sus propios reportes ni aprueba su propia versión; siempre queda al menos una cuenta de gestión activa; una cuenta desactivada no puede iniciar sesión.</p>
    </section>

    {creating && <Modal label="Nueva cuenta del equipo" onClose={() => setCreating(false)}>
      <h2>Nueva cuenta del equipo</h2>
      <form className="stack" onSubmit={(event) => void create(event)}>
        <label className="field">Nombre visible <input name="name" required minLength={3} maxLength={40} /></label>
        <label className="field">Correo <input name="email" type="email" required /></label>
        <label className="field">Rol <select name="role" defaultValue="moderator"><option value="moderator">Moderación</option><option value="manager">Gestión del conocimiento</option></select></label>
        <label className="field">Función en el equipo <select name="function" defaultValue="validacion">{Object.entries(catalog.functions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <ErrorText>{error}</ErrorText>
        <button className="primary">Crear cuenta</button>
      </form>
    </Modal>}
    {created && <Modal label="Cuenta creada" onClose={() => setCreated(null)}>
      <h2>Cuenta creada</h2>
      <p>Comparte esta contraseña temporal con <b>{created.email}</b> por un canal seguro. No se volverá a mostrar.</p>
      <div className="temp-password"><code>{created.password}</code>
        <button className="secondary" onClick={() => void navigator.clipboard?.writeText(created.password)}><Copy size={15} /> Copiar</button></div>
      <button className="primary block" onClick={() => setCreated(null)}>Listo</button>
    </Modal>}
  </>;
}
