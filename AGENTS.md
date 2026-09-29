# Guía para agentes: Ritmo

Ritmo es una aplicación de productividad para macOS hecha con Electron y TypeScript. Ofrece sesiones de foco y descanso, tareas diarias y bloqueo de dominios durante el foco. Lee `README.md` para el comportamiento visible para el usuario, `docs/glosario.md` para el significado de cada término del dominio y `docs/arquitectura.md` para los diagramas de procesos, servicios, puertos y adaptadores, y del ciclo de una sesión.

## Mapa del proyecto

- `src/main.ts` inicia el proceso principal. En `src/main/`, `app.ts` es la raíz de composición: crea con `createMainContainer` (`container.ts`, Awilix) el contenedor de singletons, le pasa lo que viene de Electron y resuelve de él los servicios. `lifecycle.ts` (`LifecycleService`) arranca el tic y hace el cierre ordenado de todas las vías de salida (`before-quit`, `SIGINT`, `SIGTERM`, apagado de macOS): espera la operación en curso, quita el bloqueo, guarda el estado y cierra SQLite, con un tiempo máximo. Solo `container.ts` importa Awilix; los servicios reciben sus dependencias por constructor. `state.ts`, `focus.ts`, `task-service.ts`, `domains.ts`, `lifecycle.ts` y `tasks.ts` (repositorio SQLite) no importan Electron. Sus dependencias externas (bloqueo de sitios, notificaciones, sonido, reloj, temporizadores, avisos de salida, IPC, publicación del estado) son interfaces de `ports.ts`, con adaptadores en `site-blocker.ts`, `notifier.ts`, `sound-player.ts`, `timers.ts` y `quit-signals.ts`. `ipc.ts` solo conecta canales con servicios.
- `src/preload.ts` expone `window.ritmo` al renderer. Mantén el aislamiento de contexto y la API limitada.
- `src/renderer/app.ts` inicia la interfaz; los módulos de `src/renderer/` renderizan el temporizador, las tareas y los dominios. No hay framework de interfaz. La lógica de presentación sin DOM (textos, estado del temporizador, botones disponibles) va en `src/renderer/view.ts`.
- `src/shared/contracts.ts` define los tipos de estado y la API; `src/shared/validation.ts` valida entradas y define valores por defecto.
- `src/block-sites.sh` administra una sección identificada en `/etc/hosts`.
- `test/` está organizado por nivel; ver «Pruebas».
- `src/styles.css` usa Tailwind CSS y daisyUI. `dist/` es generado y está ignorado por Git.

## Comandos

- `npm install`: instala dependencias. El proyecto usa Node 24 (`.nvmrc`, `engines` de `package.json`).
- `npm run typecheck`: comprueba los tipos del proceso principal y del renderer sin generar archivos.
- `npm test`: compila todo y ejecuta todas las pruebas con `node --test`.
- `npm run test:unit`, `npm run test:contract`, `npm run test:integration`: compilan con `tsc` y ejecutan un solo nivel.
- `npm run coverage`: compila y ejecuta todas las pruebas con c8. Informa por archivo de `src/` (también los que no carga ninguna prueba) y falla por debajo de los umbrales de `.c8rc.json`. El HTML queda en `coverage/`.
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
- Si cambias un puerto, un servicio, su registro en `src/main/container.ts` o su cableado en `src/main/app.ts`, el ciclo de una sesión o un término del dominio (tipos de `src/shared/contracts.ts` o `src/main/ports.ts`), actualiza `docs/glosario.md` y `docs/arquitectura.md` en el mismo cambio.
- Inyecta las dependencias nuevas con efectos externos (Electron, procesos, reloj, red) como un puerto en `src/main/ports.ts`, regístralas en `src/main/container.ts` y pasa desde `src/main/app.ts` lo que dependa de Electron. Los servicios no deben importar `electron` ni usar `Date.now()` directamente; usan `store.now()`.

## Flujo de trabajo con worktrees

