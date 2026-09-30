import type { StudyProgress, StudyRoute } from '../../../shared/study/contract';
import { roadmapView, stageProgressView } from '../view';

/** Roadmap de una ruta guardada, para leerlo: enfoque, orden recomendado, cada etapa, proyecto final y reglas. */
export function RoadmapView({ route, progress }: { route: StudyRoute; progress: StudyProgress }) {
  const view = roadmapView(route);
  return <article className="study-editor roadmap-view" aria-labelledby={`roadmap-${route.id}`}>
    <h3 id={`roadmap-${route.id}`} className="planner-day-heading">{route.topic}</h3>
    {route.goal && <p className="roadmap-goal">{route.goal}</p>}

    {view.approach && <section className="roadmap-section">
      <h4>Enfoque recomendado</h4>
      <p className="roadmap-text">{view.approach}</p>
    </section>}

    <section className="roadmap-section">
      <h4>Orden recomendado</h4>
      <ol className="roadmap-order">{view.order.map((title, index) => <li key={route.stages[index].id}>{title}</li>)}</ol>
    </section>

    <ol className="roadmap-stages">
      {view.stages.map(stage => {
        const stageProgress = stageProgressView(progress[stage.id]);
        return <li key={stage.id} className="roadmap-stage" aria-labelledby={`roadmap-stage-${stage.id}`}>
          <span className="study-stage-number" aria-hidden="true">{stage.number}</span>
          <div className="roadmap-stage-body">
            <h4 id={`roadmap-stage-${stage.id}`}>{stage.title}</h4>
            <div className="study-stage-progress" data-complete={stageProgress.complete}>
              <span className="study-stage-bar" aria-hidden="true"><i style={{ width: stageProgress.percent }} /></span>
              <span>{stageProgress.text}</span>
            </div>
            {stage.summary && <p className="roadmap-text">{stage.summary}</p>}
            {stage.lists.map(list => <div key={list.label} className="roadmap-list">
              <h5>{list.label}</h5>
              <ul>{list.items.map(item => <li key={item}>{item}</li>)}</ul>
            </div>)}
            {stage.project && <div className="roadmap-list"><h5>Proyecto</h5><p className="roadmap-text">{stage.project}</p></div>}
          </div>
        </li>;
      })}
    </ol>

    {view.finalProject && <section className="roadmap-section">
      <h4>Proyecto final</h4>
      <p className="roadmap-text">{view.finalProject}</p>
    </section>}
    {view.studyRules && <section className="roadmap-section">
      <h4>Reglas de estudio</h4>
      <p className="roadmap-text">{view.studyRules}</p>
    </section>}
  </article>;
}
