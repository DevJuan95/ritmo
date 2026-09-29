import { useCallback, useEffect, useState } from 'react';
import type { PublicState } from '../shared/contracts';

export function useRitmo() {
  const [state, setState] = useState<PublicState>();
  const [error, setError] = useState('');

  const showError = useCallback((reason: unknown) => {
    setError(reason instanceof Error ? reason.message : String(reason));
  }, []);

  useEffect(() => {
    // Con `npm run dev:renderer` en un navegador no hay preload ni proceso principal.
    if (!window.ritmo) { setError('Sin conexión con Ritmo: abre la app con npm start para ver tus datos.'); return; }
    const unsubscribe = window.ritmo.onState(setState);
    window.ritmo.getState().then(setState).catch(showError);
    return unsubscribe;
  }, [showError]);

  async function run(work: () => Promise<unknown>): Promise<boolean> {
    setError('');
    try { await work(); return true; }
    catch (reason) { showError(reason); return false; }
  }

  return { state, error, run, showError };
}

export type RunAction = (work: () => Promise<unknown>) => Promise<boolean>;
