import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router';
import type { AgentSettings, AgentStatus, StudyProgress, StudyProvider, StudyRoute } from '../../../shared/study/contract';
import { DeleteRouteButton } from '../components/delete-route-dialog';
import { ProposalsPanel } from '../components/proposals-panel';
import { RoadmapPanel } from '../components/roadmap-panel';
import { RoadmapView } from '../components/roadmap-view';
import { RouteEditor } from '../components/route-editor';
import { buttonVariants } from '../components/ui/button';
import { cn } from '../lib/utils';
import {
  agentBusyText, agentSummary, pendingProposalCount, proposalGate, roadmapToDraft, routeDraftKey, routeProgressView, routeSummary, withDraft,
  type RouteDraft, type RouteDrafts
} from '../view';
import type { ProposalsController } from '../use-proposals';
import type { RunAction } from '../use-ritmo';

/** Clave del borrador de la ruta nueva en `RouteDrafts`. */
const NEW_ROUTE = 'nueva';

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
  /** Propuestas del agente y la petición en curso; viven en `App` por la misma razón. */
  proposals: ProposalsController;
  today: string;
  /** `tasksVersion` del estado: cuando cambia, el avance se vuelve a pedir. */
  tasksVersion: number;
}

/** Agente elegido, su estado y los avisos de privacidad aceptados. */
interface AgentInfo {
  settings: AgentSettings;
  statuses?: AgentStatus[];
  notices: StudyProvider[];
}

/**
 * Pantalla Rutas, en páginas: la lista de rutas (`/rutas`), la página de cada ruta con sus pestañas
 * Etapas, Próximas tareas y Opciones (`/rutas/:id`), la ruta nueva (`/rutas/nueva`) y la ruta nueva
 * con el agente (`/rutas/agente`). Aquí se cargan las rutas, su avance y el agente, que comparten todas.
 */
