import { useEffect, useState } from 'react';
import { elapsedText } from '../view';
import { Button } from './ui/button';

/** Espera de una petición al agente, con el tiempo que lleva y la cancelación. */
export function AgentWaiting({ text, startedAt, onCancel }: { text: string; startedAt: number; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <div className="proposal-waiting" role="status">
    <span className="proposal-pencil" aria-hidden="true"><i /></span>
    <p>{text} <span className="proposal-elapsed">{elapsedText(now - startedAt)}</span></p>
    <Button type="button" variant="ghost" className="row-action row-action-danger" disabled={cancelling} onClick={() => { setCancelling(true); onCancel(); }}>
      {cancelling ? 'Cancelando…' : 'Cancelar'}
    </Button>
  </div>;
}
