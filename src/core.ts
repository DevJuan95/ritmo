export const DEFAULT_DOMAINS = ['facebook.com', 'linkedin.com', 'x.com', 'twitter.com'];
export const MINUTES: Record<SessionKind, number> = { focus: 25, shortBreak: 5, longBreak: 15 };

export function normalizeDomain(value: unknown): string {
  const domain = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error('Escribe un dominio válido, por ejemplo instagram.com.');
  }
  return domain;
}

export function normalizeDomains(values: unknown): string[] {
  if (!Array.isArray(values) || values.length > 50) throw new Error('La lista de sitios no es válida.');
  return [...new Set(values.map(normalizeDomain))];
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function safeTaskTitle(value: unknown): string {
  const title = String(value || '').trim().replace(/\s+/g, ' ');
  if (!title || title.length > 160) throw new Error('La tarea debe tener entre 1 y 160 caracteres.');
  return title;
}
