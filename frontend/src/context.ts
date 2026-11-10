import { createContext, useContext } from 'react';
import { Account, Alert, Catalog, Filters, Position } from './api';

export type AppState = {
  catalog: Catalog;
  account: Account | null;
  setAccount: (account: Account | null) => void;
  alerts: Alert[] | undefined;
  alertsError: string;
  reloadAlerts: () => void;
  filters: Filters;
  setFilters: (filters: Filters) => void;
  position: Position | null;
  locate: () => Promise<Position | null>;
  unread: number;
  refreshUnread: () => void;
};

export const AppContext = createContext<AppState | null>(null);

export function useApp() {
  const state = useContext(AppContext);
  if (!state) throw new Error('AppContext no disponible');
  return state;
}

export function go(path: string) {
  location.hash = '#/' + path.replace(/^\//, '');
}
