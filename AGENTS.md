# Guía para agentes: Ritmo

Ritmo es una aplicación de productividad para macOS hecha con Electron y TypeScript. Ofrece sesiones de foco y descanso, tareas diarias y bloqueo de dominios durante el foco. Lee `README.md` para el comportamiento visible para el usuario.

## Mapa del proyecto

- `src/main.ts` inicia el proceso principal. En `src/main/`, `app.ts` es la raíz de composición: crea las implementaciones reales y las inyecta. `state.ts`, `focus.ts`, `task-service.ts`, `domains.ts` y `tasks.ts` (repositorio SQLite) no importan Electron. Sus dependencias externas (bloqueo de sitios, notificaciones, reloj, IPC, publicación del estado) son interfaces de `ports.ts`, con adaptadores en `site-blocker.ts` y `notifier.ts`. `ipc.ts` solo conecta canales con servicios.
- `src/preload.ts` expone `window.ritmo` al renderer. Mantén el aislamiento de contexto y la API limitada.
- `src/renderer/app.ts` inicia la interfaz; los módulos de `src/renderer/` renderizan el temporizador, las tareas y los dominios. No hay framework de interfaz.
- `src/shared/contracts.ts` define los tipos de estado y la API; `src/shared/validation.ts` valida entradas y define valores por defecto.
- `src/block-sites.sh` administra una sección identificada en `/etc/hosts`.
- `test/` está organizado por nivel; ver «Pruebas».
- `src/styles.css` usa Tailwind CSS y daisyUI. `dist/` es generado y está ignorado por Git.

## Comandos

- `npm install`: instala dependencias.
- `npm run typecheck`: comprueba los tipos del proceso principal y del renderer sin generar archivos.
- `npm test`: compila todo y ejecuta todas las pruebas con `node --test`.
- `npm run test:unit`, `npm run test:contract`, `npm run test:integration`: compilan con `tsc` y ejecutan un solo nivel.
- `npm run build`: genera la app en `dist/`.
- `npm start`: compila y abre Electron; requiere macOS para probar el bloqueo real.
- `npm run watch:css`: recompila estilos durante cambios de interfaz.

## Al cambiar código

- Conserva sincronizados los contratos de `src/shared/contracts.ts`, el puente de `src/preload.ts`, los manejadores de `src/main/ipc.ts` y sus llamadas desde el renderer.
- Valida en el proceso principal toda entrada recibida por IPC. El renderer no tiene acceso directo a Node ni a Electron.
- Respeta la persistencia local de `StateStore` y el reinicio diario de tareas y contador. Las operaciones de foco que cambian el estado pasan por `guarded`.
- En el bloqueo de sitios, preserva las entradas ajenas a la sección de Ritmo y la recuperación tras un cierre inesperado. No ejecutes pruebas contra el `/etc/hosts` real: la prueba del script usa `RITMO_TEST_HOSTS` con un archivo temporal.
- Antes de cerrar un cambio de código, ejecuta `npm run typecheck` y las pruebas pertinentes. Si cambias la compilación o recursos copiados a `dist/`, ejecuta también `npm run build`.
- No edites `dist/` ni `node_modules/` directamente. Respeta los cambios locales existentes que no pertenezcan a la tarea.
- Inyecta las dependencias nuevas con efectos externos (Electron, procesos, reloj, red) como un puerto en `src/main/ports.ts`, y cablea la implementación real en `src/main/app.ts`. Los servicios no deben importar `electron` ni usar `Date.now()` directamente; usan `store.now()`.

## Flujo de trabajo con worktrees

- Cada feature o cambio se desarrolla en su propio worktree y rama, nunca directamente en `main`:
  `git worktree add -b feature/<nombre> ../ritmo-<nombre> main`, y después `npm ci` dentro del worktree.
- Antes de crear el worktree, confirma que `main` no tiene cambios sin commitear que la feature necesite. Si los tiene, commitéalos primero en `main`; no los copies al worktree.
- Trabaja, ejecuta `npm run typecheck` y `npm test` y commitea en la rama del worktree.
- Para traerlo a `main`: desde el checkout principal, `git merge --ff-only feature/<nombre>` (si no es posible, rebasa la rama sobre `main` y resuelve allí). Verifica `npm test` en `main`. Luego elimina el worktree y la rama: `git worktree remove ../ritmo-<nombre>` y `git branch -d feature/<nombre>`.
- No dejes worktrees abiertos de features ya integradas. `git worktree list` debe mostrar solo `main` y el trabajo en curso.

## Pruebas

- `test/unit/<área>/`: una prueba por módulo de `src/` (por ejemplo, `unit/main/focus.test.ts`). Sin procesos externos; los archivos y SQLite van en directorios temporales.
- `test/contract/`: comprueba que `preload.ts`, `ipc.ts` y `RitmoAPI` sigan sincronizados. Si añades un método a `RitmoAPI`, `sampleCalls` deja de compilar hasta que lo incluyas.
- `test/integration/`: ejecuta `block-sites.sh` real contra un hosts falso en `/tmp`.
- `test/helpers/`: piezas reutilizables. `fakes.ts` tiene `FakeBlocker`, `FakeNotifier`, `FakeClock`, `FakeIpc` y `sequentialIds`. `harness.ts` tiene `createHarness(t, { saved, clock })`, que arma store, repositorio y servicios con dobles, y `buildState`. `temp.ts` tiene `tempDir(t)`, que se limpia sola. Reutilízalas en lugar de crear dobles ad hoc en cada archivo.
- Controla el tiempo con `FakeClock` (`advanceMinutes`, `nextDay`), no con esperas reales.
- Para documentar un defecto conocido sin romper la suite, usa `test(..., { todo: 'motivo' }, ...)`. Quita el `todo` cuando lo corrijas.
