import { useEffect, useState, type FormEvent } from 'react';
import type { PublicState, Task } from '../../shared/contracts';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { TaskList } from '../components/task-list';
import { completionText } from '../view';
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

  useEffect(() => {
    let active = true;
    window.ritmo.getTasksForDay(date).then(items => { if (active) setTasks(items); }).catch(error => { if (active) showError(error); });
    return () => { active = false; };
  }, [date, state, showError]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (title.trim() && await run(() => window.ritmo.addTask(title, date))) onTitleChange('');
  }

  return <section className="planner-panel" aria-labelledby="planner-heading">
    <div className="planner-header"><div className="sheet-head"><h2 id="planner-heading">Planner</h2><p className="section-subtitle">Tus tareas permanecen en el día que elegiste hasta que las muevas.</p></div><label className="planner-date-label" htmlFor="planner-date">Día <Input id="planner-date" type="date" value={date} onChange={event => onDateChange(event.target.value)} /></label></div>
    <form className="inline-form planner-form" onSubmit={event => void add(event)}><label className="sr-only" htmlFor="planner-task-input">Nueva tarea para el día elegido</label><Input id="planner-task-input" value={title} onChange={event => onTitleChange(event.target.value)} maxLength={160} placeholder="Añadir tarea para este día…" autoComplete="off" /><Button type="submit">Añadir</Button></form>
    <p className="section-subtitle">{completionText(tasks, '')}</p>
    <TaskList tasks={tasks} planner run={run} />
    {tasks.length === 0 && <p className="empty-state">No hay tareas para este día.</p>}
  </section>;
}
