# Glosario de dominio

Términos que usa Ritmo en el código, los contratos y la interfaz. Cada entrada indica el identificador en código y el archivo donde vive. La interfaz habla en español y el código en inglés; esta tabla los relaciona. Los diagramas de procesos, servicios y ciclo de una sesión están en [`arquitectura.md`](arquitectura.md).

Si cambias un término, un puerto o un servicio, actualiza este glosario y `arquitectura.md` en el mismo cambio.

## Sesiones y temporizador

| Término | Definición | En código | Dónde |
| --- | --- | --- | --- |
| Sesión | Intervalo cronometrado en curso: un foco o un descanso. Solo hay una a la vez; sin sesión, la app está «Lista para empezar». Se guarda en `state.json` y sobrevive a reinicios. | `Session`, `AppState.session` (`Session \| null`) | `src/shared/contracts.ts` |
| Tipo de sesión | Foco, descanso corto o descanso largo. | `SessionKind` = `'focus' \| 'shortBreak' \| 'longBreak'` | `src/shared/contracts.ts` |
| Fin de la sesión | Instante, en milisegundos desde la época, en que termina la sesión. Se calcula al iniciarla; el renderer deriva de él la cuenta atrás. | `Session.endsAt` | `src/shared/contracts.ts` |
| Foco | Sesión de 25 minutos con los dominios bloqueados. Iniciarla exige al menos un dominio y ningún bloqueo pendiente. | `'focus'`, `FocusService.startFocus()` | `src/main/focus.ts` |
| Descanso corto / largo | Sesión de 5 o 15 minutos sin bloqueo. La inicia el usuario; no empieza sola al acabar el foco. | `BreakKind` = `'shortBreak' \| 'longBreak'`, `FocusService.startBreak()` | `src/shared/contracts.ts`, `src/main/focus.ts` |
| Duraciones | Minutos de cada tipo de sesión. | `MINUTES` | `src/shared/validation.ts` |
| Terminar foco / descanso | Acabar la sesión antes de tiempo. Terminar el foco así desbloquea pero no cuenta un pomodoro. | `finishFocus()`, `finishBreak()`, `FocusService.endFocus(false)` | `src/main/focus.ts` |
| Tic | Comprobación que el proceso principal ejecuta cada segundo: hace el reinicio diario y, si la sesión venció, la cierra. | `FocusService.tick()`, `LifecycleService.start()`, `TICK_INTERVAL_MS` | `src/main/focus.ts`, `src/main/lifecycle.ts` |
| Pomodoro | Un foco completado: el que llega a su fin por el tic, no el que se termina a mano. Al completarse se desbloquea, se suma al contador, se notifica y suena una señal. | `FocusService.endFocus(true)` | `src/main/focus.ts` |
| Contador diario | Pomodoros completados hoy. Se pone a cero en el reinicio diario; no hay historial. | `AppState.focusCount`, `focusCountText()` | `src/shared/contracts.ts`, `src/renderer/view.ts` |

## Día y tareas

