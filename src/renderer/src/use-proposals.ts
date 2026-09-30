import { useRef, useState } from 'react';
import type { StudyRoute } from '../../shared/study/contract';
import type { RunAction } from './use-ritmo';
import { scheduleProposals, withRouteProposals, type ProposalDraft, type ProposalsByRoute } from './view';

/** Petición al agente en curso: una a la vez, en toda la app. */
export interface ProposalRequest {
  routeId: string;
  /** `Date.now()` al empezar, para mostrar el tiempo de espera. */
  startedAt: number;
}

let nextProposalKey = 0;
const proposalKey = () => `propuesta-${++nextProposalKey}`;

/**
 * Propuestas por revisar de cada ruta y la petición en curso. Vive en `App`: la petición sigue y
 * sus propuestas se conservan aunque el usuario cambie de sección mientras espera.
 */
export function useProposals(run: RunAction) {
  const [proposals, setProposals] = useState<ProposalsByRoute>({});
  const [request, setRequest] = useState<ProposalRequest>();
  // Una cancelación hace que la petición rechace; ese rechazo no es un error para el usuario.
  const cancelled = useRef(false);
  const requesting = useRef(false);

  /** Pide propuestas para la ruta guardada y reemplaza las que quedaban por revisar. */
  async function propose(route: StudyRoute, today: string): Promise<void> {
    if (requesting.current) return;
    requesting.current = true;
    cancelled.current = false;
    setRequest({ routeId: route.id, startedAt: Date.now() });
    try {
      await run(async () => {
        try {
          const items = await window.ritmo.proposeStudyTasks(route.id);
          setProposals(current => withRouteProposals(current, route.id, scheduleProposals(items, today, route.dailyPomodoros, proposalKey)));
        } catch (error) {
          if (!cancelled.current) throw error;
        }
      });
    } finally {
      requesting.current = false;
      setRequest(undefined);
    }
  }

  async function cancel(): Promise<void> {
    cancelled.current = true;
    await run(() => window.ritmo.cancelStudyProposals());
  }

  function update(routeId: string, change: (items: readonly ProposalDraft[]) => ProposalDraft[]): void {
    setProposals(current => withRouteProposals(current, routeId, change(current[routeId] ?? [])));
  }

  return { proposals, request, propose, cancel, update };
}

export type ProposalsController = ReturnType<typeof useProposals>;
