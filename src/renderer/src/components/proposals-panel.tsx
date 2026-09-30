import { useEffect, useState } from 'react';
import { AGENT_NAMES, type StudyProvider, type StudyRoute } from '../../../shared/study/contract';
import { FIRST_PLANNED_DATE, LAST_PLANNED_DATE, MAX_TASK_TITLE } from '../../../shared/tasks/contract';
import type { ProposalsController } from '../use-proposals';
import type { RunAction } from '../use-ritmo';
import {
  acceptableProposals, agentNoticeText, elapsedText, oneAtATime, pomodorosText, proposalProblem, proposalsSummary, proposalStageLabel, relativeDayLabel,
  withoutProposals, withProposal, type ProposalDraft, type ProposalGate
} from '../view';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface ProposalsPanelProps {
  route: StudyRoute;
  provider: StudyProvider;
  gate: ProposalGate;
  today: string;
  controller: ProposalsController;
  run: RunAction;
  /** Tema de la ruta con una petición en curso, si no es esta. */
  busyWith: string | undefined;
  onAcceptNotice: () => Promise<boolean>;
  /** Se añadieron tareas al Planner: el avance de las etapas cambió. */
  onTasksAdded: () => void;
}

/**
 * Tareas que propone el agente para la ruta: se piden con un botón, se revisan una a una (título,
 * etapa y día) y las aceptadas se añaden al Planner vinculadas a su etapa. Las propuestas van «a
 * lápiz» hasta que se pasan a tinta en el Planner.
 */
export function ProposalsPanel({ route, provider, gate, today, controller, run, busyWith, onAcceptNotice, onTasksAdded }: ProposalsPanelProps) {
  const { request, propose, cancel, update } = controller;
  const items = controller.proposals[route.id] ?? [];
  const waiting = request?.routeId === route.id;
  const [busy, setBusy] = useState(false);
  const [exclusive] = useState(() => oneAtATime(setBusy));
  const name = AGENT_NAMES[provider];
  const pending = items.filter(item => item.acceptedOn === null);
  const ready = acceptableProposals(items, route);
  const blocked = gate.kind === 'blocked' ? gate.reason : busyWith ? `Espera a que terminen las propuestas de «${busyWith}».` : null;

  async function start() {
    if (gate.kind === 'blocked' || busyWith || request) return;
    if (gate.kind === 'notice' && !await onAcceptNotice()) return;
    await propose(route, today);
  }

  async function add(targets: readonly ProposalDraft[]) {
    await exclusive(async () => {
      let added = 0;
      for (const item of targets) {
        const ok = await run(() => window.ritmo.addTask(item.title, item.plannedDate, { routeId: route.id, stageId: item.stageId }));
        if (!ok) break;
        added += 1;
        update(route.id, current => withProposal(current, item.key, { acceptedOn: item.plannedDate }));
      }
      if (added) onTasksAdded();
    });
  }

  const change = (key: string, patch: Parameters<typeof withProposal>[2]) => update(route.id, current => withProposal(current, key, patch));
  const discard = (keys: string[]) => update(route.id, current => withoutProposals(current, keys));

  return <section className="proposal-sheet" aria-labelledby="proposals-heading" aria-busy={waiting}>
    <div className="proposal-head">
      <div className="sheet-head">
        <h3 id="proposals-heading" className="planner-day-heading">Próximas tareas</h3>
        <p className="section-subtitle">{items.length ? proposalsSummary(items) : `${name} propone tareas según las etapas, tus instrucciones y lo que ya hiciste.`}</p>
      </div>
      {!waiting && <Button type="button" className="proposal-request" disabled={!!blocked || !!request || busy} onClick={() => void start()}>
        {gate.kind === 'notice' ? 'Aceptar y proponer tareas' : items.length ? 'Proponer otras' : 'Proponer tareas'}
      </Button>}
    </div>

    {gate.kind === 'notice' && !waiting && <p className="proposal-notice" role="note">{agentNoticeText(provider)}</p>}
    {blocked && !waiting && <p className="proposal-blocked" aria-live="polite">{blocked}</p>}
    {gate.kind === 'ready' && !blocked && !waiting && <p className="proposal-privacy">
      Se envía esta ruta a {name} solo al pulsar el botón.{pending.length > 0 && ' Pedir otras reemplaza las que no hayas añadido.'}
    </p>}

    {waiting && request && <Waiting name={name} startedAt={request.startedAt} onCancel={() => void cancel()} />}

    {items.length > 0 && <ol className="proposal-list">
      {items.map(item => item.acceptedOn === null
        ? <ProposalItem key={item.key} item={item} route={route} today={today} disabled={busy || waiting} onChange={patch => change(item.key, patch)} onDiscard={() => discard([item.key])} onAccept={() => void add([item])} />
        : <li key={item.key} className="proposal proposal-accepted">
            <span className="proposal-check" aria-hidden="true">✓</span>
            <span className="proposal-accepted-title">{item.title}</span>
            <span className="proposal-accepted-day">En el Planner para {relativeDayLabel(item.acceptedOn, today)}</span>
          </li>)}
    </ol>}

    {items.length > 0 && <div className="study-footer proposal-footer">
      {pending.length > 0
        ? <>
            <Button type="button" variant="ghost" className="row-action row-action-danger" disabled={busy || waiting} onClick={() => discard(pending.map(item => item.key))}>Descartar las pendientes</Button>
            <Button type="button" variant="outline" disabled={busy || waiting || ready.length === 0} onClick={() => void add(ready)}>
              {ready.length === 1 ? 'Añadir 1 al Planner' : `Añadir ${ready.length} al Planner`}
            </Button>
          </>
        : <Button type="button" variant="ghost" className="row-action" disabled={waiting} onClick={() => discard(items.map(item => item.key))}>Limpiar la lista</Button>}
    </div>}
  </section>;
}

