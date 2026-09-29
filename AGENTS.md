# Guía para agentes: Ritmo

Ritmo es una aplicación de productividad para macOS hecha con Electron y TypeScript. Ofrece sesiones de foco y descanso, tareas diarias y bloqueo de dominios durante el foco. Lee `README.md` para el comportamiento visible para el usuario, `docs/glosario.md` para el significado de cada término del dominio y `docs/arquitectura.md` para los diagramas de procesos, servicios, puertos y adaptadores, y del ciclo de una sesión.

## Mapa del proyecto

- `src/main.ts` inicia el proceso principal. En `src/main/`, `app.ts` es la raíz de composición: crea con `createMainContainer` (`container.ts`, Awilix) el contenedor de singletons, le pasa lo que viene de Electron y resuelve de él los servicios. Solo `container.ts` importa Awilix y construye las clases de servicio; los servicios reciben sus dependencias por constructor y no importan Electron. `window-size.ts` calcula el tamaño inicial de la ventana a partir del área útil de la pantalla. El resto se divide en módulos por contexto, cada uno con su servicio, sus adaptadores y un `ports.ts` con la interfaz del servicio y sus puertos de salida:
  - `common/`: `Clock`, `Timers`, `Notifier` y sus adaptadores (`timers.ts`, `notifier.ts`).
  - `state/`: `StateStore` (`state-store.ts`, `StateStorePort`), dueño del estado, su persistencia y las operaciones protegidas; `PublishState`.
  - `focus/`: `FocusService` (`focus-service.ts`, `FocusServicePort`), sesiones de foco y descanso y el tic; `SoundPlayer` y `sound-player.ts`.
  - `blocking/`: `DomainService` (`domain-service.ts`, `DomainServicePort`), los dominios bloqueados; `SiteBlocker` y `site-blocker.ts`.
  - `tasks/`: `TaskService` (`task-service.ts`, `TaskServicePort`) y el repositorio SQLite (`task-repository.ts`, `TaskRepositoryPort`).
  - `lifecycle/`: `LifecycleService` (`lifecycle-service.ts`, `LifecycleServicePort`) arranca el tic y hace el cierre ordenado de todas las vías de salida (`before-quit`, `SIGINT`, `SIGTERM`, apagado de macOS): espera la operación en curso, quita el bloqueo, guarda el estado y cierra SQLite, con un tiempo máximo; `QuitSignals` y `quit-signals.ts`.
  - `ipc/`: `handlers.ts` solo conecta canales con servicios; `IpcRegistrar`.
- `src/preload.ts` expone `window.ritmo` al renderer. Mantén el aislamiento de contexto y la API limitada.
- `src/renderer/main.tsx` inicia React. `src/renderer/screens/` contiene Hoy y Planner; `src/renderer/components/` contiene las piezas de la aplicación y `src/components/ui/` los componentes editables de shadcn/ui. La lógica de presentación sin DOM va en `src/renderer/view.ts`.
- `src/shared/contracts.ts` define los tipos de estado y la API; `src/shared/validation.ts` valida entradas y define valores por defecto.
- `src/block-sites.sh` administra una sección identificada en `/etc/hosts`; con `check` solo comprueba que se puede ejecutar. Se instala como helper de root en `/Library/PrivilegedHelperTools/ritmo-block-sites`.
- `src/install-block-helper.sh` instala ese helper y la regla de sudoers de la cuenta. Lo ejecuta `main/blocking/site-blocker.ts` con `osascript` y privilegios de administrador, solo cuando el helper falta, cambió o perdió el permiso.
- `test/` está organizado por nivel; ver «Pruebas».
- `src/styles.css` usa Tailwind CSS y los tokens de shadcn/ui. Vite compila la interfaz a `dist/src/`; `dist/` es generado y está ignorado por Git.

## Comandos

- `npm install`: instala dependencias. El proyecto usa Node 24 (`.nvmrc`, `engines` de `package.json`).
- `npm run typecheck`: comprueba los tipos del proceso principal y del renderer sin generar archivos.
- `npm test`: compila todo y ejecuta todas las pruebas con `node --test`.
- `npm run test:unit`, `npm run test:contract`, `npm run test:integration`: compilan con `tsc` y ejecutan un solo nivel.
- `npm run coverage`: compila y ejecuta todas las pruebas con c8. Informa por archivo de `src/` (también los que no carga ninguna prueba) y falla por debajo de los umbrales de `.c8rc.json`. El HTML queda en `coverage/`.
- `npm run build`: genera la app en `dist/`.
- `npm start`: compila y abre Electron; requiere macOS para probar el bloqueo real.
- `npm run dev:renderer`: abre el servidor de Vite, con recarga en caliente, para trabajar en la estructura y los estilos. En el navegador no hay `window.ritmo`, así que no hay datos ni acciones; para eso usa `npm start`. El servidor quita la CSP de `index.html`, que la compilación conserva.