export function StudyScreen({ run, showError, drafts, onDraftsChange, proposals, today, tasksVersion }: StudyScreenProps) {
  const [routes, setRoutes] = useState<StudyRoute[]>();
  const [progress, setProgress] = useState<StudyProgress>({});
  const [agent, setAgent] = useState<AgentInfo>();
  // El editor de la ruta nueva se vuelve a montar cuando llega un roadmap del agente, para mostrarlo.
  const [newEditor, setNewEditor] = useState(0);
  const [agentDraft, setAgentDraft] = useState<StudyProvider>();
  const navigate = useNavigate();

  // El avance se pide junto con las rutas: al quitar etapas, sus tareas dejan de contar.
  const fetchAll = useCallback(() => Promise.all([window.ritmo.listStudyRoutes(), window.ritmo.getStudyProgress()]), []);

  const load = useCallback(async () => {
    const [items, stages] = await fetchAll();
    setRoutes(items);
    setProgress(stages);
  }, [fetchAll]);

  useEffect(() => {
    let active = true;
    fetchAll().then(([items, stages]) => {
      if (!active) return;
      setRoutes(items);
      setProgress(stages);
    }).catch(error => { if (active) showError(error); });
    return () => { active = false; };
  }, [fetchAll, showError]);

  // Las tareas pueden cambiar fuera de esta pantalla, por ejemplo si un agente las añade por el puente.
  // El montaje ya pide el avance junto con las rutas; solo hace falta pedirlo de nuevo si la versión cambia.
  const seenVersion = useRef(tasksVersion);
  useEffect(() => {
    if (tasksVersion === seenVersion.current) return;
    seenVersion.current = tasksVersion;
    // Sin limpieza que descarte la respuesta: solo se aplica la de la versión más reciente.
    window.ritmo.getStudyProgress().then(stages => { if (seenVersion.current === tasksVersion) setProgress(stages); }, showError);
  }, [tasksVersion, showError]);

  useEffect(() => {
    let active = true;
    Promise.all([window.ritmo.getAgentSettings(), window.ritmo.getAgentNotices()]).then(([settings, notices]) => {
      if (!active) return;
      setAgent({ settings, notices });
      return window.ritmo.checkStudyAgents().then(statuses => { if (active) setAgent({ settings, notices, statuses }); });
    }).catch(error => { if (active) showError(error); });
    return () => { active = false; };
  }, [showError]);

  // El roadmap que generó el agente se abre como borrador de la ruta nueva, también si llegó con la
  // pantalla desmontada. Reemplaza el borrador anterior de la ruta nueva.
  const { drafted, clearDrafted } = proposals;
  useEffect(() => {
    if (!drafted) return;
    clearDrafted();
    onDraftsChange(current => withDraft(current, NEW_ROUTE, roadmapToDraft(drafted.roadmap, stageKey)));
    setAgentDraft(drafted.provider);
    setNewEditor(count => count + 1);
    void navigate('/rutas/nueva');
  }, [drafted, clearDrafted, onDraftsChange, navigate]);

  const setDraft = (key: string, draft: RouteDraft | undefined) => onDraftsChange(current => withDraft(current, key, draft));
  const agentStatus = agent?.statuses?.find(status => status.provider === agent.settings.provider);

  async function acceptNotice(provider: StudyProvider): Promise<boolean> {
    let notices: StudyProvider[] | undefined;
    const ok = await run(async () => { notices = await window.ritmo.acceptAgentNotice(provider); });
    if (ok && notices) {
      const accepted = notices;
      setAgent(current => current && { ...current, notices: accepted });
    }
    return ok;
  }

  const page: RoutePageProps = {
    routes, progress, agent, agentStatus, drafts, setDraft, proposals, today, run,
    reload: load,
    onError: showError,
    acceptNotice
  };

  return <Routes>
    <Route index element={<section className="study-panel" aria-labelledby="study-heading">
      <div className="planner-header">
        <div className="sheet-head"><h2 id="study-heading">Rutas de estudio</h2><p className="section-subtitle">Traza el camino de un tema en etapas y avanza una tarea a la vez.</p></div>
        <div className="study-header-actions">
          <LinkButton to="/rutas/nueva" variant="outline">Nueva ruta</LinkButton>
          <LinkButton to="/rutas/agente" variant="default">Crear con el agente</LinkButton>
        </div>
      </div>
      {agent && <AgentLine settings={agent.settings} statuses={agent.statuses} />}
      {routes && (routes.length > 0 || drafts[NEW_ROUTE]) && <ul className="study-cards">
        {drafts[NEW_ROUTE] && <li><Link to="/rutas/nueva" className="study-card study-card-draft">
          <span className="study-route-topic">{drafts[NEW_ROUTE].topic.trim() || 'Nueva ruta'}</span>
          <span className="study-route-meta">Borrador sin guardar{agentDraft ? ', propuesto por el agente' : ''}. Sigue donde lo dejaste.</span>
        </Link></li>}
        {routes.map(route => <li key={route.id}><RouteCard
          route={route}
          progress={progress}
          pending={pendingProposalCount(proposals.proposals[route.id])}
          unsaved={drafts[routeDraftKey(route)] !== undefined}
        /></li>)}
      </ul>}
      {routes && routes.length === 0 && !drafts[NEW_ROUTE] && <p className="empty-state">
        Todavía no tienes rutas. Empieza por el tema que quieres dominar: escríbela tú o pide al agente un roadmap a partir de unas líneas.
      </p>}
    </section>} />
    <Route path="nueva" element={<section className="study-panel" aria-labelledby="new-route-heading">
      <BackLink />
      <h2 id="new-route-heading" className="sr-only">Nueva ruta</h2>
      <RouteEditor
        key={`${NEW_ROUTE}:${newEditor}`}
        route={undefined}
        progress={progress}
        saved={drafts[NEW_ROUTE]}
        agentDraft={agentDraft}
        onDraftChange={draft => { setDraft(NEW_ROUTE, draft); if (!draft) setAgentDraft(undefined); }}
        newStageKey={stageKey}
        run={run}
        onSaved={async route => {
          setDraft(NEW_ROUTE, undefined);
          setAgentDraft(undefined);
          await load();
          void navigate(`/rutas/${route.id}`, { replace: true });
        }}
      />
    </section>} />
    <Route path="agente" element={<section className="study-panel" aria-labelledby="agent-route-heading">
      <BackLink />
      <h2 id="agent-route-heading" className="sr-only">Nueva ruta con el agente</h2>
      {agent && <AgentLine settings={agent.settings} statuses={agent.statuses} />}
      {agent && <RoadmapPanel
        provider={agent.settings.provider}
        gate={proposalGate(agent.settings.provider, agentStatus, agent.notices, false)}
        controller={proposals}
        busy={agentBusyText(proposals.request, routes, null)}
        replacesDraft={drafts[NEW_ROUTE] !== undefined}
        onAcceptNotice={() => acceptNotice(agent.settings.provider)}
      />}
    </section>} />
    <Route path=":id/*" element={<RoutePage {...page} />} />
  </Routes>;
}

interface RoutePageProps {
  routes: StudyRoute[] | undefined;
  progress: StudyProgress;
  agent: AgentInfo | undefined;
  agentStatus: AgentStatus | undefined;
  drafts: RouteDrafts;
  setDraft: (key: string, draft: RouteDraft | undefined) => void;
  proposals: ProposalsController;
  today: string;
  run: RunAction;
  /** Vuelve a pedir las rutas y su avance. */
  reload: () => Promise<void>;
  onError: (error: unknown) => void;
  acceptNotice: (provider: StudyProvider) => Promise<boolean>;
}

/**
 * Página de una ruta: su tema, su objetivo y en qué etapa va, y tres pestañas. Etapas para leer el
 * roadmap, Próximas tareas para pedirle tareas al agente y Opciones para editarla. «Eliminar ruta»,
 * en la cabecera, pide confirmación y borra también sus tareas vinculadas.
 */
