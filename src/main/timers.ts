import type { Timers } from './ports';

/** Temporizadores reales de Node. */
export const systemTimers: Timers = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: handle => clearInterval(handle as NodeJS.Timeout),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: handle => clearTimeout(handle as NodeJS.Timeout)
};
