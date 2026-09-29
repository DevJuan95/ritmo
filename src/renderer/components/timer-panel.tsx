import { useEffect, useState } from 'react';
import type { PublicState } from '../../shared/contracts';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { timerActions, timerView } from '../view';
import type { RunAction } from '../use-ritmo';

const buttonVariant = { primary: 'default', secondary: 'outline', ghost: 'ghost' } as const;

export function TimerPanel({ state, run }: { state: PublicState; run: RunAction }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const view = timerView(state, now);
  return <Card className="timer-panel" data-mode={view.mode} aria-labelledby="timer-heading">
    <div className="timer-head"><h2 id="timer-heading">Pomodoro</h2><Badge variant="outline" className="status-pill">{view.status}</Badge></div>
    <span className="timer-kind">{view.kind}</span>
    <span className="timer-value">{view.value}</span>
    <span className="timer-caption">{view.caption}</span>
    <div className="timer-beats" aria-hidden="true" style={{ '--progress': view.progress, '--beats': view.beats } as React.CSSProperties} />
    <div className="timer-actions">
      {timerActions(state).map(action => <Button key={action.label} variant={buttonVariant[action.style]} className={`timer-button timer-button-${action.style}`} disabled={state.busy} onClick={() => void run(() => action.run(window.ritmo))}>{action.label}</Button>)}
    </div>
    <p className="timer-note">La primera vez, macOS pedirá permiso para instalar el bloqueo de sitios.</p>
  </Card>;
}
