import { ReactNode, useEffect } from 'react';
import {
  ArrowLeft, Bell, Construction, Eye, Flag, Lightbulb, Map as MapIcon, Phone, Plus, Shield, ShieldAlert, Siren, UserRound,
  Wallet, X,
} from 'lucide-react';
import { Risk, Status, risks, statuses } from './api';

export const categoryIcons: Record<string, typeof Shield> = {
  robo: ShieldAlert, hurto: Wallet, sospechoso: Eye, vandalismo: Flag, iluminacion: Lightbulb, via: Construction,
};
export function CategoryIcon({ category, size = 20 }: { category: string; size?: number }) {
  const Icon = categoryIcons[category] || Siren;
  return <Icon size={size} aria-hidden />;
}

export function Logo({ size = 22 }: { size?: number }) {
  return <span className="logo-mark" style={{ width: size * 1.7, height: size * 1.7 }}><Shield size={size} strokeWidth={2.2} /></span>;
}

export function AppBar({ title, back, action }: { title: string; back?: () => void; action?: ReactNode }) {
  return <header className="appbar">
    {back ? <button className="appbar-icon" aria-label="Volver" onClick={back}><ArrowLeft size={20} /></button> : <span className="appbar-spacer" />}
    <h1>{title}</h1>
    {action || <span className="appbar-spacer" />}
  </header>;
}

export function BellButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return <button className="appbar-icon" aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'} onClick={onClick}>
    <Bell size={20} />{unread > 0 && <span className="dot-badge">{unread > 9 ? '9+' : unread}</span>}
  </button>;
}

export function RiskBadge({ risk }: { risk: Risk | null }) {
  if (!risk) return null;
  return <span className={'badge risk-' + risk}>Riesgo {risks[risk].toLowerCase()}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={'badge status-' + status}>{statuses[status]}</span>;
}

export type Tab = 'mapa' | 'contactos' | 'reportar' | 'alertas' | 'perfil';
const tabs: [Tab, string, typeof MapIcon][] = [
  ['mapa', 'Mapa', MapIcon], ['contactos', 'Entidades', Phone], ['reportar', 'Reportar', Plus], ['alertas', 'Alertas', Siren], ['perfil', 'Perfil', UserRound],
];
export function BottomNav({ current }: { current: string }) {
  return <nav className="bottom-nav" aria-label="Navegación principal">
    {tabs.map(([tab, label, Icon]) => tab === 'reportar'
      ? <a key={tab} href="#/reportar" className="fab" aria-label="Reportar incidencia" aria-current={current === tab ? 'page' : undefined}><Plus size={26} /></a>
      : <a key={tab} href={'#/' + tab} className={'tab ' + (current === tab ? 'current' : '')} aria-current={current === tab ? 'page' : undefined}>
        <Icon size={20} /><span>{label}</span>
      </a>)}
  </nav>;
}

export function Modal({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={label} onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
      {children}
    </div>
  </div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function ErrorText({ children, retry }: { children: ReactNode; retry?: () => void }) {
  if (!children) return null;
  return <p className="error" role="alert">{children}{retry && <> <button className="link" onClick={retry}>Reintentar</button></>}</p>;
}
