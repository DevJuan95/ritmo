import { useEffect, useState, type FormEvent } from 'react';
import type { PublicState, Task } from '../../shared/contracts';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { TaskList } from '../components/task-list';
import { FIRST_PLANNED_DATE, LAST_PLANNED_DATE } from '../../shared/validation';
import { completionText, isPlannableDate, tasksRevision } from '../view';
import type { RunAction } from '../use-ritmo';

interface PlannerScreenProps {
  state: PublicState;
  run: RunAction;
  showError: (error: unknown) => void;
  date: string;
  onDateChange: (date: string) => void;
  title: string;
  onTitleChange: (title: string) => void;
}

export function PlannerScreen({ state, run, showError, date, onDateChange, title, onTitleChange }: PlannerScreenProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reload, setReload] = useState(0);
  const revision = tasksRevision(state);
  // Mientras se escribe el año, el campo pasa por días inválidos o fuera de rango: no se piden.
  const validDate = isPlannableDate(date);

  // Las tareas de otros días no llegan en el estado: se piden al elegir el día y
  // después de cada cambio hecho aquí o en la lista de hoy.
  useEffect(() => {
    if (!validDate) { setTasks([]); return; }
    let active = true;
    window.ritmo.getTasksForDay(date).then(items => { if (active) setTasks(items); }).catch(error => { if (active) showError(error); });
    return () => { active = false; };
  }, [date, validDate, revision, reload, showError]);

  const runAndReload: RunAction = async work => {
    const ok = await run(work);
    setReload(count => count + 1);
    return ok;
  };

  async function add(event: FormEvent) {
    event.preventDefault();
    if (validDate && title.trim() && await runAndReload(() => window.ritmo.addTask(title, date))) onTitleChange('');
  }

  return <section className="planner-panel" aria-labelledby="planner-heading">
    <div className="planner-header"><div className="sheet-head"><h2 id="planner-heading">Planner</h2><p className="section-subtitle">Tus tareas permanecen en el día que elegiste hasta que las muevas.</p></div><label className="planner-date-label" htmlFor="planner-date">Día <Input id="planner-date" type="date" value={date} min={FIRST_PLANNED_DATE} max={LAST_PLANNED_DATE} onChange={event => onDateChange(event.target.value)} /></label></div>
    <form className="inline-form planner-form" onSubmit={event => void add(event)}><label className="sr-only" htmlFor="planner-task-input">Nueva tarea para el día elegido</label><Input id="planner-task-input" value={title} onChange={event => onTitleChange(event.target.value)} maxLength={160} placeholder="Añadir tarea para este día…" autoComplete="off" /><Button type="submit" disabled={!validDate}>Añadir</Button></form>
    <p className="section-subtitle">{completionText(tasks, '')}</p>
    <TaskList tasks={tasks} planner run={runAndReload} />
    {tasks.length === 0 && <p className="empty-state">{validDate ? 'No hay tareas para este día.' : 'Elige un día entre 2000 y 2100 para ver sus tareas.'}</p>}
  </section>;
}