/** Espera de la petición, con el tiempo que lleva y la cancelación. */
function Waiting({ name, startedAt, onCancel }: { name: string; startedAt: number; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <div className="proposal-waiting" role="status">
    <span className="proposal-pencil" aria-hidden="true"><i /></span>
    <p>{name} está preparando propuestas. <span className="proposal-elapsed">{elapsedText(now - startedAt)}</span></p>
    <Button type="button" variant="ghost" className="row-action row-action-danger" disabled={cancelling} onClick={() => { setCancelling(true); onCancel(); }}>
      {cancelling ? 'Cancelando…' : 'Cancelar'}
    </Button>
  </div>;
}

interface ProposalItemProps {
  item: ProposalDraft;
  route: StudyRoute;
  today: string;
  disabled: boolean;
  onChange: (patch: Partial<Omit<ProposalDraft, 'key'>>) => void;
  onDiscard: () => void;
  onAccept: () => void;
}

function ProposalItem({ item, route, today, disabled, onChange, onDiscard, onAccept }: ProposalItemProps) {
  const problem = proposalProblem(item, route);
  const stageMissing = proposalStageLabel(route, item.stageId) === null;
  const id = `proposal-${item.key}`;
  return <li className="proposal" aria-labelledby={`${id}-title`}>
    <Input id={`${id}-title`} className="proposal-title" value={item.title} maxLength={MAX_TASK_TITLE} aria-label="Título de la tarea" disabled={disabled} onChange={event => onChange({ title: event.target.value })} />
    <div className="proposal-fields">
      <label className="study-field"><span>Etapa</span>
        <select className="study-select" value={stageMissing ? '' : item.stageId} disabled={disabled} onChange={event => onChange({ stageId: event.target.value })}>
          {stageMissing && <option value="" disabled>Elige una etapa</option>}
          {route.stages.map((stage, index) => <option key={stage.id} value={stage.id}>{`${index + 1}. ${stage.title}`}</option>)}
        </select>
      </label>
      <label className="study-field"><span>Día</span>
        <Input type="date" value={item.plannedDate} min={FIRST_PLANNED_DATE} max={LAST_PLANNED_DATE} disabled={disabled} onChange={event => onChange({ plannedDate: event.target.value })} />
      </label>
      <p className="proposal-estimate"><span>Estimación</span>{pomodorosText(item.pomodoros)}</p>
    </div>
    {item.doneWhen && <p className="proposal-note"><span>Hecha cuando</span> {item.doneWhen}</p>}
    {item.reason && <p className="proposal-reason">{item.reason}</p>}
    <div className="proposal-actions">
      <p className="study-hint" aria-live="polite">{problem ?? `Se añadirá para ${relativeDayLabel(item.plannedDate, today)}.`}</p>
      <Button type="button" variant="ghost" className="row-action row-action-danger" disabled={disabled} onClick={onDiscard}>Descartar</Button>
      <Button type="button" size="sm" disabled={disabled || problem !== null} onClick={onAccept}>Añadir al Planner</Button>
    </div>
  </li>;
}