| Término | Definición | En código | Dónde |
| --- | --- | --- | --- |
| Día | Fecha local actual con formato `YYYY-MM-DD`. Es el día al que pertenecen el contador y la lista **Hoy**. | `AppState.day`, `todayKey()`, `StateStore.today()` | `src/shared/contracts.ts`, `src/shared/validation.ts`, `src/main/state.ts` |
| Reinicio diario | Cambio de día detectado al abrir la app, en cada tic, en `get-state` y al crear, marcar o borrar tareas. Pone `focusCount` a 0 y recarga las tareas del nuevo día. No borra ni mueve tareas. | `StateStore.rollDay()` | `src/main/state.ts` |
| Tarea | Algo por hacer en un día concreto. Título de 1 a 160 caracteres. Su fuente es SQLite (`ritmo.db`). `state.json` guarda además una copia de las tareas de hoy: se valida en cada arranque, pero las tareas vigentes se cargan desde SQLite. | `Task` (`id`, `title`) | `src/shared/contracts.ts`, `src/main/tasks.ts` |
| Fecha planificada | Día al que pertenece una tarea. Las pendientes se quedan en su fecha hasta que el usuario las mueve en el **Planner**. | `Task.plannedDate`, columna `planned_date`, `safePlannedDate()` | `src/shared/contracts.ts`, `src/main/tasks.ts`, `src/shared/validation.ts` |
| Tarea completada | Tarea con fecha de finalización. `done` se deriva de `completedAt`; desmarcarla borra la fecha. | `Task.done`, `Task.completedAt` | `src/shared/contracts.ts`, `src/main/tasks.ts` |
| Fecha de creación | Marca ISO de cuándo se creó la tarea; ordena la lista del día. | `Task.createdAt` | `src/shared/contracts.ts` |
| Tareas de hoy | Copia en memoria de las tareas planificadas para `day`, incluida en el estado público. Se refresca tras cada cambio de tareas y en el reinicio diario. | `AppState.tasks`, `TaskService.refreshToday()` | `src/shared/contracts.ts`, `src/main/task-service.ts` |
| Cambio de tarea | Edición parcial de título, fecha planificada o completado. | `TaskPatch`, `RitmoAPI.updateTask()` | `src/main/task-service.ts`, `src/shared/contracts.ts` |
| Resumen de tareas | Cuántas tareas tiene cada día de un rango y cuántas están completadas. El calendario del Planner lo pide para las seis semanas que muestra y lo usa para el indicador de cada día. Solo incluye los días con tareas. | `TaskSummary`, `DaySummary`, `RitmoAPI.getTaskSummary()`, `TaskService.summarize()`, `TaskRepositoryPort.summarizeRange()`, `calendarRange()`, `dayIndicator()` | `src/shared/contracts.ts`, `src/main/tasks.ts`, `src/main/task-service.ts`, `src/renderer/view.ts` |
| Repositorio de tareas | Acceso a la tabla `tasks` de SQLite. Los servicios dependen del puerto `TaskRepositoryPort`. | `TaskRepository`, `TaskRepositoryPort`, `TaskPatch` | `src/main/tasks.ts`, `src/main/ports.ts` |
| Migración de tareas | Importación única de las tareas antiguas de `state.json` a SQLite, con copia en `state.json.backup`. | `TaskRepository.importLegacy()`, campo `tasksMigrated` de `state.json` | `src/main/tasks.ts`, `src/main/state.ts` |

## Dominios y bloqueo

| Término | Definición | En código | Dónde |
| --- | --- | --- | --- |
| Dominio bloqueado | Sitio que se bloquea durante el foco («sitio» en la interfaz). Se normaliza a minúsculas, sin protocolo, ruta ni puerto; máximo 50. Solo se editan fuera del foco y sin bloqueo pendiente; la interfaz tampoco deja editarlos mientras hay una operación protegida en curso, aunque `DomainService` todavía no lo comprueba (prueba `todo`). | `AppState.domains`, `normalizeDomain()`, `normalizeDomains()`, `DomainService`, `domainsLocked()` | `src/shared/contracts.ts`, `src/shared/validation.ts`, `src/main/domains.ts`, `src/renderer/view.ts` |
| Dominios por defecto | Lista inicial: `facebook.com`, `linkedin.com`, `x.com`, `twitter.com`. | `DEFAULT_DOMAINS` | `src/shared/validation.ts` |
| Bloqueo de sitios | Redirigir cada dominio y su `www.` a `0.0.0.0` y `::1` en `/etc/hosts`. Lo hace un helper instalado en `/Library/PrivilegedHelperTools/ritmo-block-sites`, que la cuenta ejecuta con `sudo -n` sin contraseña; macOS solo pide autorización para instalarlo o restaurarlo. | Puerto `SiteBlocker`, `BlockAction` = `'block' \| 'unblock'` | `src/main/ports.ts`, `src/main/site-blocker.ts`, `src/block-sites.sh` |
| Sección gestionada | Bloque de `/etc/hosts` entre `# >>> RITMO FOCUS BLOCK >>>` y `# <<< RITMO FOCUS BLOCK <<<`. Es lo único que Ritmo escribe o borra; el resto del archivo se conserva. | `BLOCK_MARKER`, `SiteBlocker.hasManagedBlock()` | `src/main/site-blocker.ts`, `src/block-sites.sh` |
| Bloqueo pendiente | Mensaje que indica que la sección gestionada puede seguir en `/etc/hosts` sin un foco activo: falló el desbloqueo o se encontró un bloqueo anterior. Mientras exista, no se puede iniciar sesión ni editar dominios, y la interfaz solo ofrece **Quitar bloqueo**. | `AppState.blockError` | `src/shared/contracts.ts`, `src/main/focus.ts` |
| Quitar bloqueo | Reintento de desbloqueo. Usa el mismo camino que terminar el foco. | `RitmoAPI.retryUnblock()`, canal `retry-unblock` → `FocusService.finishFocus()` | `src/shared/contracts.ts`, `src/main/ipc.ts` |
| Recuperación tras cierre inesperado | Reconciliación al arrancar entre la sesión guardada y `/etc/hosts`: con sección y sin foco, marca bloqueo pendiente; con foco y sin sección, descarta el foco; sin sección, limpia `blockError`. | `FocusService.recover()` | `src/main/focus.ts` |
| Liberar antes de salir | Paso del cierre ordenado: con foco activo o bloqueo pendiente, se intenta desbloquear. Si falla, la app sale igualmente con el error en `blockError`, descarta el foco (como el tic al fallar, para que no se cuente como pomodoro al reabrir) y notifica «Bloqueo aún activo»; `recover()` lo resuelve al arrancar. | `FocusService.mustReleaseBeforeQuit()`, `LifecycleService` | `src/main/focus.ts`, `src/main/lifecycle.ts` |
| Cierre ordenado | Secuencia única de salida para `before-quit` (Cmd+Q), `SIGINT` (Ctrl+C), `SIGTERM` y el apagado de macOS: detiene el tic, deja de aceptar operaciones protegidas, espera la que esté en curso, libera el bloqueo, guarda `state.json` y cierra SQLite. Se ejecuta una sola vez aunque lleguen varios avisos, y después la app sale con `app.exit()`. | `LifecycleService.shutdown()`, `LifecycleService.listen()`, `StateStore.drain()`, `StateStore.closeWith()` | `src/main/lifecycle.ts`, `src/main/state.ts` |
| Tiempo máximo del cierre | Límite de cada fase del cierre ordenado: la espera de la operación en curso y el desbloqueo tienen cada una 160 s por defecto. La operación en curso puede estar reinstalando el helper: un diálogo de administrador de `osascript` (hasta 120 s) y hasta tres llamadas a `sudo` (hasta 10 s cada una). El desbloqueo al salir no pide autorización (`authorize: false`), así que solo usa `sudo`. Si la espera agota el tiempo, no se intenta desbloquear. Al vencer, la app sale aunque macOS no haya respondido; si aún había que desbloquear, conserva el `blockError` que hubiera o guarda «Ritmo se cerró antes de quitar el bloqueo.», descarta el foco y notifica «Bloqueo aún activo». | `DEFAULT_SHUTDOWN_TIMEOUT_MS`, opción `shutdownTimeoutMs` de `createMainContainer()` | `src/main/lifecycle.ts`, `src/main/container.ts` |

