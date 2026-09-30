import {
  MAX_BRIDGE_TASKS, safeBridgeRequest, type BridgeRouteDetail, type BridgeRouteSummary, type BridgeTask, type BridgeTaskAdded
} from '../../shared/bridge/contract';
import type { DaySummary } from '../../shared/tasks/contract';
import type { TodayPort } from '../state/ports';
import type { StudyRouteListPort, StudyRouteReaderPort } from '../study/ports';
import type { RouteTasksPort, TaskCreatorPort } from '../tasks/ports';
import type { BridgeLifecyclePort, BridgeServer, BridgeServicePort } from './ports';

export interface BridgeDeps {
  server: BridgeServer;
  /** Ruta del socket, dentro de los datos de la app. */
  socketPath: string;
  routes: StudyRouteListPort & StudyRouteReaderPort;
  tasks: RouteTasksPort & TaskCreatorPort;
  day: TodayPort;
}

function summarize(tasks: readonly BridgeTask[]): DaySummary {
  return { total: tasks.length, done: tasks.filter(task => task.done).length };
}

/**
 * Puente para agentes de terminal: el servidor MCP que lanzan Claude Code o Codex lee las rutas y crea
 * tareas vinculadas a través de la app abierta. Las altas pasan por `TaskService`, que usa la conexión
 * SQLite de la app y actualiza las tareas de hoy, así que ningún otro proceso escribe en `ritmo.db`.
 * No borra ni cambia nada: solo lee rutas y añade tareas a una etapa que existe.
 */
export class BridgeService implements BridgeServicePort, BridgeLifecyclePort {
  constructor(private readonly deps: BridgeDeps) {}

  start(): Promise<void> {
    return this.deps.server.listen(this.deps.socketPath, request => this.handle(request));
  }

  stop(): Promise<void> {
    return this.deps.server.close();
  }

  handle(value: unknown): BridgeRouteSummary[] | BridgeRouteDetail | BridgeTaskAdded {
    const request = safeBridgeRequest(value);
    switch (request.op) {
      case 'list-routes': return this.listRoutes();
      case 'get-route': return this.route(request.routeId);
      case 'add-task': {
        const { routeId, stageId, title } = request;
        const plannedDate = request.date ?? this.deps.day.today();
        this.deps.tasks.add(title, plannedDate, { routeId, stageId });
        return { title, plannedDate, routeId, stageId };
      }
    }
  }

  private listRoutes(): BridgeRouteSummary[] {
    return this.deps.routes.list().map(route => ({
      id: route.id, topic: route.topic, goal: route.goal, level: route.level, stages: route.stages.length,
      progress: summarize(this.deps.tasks.routeTasks(route.id))
    }));
  }

  private route(routeId: string): BridgeRouteDetail {
    const route = this.deps.routes.get(routeId);
    const tasks: BridgeTask[] = this.deps.tasks.routeTasks(route.id);
    return {
      id: route.id, topic: route.topic, goal: route.goal, level: route.level, dailyPomodoros: route.dailyPomodoros,
      approach: route.approach, finalProject: route.finalProject, studyRules: route.studyRules,
      instructions: route.instructions, today: this.deps.day.today(),
      stages: route.stages.map(stage => ({
        id: stage.id, title: stage.title, summary: stage.summary, topics: stage.topics, deprioritized: stage.deprioritized,
        project: stage.project, resources: stage.resources, progress: summarize(tasks.filter(task => task.stageId === stage.id))
      })),
      tasks: tasks.slice(-MAX_BRIDGE_TASKS),
      totalTasks: tasks.length
    };
  }
}
