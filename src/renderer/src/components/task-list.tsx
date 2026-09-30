import { useEffect, useState } from 'react';
import type { StudyRoute } from '../../../shared/study/contract';
import { FIRST_PLANNED_DATE, LAST_PLANNED_DATE, type Task } from '../../../shared/tasks/contract';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { ChevronDownIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Input } from './ui/input';
import type { RunAction } from '../use-ritmo';
import { linkFromStage, plannedDateToSave, stageOptions, taskStageLabel, taskStageValue } from '../view';

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

/** Vincula la tarea a una etapa de una ruta de estudio, o la deja suelta: primero la ruta y, en su submenú, la etapa. */
function StageSelect({ task, routes, run }: { task: Task; routes: readonly StudyRoute[]; run: RunAction }) {
  const current = taskStageLabel(routes, task);
  const stageId = taskStageValue(routes, task);
  const link = (value: string) => void run(() => window.ritmo.updateTask(task.id, { link: linkFromStage(routes, value) }));
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger className="row-stage" aria-label={`Etapa de ruta de ${task.title}`} title={current ? `${current.route} · ${current.stage}` : undefined}>
      {current ? <><span className="row-stage-route">{current.route}</span><span className="row-stage-name">{current.stage}</span></> : <span className="row-stage-name">Sin ruta</span>}
      <ChevronDownIcon className="row-stage-chevron" aria-hidden />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="stage-menu">
      <DropdownMenuLabel>Rutas de estudio</DropdownMenuLabel>
      {stageOptions(routes).map(group => <DropdownMenuSub key={group.routeId}>
        <DropdownMenuSubTrigger className={group.routeId === task.routeId && stageId ? 'stage-menu-current' : undefined}>
          <span className="stage-menu-text">{group.label}</span>
          <span className="stage-menu-count">{group.options.length}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="stage-menu">
          {group.options.length === 0 ? <DropdownMenuItem disabled>Sin etapas</DropdownMenuItem>
            : <DropdownMenuRadioGroup value={group.routeId === task.routeId ? stageId : ''} onValueChange={link}>
              {group.options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}><span className="stage-menu-text">{option.label}</span></DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>}
        </DropdownMenuSubContent>
      </DropdownMenuSub>)}
      {current && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => link('')}>Quitar de la ruta</DropdownMenuItem></>}
    </DropdownMenuContent>
  </DropdownMenu>;
}

const NO_ROUTES: readonly StudyRoute[] = [];

export function TaskList({ tasks, planner = false, routes = NO_ROUTES, run }: { tasks: Task[]; planner?: boolean; routes?: readonly StudyRoute[]; run: RunAction }) {
  return <ul className={`task-list ${planner ? 'planner-list' : ''}`}>{tasks.map(task => <TaskRow key={task.id} task={task} planner={planner} routes={routes} run={run} />)}</ul>;
}
