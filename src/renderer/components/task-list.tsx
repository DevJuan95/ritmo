import { useState } from 'react';
import type { Task } from '../../shared/contracts';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import type { RunAction } from '../use-ritmo';

function TaskRow({ task, planner, run }: { task: Task; planner: boolean; run: RunAction }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  return <li>
    <Checkbox className="task-check" checked={task.done} aria-label={`Completar ${task.title}`} onCheckedChange={checked => void run(() => planner ? window.ritmo.updateTask(task.id, { done: checked === true }) : window.ritmo.toggleTask(task.id))} />
    {editing ? <form className="planner-edit-form" onSubmit={async event => { event.preventDefault(); if (await run(() => window.ritmo.updateTask(task.id, { title }))) setEditing(false); }}>
      <Input value={title} maxLength={160} autoFocus aria-label={`Nuevo título de ${task.title}`} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }} />
      <Button size="sm" type="submit">Guardar</Button><Button size="sm" variant="ghost" className="row-action" type="button" onClick={() => setEditing(false)}>Cancelar</Button>
    </form> : <span className={`task-title ${task.done ? 'done' : ''}`}>{task.title}</span>}
    {planner ? <div className="planner-actions">
      <Button size="sm" variant="ghost" className="row-action" aria-label={`Editar ${task.title}`} onClick={() => { setTitle(task.title); setEditing(true); }}>Editar</Button>
      <Input type="date" className="row-date" value={task.plannedDate} aria-label={`Mover ${task.title} a otro día`} onChange={event => { const plannedDate = event.target.value; if (plannedDate) void run(() => window.ritmo.updateTask(task.id, { plannedDate })); }} />
      <Button size="sm" variant="ghost" className="row-action row-action-danger" aria-label={`Eliminar ${task.title}`} onClick={() => void run(() => window.ritmo.deleteTask(task.id))}>Eliminar</Button>
    </div> : <Button size="icon" variant="ghost" className="task-remove" aria-label={`Eliminar ${task.title}`} onClick={() => void run(() => window.ritmo.deleteTask(task.id))}>×</Button>}
  </li>;
}

export function TaskList({ tasks, planner = false, run }: { tasks: Task[]; planner?: boolean; run: RunAction }) {
  return <ul className={`task-list ${planner ? 'planner-list' : ''}`}>{tasks.map(task => <TaskRow key={task.id} task={task} planner={planner} run={run} />)}</ul>;
}
