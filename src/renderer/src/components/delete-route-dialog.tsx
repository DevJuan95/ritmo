import { useState } from 'react';
import type { StudyProgress, StudyRoute } from '../../../shared/study/contract';
import type { RunAction } from '../use-ritmo';
import { routeDeletionText } from '../view';
import { Button } from './ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from './ui/alert-dialog';

interface DeleteRouteButtonProps {
  route: StudyRoute;
  /** Avance de las etapas: el diálogo cuenta con él las tareas vinculadas que se borrarán. */
  progress: StudyProgress;
  run: RunAction;
  onDeleted: () => Promise<void>;
}

/**
 * Botón «Eliminar ruta» con su diálogo de confirmación. Borra la ruta, sus etapas y sus tareas
 * vinculadas de todos los días; el diálogo sigue abierto mientras tanto y se cierra si falla.
 */
export function DeleteRouteButton({ route, progress, run, onDeleted }: DeleteRouteButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const ok = await run(() => window.ritmo.deleteStudyRoute(route.id));
      setOpen(false);
      if (ok) await onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return <AlertDialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }}>
    <AlertDialogTrigger asChild>
      <Button type="button" variant="ghost" className="row-action row-action-danger">Eliminar ruta</Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>¿Seguro que deseas eliminar esta ruta?</AlertDialogTitle>
        <AlertDialogDescription>{routeDeletionText(route, progress)}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive text-white hover:bg-destructive/90"
          disabled={busy}
          onClick={event => { event.preventDefault(); void remove(); }}
        >{busy ? 'Eliminando…' : 'Eliminar'}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
