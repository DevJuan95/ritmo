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
| Tic | Comprobación que el proceso principal ejecuta cada segundo: hace el reinicio diario y, si la sesión venció, la cierra. | `FocusService.tick()`, `setInterval` en `app.ts` | `src/main/focus.ts`, `src/main/app.ts` |
| Pomodoro | Un foco completado: el que llega a su fin por el tic, no el que se termina a mano. Al completarse se desbloquea, se suma al contador, se notifica y suena una señal. | `FocusService.endFocus(true)` | `src/main/focus.ts` |
| Contador diario | Pomodoros completados hoy. Se pone a cero en el reinicio diario; no hay historial. | `AppState.focusCount`, `focusCountText()` | `src/shared/contracts.ts`, `src/renderer/view.ts` |

## Día y tareas

| Término | Definición | En código | Dónde |
| --- | --- | --- | --- |
| Día | Fecha local actual con formato `YYYY-MM-DD`. Es el día al que pertenecen el contador y la lista **Hoy**. | `AppState.day`, `todayKey()`, `StateStore.today()` | `src/shared/contracts.ts`, `src/shared/validation.ts`, `src/main/state.ts` |
| Reinicio diario | Cambio de día detectado al abrir la app, en cada tic, en `get-state` y al crear, marcar o borrar tareas. Pone `focusCount` a 0 y recarga las tareas del nuevo día. No borra ni mueve tareas. | `StateStore.rollDay()` | `src/main/state.ts` |
| Tarea | Algo por hacer en un día concreto. Título de 1 a 160 caracteres. Su fuente es SQLite (`ritmo.db`); `state.json` solo guarda una copia de las tareas de hoy que no se vuelve a leer. | `Task` (`id`, `title`) | `src/shared/contracts.ts`, `src/main/tasks.ts` |
| Fecha planificada | Día al que pertenece una tarea. Las pendientes se quedan en su fecha hasta que el usuario las mueve en el **Planner**. | `Task.plannedDate`, columna `planned_date`, `safePlannedDate()` | `src/shared/contracts.ts`, `src/main/tasks.ts`, `src/shared/validation.ts` |
| Tarea completada | Tarea con fecha de finalización. `done` se deriva de `completedAt`; desmarcarla borra la fecha. | `Task.done`, `Task.completedAt` | `src/shared/contracts.ts`, `src/main/tasks.ts` |
| Fecha de creación | Marca ISO de cuándo se creó la tarea; ordena la lista del día. | `Task.createdAt` | `src/shared/contracts.ts` |
| Tareas de hoy | Copia en memoria de las tareas planificadas para `day`, incluida en el estado público. Se refresca tras cada cambio de tareas y en el reinicio diario. | `AppState.tasks`, `TaskService.refreshToday()` | `src/shared/contracts.ts`, `src/main/task-service.ts` |
| Cambio de tarea | Edición parcial de título, fecha planificada o completado. | `TaskPatch`, `RitmoAPI.updateTask()` | `src/main/task-service.ts`, `src/shared/contracts.ts` |
| Repositorio de tareas | Acceso a la tabla `tasks` de SQLite. | `TaskRepository` | `src/main/tasks.ts` |
| Migración de tareas | Importación única de las tareas antiguas de `state.json` a SQLite, con copia en `state.json.backup`. | `TaskRepository.importLegacy()`, campo `tasksMigrated` de `state.json` | `src/main/tasks.ts`, `src/main/state.ts` |

## Dominios y bloqueo

| Término | Definición | En código | Dónde |
| --- | --- | --- | --- |
| Dominio bloqueado | Sitio que se bloquea durante el foco («sitio» en la interfaz). Se normaliza a minúsculas, sin protocolo, ruta ni puerto; máximo 50. Solo se editan fuera del foco y sin bloqueo pendiente; la interfaz tampoco deja editarlos mientras hay una operación protegida en curso, aunque `DomainService` todavía no lo comprueba (prueba `todo`). | `AppState.domains`, `normalizeDomain()`, `normalizeDomains()`, `DomainService`, `domainsLocked()` | `src/shared/contracts.ts`, `src/shared/validation.ts`, `src/main/domains.ts`, `src/renderer/view.ts` |
| Dominios por defecto | Lista inicial: `facebook.com`, `linkedin.com`, `x.com`, `twitter.com`. | `DEFAULT_DOMAINS` | `src/shared/validation.ts` |
| Bloqueo de sitios | Redirigir cada dominio y su `www.` a `0.0.0.0` y `::1` en `/etc/hosts`. Requiere autorización de administrador de macOS en cada cambio. | Puerto `SiteBlocker`, `BlockAction` = `'block' \| 'unblock'` | `src/main/ports.ts`, `src/main/site-blocker.ts`, `src/block-sites.sh` |
| Sección gestionada | Bloque de `/etc/hosts` entre `# >>> RITMO FOCUS BLOCK >>>` y `# <<< RITMO FOCUS BLOCK <<<`. Es lo único que Ritmo escribe o borra; el resto del archivo se conserva. | `BLOCK_MARKER`, `SiteBlocker.hasManagedBlock()` | `src/main/site-blocker.ts`, `src/block-sites.sh` |
| Bloqueo pendiente | Mensaje que indica que la sección gestionada puede seguir en `/etc/hosts` sin un foco activo: falló el desbloqueo o se encontró un bloqueo anterior. Mientras exista, no se puede iniciar sesión ni editar dominios, y la interfaz solo ofrece **Quitar bloqueo**. | `AppState.blockError` | `src/shared/contracts.ts`, `src/main/focus.ts` |
| Quitar bloqueo | Reintento de desbloqueo. Usa el mismo camino que terminar el foco. | `RitmoAPI.retryUnblock()`, canal `retry-unblock` → `FocusService.finishFocus()` | `src/shared/contracts.ts`, `src/main/ipc.ts` |
| Recuperación tras cierre inesperado | Reconciliación al arrancar entre la sesión guardada y `/etc/hosts`: con sección y sin foco, marca bloqueo pendiente; con foco y sin sección, descarta el foco; sin sección, limpia `blockError`. | `FocusService.recover()` | `src/main/focus.ts` |
| Liberar antes de salir | Al cerrar la app con foco activo o bloqueo pendiente, se intenta desbloquear antes de salir; si falla, la app no se cierra. | `FocusService.mustReleaseBeforeQuit()`, `before-quit` en `app.ts` | `src/main/focus.ts`, `src/main/app.ts` |

