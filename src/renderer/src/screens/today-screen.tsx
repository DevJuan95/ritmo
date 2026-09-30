import { useState, type FormEvent } from 'react';
import type { PublicState } from '../../../shared/state/contract';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { DomainsPanel } from '../components/domains-panel';
import { TaskList } from '../components/task-list';
import { TimerPanel } from '../components/timer-panel';
import { completionText } from '../view';
import type { RunAction } from '../use-ritmo';

export function TodayScreen({ state, run }: { state: PublicState; run: RunAction }) {
  const [title, setTitle] = useState('');
  async function add(event: FormEvent) {
    event.preventDefault();
    if (title.trim() && await run(() => window.ritmo.addTask(title))) setTitle('');
  }
  return <div className="dashboard">
    <TimerPanel state={state} run={run} />
    <div className="side-column">
      <section className="tasks-panel" aria-labelledby="tasks-heading">
        <div className="sheet-head"><h2 id="tasks-heading">Plan de hoy</h2><p className="section-subtitle">{completionText(state.tasks, 'Elige lo que importa.')}</p></div>
        <form className="inline-form" onSubmit={event => void add(event)}><label className="sr-only" htmlFor="task-input">Nueva tarea</label><Input id="task-input" value={title} onChange={event => setTitle(event.target.value)} maxLength={160} placeholder="Añadir una tarea…" autoComplete="off" /><Button size="icon" className="add-button" type="submit" aria-label="Añadir tarea">+</Button></form>
        <TaskList tasks={state.tasks} run={run} />
        {state.tasks.length === 0 && <p className="empty-state">Anota una tarea para empezar el día con intención.</p>}
      </section>
      <DomainsPanel state={state} run={run} />
    </div>
  </div>;
}
