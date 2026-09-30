# Guía para agentes: Ritmo

Ritmo es una aplicación de productividad para macOS hecha con Electron y TypeScript. Ofrece sesiones de foco y descanso, tareas diarias y bloqueo de dominios durante el foco. Lee `README.md` para el comportamiento visible para el usuario, `docs/bloqueo-de-sitios.md` para el helper de bloqueo y su recuperación, `docs/desarrollo.md` para la compilación y los datos locales, `docs/glosario.md` para el significado de cada término del dominio y `docs/arquitectura.md` para los diagramas de procesos, servicios, puertos y adaptadores, y del ciclo de una sesión.

## Mapa del proyecto

- `src/main/index.ts` inicia el proceso principal. En `src/main/`, `app.ts` es la raíz de composición: crea con `createMainContainer` (`container.ts`, Awilix) el contenedor de singletons, le pasa lo que viene de Electron y resuelve de él los servicios. Solo `container.ts` importa Awilix y construye las clases de servicio; los servicios reciben sus dependencias por constructor y no importan Electron. `window-size.ts` calcula el tamaño inicial de la ventana a partir del área útil de la pantalla. El resto se divide en módulos por contexto, cada uno con su servicio, sus adaptadores y un `ports.ts` con la interfaz del servicio y sus puertos de salida:
  - `common/`: `Clock`, `Timers`, `Notifier`, `IdGenerator` y sus adaptadores (`timers.ts`, `notifier.ts`).
  - `state/`: `StateStore` (`state-store.ts`; `StateStorePort` para los servicios, `PublicStatePort` para IPC y `StateShutdownPort` para el cierre), dueño del estado, su persistencia y las operaciones protegidas; `PublishState`; `ipc.ts` registra `get-state`.
  - `focus/`: `FocusService` (`focus-service.ts`; `FocusServicePort` para IPC y `FocusLifecyclePort` para el ciclo de vida), sesiones de foco y descanso y el tic; `SoundPlayer` y `sound-player.ts`; `ipc.ts` registra los canales de foco y descanso.
  - `blocking/`: `DomainService` (`domain-service.ts`, `DomainServicePort`), los dominios bloqueados; `SiteBlocker` y `site-blocker.ts`; `ipc.ts` registra los canales de dominios y `retry-unblock`.
  - `tasks/`: `TaskService` (`task-service.ts`, `TaskServicePort`; `StudyTasksPort` para las rutas: avance por etapa y desvincular tareas) y el repositorio SQLite (`task-repository.ts`, `TaskRepositoryPort`), con el vínculo opcional de cada tarea a una etapa; `ipc.ts` registra los canales de tareas.
  - `study/`: `StudyService` (`study-service.ts`, `StudyServicePort`), las rutas de estudio, y su repositorio SQLite (`study-repository.ts`, `StudyRepositoryPort`; `StudyStagesPort` para que las tareas comprueben la etapa de su vínculo), con su propia conexión a `ritmo.db`; `ipc.ts` registra los canales de rutas de estudio.
  - `lifecycle/`: `LifecycleService` (`lifecycle-service.ts`, `LifecycleServicePort`) arranca el tic y hace el cierre ordenado de todas las vías de salida (`before-quit`, `SIGINT`, `SIGTERM`, apagado de macOS): espera la operación en curso, quita el bloqueo, guarda el estado y cierra las conexiones SQLite (`Database`), con un tiempo máximo; `QuitSignals` y `quit-signals.ts`.
  - `ipc/`: `register.ts` (`registerHandlers`) solo compone el `ipc.ts` de cada módulo; `handle.ts` (`createHandle`) envuelve cada manejador para devolver `IpcResult`; `ports.ts` tiene `IpcRegistrar` y `Handle<Channels>`, con que cada `ipc.ts` solo puede registrar los canales de su contrato.
- `src/preload/index.ts` expone `window.ritmo` al renderer. Mantén el aislamiento de contexto y la API limitada.
- `src/renderer/index.html` carga `src/renderer/src/main.tsx`, que inicia React. En `src/renderer/src/`, `screens/` contiene Hoy, Planner y Rutas (rutas de estudio), `components/` las piezas de la aplicación, `components/ui/` los componentes editables de shadcn/ui (alias `@` = `src/renderer/src`) y `view.ts` la lógica de presentación sin DOM.
- `src/shared/` guarda lo que cruza procesos. Cada módulo que habla con el renderer tiene su contrato en `src/shared/<módulo>/contract.ts` (`focus`, `tasks`, `blocking`, `state`, `study`): sus tipos, su parte de `AppState`, su API (`FocusAPI`…), sus canales IPC (`FocusChannels`… con `ChannelMap`) y la validación y los valores por defecto de su entrada. `ipc.ts` tiene `PublicError`, `IpcResult`, `ApiError` y los tipos auxiliares de canales; `api.ts` solo compone `RitmoAPI`, `RitmoChannels` y `RitmoEvents` y declara `window.ritmo`.
- `resources/block-sites.sh` administra una sección identificada en `/etc/hosts`; con `check` solo comprueba que se puede ejecutar. Se instala como helper de root en `/Library/PrivilegedHelperTools/ritmo-block-sites`.
- `resources/install-block-helper.sh` instala ese helper y la regla de sudoers de la cuenta. Lo ejecuta `main/blocking/site-blocker.ts` con `osascript` y privilegios de administrador, solo cuando el helper falta, cambió o perdió el permiso.
- `test/` está organizado por nivel; ver «Pruebas».
- `resources/` guarda lo que la app usa sin compilar (esos dos scripts y el icono); `app.ts` pasa su ruta al contenedor como `resourcesPath`.
- `electron.vite.config.ts` compila con `electron-vite` las entradas `main`, `preload` y `renderer` a `out/`. `src/renderer/src/styles.css` usa Tailwind CSS y los tokens de shadcn/ui. `tsc` compila a `dist/` solo lo que ejecutan las pruebas. `out/` y `dist/` son generados y están ignorados por Git.

