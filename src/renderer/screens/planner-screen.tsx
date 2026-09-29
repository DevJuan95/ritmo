import { useEffect, useState, type FormEvent } from 'react';
import { todayKey } from '../../shared/validation';
import type { PublicState, Task } from '../../shared/contracts';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { TaskList } from '../components/task-list';
import { completionText } from '../view';
import type { RunAction } from '../use-ritmo';

export function PlannerScreen({ state, run, showError }: { state: PublicState; run: RunAction; showError: (error: unknown) => void }) {
  const [date, setDate] = useState(todayKey);
  const [title, setTitle] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    let active = true;
    window.ritmo.getTasksForDay(date).then(items => { if (active) setTasks(items); }).catch(error => { if (active) showError(error); });
    return () => { active = false; };
  }, [date, state, showError]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (title.trim() && await run(() => window.ritmo.addTask(title, date))) setTitle('');
  }

  return <Card className="planner-panel" aria-labelledby="planner-heading">
    <div className="planner-header"><div><h2 id="planner-heading">Planner</h2><p className="section-subtitle">Tus tareas permanecen en el día que elegiste hasta que las muevas.</p></div><label className="planner-date-label" htmlFor="planner-date">Día <Input id="planner-date" type="date" value={date} onChange={event => setDate(event.target.value)} /></label></div>
    <form className="planner-form" onSubmit={event => void add(event)}><label className="sr-only" htmlFor="planner-task-input">Nueva tarea para el día elegido</label><Input id="planner-task-input" value={title} onChange={event => setTitle(event.target.value)} maxLength={160} placeholder="Añadir tarea para este día…" autoComplete="off" /><Button variant="secondary" type="submit">Añadir</Button></form>
    <p className="section-subtitle planner-progress">{completionText(tasks, '')}</p>
    <TaskList tasks={tasks} planner run={run} />
    {tasks.length === 0 && <p className="empty-state">No hay tareas para este día.</p>}
  </Card>;
}
