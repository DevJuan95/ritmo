import { useState, type FormEvent } from 'react';
import {
  AGENT_NAMES, MAX_DAILY_POMODOROS, MAX_ROADMAP_TEXT, MAX_STAGE_TEXT, MAX_STAGE_TITLE, STUDY_LEVELS, type StageProgress, type StudyProgress, type StudyProvider, type StudyRoute
} from '../../../shared/study/contract';
import type { RunAction } from '../use-ritmo';
import {
  LEVEL_LABELS, canSaveDraft, draftChanged, draftProblem, draftToInput, emptyRouteDraft, moveStage, newStageDraft, oneAtATime, routeToDraft,
  stageHasDetails, stageLimits, stageProgressView, type RouteDraft, type StageDraft
} from '../view';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

interface RouteEditorProps {
  route: StudyRoute | undefined;
  /** Avance de las etapas guardadas; una etapa nueva aún no tiene tareas. */
  progress: StudyProgress;
  /** Borrador sin guardar que se conservó de una visita anterior o que generó el agente. */
  saved: RouteDraft | undefined;
  /** Proveedor que generó el borrador de la ruta nueva, si lo generó el agente. */
  agentDraft: StudyProvider | undefined;
  /** Conserva el borrador fuera del editor, o lo olvida con `undefined` si no tiene cambios. */
  onDraftChange: (draft: RouteDraft | undefined) => void;
  newStageKey: () => string;
  run: RunAction;
  onSaved: (route: StudyRoute) => Promise<void>;
}

/**
 * Formulario de una ruta, nueva o guardada, por secciones: datos básicos, etapas (con sus detalles
 * plegados), plan general e instrucciones para el agente. En una ruta guardada es su página de opciones.
 */
