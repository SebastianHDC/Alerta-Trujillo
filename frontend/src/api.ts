export type Position = [number, number];
export type Risk = 'low' | 'medium' | 'high';
export type Status = 'pending' | 'rejected' | 'community' | 'verified' | 'discarded';
export type Role = 'citizen' | 'moderator' | 'manager';
export type Catalog = {
  categories: Record<string, string>;
  districts: Record<string, Position>;
  demo: boolean;
  knowledge_categories: Record<string, string>;
  knowledge_kinds: Record<string, string>;
  checklist: Record<string, string>;
  functions: Record<string, string>;
  max_upload_mb: number;
};
export type Account = { id: string; name: string; email: string; role: Role; district: string | null; function?: string | null };
export type Alert = {
  id: string; category: string; district: string; description: string; latitude: number; longitude: number;
  occurred_at: string; risk: Risk; status: 'community' | 'verified'; sample: boolean;
  confirmations: number; denials: number; unsure: number; photo: string | null; my_vote: string | null; own: boolean;
};
export type Evidence = { id: string; kind: 'photo' | 'video'; url: string };
export type Report = {
  id: string; category: string; district: string; location: string; description: string; latitude: number; longitude: number;
  occurred_at: string; created_at: string; status: Status; risk: Risk | null; public_summary: string | null; show_photo: boolean;
  confirmations: number; denials: number; unsure: number; evidence: Evidence[];
};
export type Filters = { query: string; categories: string[]; risk: Risk | ''; hours: number };
export const defaultFilters: Filters = { query: '', categories: [], risk: '', hours: 720 };

export const risks: Record<Risk, string> = { high: 'Alto', medium: 'Medio', low: 'Bajo' };
export const statuses: Record<Status, string> = {
  pending: 'En revisión', rejected: 'No publicado', community: 'Sin verificar', verified: 'Verificado', discarded: 'Descartado',
};
export const roles: Record<Role, string> = { citizen: 'Ciudadano', moderator: 'Moderación', manager: 'Gestión del conocimiento' };
export const timeRanges: [number, string][] = [[1, '1 h'], [12, '12 h'], [24, '24 h'], [72, '72 h'], [168, '7 días'], [720, '30 días']];

export const dateText = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });
const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
export function ago(value: string) {
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}

export function distanceKm([lat1, lon1]: Position, [lat2, lon2]: Position) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(a));
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la acción.';
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  const form = body instanceof FormData;
  try {
    response = await fetch('/api' + path, {
      method,
      headers: { 'X-Alerta-Client': '1', ...(body === undefined || form ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
  } catch {
    throw new Error('No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(response.status, typeof error?.detail === 'string' ? error.detail : 'La solicitud no se pudo completar.');
  }
  return response.status === 204 ? undefined as T : response.json();
}

export function filterAlerts(alerts: Alert[], filters: Filters, catalog: Catalog) {
  const normalized = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const search = normalized(filters.query.trim());
  return alerts.filter((alert) => (
    (!filters.categories.length || filters.categories.includes(alert.category)) &&
    (!filters.risk || alert.risk === filters.risk) &&
    new Date(alert.occurred_at).getTime() >= Date.now() - filters.hours * 3_600_000 - 3_600_000 &&
    (!search || normalized(alert.district + ' ' + catalog.categories[alert.category] + ' ' + alert.description).includes(search))
  ));
}
