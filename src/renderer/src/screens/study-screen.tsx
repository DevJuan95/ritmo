import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MAX_DAILY_POMODOROS, STUDY_LEVELS, type StudyProgress, type StudyRoute } from '../../../shared/study/contract';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import {
  LEVEL_LABELS, canSaveDraft, draftChanged, draftProblem, draftToInput, emptyRouteDraft, moveStage, newStageDraft, oneAtATime, routeProgressView,
  routeSummary, routeToDraft, stageLimits, stageProgressView, withDraft, type RouteDraft, type RouteDrafts, type StageDraft
} from '../view';
import type { RunAction } from '../use-ritmo';

type Selection = { kind: 'new' } | { kind: 'route'; id: string };

// Fuera del componente: los borradores conservados sobreviven a que la pantalla se desmonte,
// y sus claves de etapa no deben repetirse al volver a montarla.
let nextStageKey = 0;
const stageKey = () => `nueva-${++nextStageKey}`;

interface StudyScreenProps {
  run: RunAction;
  showError: (error: unknown) => void;
  /** Borradores sin guardar; viven en `App` para no perderse al cambiar de ruta o de sección. */
  drafts: RouteDrafts;
  onDraftsChange: (update: (drafts: RouteDrafts) => RouteDrafts) => void;
}

export function StudyScreen({ run, showError, drafts, onDraftsChange }: StudyScreenProps) {
  const [routes, setRoutes] = useState<StudyRoute[]>();
  const [progress, setProgress] = useState<StudyProgress>({});
  const [selection, setSelection] = useState<Selection>();

  // El avance se pide junto con las rutas: al quitar etapas, sus tareas dejan de contar.
  const fetchAll = useCallback(() => Promise.all([window.ritmo.listStudyRoutes(), window.ritmo.getStudyProgress()]), []);

  const load = useCallback(async () => {
    const [items, stages] = await fetchAll();
    setRoutes(items);
    setProgress(stages);
    return items;
  }, [fetchAll]);

  useEffect(() => {
    let active = true;
    fetchAll().then(([items, stages]) => {
      if (!active) return;
      setRoutes(items);
      setProgress(stages);
      setSelection(current => current ?? (items[0] ? { kind: 'route', id: items[0].id } : { kind: 'new' }));
    }).catch(error => { if (active) showError(error); });
    return () => { active = false; };
  }, [fetchAll, showError]);

  const selected = selection?.kind === 'route' ? routes?.find(route => route.id === selection.id) : undefined;
  const editorKey = selected ? `${selected.id}:${selected.updatedAt}` : 'nueva';
  const setDraft = (key: string, draft: RouteDraft | undefined) => onDraftsChange(current => withDraft(current, key, draft));

  async function afterDelete() {
    const items = await load();
    setSelection(items[0] ? { kind: 'route', id: items[0].id } : { kind: 'new' });
  }

  return <section className="study-panel" aria-labelledby="study-heading">
    <div className="planner-header">
      <div className="sheet-head"><h2 id="study-heading">Rutas de estudio</h2><p className="section-subtitle">Traza el camino de un tema en etapas y avanza una tarea a la vez.</p></div>
      <Button variant="outline" className="planner-today" onClick={() => setSelection({ kind: 'new' })}>Nueva ruta</Button>
    </div>
    <div className="study-layout">
      <nav className="study-index" aria-label="Tus rutas">
        {routes && routes.length === 0 && <p className="empty-state">Todavía no tienes rutas. Empieza por el tema que quieres dominar.</p>}
        <ul className="study-route-list">
          {routes?.map(route => <RouteItem key={route.id} route={route} progress={progress} active={route.id === selected?.id} onSelect={() => setSelection({ kind: 'route', id: route.id })} />)}
        </ul>
      </nav>
      {selection && (selection.kind === 'new' || selected) && <RouteEditor
        key={editorKey}
        route={selected}
        progress={progress}
        saved={drafts[editorKey]}
        onDraftChange={draft => setDraft(editorKey, draft)}
        newStageKey={stageKey}
        run={run}
        onSaved={async route => { setDraft(editorKey, undefined); await load(); setSelection({ kind: 'route', id: route.id }); }}
        onDeleted={async () => { setDraft(editorKey, undefined); await afterDelete(); }}
      />}
    </div>
  </section>;
}

function RouteItem({ route, progress: stages, active, onSelect }: { route: StudyRoute; progress: StudyProgress; active: boolean; onSelect: () => void }) {
  const progress = routeProgressView(route, stages);
  return <li>
    <button type="button" className="study-route" aria-current={active ? 'true' : undefined} onClick={onSelect}>
      <span className="study-route-topic">{route.topic}</span>
      <span className="study-route-meta">{routeSummary(route)}</span>
      <span className="study-route-stages" aria-hidden="true">
        {route.stages.map((stage, index) => <i key={stage.id} data-state={progress.stages[index]} />)}
      </span>
      <span className="study-route-meta">{progress.text}</span>
    </button>
  </li>;
}

