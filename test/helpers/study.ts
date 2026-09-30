import type { StudyStage } from '../../src/shared/study/contract';

/** Campos del roadmap de una ruta, vacíos como en una ruta sin roadmap. */
export const emptyRouteRoadmap = () => ({ approach: '', finalProject: '', studyRules: '' });

/** Etapa con los campos del roadmap vacíos y lo que se indique en `fields`; con `id`, es una `StudyStage`. */
export function stage<T extends Partial<StudyStage> & { title: string }>(fields: T): Omit<StudyStage, 'id'> & T {
  return { summary: '', topics: [], deprioritized: [], project: '', resources: [], ...fields };
}
