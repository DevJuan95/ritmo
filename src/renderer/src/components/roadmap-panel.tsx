import type { FormEvent } from 'react';
import { AGENT_NAMES, MAX_ROADMAP_BRIEF, type StudyProvider } from '../../../shared/study/contract';
import type { ProposalsController } from '../use-proposals';
import { briefProblem, roadmapNoticeText, type ProposalGate } from '../view';
import { AgentWaiting } from './agent-waiting';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

interface RoadmapPanelProps {
  provider: StudyProvider;
  gate: ProposalGate;
  controller: ProposalsController;
  /** Por qué otra petición al agente en curso impide generar el roadmap, si la hay. */
  busy: string | undefined;
  /** Si hay una ruta nueva sin guardar, que el roadmap generado reemplazará. */
  replacesDraft: boolean;
  onAcceptNotice: () => Promise<boolean>;
}

/**
 * «Nueva ruta con el agente»: el usuario escribe un brief y el agente elegido devuelve un roadmap, que
 * se abre como borrador en el editor para revisarlo y guardarlo. El brief y el último error viven en
 * `App`, así que un error, un tiempo agotado o una cancelación no lo pierden.
 */
export function RoadmapPanel({ provider, gate, controller, busy, replacesDraft, onAcceptNotice }: RoadmapPanelProps) {
  const { request, brief, changeBrief, roadmapProblem, draftRoadmap, cancel } = controller;
  const waiting = request?.kind === 'roadmap';
  const name = AGENT_NAMES[provider];
  const problem = briefProblem(brief);
  const blocked = gate.kind === 'blocked' ? gate.reason : busy ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked || problem || request) return;
    if (gate.kind === 'notice' && !await onAcceptNotice()) return;
    await draftRoadmap(provider);
  }

  return <form className="proposal-sheet roadmap-sheet" aria-labelledby="roadmap-heading" aria-busy={waiting} onSubmit={event => void submit(event)}>
    <div className="sheet-head">
      <h3 id="roadmap-heading" className="planner-day-heading">Nueva ruta con el agente</h3>
      <p className="section-subtitle">Cuéntale a {name} qué quieres aprender, desde dónde partes y cuánto tiempo tienes. Te propondrá un roadmap completo que podrás revisar y editar antes de guardarlo.</p>
    </div>

    <label className="study-field study-field-full roadmap-brief">
      <span>Brief</span>
      <Textarea value={brief} maxLength={MAX_ROADMAP_BRIEF} rows={6} disabled={waiting}
        placeholder="Por ejemplo: Senior Backend → Tech Lead / Architect / FDE, con Java como vehículo, 2 h al día."
        onChange={event => changeBrief(event.target.value)} />
    </label>

    {gate.kind === 'notice' && !waiting && <p className="proposal-notice" role="note">{roadmapNoticeText(provider)}</p>}
    {blocked && !waiting && <p className="proposal-blocked" aria-live="polite">{blocked}</p>}
    {roadmapProblem && !waiting && <p className="roadmap-problem" role="alert">{roadmapProblem}</p>}
    {waiting && <AgentWaiting text={`${name} está trazando el roadmap.`} startedAt={request.startedAt} onCancel={() => void cancel()} />}

    {!waiting && <div className="study-footer">
      <p className="study-hint" aria-live="polite">
        {brief.trim() && problem ? problem : gate.kind === 'ready' && !blocked ? `Se envía solo el brief a ${name}, al pulsar el botón.` : ''}
        {replacesDraft && ' El roadmap reemplazará la nueva ruta que no has guardado.'}
      </p>
      <div className="study-footer-actions">
        <Button type="submit" disabled={!!blocked || !!problem || !!request}>{gate.kind === 'notice' ? 'Aceptar y generar roadmap' : 'Generar roadmap'}</Button>
      </div>
    </div>}
  </form>;
}
