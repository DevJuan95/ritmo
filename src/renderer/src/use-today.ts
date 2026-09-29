import { useEffect, useState } from 'react';
import { todayKey } from '../../shared/validation';

/**
 * Clave del día local que se actualiza sola al pasar la medianoche.
 * Se revisa cada minuto en lugar de programar la medianoche, porque los temporizadores
 * se retrasan mientras el Mac duerme.
 */
export function useToday(): string {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const timer = setInterval(() => setToday(todayKey()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return today;
}
