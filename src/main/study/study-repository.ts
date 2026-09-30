import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PublicError } from '../../shared/ipc';
import { DEFAULT_AGENT_SETTINGS, safeAgentSettings, STUDY_PROVIDERS, type StudyProvider, type AgentSettings, type StudyLevel, type StudyRoute, type StudyRouteInput, type StudyStage } from '../../shared/study/contract';
import type { Clock, IdGenerator } from '../common/ports';
import type { AgentNoticeRepositoryPort, AgentSettingsRepositoryPort, StudyRepositoryPort, StudyRouteReaderPort, StudyStagesPort } from './ports';

interface RouteRow {
  id: string;
  topic: string;
  goal: string;
  level: string;
  daily_pomodoros: number;
  approach: string;
  final_project: string;
  study_rules: string;
  instructions: string;
  created_at: string;
  updated_at: string;
}

interface StageRow {
  id: string;
  route_id: string;
  title: string;
  summary: string;
  topics: string;
  deprioritized: string;
  project: string;
  resources: string;
}

function routeFromRow(row: RouteRow, stages: StudyStage[]): StudyRoute {
  return {
    id: row.id, topic: row.topic, goal: row.goal, level: row.level as StudyLevel,
    dailyPomodoros: Number(row.daily_pomodoros), approach: row.approach, stages, finalProject: row.final_project,
    studyRules: row.study_rules, instructions: row.instructions, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function stageFromRow(row: StageRow): StudyStage {
  return {
    id: row.id, title: row.title, summary: row.summary, topics: JSON.parse(row.topics) as string[],
    deprioritized: JSON.parse(row.deprioritized) as string[], project: row.project, resources: JSON.parse(row.resources) as string[]
  };
}

/**
 * Columnas del roadmap que se añadieron después de crear las tablas, con su valor en las filas que
 * ya existían: texto vacío o una lista JSON vacía.
 */
const ROADMAP_COLUMNS: ReadonlyArray<readonly [table: string, column: string, empty: string]> = [
  ['study_routes', 'approach', "''"],
  ['study_routes', 'final_project', "''"],
  ['study_routes', 'study_rules', "''"],
  ['study_stages', 'summary', "''"],
  ['study_stages', 'deprioritized', "'[]'"],
  ['study_stages', 'project', "''"],
  ['study_stages', 'resources', "'[]'"]
];

export interface StudyRepositoryDeps {
  now?: Clock;
  newId?: IdGenerator;
}

/** Clave de la configuración del agente en `study_settings`. */
const AGENT_SETTINGS_KEY = 'agent';
/** Clave de los avisos de privacidad aceptados en `study_settings`. */
const AGENT_NOTICES_KEY = 'agent-notices';

/**
 * Rutas de estudio en las tablas `study_routes` y `study_stages` de `ritmo.db`, con su propia
 * conexión. Las etapas guardan su posición en la ruta y sus listas (temas, temas que no priorizar y
 * recursos) como JSON; borrar una ruta borra sus etapas. Las columnas del roadmap se añaden al abrir
 * una base anterior (`ROADMAP_COLUMNS`). La configuración del agente y los avisos aceptados van como JSON en `study_settings`.
 */
export class StudyRepository implements StudyRepositoryPort, StudyRouteReaderPort, StudyStagesPort, AgentSettingsRepositoryPort, AgentNoticeRepositoryPort {
  private readonly db: DatabaseSync;
  private closed = false;
  private readonly now: Clock;
  private readonly newId: IdGenerator;

  constructor(dbPath: string, deps: StudyRepositoryDeps = {}) {
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS study_routes (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        goal TEXT NOT NULL,
        level TEXT NOT NULL,
        daily_pomodoros INTEGER NOT NULL,
        instructions TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS study_stages (
        id TEXT PRIMARY KEY,
        route_id TEXT NOT NULL REFERENCES study_routes(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        topics TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS study_stages_route ON study_stages(route_id, position);
      CREATE TABLE IF NOT EXISTS study_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.addRoadmapColumns();
  }

  list(): StudyRoute[] {
    const routes = this.db.prepare('SELECT * FROM study_routes ORDER BY created_at, id').all() as unknown as RouteRow[];
    const stages = this.db.prepare('SELECT * FROM study_stages ORDER BY route_id, position').all() as unknown as StageRow[];
    const byRoute = new Map<string, StudyStage[]>();
    for (const row of stages) {
      const list = byRoute.get(row.route_id) ?? [];
      list.push(stageFromRow(row));
      byRoute.set(row.route_id, list);
    }
    return routes.map(row => routeFromRow(row, byRoute.get(row.id) ?? []));
  }

  create(route: StudyRouteInput): StudyRoute {
    const timestamp = this.timestamp();
    const id = this.newId();
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO study_routes
          (id, topic, goal, level, daily_pomodoros, approach, final_project, study_rules, instructions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, route.topic, route.goal, route.level, route.dailyPomodoros, route.approach, route.finalProject, route.studyRules,
        route.instructions, timestamp, timestamp);
      this.writeStages(id, route, new Set());
    });
    return this.get(id);
  }

  update(id: string, route: StudyRouteInput): StudyRoute {
    this.get(id);
    const owned = new Set((this.db.prepare('SELECT id FROM study_stages WHERE route_id = ?').all(id) as unknown as Array<{ id: string }>).map(row => row.id));
    this.transaction(() => {
      this.db.prepare(`
        UPDATE study_routes SET topic = ?, goal = ?, level = ?, daily_pomodoros = ?, approach = ?, final_project = ?, study_rules = ?,
          instructions = ?, updated_at = ? WHERE id = ?
      `).run(route.topic, route.goal, route.level, route.dailyPomodoros, route.approach, route.finalProject, route.studyRules,
        route.instructions, this.timestamp(), id);
      this.db.prepare('DELETE FROM study_stages WHERE route_id = ?').run(id);
      this.writeStages(id, route, owned);
    });
    return this.get(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM study_routes WHERE id = ?').run(id);
  }

  /** Falla con un `PublicError` si la ruta no existe. */
  get(id: string): StudyRoute {
    const row = this.db.prepare('SELECT * FROM study_routes WHERE id = ?').get(id) as RouteRow | undefined;
    if (!row) throw new PublicError('La ruta no existe.');
    const stages = this.db.prepare('SELECT * FROM study_stages WHERE route_id = ? ORDER BY position').all(id) as unknown as StageRow[];
    return routeFromRow(row, stages.map(stageFromRow));
  }

  hasStage(routeId: string, stageId: string): boolean {
    return this.db.prepare('SELECT 1 FROM study_stages WHERE id = ? AND route_id = ?').get(stageId, routeId) !== undefined;
  }

  /** Una configuración guardada que ya no es válida, por ejemplo de otra versión, vuelve a la de por defecto. */
  loadAgentSettings(): AgentSettings {
    const row = this.db.prepare('SELECT value FROM study_settings WHERE key = ?').get(AGENT_SETTINGS_KEY) as { value: string } | undefined;
    if (!row) return structuredClone(DEFAULT_AGENT_SETTINGS);
    try {
      return safeAgentSettings(JSON.parse(row.value));
    } catch {
      return structuredClone(DEFAULT_AGENT_SETTINGS);
    }
  }

  saveAgentSettings(settings: AgentSettings): void {
    this.writeSetting(AGENT_SETTINGS_KEY, settings);
  }

  /** Solo los proveedores que siguen existiendo; lo que no se puede leer cuenta como ningún aviso aceptado. */
  loadAgentNotices(): StudyProvider[] {
    const row = this.db.prepare('SELECT value FROM study_settings WHERE key = ?').get(AGENT_NOTICES_KEY) as { value: string } | undefined;
    let saved: unknown;
    try {
      saved = row ? JSON.parse(row.value) : [];
    } catch {
      saved = [];
    }
    return Array.isArray(saved) ? STUDY_PROVIDERS.filter(provider => saved.includes(provider)) : [];
  }

  saveAgentNotices(providers: readonly StudyProvider[]): void {
    this.writeSetting(AGENT_NOTICES_KEY, providers);
  }

  private writeSetting(key: string, value: unknown): void {
    this.db.prepare('INSERT INTO study_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  close(): void {
    if (!this.closed) { this.db.close(); this.closed = true; }
  }

  /** Inserta las etapas en orden. Una etapa con `id` debe estar en `owned`: las de la ruta antes del cambio. */
  private writeStages(routeId: string, route: StudyRouteInput, owned: ReadonlySet<string>): void {
    const insert = this.db.prepare(`
      INSERT INTO study_stages (id, route_id, position, title, summary, topics, deprioritized, project, resources)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    route.stages.forEach((stage, position) => {
      if (stage.id !== undefined && !owned.has(stage.id)) throw new PublicError('La etapa no es válida.');
      insert.run(stage.id ?? this.newId(), routeId, position, stage.title, stage.summary, JSON.stringify(stage.topics),
        JSON.stringify(stage.deprioritized), stage.project, JSON.stringify(stage.resources));
    });
  }

  /**
   * Las bases creadas antes del roadmap completo no tienen sus columnas: las añade con su valor
   * vacío, así que las rutas guardadas se conservan. Es idempotente.
   */
  private addRoadmapColumns(): void {
    for (const [table, column, empty] of ROADMAP_COLUMNS) {
      const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
      if (!columns.some(existing => existing.name === column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT NOT NULL DEFAULT ${empty}`);
      }
    }
  }

  private transaction(work: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      work();
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private timestamp(): string { return new Date(this.now()).toISOString(); }
}