function RoutePage({ routes, progress, agent, agentStatus, drafts, setDraft, proposals, today, run, reload, onError, acceptNotice }: RoutePageProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const route = routes?.find(item => item.id === id);
  if (!routes) return null;
  if (!route) return <Navigate to="/rutas" replace />;
  const key = routeDraftKey(route);
  const view = routeProgressView(route, progress);
  const pending = pendingProposalCount(proposals.proposals[route.id]);
  const base = `/rutas/${route.id}`;

  return <section className="study-panel" aria-labelledby="route-heading">
    <BackLink />
    <header className="route-hero">
      <div className="route-hero-title">
        <h2 id="route-heading">{route.topic}</h2>
        <DeleteRouteButton route={route} progress={progress} run={run} onDeleted={async () => {
          setDraft(key, undefined);
          proposals.update(route.id, () => []);
          await reload();
          void navigate('/rutas', { replace: true });
        }} />
      </div>
      {route.goal && <p className="roadmap-goal">{route.goal}</p>}
      <div className="route-hero-progress">
        <StageMarks route={route} progress={progress} />
        <p className="study-route-meta"><strong>{view.text}</strong> · {routeSummary(route)}</p>
      </div>
    </header>
    <nav className="route-tabs" aria-label="Secciones de la ruta">
      <NavLink to={base} end className="route-tab">Etapas</NavLink>
      <NavLink to={`${base}/tareas`} className="route-tab">
        Próximas tareas{pending > 0 && <span className="route-tab-badge"><span className="sr-only">, por revisar: </span>{pending}</span>}
      </NavLink>
      <NavLink to={`${base}/opciones`} className="route-tab">
        Opciones{drafts[key] && <span className="route-tab-note"> · sin guardar</span>}
      </NavLink>
    </nav>
    <Routes>
      <Route index element={<RoadmapView route={route} progress={progress} />} />
      <Route path="tareas" element={agent && <div className="route-tasks">
        <AgentLine settings={agent.settings} statuses={agent.statuses} />
        <ProposalsPanel
        route={route}
        provider={agent.settings.provider}
        gate={proposalGate(agent.settings.provider, agentStatus, agent.notices, drafts[key] !== undefined)}
        today={today}
        controller={proposals}
        run={run}
        busy={agentBusyText(proposals.request, routes, route.id)}
        onAcceptNotice={() => acceptNotice(agent.settings.provider)}
        onTasksAdded={() => { void reload().catch(onError); }}
      />
      </div>} />
      <Route path="opciones" element={<RouteEditor
        key={key}
        route={route}
        progress={progress}
        saved={drafts[key]}
        agentDraft={undefined}
        onDraftChange={draft => setDraft(key, draft)}
        newStageKey={stageKey}
        run={run}
        onSaved={async saved => {
          setDraft(key, undefined);
          await reload();
          void navigate(`/rutas/${saved.id}`, { replace: true });
        }}
      />} />
      <Route path="*" element={<Navigate to={base} replace />} />
    </Routes>
  </section>;
}

function LinkButton({ to, variant, children }: { to: string; variant: 'default' | 'outline'; children: ReactNode }) {
  return <Link to={to} className={cn(buttonVariants({ variant }), variant === 'outline' && 'planner-today')}>{children}</Link>;
}

function BackLink() {
  return <Link to="/rutas" className="study-back">← Todas las rutas</Link>;
}

/** Qué agente propondrá las tareas y si está listo, con un enlace a su configuración. */
function AgentLine({ settings, statuses }: { settings: AgentSettings; statuses: AgentStatus[] | undefined }) {
  const summary = agentSummary(settings, statuses);
  return <p className="study-agent" data-tone={summary.tone} aria-live="polite">
    <span>{summary.text}</span>
    <Link to="/ajustes" className="study-agent-link">{summary.tone === 'ready' ? 'Cambiar agente' : 'Configurar agente'}</Link>
  </p>;
}

/** Una marca por etapa: entintadas las completas, en rojo la etapa en curso. */
function StageMarks({ route, progress }: { route: StudyRoute; progress: StudyProgress }) {
  const view = routeProgressView(route, progress);
  return <span className="study-route-stages" aria-hidden="true">
    {route.stages.map((stage, index) => <i key={stage.id} data-state={view.stages[index]} />)}
  </span>;
}

interface RouteCardProps {
  route: StudyRoute;
  progress: StudyProgress;
  /** Propuestas del agente por revisar. */
  pending: number;
  /** Si la ruta tiene cambios sin guardar en Opciones. */
  unsaved: boolean;
}

/** Tarjeta de una ruta en la lista: lo justo para saber en qué va; abre su página. */
function RouteCard({ route, progress, pending, unsaved }: RouteCardProps) {
  const view = routeProgressView(route, progress);
  const notes = [
    pending > 0 && `${pending} ${pending === 1 ? 'tarea propuesta' : 'tareas propuestas'} por revisar`,
    unsaved && 'Cambios sin guardar'
  ].filter(Boolean);
  return <Link to={`/rutas/${route.id}`} className="study-card">
    <span className="study-route-topic">{route.topic}</span>
    <span className="study-route-meta">{routeSummary(route)}</span>
    <StageMarks route={route} progress={progress} />
    <span className="study-card-current" data-done={view.current === null}>{view.text}</span>
    {notes.length > 0 && <span className="study-card-notes">{notes.join(' · ')}</span>}
  </Link>;
}