## Comandos

- `npm install`: instala dependencias. El proyecto usa Node 24 (`.nvmrc`, `engines` de `package.json`).
- `npm run typecheck`: comprueba los tipos del proceso principal y del renderer sin generar archivos.
- `npm test`: compila todo y ejecuta todas las pruebas con `node --test`.
- `npm run test:unit`, `npm run test:contract`, `npm run test:integration`: borran `dist/`, compilan con `tsc` y ejecutan un solo nivel. Borrar `dist/` evita ejecutar pruebas compiladas de archivos que ya no existen.
- `npm run coverage`: compila y ejecuta todas las pruebas con c8. Informa por archivo de `src/` (también los que no carga ninguna prueba) y falla por debajo de los umbrales de `.c8rc.json`. El HTML queda en `coverage/`.
- `npm run build`: comprueba los tipos y genera la app en `out/` con `electron-vite`.
- `npm start`: compila y abre Electron; requiere macOS para probar el bloqueo real.
- `npm run dev`: abre Electron con el renderer servido por Vite, con recarga en caliente y datos reales; los cambios del proceso principal o del preload reinician la app. El servidor quita la CSP de `index.html`, que la compilación conserva.

## Al cambiar código

- Conserva sincronizados los contratos de `src/shared/<módulo>/contract.ts`, el puente de `src/preload/index.ts`, los manejadores de `src/main/<módulo>/ipc.ts` y sus llamadas desde el renderer. Un método nuevo de la API va en la API de su módulo con su canal en el `ChannelMap` del mismo contrato y su manejador en el `ipc.ts` del módulo; si el módulo es nuevo, compón su API y sus canales en `src/shared/api.ts` y su registro en `src/main/ipc/register.ts`.
- El preload se ejecuta con sandbox: de `src/shared/` solo importa tipos (`import type`).
- Valida en el proceso principal toda entrada recibida por IPC. El renderer no tiene acceso directo a Node ni a Electron.
- Respeta la persistencia local de `StateStore` y el reinicio diario de tareas y contador. Las operaciones de foco que cambian el estado pasan por `guarded`.
- En el bloqueo de sitios, preserva las entradas ajenas a la sección de Ritmo y la recuperación tras un cierre inesperado. No ejecutes pruebas contra el `/etc/hosts` real: la prueba del script usa `RITMO_TEST_HOSTS` con un archivo temporal.
- Antes de cerrar un cambio de código, ejecuta `npm run typecheck` y las pruebas pertinentes. Si cambias la compilación o `resources/`, ejecuta también `npm run build`.
- No edites `out/`, `dist/` ni `node_modules/` directamente. Respeta los cambios locales existentes que no pertenezcan a la tarea.
- Si cambias un puerto, un servicio o su interfaz, un módulo, su registro en `src/main/container.ts` o su cableado en `src/main/app.ts`, el ciclo de una sesión o un término del dominio (tipos de un contrato de `src/shared/` o de un `ports.ts` de `src/main/`), actualiza `docs/glosario.md` y `docs/arquitectura.md` en el mismo cambio.
- Inyecta las dependencias nuevas con efectos externos (Electron, procesos, reloj, red) como un puerto en el `ports.ts` del módulo que la usa, o en `common/ports.ts` si la usan varios; si no encaja en ningún módulo, crea uno nuevo con su `ports.ts`.
- Cada servicio implementa (`implements`) las interfaces declaradas en el `ports.ts` de su módulo. Cada consumidor recibe una interfaz con solo lo que usa; si dos consumidores usan partes distintas, sepáralas en dos interfaces. Los consumidores, `MainCradle` incluido, dependen de la interfaz y la importan con `import type`; entre módulos solo se importa `ports.ts` (salvo `ipc/register.ts`, que importa el `ipc.ts` de cada módulo), y solo `container.ts` (y las pruebas) importan las clases de servicio. Regístralas en `src/main/container.ts` y pasa desde `src/main/app.ts` lo que dependa de Electron. Los servicios no deben importar `electron` ni usar `Date.now()` directamente; usan `store.now()`.

