import { useEffect, useState } from 'react';
import type { StudyRoute } from '../../../shared/study/contract';
import { FIRST_PLANNED_DATE, LAST_PLANNED_DATE, type Task } from '../../../shared/tasks/contract';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import type { RunAction } from '../use-ritmo';
import { linkFromStage, plannedDateToSave, stageOptions, taskStageValue } from '../view';

function TaskRow({ task, planner, routes, run }: { task: Task; planner: boolean; routes: readonly StudyRoute[]; run: RunAction }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [plannedDate, setPlannedDate] = useState(task.plannedDate);
  useEffect(() => setPlannedDate(task.plannedDate), [task.plannedDate]);
  // El campo de fecha cambia con cada dígito del año; la tarea se mueve al salir del campo o con Enter.
  function movePlannedDate() {
    const next = plannedDateToSave(plannedDate, task.plannedDate);
    if (next) void run(() => window.ritmo.updateTask(task.id, { plannedDate: next }));
    else setPlannedDate(task.plannedDate);
  }
  return <li>
    <Checkbox className="task-check" checked={task.done} aria-label={`Completar ${task.title}`} onCheckedChange={checked => void run(() => planner ? window.ritmo.updateTask(task.id, { done: checked === true }) : window.ritmo.toggleTask(task.id))} />
    {editing ? <form className="planner-edit-form" onSubmit={async event => { event.preventDefault(); if (await run(() => window.ritmo.updateTask(task.id, { title }))) setEditing(false); }}>
      <Input value={title} maxLength={160} autoFocus aria-label={`Nuevo título de ${task.title}`} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }} />
      <Button size="sm" type="submit">Guardar</Button><Button size="sm" variant="ghost" className="row-action" type="button" onClick={() => setEditing(false)}>Cancelar</Button>
    </form> : <span className={`task-title ${task.done ? 'done' : ''}`}>{task.title}</span>}
    {planner ? <div className="planner-actions">
      <Button size="sm" variant="ghost" className="row-action" aria-label={`Editar ${task.title}`} onClick={() => { setTitle(task.title); setEditing(true); }}>Editar</Button>
      {routes.length > 0 && <StageSelect task={task} routes={routes} run={run} />}
      <Input type="date" className="row-date" value={plannedDate} min={FIRST_PLANNED_DATE} max={LAST_PLANNED_DATE} aria-label={`Mover ${task.title} a otro día`} onChange={event => setPlannedDate(event.target.value)} onBlur={movePlannedDate} onKeyDown={event => { if (event.key === 'Enter') movePlannedDate(); }} />
      <Button size="sm" variant="ghost" className="row-action row-action-danger" aria-label={`Eliminar ${task.title}`} onClick={() => void run(() => window.ritmo.deleteTask(task.id))}>Eliminar</Button>
    </div> : <Button size="icon" variant="ghost" className="task-remove" aria-label={`Eliminar ${task.title}`} onClick={() => void run(() => window.ritmo.deleteTask(task.id))}>×</Button>}
  </li>;
}

/** Vincula la tarea a una etapa de una ruta de estudio, o la deja suelta. */
function StageSelect({ task, routes, run }: { task: Task; routes: readonly StudyRoute[]; run: RunAction }) {
  return <select className="row-stage" value={taskStageValue(routes, task)} aria-label={`Etapa de ruta de ${task.title}`}
    onChange={event => void run(() => window.ritmo.updateTask(task.id, { link: linkFromStage(routes, event.target.value) }))}>
    <option value="">Sin ruta</option>
    {stageOptions(routes).map(group => <optgroup key={group.label} label={group.label}>
      {group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </optgroup>)}
  </select>;
}

const NO_ROUTES: readonly StudyRoute[] = [];

export function TaskList({ tasks, planner = false, routes = NO_ROUTES, run }: { tasks: Task[]; planner?: boolean; routes?: readonly StudyRoute[]; run: RunAction }) {
  return <ul className={`task-list ${planner ? 'planner-list' : ''}`}>{tasks.map(task => <TaskRow key={task.id} task={task} planner={planner} routes={routes} run={run} />)}</ul>;
}
