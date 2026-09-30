import type { RoadmapDraft, StudyStage } from '../../src/shared/study/contract';

/** Campos del roadmap de una ruta, vacíos como en una ruta sin roadmap. */
export const emptyRouteRoadmap = () => ({ approach: '', finalProject: '', studyRules: '' });

/** Etapa con los campos del roadmap vacíos y lo que se indique en `fields`; con `id`, es una `StudyStage`. */
export function stage<T extends Partial<StudyStage> & { title: string }>(fields: T): Omit<StudyStage, 'id'> & T {
  return { summary: '', topics: [], deprioritized: [], project: '', resources: [], ...fields };
}

/** Roadmap válido como el que devuelve el agente para un brief, con todos los campos llenos. */
export function sampleRoadmap(): RoadmapDraft {
  return {
    topic: 'Sistemas distribuidos con Java',
    goal: 'Pasar de Senior Backend a Tech Lead.',
    level: 'advanced',
    dailyPomodoros: 5,
    approach: '60-70 % sistemas distribuidos y system design, 30-40 % Java/JVM.',
    stages: [
      stage({
        title: 'Fundamentos de sistemas distribuidos',
        summary: 'Entender replicación, particionado y consenso.',
        topics: ['Replicación', 'Particionado'],
        deprioritized: ['Blockchain'],
        project: 'Un almacén clave-valor replicado.',
        resources: ['Designing Data-Intensive Applications'],
      }),
      stage({ title: 'JVM en producción', topics: ['GC', 'JFR'] }),
    ],
    finalProject: 'Un sistema de pedidos con colas y sagas.',
    studyRules: 'Aprender Java y sistemas distribuidos en paralelo.',
    instructions: 'Dos horas al día, con práctica en cada sesión.',
  };
}
