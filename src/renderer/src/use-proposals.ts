import { useRef, useState } from 'react';
import type { RoadmapDraft, StudyProvider, StudyRoute } from '../../shared/study/contract';
import type { RunAction } from './use-ritmo';
import { roadmapFailureText, scheduleProposals, withRouteProposals, type AgentRequest, type ProposalDraft, type ProposalsByRoute } from './view';

/** Roadmap que devolvió el agente y que la pantalla Rutas aún no abrió en el editor. */
export interface DraftedRoadmap {
  roadmap: RoadmapDraft;
  provider: StudyProvider;
}

let nextProposalKey = 0;
const proposalKey = () => `propuesta-${++nextProposalKey}`;

/**
 * Peticiones al agente de la pantalla Rutas: las propuestas por revisar de cada ruta, el brief del
 * roadmap con su último error y el roadmap generado que falta abrir. Vive en `App`: la petición sigue,
 * y sus resultados y el brief se conservan, aunque el usuario cambie de sección mientras espera.
 * Hay una sola petición a la vez, de cualquiera de los dos tipos, como en el proceso principal.
 */
export function useProposals(run: RunAction) {
  const [proposals, setProposals] = useState<ProposalsByRoute>({});
  const [request, setRequest] = useState<AgentRequest>();
  const [brief, setBrief] = useState('');
  const [roadmapProblem, setRoadmapProblem] = useState<string | null>(null);
  const [drafted, setDrafted] = useState<DraftedRoadmap>();
  // Una cancelación hace que la petición rechace; en las propuestas, ese rechazo no es un error para el usuario.
  const cancelled = useRef(false);
  const requesting = useRef(false);

  /** Marca la petición en curso mientras dura `work`; si ya hay una, no hace nada. */
  async function exclusive(next: AgentRequest, work: () => Promise<void>): Promise<void> {
    if (requesting.current) return;
    requesting.current = true;
    cancelled.current = false;
    setRequest(next);
    try { await work(); }
    finally {
      requesting.current = false;
      setRequest(undefined);
    }
  }

  /** Pide propuestas para la ruta guardada y reemplaza las que quedaban por revisar. */
  async function propose(route: StudyRoute, today: string): Promise<void> {
    await exclusive({ kind: 'tasks', routeId: route.id, startedAt: Date.now() }, async () => {
      await run(async () => {
        try {
          const items = await window.ritmo.proposeStudyTasks(route.id);
          setProposals(current => withRouteProposals(current, route.id, scheduleProposals(items, today, route.dailyPomodoros, proposalKey)));
        } catch (error) {
          if (!cancelled.current) throw error;
        }
      });
    });
  }

  /**
   * Pide un roadmap para el brief actual. Si llega, queda en `drafted` hasta que la pantalla lo abra;
   * si falla o se cancela, el motivo queda en `roadmapProblem` y el brief no cambia.
   */
  async function draftRoadmap(provider: StudyProvider): Promise<void> {
    await exclusive({ kind: 'roadmap', startedAt: Date.now() }, async () => {
      setRoadmapProblem(null);
      try {
        const roadmap = await window.ritmo.draftStudyRoute(brief);
        setDrafted({ roadmap, provider });
      } catch (error) {
        setRoadmapProblem(roadmapFailureText(error, cancelled.current));
      }
    });
  }

  async function cancel(): Promise<void> {
    cancelled.current = true;
    await run(() => window.ritmo.cancelStudyProposals());
  }

  function update(routeId: string, change: (items: readonly ProposalDraft[]) => ProposalDraft[]): void {
    setProposals(current => withRouteProposals(current, routeId, change(current[routeId] ?? [])));
  }

  function changeBrief(text: string): void {
    setBrief(text);
    setRoadmapProblem(null);
  }

  /** Olvida el roadmap generado, una vez que la pantalla lo abrió en el editor. */
  function clearDrafted(): void {
    setDrafted(undefined);
  }

  return { proposals, request, propose, cancel, update, brief, changeBrief, roadmapProblem, drafted, draftRoadmap, clearDrafted };
}

export type ProposalsController = ReturnType<typeof useProposals>;
