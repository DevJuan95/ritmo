import { useState, type FormEvent } from 'react';
import type { PublicState } from '../../../shared/contracts';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { domainsLocked } from '../view';
import type { RunAction } from '../use-ritmo';

export function DomainsPanel({ state, run }: { state: PublicState; run: RunAction }) {
  const [domain, setDomain] = useState('');
  const locked = domainsLocked(state);
  async function add(event: FormEvent) {
    event.preventDefault();
    if (domain.trim() && await run(() => window.ritmo.addDomain(domain))) setDomain('');
  }
  return <section className="sites-panel" aria-labelledby="sites-heading">
    <div className="sheet-head"><h2 id="sites-heading">Sitios en pausa</h2><p className="section-subtitle">Se bloquean mientras corre el pomodoro.</p></div>
    <div className="domain-list">{state.domains.map(item => <Badge key={item} variant="outline" className="domain-chip">{item}<Button type="button" size="icon-xs" variant="ghost" className="domain-remove" disabled={locked} aria-label={`Quitar ${item}`} onClick={() => void run(() => window.ritmo.removeDomain(item))}>×</Button></Badge>)}</div>
    <form className="inline-form" onSubmit={event => void add(event)}><label className="sr-only" htmlFor="domain-input">Añadir sitio</label><Input id="domain-input" value={domain} onChange={event => setDomain(event.target.value)} placeholder="Añadir dominio, ej. instagram.com" autoComplete="off" inputMode="url" disabled={locked} /><Button size="icon" className="add-button" type="submit" aria-label="Añadir sitio" disabled={locked}>+</Button></form>
    <p className="sites-note">El bloqueo cubre cada dominio y su versión con www. La primera vez requiere autorización de administrador.</p>
  </section>;
}
