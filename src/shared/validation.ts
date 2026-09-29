import { PublicError } from './contracts';
export const DEFAULT_DOMAINS = ['facebook.com', 'linkedin.com', 'x.com', 'twitter.com'];
export const MINUTES: Record<SessionKind, number> = { focus: 25, shortBreak: 5, longBreak: 15 };

export function normalizeDomain(value: unknown): string {
  const domain = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new PublicError('Escribe un dominio válido, por ejemplo instagram.com.');
  }
  return domain;
}

export function normalizeDomains(values: unknown): string[] {
  if (!Array.isArray(values) || values.length > 50) throw new PublicError('La lista de sitios no es válida.');
  return [...new Set(values.map(normalizeDomain))];
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Rango de días que se pueden planificar. Evita guardar los años intermedios que el campo de
 * fecha produce mientras se escribe el año a mano (0202-… antes de 2026-…).
 */
export const FIRST_PLANNED_DATE = '2000-01-01';
export const LAST_PLANNED_DATE = '2100-12-31';

export function safePlannedDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new PublicError('Fecha inválida.');
  if (value < FIRST_PLANNED_DATE || value > LAST_PLANNED_DATE) throw new PublicError('Elige una fecha entre 2000 y 2100.');
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) throw new PublicError('Fecha inválida.');
  return value;
}

export function safeTaskTitle(value: unknown): string {
  const title = String(value || '').trim().replace(/\s+/g, ' ');
  if (!title || title.length > 160) throw new PublicError('La tarea debe tener entre 1 y 160 caracteres.');
  return title;
}
import type { SessionKind } from './contracts';
