export type Position = [number, number];
export type Risk = 'low' | 'medium' | 'high';
export type Status = 'pending' | 'published' | 'rejected';
export type Page = 'mapa' | 'alertas' | 'reportar' | 'guias' | 'perfil' | 'revision';
export type Catalog = { categories: Record<string, string>; districts: Record<string, Position>; demo: boolean };
export type Account = { id: string; name: string; email: string; role: 'citizen' | 'moderator' };
export type Incident = {
  id: string; category: string; district: string; description: string;
  latitude: number; longitude: number; occurred_at: string;
};
export type Alert = Incident & { risk: Risk; sample: boolean };
export type Report = Incident & { location: string; status: Status };

export const risks: Record<Risk, string> = { high: 'Alto', medium: 'Medio', low: 'Bajo' };
export const statuses: Record<Status, string> = { pending: 'En revisión', published: 'Publicado', rejected: 'No publicado' };
export const dateText = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima',
});

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      method,
      headers: { 'X-Alerta-Client': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
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