export function RouteEditor({ route, progress: stages, saved, agentDraft, onDraftChange, newStageKey, run, onSaved }: RouteEditorProps) {
  const [initial] = useState<RouteDraft>(() => route ? routeToDraft(route) : emptyRouteDraft(newStageKey()));
  const [draft, setDraftState] = useState(() => saved ?? initial);
  const [busy, setBusy] = useState(false);
  // Un solo guardián por editor: bloquea al instante, sin esperar al siguiente render.
  const [exclusive] = useState(() => oneAtATime(setBusy));
  const problem = draftProblem(draft);
  const changed = draftChanged(draft, initial);
  const limits = stageLimits(draft.stages.length);
  const titleId = route ? `route-${route.id}` : 'route-new';

  function setDraft(next: RouteDraft) {
    setDraftState(next);
    onDraftChange(draftChanged(next, initial) ? next : undefined);
  }

  function patch(changes: Partial<RouteDraft>) { setDraft({ ...draft, ...changes }); }
  function patchStage(key: string, changes: Partial<StageDraft>) {
    setDraft({ ...draft, stages: draft.stages.map(stage => stage.key === key ? { ...stage, ...changes } : stage) });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (problem) return;
    const input = draftToInput(draft);
    await exclusive(async () => {
      let saved: StudyRoute | undefined;
      const ok = await run(async () => { saved = route ? await window.ritmo.updateStudyRoute(route.id, input) : await window.ritmo.createStudyRoute(input); });
      if (ok && saved) await onSaved(saved);
    });
  }

  return <form className="study-editor" aria-labelledby={titleId} onSubmit={event => void save(event)}>
    <h3 id={titleId} className="planner-day-heading">{route ? 'Opciones de la ruta' : 'Nueva ruta'}</h3>
    {agentDraft && <p className="roadmap-drafted" role="note">Roadmap propuesto por {AGENT_NAMES[agentDraft]}. Revísalo y edítalo; no se guarda hasta que pulses «Crear ruta».</p>}

    <section className="study-editor-section" aria-labelledby={`${titleId}-basics`}>
      <h4 id={`${titleId}-basics`}>Lo básico</h4>
      <div className="study-fields">
        <label className="study-field study-field-wide"><span>Tema</span><Input value={draft.topic} maxLength={80} placeholder="Por ejemplo, Rust o sistemas distribuidos" onChange={event => patch({ topic: event.target.value })} /></label>
        <label className="study-field"><span>Nivel actual</span>
          <select className="study-select" value={draft.level} onChange={event => patch({ level: event.target.value as RouteDraft['level'] })}>
            {STUDY_LEVELS.map(level => <option key={level} value={level}>{LEVEL_LABELS[level]}</option>)}
          </select>
        </label>
        <label className="study-field"><span>Pomodoros al día</span><Input type="number" inputMode="numeric" min={1} max={MAX_DAILY_POMODOROS} value={draft.dailyPomodoros} onChange={event => patch({ dailyPomodoros: event.target.value })} /></label>
        <label className="study-field study-field-full"><span>Objetivo</span><Textarea value={draft.goal} maxLength={500} rows={2} placeholder="Qué quieres poder hacer al terminar la ruta" onChange={event => patch({ goal: event.target.value })} /></label>
      </div>
    </section>

    <fieldset className="study-stages">
      <legend>Etapas</legend>
      <p className="section-subtitle">En el orden recomendado. Abre «Detalles» para escribir el resumen, los temas, el proyecto y los recursos, uno por línea.</p>
      <ol className="study-stage-list">
        {draft.stages.map((stage, index) => <StageEditor
          key={stage.key}
          stage={stage}
          index={index}
          count={draft.stages.length}
          canRemove={limits.canRemove}
          progress={stage.id ? stages[stage.id] : undefined}
          onChange={changes => patchStage(stage.key, changes)}
          onMove={delta => patch({ stages: moveStage(draft.stages, index, delta) })}
          onRemove={() => patch({ stages: draft.stages.filter(item => item.key !== stage.key) })}
        />)}
      </ol>
      <Button type="button" variant="ghost" className="row-action study-add-stage" disabled={!limits.canAdd} onClick={() => patch({ stages: [...draft.stages, newStageDraft(newStageKey())] })}>Añadir etapa</Button>
    </fieldset>

    <details className="study-editor-more">
      <summary>Plan general <small>Enfoque, proyecto final y reglas de estudio</small></summary>
      <div className="study-fields">
        <label className="study-field study-field-full"><span>Enfoque recomendado</span><Textarea value={draft.approach} maxLength={MAX_ROADMAP_TEXT} rows={2} placeholder="Por ejemplo, 60-70 % sistemas distribuidos y 30-40 % Java" onChange={event => patch({ approach: event.target.value })} /></label>
        <label className="study-field study-field-full"><span>Proyecto final</span><Textarea value={draft.finalProject} maxLength={MAX_ROADMAP_TEXT} rows={2} placeholder="Un proyecto que integre las etapas" onChange={event => patch({ finalProject: event.target.value })} /></label>
        <label className="study-field study-field-full"><span>Reglas de estudio</span><Textarea value={draft.studyRules} maxLength={MAX_ROADMAP_TEXT} rows={2} placeholder="Por ejemplo, aprender Java y sistemas distribuidos en paralelo" onChange={event => patch({ studyRules: event.target.value })} /></label>
      </div>
    </details>

    <details className="study-editor-more">
      <summary>Instrucciones para el agente <small>Cómo quieres las tareas que te proponga</small></summary>
      <label className="study-field study-field-full study-instructions">
        <span className="sr-only">Instrucciones para el agente</span>
        <Textarea value={draft.instructions} maxLength={2000} rows={4} onChange={event => patch({ instructions: event.target.value })} />
        <small>Qué tipo de tareas quieres, cuánto deben durar, recursos preferidos e idioma. Se usarán cuando pidas tareas a Claude Code o Codex.</small>
      </label>
    </details>

    <div className="study-footer">
      <p className="study-hint" aria-live="polite">{changed ? problem ?? 'Cambios sin guardar.' : ''}</p>
      <div className="study-footer-actions">
        {changed && <Button type="button" variant="ghost" className="row-action" disabled={busy} onClick={() => setDraft(initial)}>{route ? 'Descartar cambios' : 'Descartar borrador'}</Button>}
        <Button type="submit" disabled={!canSaveDraft(changed, problem, busy)}>{route ? 'Guardar cambios' : 'Crear ruta'}</Button>
      </div>
    </div>
  </form>;
}

