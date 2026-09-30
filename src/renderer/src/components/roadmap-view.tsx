import { useState } from 'react';
import type { StudyProgress, StudyRoute } from '../../../shared/study/contract';
import { STAGE_STATE_LABELS, roadmapView, routeProgressView, stageProgressView, type RoadmapStageView, type StageState } from '../view';

/**
 * Etapas de una ruta guardada, para leerlas: cada una plegada con su estado y su avance, y abierta la
 * etapa en curso al mostrarlas. El enfoque, el proyecto final y las reglas de estudio van plegados al final.
 */
export function RoadmapView({ route, progress }: { route: StudyRoute; progress: StudyProgress }) {
  const view = roadmapView(route);
  const states = routeProgressView(route, progress).stages;
  const plan = [
    { label: 'Enfoque recomendado', text: view.approach },
    { label: 'Proyecto final', text: view.finalProject },
    { label: 'Reglas de estudio', text: view.studyRules }
  ].filter(section => section.text);

  return <article className="roadmap-view" aria-labelledby={`roadmap-${route.id}`}>
    <h3 id={`roadmap-${route.id}`} className="sr-only">Etapas de {route.topic}</h3>
    <ol className="roadmap-stages">
      {view.stages.map((stage, index) => <StageItem key={stage.id} stage={stage} state={states[index]} progress={progress} />)}
    </ol>

    {plan.length > 0 && <div className="roadmap-plan">
      <h4>Plan general</h4>
      {plan.map(section => <details key={section.label} className="roadmap-plan-item">
        <summary>{section.label}</summary>
        <p className="roadmap-text">{section.text}</p>
      </details>)}
    </div>}
  </article>;
}

/** Una etapa plegada con su estado y su avance; se abre por sí sola si es la etapa en curso al mostrarla. */
function StageItem({ stage, state, progress }: { stage: RoadmapStageView; state: StageState; progress: StudyProgress }) {
  // Solo al montar: si siguiera al avance, una etapa abierta se plegaría sola cuando cambian sus tareas.
  const [openAtStart] = useState(() => state === 'current');
  const stageProgress = stageProgressView(progress[stage.id]);
  const empty = !stage.summary && stage.lists.length === 0 && !stage.project;
  return <li data-state={state}>
    <details className="roadmap-stage" open={openAtStart}>
      <summary>
        <span className="study-stage-number" aria-hidden="true">{stage.number}</span>
        <span className="roadmap-stage-head">
          <span className="roadmap-stage-title">{stage.title}</span>
          <span className="roadmap-stage-meta">
            <span className="roadmap-stage-state">{STAGE_STATE_LABELS[state]}</span>
            <span className="study-stage-progress" data-complete={stageProgress.complete}>
              <span className="study-stage-bar" aria-hidden="true"><i style={{ width: stageProgress.percent }} /></span>
              <span>{stageProgress.text}</span>
            </span>
          </span>
        </span>
      </summary>
      <div className="roadmap-stage-body">
        {empty && <p className="roadmap-empty">Esta etapa aún no tiene detalles. Puedes añadirlos en Opciones.</p>}
        {stage.summary && <p className="roadmap-text">{stage.summary}</p>}
        {stage.lists.map(list => <div key={list.label} className="roadmap-list">
          <h5>{list.label}</h5>
          <ul>{list.items.map(item => <li key={item}>{item}</li>)}</ul>
        </div>)}
        {stage.project && <div className="roadmap-list"><h5>Proyecto</h5><p className="roadmap-text">{stage.project}</p></div>}
      </div>
    </details>
  </li>;
}