## Al cambiar código

- Conserva sincronizados los contratos de `src/shared/contracts.ts`, el puente de `src/preload.ts`, los manejadores de `src/main/ipc/handlers.ts` y sus llamadas desde el renderer.
- Valida en el proceso principal toda entrada recibida por IPC. El renderer no tiene acceso directo a Node ni a Electron.
- Respeta la persistencia local de `StateStore` y el reinicio diario de tareas y contador. Las operaciones de foco que cambian el estado pasan por `guarded`.
- En el bloqueo de sitios, preserva las entradas ajenas a la sección de Ritmo y la recuperación tras un cierre inesperado. No ejecutes pruebas contra el `/etc/hosts` real: la prueba del script usa `RITMO_TEST_HOSTS` con un archivo temporal.
- Antes de cerrar un cambio de código, ejecuta `npm run typecheck` y las pruebas pertinentes. Si cambias la compilación o recursos copiados a `dist/`, ejecuta también `npm run build`.
- No edites `dist/` ni `node_modules/` directamente. Respeta los cambios locales existentes que no pertenezcan a la tarea.
- Si cambias un puerto, un servicio o su interfaz, un módulo, su registro en `src/main/container.ts` o su cableado en `src/main/app.ts`, el ciclo de una sesión o un término del dominio (tipos de `src/shared/contracts.ts` o de un `ports.ts` de `src/main/`), actualiza `docs/glosario.md` y `docs/arquitectura.md` en el mismo cambio.
- Inyecta las dependencias nuevas con efectos externos (Electron, procesos, reloj, red) como un puerto en el `ports.ts` del módulo que la usa, o en `common/ports.ts` si la usan varios; si no encaja en ningún módulo, crea uno nuevo con su `ports.ts`.
- Cada servicio implementa (`implements`) la interfaz declarada en el `ports.ts` de su módulo, con solo lo que usan sus consumidores. Los consumidores, `MainCradle` incluido, dependen de la interfaz y la importan con `import type`; entre módulos solo se importa `ports.ts`, y solo `container.ts` (y las pruebas) importan las clases de servicio. Regístralas en `src/main/container.ts` y pasa desde `src/main/app.ts` lo que dependa de Electron. Los servicios no deben importar `electron` ni usar `Date.now()` directamente; usan `store.now()`.

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

- `test/unit/<área>/`: una prueba por archivo de `src/`, en la misma ruta (por ejemplo, `unit/main/focus/focus-service.test.ts`). Sin procesos externos; los archivos y SQLite van en directorios temporales.
- `test/contract/`: comprueba que `preload.ts`, `ipc/handlers.ts` y `RitmoAPI` sigan sincronizados. Si añades un método a `RitmoAPI`, `sampleCalls` deja de compilar hasta que lo incluyas.
- `test/integration/`: ejecuta `block-sites.sh` real contra un hosts falso en `/tmp`.
- `test/helpers/`: piezas reutilizables. `fakes.ts` tiene `FakeBlocker`, `FakeNotifier`, `FakeSoundPlayer`, `FakeClock` (también implementa `Timers`), `FakeQuitSignals`, `FakeIpc` y `sequentialIds`. `harness.ts` tiene `createHarness(t, { saved, clock, shutdownTimeoutMs })`, que arma store, repositorio y servicios (también `lifecycle`, con `clock` como temporizadores) con dobles, y `buildState`. `temp.ts` tiene `tempDir(t)`, que se limpia sola. Reutilízalas en lugar de crear dobles ad hoc en cada archivo.
- Controla el tiempo con `FakeClock` (`advance`, `advanceMinutes`, `nextDay`, que también disparan sus temporizadores), no con esperas reales.
- Para documentar un defecto conocido sin romper la suite, usa `test(..., { todo: 'motivo' }, ...)`. Quita el `todo` cuando lo corrijas.
- Las pruebas no tienen DOM. En el renderer, lleva la lógica a funciones puras de `view.ts` y pruébalas en `test/unit/renderer/`; los componentes visuales de React quedan sin cubrir.
- Cobertura: los servicios de `src/main/`, `src/shared/`, `preload.ts` y `view.ts` están al 100 %. Quedan fuera, a propósito, `src/main.ts`, `src/main/app.ts` (raíz de composición con Electron) y el paquete de React. `block-sites.sh` no se mide; sus ramas las cubre `test/integration/`. Si añades lógica, añade su prueba en lugar de bajar los umbrales.