## Estado y comunicación

| Término | Definición | En código | Dónde |
| --- | --- | --- | --- |
| Estado de la app | Estado persistente del proceso principal. Se guarda completo en `state.json`, con escritura atómica. `tasks` va incluido como copia. En cada arranque `load()` lee y valida esa copia, y si es inválida la app no arranca; después las tareas se sustituyen por las de SQLite. Solo la migración inicial importa esa copia a SQLite. | `AppState`, `StateStore.state`, `StateStore.save()` | `src/shared/contracts.ts`, `src/main/state.ts` |
| Almacén de estado | Dueño del estado: lo carga, valida, guarda y publica, y ofrece el reloj a los servicios. | `StateStore` | `src/main/state.ts` |
| Estado público | Lo que recibe el renderer: `AppState` más `busy` y `now`. Se envía por el canal `state` en cada `save()` y al empezar una operación protegida. | `PublicState`, `StateStore.publicState()`, `StateStore.publish()` | `src/shared/contracts.ts`, `src/main/state.ts` |
| Hora del proceso principal | `now` de `PublicState`: hora del reloj del proceso principal cuando se publicó el estado. El temporizador del renderer usa su propio `Date.now()`. | `PublicState.now` | `src/shared/contracts.ts` |
| Operación protegida | Operación de foco que no puede solaparse con otra, porque puede esperar la autorización de macOS. Marca `busy`, publica, ejecuta y guarda al terminar, aunque falle. Si ya hay una en curso, falla con «Espera a que termine la operación anterior.», y durante el cierre ordenado, con «Ritmo se está cerrando.». La usan `startFocus`, `finishFocus`, `startBreak`, `finishBreak` y el cierre de una sesión en `tick`; el cierre ordenado espera la que esté en curso con `drain()` y ejecuta la última con `closeWith()`. | `StateStore.guarded()`, `StateStore.drain()`, `StateStore.closeWith()`, `StateStore.busy`, `StateStore.closing`, `PublicState.busy` | `src/main/state.ts` |
| API del renderer | Única puerta del renderer al proceso principal, expuesta como `window.ritmo`. Cada método invoca un canal IPC, salvo `onState()`, que escucha el canal `state`. | `RitmoAPI`, `window.ritmo` | `src/shared/contracts.ts`, `src/preload.ts` |
| Suscripción al estado | Recibe cada estado público publicado; devuelve la función para cancelarla. | `RitmoAPI.onState()`, canal `state` | `src/shared/contracts.ts`, `src/preload.ts` |
| Canales IPC | Nombres en kebab-case de cada método de `RitmoAPI` (`start-focus`, `get-tasks-for-day`, …). | `registerHandlers()`, `Services` | `src/main/ipc.ts` |

