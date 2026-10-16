import { useEffect, useState, type FormEvent } from 'react';
import type { StudyRoute } from '../../../shared/study/contract';
import { LAST_PLANNED_DATE, type Task } from '../../../shared/tasks/contract';
import type { RunAction } from '../use-ritmo';
import { routeTaskGroups } from '../view';
import { TaskList } from './task-list';
import { Button } from './ui/button';
import { Input } from './ui/input';

/** Tareas guardadas de la ruta, incluidas las pendientes de días anteriores. */
export function RouteTasks({ route, today, tasksVersion, run, onError }: {
  route: StudyRoute; today: string; tasksVersion: number; run: RunAction; onError: (error: unknown) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [date, setDate] = useState(today);
  useEffect(() => setDate(today), [today]);
  const [moving, setMoving] = useState(false);
  const [message, setMessage] = useState('');
  const routeId = route.id;

  useEffect(() => {
    let active = true;
    setFailed(false);
    window.ritmo.getTasksForRoute(routeId).then(items => {
      if (active) setTasks(items);
    }).catch(error => { if (active) { setFailed(true); onError(error); } });
    return () => { active = false; };
  }, [routeId, tasksVersion, retry, onError]);

  async function reschedule(event: FormEvent) {
    event.preventDefault();
    if (moving) return;
    setMoving(true);
    setMessage('');
    try {
      await run(async () => {
        const count = await window.ritmo.rescheduleOverdueTasks(routeId, date);
        setMessage(`${count} ${count === 1 ? 'tarea reagendada' : 'tareas reagendadas'}.`);
      });
    } finally { setMoving(false); }
  }

  const groups = routeTaskGroups(tasks ?? [], today);
  return <section className="route-saved-tasks" aria-labelledby="route-saved-tasks-heading">
    <div className="sheet-head">
      <h3 id="route-saved-tasks-heading">Tareas de esta ruta</h3>
      <p className="section-subtitle">Cambia la fecha de una tarea o reagenda juntas las que quedaron de días anteriores.</p>
    </div>
    {failed ? <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Reintentar cargar tareas</Button>
      : tasks === undefined ? <p role="status">Cargando tareas…</p> : <>
        {groups.overdue.length > 0 && <div>
          <h4>Vencidas · {groups.overdue.length}</h4>
          <form className="route-reschedule" onSubmit={event => void reschedule(event)}>
            <label htmlFor="route-reschedule-date">Nueva fecha</label>
            <Input id="route-reschedule-date" type="date" required min={today} max={LAST_PLANNED_DATE} value={date} onChange={event => setDate(event.target.value)} />
            <Button type="submit" disabled={moving}>{moving ? 'Reagendando…' : 'Reagendar vencidas'}</Button>
          </form>
          <TaskList tasks={groups.overdue} planner routes={[route]} run={run} />
        </div>}
        {groups.pending.length > 0 && <div>
          <h4>Hoy y próximas · {groups.pending.length}</h4>
          <TaskList tasks={groups.pending} planner routes={[route]} run={run} />
        </div>}
        {groups.overdue.length === 0 && groups.pending.length === 0 && <p className="empty-state">No hay tareas pendientes en esta ruta.</p>}
        {groups.completed.length > 0 && <details>
          <summary>Completadas · {groups.completed.length}</summary>
          <TaskList tasks={groups.completed} planner routes={[route]} run={run} />
        </details>}
      </>}
    <p role="status" className="section-subtitle">{message}</p>
  </section>;
}
