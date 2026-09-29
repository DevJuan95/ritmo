import { useEffect, useState } from 'react';
import type { PublicState } from '../../shared/contracts';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { timerActions, timerView } from '../view';
import type { RunAction } from '../use-ritmo';

export function TimerPanel({ state, run }: { state: PublicState; run: RunAction }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const view = timerView(state, now);
  return <Card className="timer-panel" aria-labelledby="timer-heading">
    <div className="panel-heading"><h2 id="timer-heading">Pomodoro</h2><Badge className="status-pill">{view.status}</Badge></div>
    <div className="timer-stage"><div className="timer-ring" style={{ '--progress': view.progress } as React.CSSProperties}><div className="timer-inner"><span className="timer-kind">{view.kind}</span><span className="timer-value">{view.value}</span><span className="timer-caption">{view.caption}</span></div></div></div>
    <div className="timer-actions">
      {timerActions(state).map(action => <Button key={action.label} variant={action.style === 'primary' ? 'default' : action.style === 'secondary' ? 'outline' : 'ghost'} className={`timer-button-${action.style}`} disabled={state.busy} onClick={() => void run(() => action.run(window.ritmo))}>{action.label}</Button>)}
    </div>
    <p className="timer-note">La primera vez, macOS pedirá permiso para instalar el bloqueo de sitios.</p>
  </Card>;
}