## Puertos

Interfaces de `src/main/ports.ts` por las que los servicios acceden a efectos externos. Sus implementaciones reales se registran en `src/main/container.ts`, y `src/main/app.ts` le pasa lo que viene de Electron; las pruebas usan los dobles de `test/helpers/fakes.ts`.

| Puerto | Qué abstrae | Implementación real | Quién lo usa |
| --- | --- | --- | --- |
| `SiteBlocker` | Consultar y cambiar la sección gestionada de `/etc/hosts`. | `createSiteBlocker()` en `site-blocker.ts`: ejecuta con `sudo -n` el helper instalado (copia de `block-sites.sh`); si falta o cambió, lo instala `install-block-helper.sh` mediante `osascript` con privilegios de administrador. Con `ChangeBlockOptions.authorize = false`, que usa el cierre ordenado, nunca lo instala. | `FocusService` |
| `BlockAction` | Acción de `SiteBlocker.changeBlock()`: `'block'` o `'unblock'`. El helper acepta además `check`, que no toca `/etc/hosts`: `site-blocker.ts` lo usa tras un fallo para distinguir la falta de permiso de otros errores, y no forma parte del puerto. | — | `FocusService`, `site-blocker.ts`, `block-sites.sh` |
| `Notifier` | Notificaciones del sistema. | `createNotifier(notificationApi)` en `notifier.ts`; `app.ts` pasa `Notification` de Electron como `notificationApi`. | `FocusService`, `LifecycleService` |
| `SoundPlayer` | Señal sonora al completar un pomodoro. | `createSoundPlayer()` en `sound-player.ts`: `afplay` con `Glass.aiff`. | `FocusService` |
| `TaskRepositoryPort` | Lectura y escritura de tareas por día, el resumen de un rango, la migración de las antiguas y el cierre de la conexión. | `TaskRepository` en `tasks.ts`, registrado como `taskRepository` en `container.ts`. | `StateStore`, `TaskService`, `LifecycleService` |
| `Clock` | Hora actual en milisegundos. Los servicios la leen con `store.now()`. | `Date.now`, registrado como `now` en `container.ts` e inyectado en `StateStore` y `TaskRepository`. | `StateStore`, `TaskRepository` |
| `IdGenerator` | Identificadores de tareas nuevas. | `crypto.randomUUID()`, valor por defecto de `TaskRepository`; `container.ts` no lo registra. | `TaskRepository` |
| `PublishState` | Envío del estado público al renderer. | Función que `app.ts` pasa a `createMainContainer()` y llama a `window.webContents.send('state', …)`. | `StateStore` |
| `IpcRegistrar` | Registro de manejadores IPC. | `ipcMain` de Electron, que `app.ts` pasa a `registerHandlers()`. | `registerHandlers()` |
| `Timers` | Intervalo del tic y tiempo máximo del cierre. | `systemTimers` en `timers.ts` (temporizadores de Node), registrado como `timers` en `container.ts`. | `LifecycleService` |
| `QuitSignals` | Avisos de que la app debe cerrarse, con su motivo (`QuitReason`: `'before-quit'`, `'SIGINT'`, `'SIGTERM'` o `'shutdown'`). | `createQuitSignals({ app, powerMonitor, process })` en `quit-signals.ts`; cancela `before-quit` y el `shutdown` de `powerMonitor` para terminar el cierre antes de salir. `app.ts` lo pasa a `LifecycleService.listen()`. | `LifecycleService` |

## Términos que no están en el glosario

- `Window.ritmo` en `contracts.ts` solo declara el tipo global de `window.ritmo`; se describe en «API del renderer».
- Los métodos de `RitmoAPI` que solo reenvían a un servicio (`addTask`, `toggleTask`, `deleteTask`, `getTasksForDay`, `addDomain`, `removeDomain`, `getState`) se entienden por su nombre y por los términos de tarea, dominio y estado público.
- Las dependencias de los adaptadores (`SiteBlockerDeps`, `SoundPlayerDeps`, `NotificationApi`, `QuitSources`) son detalles de prueba de cada adaptador, no términos del dominio.