- Cada feature o cambio se desarrolla en su propio worktree y rama, nunca directamente en `main`.
- Los worktrees viven en `~/orca/workspaces/ritmo/<nombre>`, la carpeta que usa Orca (`workspaceDir` con `nestWorkspaces`). Así quedan juntos los creados desde Orca y los creados con git:
  `git worktree add -b feature/<nombre> ~/orca/workspaces/ritmo/<nombre> main`, y después `npm ci` dentro del worktree.
- Si el worktree lo creó Orca, usa su rama tal como está; no crees otro para la misma feature.
- Antes de crear el worktree, confirma que `main` no tiene cambios sin commitear que la feature necesite. Si los tiene, intégralos primero en `main` con su propia rama y PR, porque `main` no admite push directo; no los copies al worktree.
- Trabaja, ejecuta `npm run typecheck` y `npm test` y commitea en la rama del worktree.
- `main` está protegida por un ruleset: no admite push directo ni force-push, y solo integra PR con el check `ci` aprobado, la rama al día con `main` y el método rebase. El check lo define `.github/workflows/ci.yml` (`npm ci`, `npm run typecheck` y `npm test` en macOS con la versión de Node de `.nvmrc`); si renombras el job, actualiza el ruleset.
- Para traerlo a `main`, ejecuta `scripts/integrar-feature.sh` desde el worktree (skill `integrar-feature`). Sube la rama, crea su PR si no existe, espera el check `ci`, integra el PR por rebase, borra la rama remota, actualiza `main` local y elimina el worktree y la rama local con `orca worktree rm`, lo que también cierra la sesión del agente en Orca. Necesita `gh` autenticado. Si la rama no está al día con `main`, rebásala sobre `main` y resuelve allí; si el check falla, el script se detiene sin integrar. Si el worktree tiene cambios sin commitear, el script se detiene; `--force` los descarta, y solo debe usarse con confirmación del usuario. Ejecútalo como última acción de la sesión.
- No dejes worktrees abiertos de features ya integradas. `git worktree list` debe mostrar solo `main` y el trabajo en curso.

## Pruebas

- `test/unit/<área>/`: una prueba por módulo de `src/` (por ejemplo, `unit/main/focus.test.ts`). Sin procesos externos; los archivos y SQLite van en directorios temporales.
- `test/contract/`: comprueba que `preload.ts`, `ipc.ts` y `RitmoAPI` sigan sincronizados. Si añades un método a `RitmoAPI`, `sampleCalls` deja de compilar hasta que lo incluyas.
- `test/integration/`: ejecuta `block-sites.sh` real contra un hosts falso en `/tmp`.
- `test/helpers/`: piezas reutilizables. `fakes.ts` tiene `FakeBlocker`, `FakeNotifier`, `FakeSoundPlayer`, `FakeClock` (también implementa `Timers`), `FakeQuitSignals`, `FakeIpc` y `sequentialIds`. `harness.ts` tiene `createHarness(t, { saved, clock, shutdownTimeoutMs })`, que arma store, repositorio y servicios (también `lifecycle`, con `clock` como temporizadores) con dobles, y `buildState`. `temp.ts` tiene `tempDir(t)`, que se limpia sola. Reutilízalas en lugar de crear dobles ad hoc en cada archivo.
- Controla el tiempo con `FakeClock` (`advance`, `advanceMinutes`, `nextDay`, que también disparan sus temporizadores), no con esperas reales.
- Para documentar un defecto conocido sin romper la suite, usa `test(..., { todo: 'motivo' }, ...)`. Quita el `todo` cuando lo corrijas.
- Las pruebas no tienen DOM. En el renderer, lleva la lógica a funciones puras de `view.ts` y pruébalas en `test/unit/renderer/`; los módulos que solo copian valores al DOM quedan sin cubrir.
- Cobertura: los servicios de `src/main/`, `src/shared/`, `preload.ts` y `view.ts` están al 100 %. Quedan fuera, a propósito, `src/main.ts`, `src/main/app.ts` (raíz de composición con Electron) y los módulos DOM del renderer. `block-sites.sh` no se mide; sus ramas las cubre `test/integration/`. Si añades lógica, añade su prueba en lugar de bajar los umbrales.