interface RouteEditorProps {
  route: StudyRoute | undefined;
  /** Avance de las etapas guardadas; una etapa nueva aún no tiene tareas. */
  progress: StudyProgress;
  /** Borrador sin guardar que se conservó de una visita anterior. */
  saved: RouteDraft | undefined;
  /** Conserva el borrador fuera del editor, o lo olvida con `undefined` si no tiene cambios. */
  onDraftChange: (draft: RouteDraft | undefined) => void;
  newStageKey: () => string;
  run: RunAction;
  onSaved: (route: StudyRoute) => Promise<void>;
  onDeleted: () => Promise<void>;
}

function RouteEditor({ route, progress: stages, saved, onDraftChange, newStageKey, run, onSaved, onDeleted }: RouteEditorProps) {
  const [initial] = useState<RouteDraft>(() => route ? routeToDraft(route) : emptyRouteDraft(newStageKey()));
  const [draft, setDraftState] = useState(() => saved ?? initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  async function remove() {
    if (!route) return;
    await exclusive(async () => {
      if (await run(() => window.ritmo.deleteStudyRoute(route.id))) await onDeleted();
    });
  }

  return <form className="study-editor" aria-labelledby={titleId} onSubmit={event => void save(event)}>
    <h3 id={titleId} className="planner-day-heading">{route ? route.topic : 'Nueva ruta'}</h3>

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

    <fieldset className="study-stages">
      <legend>Etapas</legend>
      <p className="section-subtitle">En orden, de la primera a la última. Separa los temas con comas.</p>
      <ol className="study-stage-list">
        {draft.stages.map((stage, index) => {
          const progress = stageProgressView(stage.id ? stages[stage.id] : undefined);
          const name = stage.title.trim() || `etapa ${index + 1}`;
          return <li key={stage.key} className="study-stage">
            <span className="study-stage-number" aria-hidden="true">{index + 1}</span>
            <div className="study-stage-body">
              <Input value={stage.title} maxLength={120} placeholder="Título de la etapa" aria-label={`Título de la etapa ${index + 1}`} onChange={event => patchStage(stage.key, { title: event.target.value })} />
              <Input value={stage.topics} placeholder="Temas: ownership, borrowing, lifetimes" aria-label={`Temas de la etapa ${index + 1}`} onChange={event => patchStage(stage.key, { topics: event.target.value })} />
              <div className="study-stage-progress" data-complete={progress.complete}>
                <span className="study-stage-bar" aria-hidden="true"><i style={{ width: progress.percent }} /></span>
                <span>{progress.text}</span>
              </div>
            </div>
            <div className="study-stage-actions">
              <Button type="button" size="icon-sm" variant="ghost" className="row-action" disabled={index === 0} aria-label={`Subir ${name}`} onClick={() => patch({ stages: moveStage(draft.stages, index, -1) })}>↑</Button>
              <Button type="button" size="icon-sm" variant="ghost" className="row-action" disabled={index === draft.stages.length - 1} aria-label={`Bajar ${name}`} onClick={() => patch({ stages: moveStage(draft.stages, index, 1) })}>↓</Button>
              <Button type="button" size="icon-sm" variant="ghost" className="row-action row-action-danger" disabled={!limits.canRemove} aria-label={`Quitar ${name}`} onClick={() => patch({ stages: draft.stages.filter(item => item.key !== stage.key) })}>×</Button>
            </div>
          </li>;
        })}
      </ol>
      <Button type="button" variant="ghost" className="row-action study-add-stage" disabled={!limits.canAdd} onClick={() => patch({ stages: [...draft.stages, newStageDraft(newStageKey())] })}>Añadir etapa</Button>
    </fieldset>

    <label className="study-field study-field-full study-instructions">
      <span>Instrucciones para el agente</span>
      <Textarea value={draft.instructions} maxLength={2000} rows={4} onChange={event => patch({ instructions: event.target.value })} />
      <small>Qué tipo de tareas quieres, cuánto deben durar, recursos preferidos e idioma. Se usarán cuando pidas tareas a Claude Code o Codex.</small>
    </label>

    <div className="study-footer">
      <p className="study-hint" aria-live="polite">{changed ? problem ?? 'Cambios sin guardar.' : ''}</p>
      <div className="study-footer-actions">
        {route && (confirmDelete
          ? <><Button type="button" variant="ghost" className="row-action" disabled={busy} onClick={() => setConfirmDelete(false)}>Conservar</Button><Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>Eliminar ruta y etapas</Button></>
          : <Button type="button" variant="ghost" className="row-action row-action-danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Eliminar</Button>)}
        {route && changed && <Button type="button" variant="ghost" className="row-action" disabled={busy} onClick={() => setDraft(initial)}>Descartar cambios</Button>}
        <Button type="submit" disabled={!canSaveDraft(changed, problem, busy)}>{route ? 'Guardar cambios' : 'Crear ruta'}</Button>
      </div>
    </div>
  </form>;
}
