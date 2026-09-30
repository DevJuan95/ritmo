import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PublicError } from '../../shared/ipc';
import type { StudyLevel, StudyRoute, StudyRouteInput, StudyStage } from '../../shared/study/contract';
import type { Clock, IdGenerator } from '../common/ports';
import type { StudyRepositoryPort, StudyStagesPort } from './ports';

interface RouteRow {
  id: string;
  topic: string;
  goal: string;
  level: string;
  daily_pomodoros: number;
  instructions: string;
  created_at: string;
  updated_at: string;
}

interface StageRow {
  id: string;
  route_id: string;
  title: string;
  topics: string;
}

function routeFromRow(row: RouteRow, stages: StudyStage[]): StudyRoute {
  return {
    id: row.id, topic: row.topic, goal: row.goal, level: row.level as StudyLevel,
    dailyPomodoros: Number(row.daily_pomodoros), stages, instructions: row.instructions,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function stageFromRow(row: StageRow): StudyStage {
  return { id: row.id, title: row.title, topics: JSON.parse(row.topics) as string[] };
}

export interface StudyRepositoryDeps {
  now?: Clock;
  newId?: IdGenerator;
}

/**
 * Rutas de estudio en las tablas `study_routes` y `study_stages` de `ritmo.db`, con su propia
 * conexión. Las etapas guardan su posición en la ruta y sus temas como JSON; borrar una ruta borra
 * sus etapas.
 */
export class StudyRepository implements StudyRepositoryPort, StudyStagesPort {
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
    `);
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
        INSERT INTO study_routes (id, topic, goal, level, daily_pomodoros, instructions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, route.topic, route.goal, route.level, route.dailyPomodoros, route.instructions, timestamp, timestamp);
      this.writeStages(id, route, new Set());
    });
    return this.require(id);
  }

  update(id: string, route: StudyRouteInput): StudyRoute {
    this.require(id);
    const owned = new Set((this.db.prepare('SELECT id FROM study_stages WHERE route_id = ?').all(id) as unknown as Array<{ id: string }>).map(row => row.id));
    this.transaction(() => {
      this.db.prepare(`
        UPDATE study_routes SET topic = ?, goal = ?, level = ?, daily_pomodoros = ?, instructions = ?, updated_at = ? WHERE id = ?
      `).run(route.topic, route.goal, route.level, route.dailyPomodoros, route.instructions, this.timestamp(), id);
      this.db.prepare('DELETE FROM study_stages WHERE route_id = ?').run(id);
      this.writeStages(id, route, owned);
    });
    return this.require(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM study_routes WHERE id = ?').run(id);
  }

  hasStage(routeId: string, stageId: string): boolean {
    return this.db.prepare('SELECT 1 FROM study_stages WHERE id = ? AND route_id = ?').get(stageId, routeId) !== undefined;
  }

  close(): void {
    if (!this.closed) { this.db.close(); this.closed = true; }
  }

  /** Inserta las etapas en orden. Una etapa con `id` debe estar en `owned`: las de la ruta antes del cambio. */
  private writeStages(routeId: string, route: StudyRouteInput, owned: ReadonlySet<string>): void {
    const insert = this.db.prepare('INSERT INTO study_stages (id, route_id, position, title, topics) VALUES (?, ?, ?, ?, ?)');
    route.stages.forEach((stage, position) => {
      if (stage.id !== undefined && !owned.has(stage.id)) throw new PublicError('La etapa no es válida.');
      insert.run(stage.id ?? this.newId(), routeId, position, stage.title, JSON.stringify(stage.topics));
    });
  }

  private transaction(work: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      work();
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private require(id: string): StudyRoute {
    const row = this.db.prepare('SELECT * FROM study_routes WHERE id = ?').get(id) as RouteRow | undefined;
    if (!row) throw new PublicError('La ruta no existe.');
    const stages = this.db.prepare('SELECT * FROM study_stages WHERE route_id = ? ORDER BY position').all(id) as unknown as StageRow[];
    return routeFromRow(row, stages.map(stageFromRow));
  }

  private timestamp(): string { return new Date(this.now()).toISOString(); }
}