## Flujo de trabajo con worktrees

- Cada feature o cambio se desarrolla en su propio worktree y rama, nunca directamente en `main`.
- Los worktrees viven en `~/orca/workspaces/ritmo/<nombre>`, la carpeta que usa Orca (`workspaceDir` con `nestWorkspaces`). Así quedan juntos los creados desde Orca y los creados con git:
  `git worktree add -b feature/<nombre> ~/orca/workspaces/ritmo/<nombre> main`, y después `npm ci` dentro del worktree.
- Si el worktree lo creó Orca, usa su rama tal como está; no crees otro para la misma feature.
- Antes de crear el worktree, confirma que `main` no tiene cambios sin commitear que la feature necesite. Si los tiene, intégralos primero en `main` con su propia rama y PR, porque `main` no admite push directo; no los copies al worktree.
- Trabaja, ejecuta `npm run typecheck` y `npm test` y commitea en la rama del worktree.
- Cada commit debe tener sentido por sí solo: un cambio coherente que compila y pasa las pruebas, sin mezclar tareas ajenas. El asunto va en español, en tercera persona del presente («Muestra…», «Evita…», «Corrige…»), dice qué cambia para el usuario o el código y tiene menos de unos 72 caracteres, sin punto final. Evita asuntos vacíos como «fix», «cambios», «wip» o «arreglos». Si el porqué no es obvio, explícalo en el cuerpo, separado por una línea en blanco. Antes de integrar, junta con `git rebase` los commits de corrección que no aporten nada por separado.
- `main` está protegida por un ruleset: no admite push directo ni force-push, y solo integra PR con el check `ci` aprobado, la rama al día con `main` y el método rebase. El check lo define `.github/workflows/ci.yml` (`npm ci`, `npm run typecheck` y `npm test` en macOS con la versión de Node de `.nvmrc`); si renombras el job, actualiza el ruleset.
- Para traerlo a `main`, ejecuta `scripts/integrar-feature.sh` desde el worktree (skill `integrar-feature`). Sube la rama, crea su PR si no existe, espera el check `ci`, integra el PR por rebase, borra la rama remota, actualiza `main` local y elimina el worktree y la rama local con `orca worktree rm`, lo que también cierra la sesión del agente en Orca. Necesita `gh` autenticado. Si la rama no está al día con `main`, rebásala sobre `main` y resuelve allí; si el check falla, el script se detiene sin integrar. Si el worktree tiene cambios sin commitear, el script se detiene; `--force` los descarta, y solo debe usarse con confirmación del usuario. Ejecútalo como última acción de la sesión.
- No dejes worktrees abiertos de features ya integradas. `git worktree list` debe mostrar solo `main` y el trabajo en curso.

## Pruebas

- `test/unit/<área>/`: una prueba por archivo de `src/`, en la misma ruta (por ejemplo, `unit/main/focus/focus-service.test.ts` o `unit/shared/tasks/contract.test.ts`). Sin procesos externos; los archivos y SQLite van en directorios temporales.
- `test/contract/`: comprueba que el preload, `ipc/register.ts` (con el `ipc.ts` de cada módulo) y `RitmoAPI` sigan sincronizados. Si añades un método a `RitmoAPI`, `sampleCalls` deja de compilar hasta que lo incluyas.
- `test/integration/`: ejecuta `block-sites.sh` real contra un hosts falso en `/tmp`.
- `test/helpers/`: piezas reutilizables. `fakes.ts` tiene `FakeBlocker`, `FakeNotifier`, `FakeSoundPlayer`, `FakeClock` (también implementa `Timers`), `FakeQuitSignals`, `FakeIpc` y `sequentialIds`. `harness.ts` tiene `createHarness(t, { saved, clock, shutdownTimeoutMs })`, que arma store, los repositorios de tareas y de rutas y los servicios (también `lifecycle`, con `clock` como temporizadores) con dobles, y `buildState`. `temp.ts` tiene `tempDir(t)`, que se limpia sola. Reutilízalas en lugar de crear dobles ad hoc en cada archivo.
- Controla el tiempo con `FakeClock` (`advance`, `advanceMinutes`, `nextDay`, que también disparan sus temporizadores), no con esperas reales.
- Para documentar un defecto conocido sin romper la suite, usa `test(..., { todo: 'motivo' }, ...)`. Quita el `todo` cuando lo corrijas.
- Las pruebas no tienen DOM. En el renderer, lleva la lógica a funciones puras de `view.ts` y pruébalas en `test/unit/renderer/`; los componentes visuales de React quedan sin cubrir.
- Cobertura: los servicios de `src/main/`, `src/shared/` (salvo `api.ts`, que solo tiene tipos), `src/preload/` y `view.ts` están al 100 %. Quedan fuera, a propósito, `src/main/index.ts`, `src/main/app.ts` (raíz de composición con Electron) y el paquete de React. `block-sites.sh` no se mide; sus ramas las cubre `test/integration/`. Si añades lógica, añade su prueba en lugar de bajar los umbrales.
