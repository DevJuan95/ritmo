import { PublicError } from '../../shared/ipc';
import { safePlannedDate, safeTaskTitle, type Task, type TaskPatch, type TaskSummary } from '../../shared/tasks/contract';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Clock, IdGenerator } from '../common/ports';
import type { TaskRepositoryPort } from './ports';

interface TaskRow {
  id: string;
  title: string;
  planned_date: string;
  created_at: string;
  completed_at: string | null;
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id, title: row.title, plannedDate: row.planned_date,
    createdAt: row.created_at, completedAt: row.completed_at, done: row.completed_at !== null
  };
}

export interface TaskRepositoryDeps {
  now?: Clock;
  newId?: IdGenerator;
}

export class TaskRepository implements TaskRepositoryPort {
  private readonly db: DatabaseSync;
  private closed = false;
  private readonly now: Clock;
  private readonly newId: IdGenerator;

  constructor(dbPath: string, deps: TaskRepositoryDeps = {}) {
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        planned_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS tasks_planned_date ON tasks(planned_date, created_at);
    `);
  }

  listByDay(date: string): Task[] {
    const plannedDate = safePlannedDate(date);
    return (this.db.prepare('SELECT * FROM tasks WHERE planned_date = ? ORDER BY created_at, id').all(plannedDate) as unknown as TaskRow[]).map(taskFromRow);
  }

  summarizeRange(from: string, to: string): TaskSummary {
    const rows = this.db.prepare(`
      SELECT planned_date, COUNT(*) AS total, COUNT(completed_at) AS done FROM tasks
      WHERE planned_date BETWEEN ? AND ? GROUP BY planned_date ORDER BY planned_date
    `).all(safePlannedDate(from), safePlannedDate(to)) as unknown as Array<{ planned_date: string; total: number; done: number }>;
    return Object.fromEntries(rows.map(row => [row.planned_date, { total: Number(row.total), done: Number(row.done) }]));
  }

  create(title: string, date: string): Task {
    const task: Task = {
      id: this.newId(), title: safeTaskTitle(title), plannedDate: safePlannedDate(date),
      createdAt: this.timestamp(), completedAt: null, done: false
    };
    this.db.prepare('INSERT INTO tasks (id, title, planned_date, created_at, completed_at) VALUES (?, ?, ?, ?, ?)')
      .run(task.id, task.title, task.plannedDate, task.createdAt, task.completedAt);
    return task;
  }

  update(id: string, patch: TaskPatch): Task {
    const existing = this.find(id);
    if (!existing) throw new PublicError('La tarea no existe.');
    if (!patch || typeof patch !== 'object' || !Object.keys(patch).length || Object.keys(patch).some(key => !['title', 'plannedDate', 'done'].includes(key))) throw new PublicError('Cambio de tarea inválido.');
    const title = patch.title === undefined ? existing.title : safeTaskTitle(patch.title);
    const plannedDate = patch.plannedDate === undefined ? existing.plannedDate : safePlannedDate(patch.plannedDate);
    if (patch.done !== undefined && typeof patch.done !== 'boolean') throw new PublicError('Estado de tarea inválido.');
    const completedAt = patch.done === undefined ? existing.completedAt : patch.done ? existing.completedAt || this.timestamp() : null;
    this.db.prepare('UPDATE tasks SET title = ?, planned_date = ?, completed_at = ? WHERE id = ?').run(title, plannedDate, completedAt, id);
    return { ...existing, title, plannedDate, completedAt, done: completedAt !== null };
  }

  delete(id: string): void {
    if (typeof id !== 'string' || !id) throw new PublicError('Identificador de tarea inválido.');
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  importLegacy(tasks: ReadonlyArray<{ id: string; title: string; done: boolean }>, day: string): void {
    const plannedDate = safePlannedDate(day);
    const insert = this.db.prepare('INSERT OR IGNORE INTO tasks (id, title, planned_date, created_at, completed_at) VALUES (?, ?, ?, ?, ?)');
    const timestamp = this.timestamp();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const task of tasks) {
        if (!task || typeof task.id !== 'string' || !task.id) continue;
        insert.run(task.id, safeTaskTitle(task.title), plannedDate, timestamp, task.done ? timestamp : null);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  close(): void {
    if (!this.closed) { this.db.close(); this.closed = true; }
  }

  private timestamp(): string { return new Date(this.now()).toISOString(); }

  private find(id: string): Task | undefined {
    if (typeof id !== 'string' || !id) throw new PublicError('Identificador de tarea inválido.');
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row && taskFromRow(row);
  }
}
