import { useState, type FormEvent } from 'react';
import type { PublicState } from '../../shared/contracts';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { domainsLocked } from '../view';
import type { RunAction } from '../use-ritmo';

export function DomainsPanel({ state, run }: { state: PublicState; run: RunAction }) {
  const [domain, setDomain] = useState('');
  const locked = domainsLocked(state);
  async function add(event: FormEvent) {
    event.preventDefault();
    if (domain.trim() && await run(() => window.ritmo.addDomain(domain))) setDomain('');
  }
  return <Card className="sites-panel" aria-labelledby="sites-heading">
    <div className="panel-heading"><div><h2 id="sites-heading">Sitios en pausa</h2><p className="section-subtitle">Se bloquean mientras corre el pomodoro.</p></div><span className="shield-icon" aria-hidden="true">✳</span></div>
    <div className="domain-list">{state.domains.map(item => <Badge key={item} variant="secondary" className="domain-chip">{item}<Button type="button" size="icon" variant="ghost" disabled={locked} aria-label={`Quitar ${item}`} onClick={() => void run(() => window.ritmo.removeDomain(item))}>×</Button></Badge>)}</div>
    <form className="inline-form domain-form" onSubmit={event => void add(event)}><label className="sr-only" htmlFor="domain-input">Añadir sitio</label><Input id="domain-input" value={domain} onChange={event => setDomain(event.target.value)} placeholder="Añadir dominio, ej. instagram.com" autoComplete="off" inputMode="url" disabled={locked} /><Button size="icon" variant="secondary" type="submit" aria-label="Añadir sitio" disabled={locked}>+</Button></form>
    <p className="sites-note">El bloqueo cubre cada dominio y su versión con www. La primera vez requiere autorización de administrador.</p>
  </Card>;
}