## Estado y comunicación

| Término | Definición | En código | Dónde |
| --- | --- | --- | --- |
| Estado de la app | Estado persistente del proceso principal. Se guarda completo en `state.json`, con escritura atómica. `tasks` va incluido solo como copia: al arrancar se recarga desde SQLite y el JSON solo se lee para la migración inicial. | `AppState`, `StateStore.state`, `StateStore.save()` | `src/shared/contracts.ts`, `src/main/state.ts` |
| Almacén de estado | Dueño del estado: lo carga, valida, guarda y publica, y ofrece el reloj a los servicios. | `StateStore` | `src/main/state.ts` |
| Estado público | Lo que recibe el renderer: `AppState` más `busy` y `now`. Se envía por el canal `state` en cada `save()` y al empezar una operación protegida. | `PublicState`, `StateStore.publicState()`, `StateStore.publish()` | `src/shared/contracts.ts`, `src/main/state.ts` |
| Hora del proceso principal | `now` de `PublicState`: hora del reloj del proceso principal cuando se publicó el estado. El temporizador del renderer usa su propio `Date.now()`. | `PublicState.now` | `src/shared/contracts.ts` |
| Operación protegida | Operación de foco que no puede solaparse con otra, porque puede esperar la autorización de macOS. Marca `busy`, publica, ejecuta y guarda al terminar, aunque falle. Si ya hay una en curso, falla con «Espera a que termine la operación anterior.». La usan `startFocus`, `finishFocus`, `startBreak`, `finishBreak`, el cierre de una sesión en `tick` y `before-quit`. | `StateStore.guarded()`, `StateStore.busy`, `PublicState.busy` | `src/main/state.ts` |
| API del renderer | Única puerta del renderer al proceso principal, expuesta como `window.ritmo`. Cada método invoca un canal IPC, salvo `onState()`, que escucha el canal `state`. | `RitmoAPI`, `window.ritmo` | `src/shared/contracts.ts`, `src/preload.ts` |
| Suscripción al estado | Recibe cada estado público publicado; devuelve la función para cancelarla. | `RitmoAPI.onState()`, canal `state` | `src/shared/contracts.ts`, `src/preload.ts` |
| Canales IPC | Nombres en kebab-case de cada método de `RitmoAPI` (`start-focus`, `get-tasks-for-day`, …). | `registerHandlers()`, `Services` | `src/main/ipc.ts` |

## Puertos

Interfaces de `src/main/ports.ts` por las que los servicios acceden a efectos externos. Sus implementaciones reales se cablean en `src/main/app.ts`; las pruebas usan los dobles de `test/helpers/fakes.ts`.

| Puerto | Qué abstrae | Implementación real | Quién lo usa |
| --- | --- | --- | --- |
| `SiteBlocker` | Consultar y cambiar la sección gestionada de `/etc/hosts`. | `createSiteBlocker()` en `site-blocker.ts`: `osascript` con privilegios de administrador ejecuta `block-sites.sh`. | `FocusService` |
| `BlockAction` | Acción de `SiteBlocker.changeBlock()`: `'block'` o `'unblock'`. | — | `FocusService`, `block-sites.sh` |
| `Notifier` | Notificaciones del sistema. | `createNotifier(Notification)` en `notifier.ts`. | `FocusService` |
| `SoundPlayer` | Señal sonora al completar un pomodoro. | `createSoundPlayer()` en `sound-player.ts`: `afplay` con `Glass.aiff`. | `FocusService` |
| `Clock` | Hora actual en milisegundos. Los servicios la leen con `store.now()`. | `Date.now`, valor por defecto de `StateStore` y `TaskRepository`; `app.ts` no lo inyecta. | `StateStore`, `TaskRepository` |
| `IdGenerator` | Identificadores de tareas nuevas. | `crypto.randomUUID()`, valor por defecto de `TaskRepository`; `app.ts` no lo inyecta. | `TaskRepository` |
| `PublishState` | Envío del estado público al renderer. | Función de `app.ts` que llama a `window.webContents.send('state', …)`. | `StateStore` |
| `IpcRegistrar` | Registro de manejadores IPC. | `ipcMain` de Electron. | `registerHandlers()` |

## Términos que no están en el glosario

- `Window.ritmo` en `contracts.ts` solo declara el tipo global de `window.ritmo`; se describe en «API del renderer».
- Los métodos de `RitmoAPI` que solo reenvían a un servicio (`addTask`, `toggleTask`, `deleteTask`, `getTasksForDay`, `addDomain`, `removeDomain`, `getState`) se entienden por su nombre y por los términos de tarea, dominio y estado público.
- Las dependencias de los adaptadores (`SiteBlockerDeps`, `SoundPlayerDeps`, `NotificationApi`) son detalles de prueba de cada adaptador, no términos del dominio.