interface StageEditorProps {
  stage: StageDraft;
  index: number;
  count: number;
  canRemove: boolean;
  progress: StageProgress | undefined;
  onChange: (changes: Partial<StageDraft>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}

/** Una etapa en el editor: el título a la vista y el resto plegado en «Detalles». */
function StageEditor({ stage, index, count, canRemove, progress, onChange, onMove, onRemove }: StageEditorProps) {
  // Solo al montar: si dependiera del contenido, los detalles se plegarían mientras se escribe en ellos.
  const [openAtStart] = useState(() => !stageHasDetails(stage));
  const view = stageProgressView(progress);
  const name = stage.title.trim() || `etapa ${index + 1}`;
  const number = index + 1;
  return <li className="study-stage">
    <span className="study-stage-number" aria-hidden="true">{number}</span>
    <div className="study-stage-body">
      <Input value={stage.title} maxLength={MAX_STAGE_TITLE} placeholder="Título de la etapa" aria-label={`Título de la etapa ${number}`} onChange={event => onChange({ title: event.target.value })} />
      <details className="study-stage-details" open={openAtStart}>
        <summary>Detalles</summary>
        <div className="study-stage-fields">
          <Textarea value={stage.summary} maxLength={MAX_STAGE_TEXT} rows={2} placeholder="Resumen: qué se busca en esta etapa" aria-label={`Resumen de la etapa ${number}`} onChange={event => onChange({ summary: event.target.value })} />
          <Textarea value={stage.topics} rows={2} placeholder={'Dominar, uno por línea:\nOwnership y borrowing'} aria-label={`Temas que dominar en la etapa ${number}`} onChange={event => onChange({ topics: event.target.value })} />
          <Textarea value={stage.deprioritized} rows={2} placeholder={'No priorizar todavía, uno por línea:\nMacros'} aria-label={`Temas que no priorizar en la etapa ${number}`} onChange={event => onChange({ deprioritized: event.target.value })} />
          <Textarea value={stage.project} maxLength={MAX_STAGE_TEXT} rows={2} placeholder="Proyecto práctico de la etapa" aria-label={`Proyecto de la etapa ${number}`} onChange={event => onChange({ project: event.target.value })} />
          <Textarea value={stage.resources} rows={2} placeholder={'Recursos, uno por línea:\nThe Rust Programming Language'} aria-label={`Recursos de la etapa ${number}`} onChange={event => onChange({ resources: event.target.value })} />
        </div>
      </details>
      {stage.id && <div className="study-stage-progress" data-complete={view.complete}>
        <span className="study-stage-bar" aria-hidden="true"><i style={{ width: view.percent }} /></span>
        <span>{view.text}</span>
      </div>}
    </div>
    <div className="study-stage-actions">
      <Button type="button" size="icon-sm" variant="ghost" className="row-action" disabled={index === 0} aria-label={`Subir ${name}`} onClick={() => onMove(-1)}>↑</Button>
      <Button type="button" size="icon-sm" variant="ghost" className="row-action" disabled={index === count - 1} aria-label={`Bajar ${name}`} onClick={() => onMove(1)}>↓</Button>
      <Button type="button" size="icon-sm" variant="ghost" className="row-action row-action-danger" disabled={!canRemove} aria-label={`Quitar ${name}`} onClick={onRemove}>×</Button>
    </div>
  </li>;
}
