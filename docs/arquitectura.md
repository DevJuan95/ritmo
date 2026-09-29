# Arquitectura

Cómo se conectan los procesos de Electron, los servicios del proceso principal, sus puertos y sus adaptadores, y cómo avanza una sesión. Los términos se definen en [`glosario.md`](glosario.md).

Si cambias un puerto, un servicio, su registro en `src/main/container.ts`, su cableado en `src/main/app.ts` o el ciclo de una sesión, actualiza estos diagramas en el mismo cambio.

## 1. Procesos

El renderer no tiene acceso a Node ni a Electron. Todo pasa por `window.ritmo`, que `preload.ts` expone con `contextBridge`. Cada método, salvo `onState()`, invoca un canal IPC; `ipc.ts` lo conecta con un servicio, que valida la entrada. El estado vuelve por un solo canal, `state`, que `onState()` escucha, cada vez que `StateStore` guarda o empieza una operación protegida.

```mermaid
flowchart LR
  subgraph renderer["Renderer (sin Node)"]
    ui["app.ts, timer.ts, tasks.ts,<br/>planner.ts, domains.ts"]
    view["view.ts<br/>lógica sin DOM"]
    ui --> view
  end

  subgraph preload["Preload (aislado)"]
    api["window.ritmo<br/>RitmoAPI"]
  end

  subgraph main["Proceso principal"]
    ipc["ipc.ts<br/>registerHandlers"]
    services["FocusService<br/>TaskService<br/>DomainService"]
    store["StateStore"]
    ipc --> services
    ipc -- "get-state" --> store
    services --> store
  end

  ui -- "llamadas a window.ritmo" --> api
  api -- "ipcRenderer.invoke(canal, ...args)" --> ipc
  ipc -. "respuesta o error" .-> api
  store -- "PublishState:<br/>webContents.send('state')" --> api
  api -- "onState(callback)" --> ui
```

Canales: `get-state`, `start-focus`, `finish-focus`, `retry-unblock`, `start-break`, `finish-break`, `add-task`, `toggle-task`, `delete-task`, `get-tasks-for-day`, `update-task`, `add-domain` y `remove-domain`, en `invoke`, y `state`, que va del proceso principal al renderer. `retry-unblock` y `finish-focus` llaman al mismo método, `FocusService.finishFocus()`. `test/contract/` comprueba que `RitmoAPI`, `preload.ts` e `ipc.ts` sigan sincronizados.

## 2. Servicios y dependencias

`src/main/app.ts` es la raíz de composición. Crea con `createMainContainer()` (`src/main/container.ts`, Awilix) un contenedor en el que todo es singleton, le pasa lo que viene de Electron (`userData`, `Notification` y la función que publica el estado) y resuelve de él `lifecycle`. Después conecta las vías de salida con el cierre ordenado, registra los manejadores IPC con `ipcMain` y el propio `container.cradle`. Solo `app.ts` y `preload.ts` importan `electron`, y solo `container.ts` importa Awilix. Los servicios no conocen el contenedor: las fábricas de `container.ts` llaman a sus constructores de forma explícita y los servicios reciben lo de Electron a través de los puertos de `ports.ts`.

```mermaid
flowchart TB
  app["app.ts<br/>raíz de composición"]:::electron
  container["createMainContainer<br/>container.ts (Awilix)"]

  subgraph servicios["Servicios (no importan Electron)"]
    ipc["registerHandlers<br/>ipc.ts"]
    focus["FocusService<br/>focus.ts"]
    taskService["TaskService<br/>task-service.ts"]
    domainService["DomainService<br/>domains.ts"]
    lifecycle["LifecycleService<br/>lifecycle.ts"]
    store["StateStore<br/>state.ts"]
    repo["TaskRepository<br/>tasks.ts"]
  end

  subgraph adaptadores["Adaptadores (no importan Electron)"]
    blocker["createSiteBlocker<br/>site-blocker.ts"]
    notifier["createNotifier<br/>notifier.ts"]
    sound["createSoundPlayer<br/>sound-player.ts"]
    timers["systemTimers<br/>timers.ts"]
    quit["createQuitSignals<br/>quit-signals.ts"]
  end

  subgraph externos["Efectos externos"]
    ipcMain["ipcMain"]:::electron
    send["webContents.send('state')"]:::electron
    notification["Notification"]:::electron
    salida["before-quit, powerMonitor 'shutdown'"]:::electron
    signals["SIGINT, SIGTERM"]
    osascript["osascript con privilegios<br/>→ block-sites.sh"]
    hosts[("/etc/hosts")]
    afplay["afplay Glass.aiff"]
    json[("state.json")]
    db[("ritmo.db<br/>SQLite")]
  end

  app -- "userDataPath, notificationApi, publish" --> container
  app -- "ipcMain, container.cradle" --> ipc
  app -- "QuitSignals, exit" --> lifecycle
  app -- "app, powerMonitor, process" --> quit
  container -. "registra singletons" .-> servicios
  container -. "registra singletons" .-> adaptadores

  ipc -- "IpcRegistrar" --> ipcMain
  ipc --> store
  ipc --> focus
  ipc --> taskService
  ipc --> domainService

  focus --> store
  focus -- "SiteBlocker" --> blocker
  focus -- "Notifier" --> notifier
  focus -- "SoundPlayer" --> sound
  taskService --> store
  taskService --> repo
  domainService --> store
  lifecycle --> store
  lifecycle --> focus
  lifecycle --> repo
  lifecycle -- "Notifier" --> notifier
  lifecycle -- "Timers" --> timers
  lifecycle -- "QuitSignals" --> quit

  store -- "tasks" --> repo
  store -- "PublishState" --> send
  store --> json
  repo --> db

  blocker --> osascript --> hosts
  blocker -- "hasManagedBlock: lectura" --> hosts
  notifier --> notification
  sound --> afplay
  quit --> salida
  quit --> signals

  classDef electron fill:#fde2e2,stroke:#c0392b,color:#000
```

En rojo, lo que depende de Electron. Las flechas continuas son dependencias en tiempo de ejecución, rotuladas con el puerto cuando lo hay; las discontinuas indican que `container.ts` registra el módulo. `registerHandlers()` no está en el contenedor: lo llama `app.ts`.

Registros de `createMainContainer()`:

| Registro | Fábrica | Puertos sin inyectar |
| --- | --- | --- |
| `userDataPath`, `publish`, `notificationApi` | Valores que pasa `app.ts`: `app.getPath('userData')`, la función que envía el estado por `webContents.send('state', …)` si la ventana existe, y `Notification` de Electron. | — |
| `now` | Valor: `options.now`, o `Date.now` si no se pasa (`app.ts` no lo pasa). | — |
| `timers` | Valor: `options.timers`, o `systemTimers` si no se pasa (`app.ts` no lo pasa). | — |
| `shutdownTimeoutMs` | Valor: `options.shutdownTimeoutMs`; sin él, `LifecycleService` usa `DEFAULT_SHUTDOWN_TIMEOUT_MS` (125 s por fase del cierre). | — |
| `blocker` | `createSiteBlocker()` | — |
| `notifier` | `createNotifier(notificationApi)` | — |
| `sound` | `createSoundPlayer()` | — |
| `taskRepository` | `new TaskRepository(<userData>/ritmo.db, { now })`; lo cierran el cierre ordenado y `container.dispose()` (`close()` es idempotente). | `IdGenerator` (`crypto.randomUUID`) |
| `store` | `new StateStore(<userData>/state.json, { tasks: taskRepository, publish, now })` | — |
| `focus` | `new FocusService(store, { blocker, notifier, sound })` | — |
| `tasks` | `new TaskService(store, taskRepository)` | — |
| `domains` | `new DomainService(store)` | — |
| `lifecycle` | `new LifecycleService({ store, focus, notifier, tasks: taskRepository, timers, shutdownTimeoutMs })` | — |

Orden de arranque en `app.ts`: se crea el contenedor y se resuelve `lifecycle` (con él, `store`, `focus`, el repositorio y los adaptadores). `lifecycle.listen()` conecta `createQuitSignals({ app, powerMonitor, process })` con el cierre ordenado; después vienen `registerHandlers(ipcMain, container.cradle)` y la ventana. Por último, `lifecycle.start()` llama a `focus.recover()` y `store.rollDay()`, hace un primer `focus.tick()`, que cierra de inmediato una sesión que venció con la app cerrada, y programa el tic cada segundo con `Timers`.

Cierre ordenado: `before-quit` (Cmd+Q, o `app.quit()` al cerrar la última ventana fuera de macOS), `SIGINT`, `SIGTERM` y el `shutdown` de `powerMonitor` llaman a `LifecycleService.shutdown()`, que se ejecuta una sola vez. `before-quit` y `shutdown` se cancelan para que el cierre termine antes; al acabar, `app.exit()` sale sin volver a emitir `before-quit` ni `will-quit`.

```mermaid
sequenceDiagram
  participant Q as QuitSignals
  participant L as LifecycleService
  participant S as StateStore
  participant F as FocusService
  participant N as Notifier
  participant R as TaskRepository
  participant A as app.ts

  Q->>L: before-quit, SIGINT, SIGTERM o shutdown
  Note over L: Los avisos repetidos reutilizan el mismo cierre
  L->>L: clearInterval(tic)
  L->>S: drain(), con su propio tiempo máximo
  S->>S: closing = true, espera la operación en curso
  L->>S: closeWith(liberar), con su propio tiempo máximo
  alt mustReleaseBeforeQuit()
    S->>F: endFocus(false)
    alt falla el desbloqueo
      L->>S: blockError = mensaje, session = null
      L->>N: notify('Bloqueo aún activo', ...)
    end
  end
  S->>S: busy = false, save()
  opt vence el tiempo máximo de drain() o de closeWith()
    L->>S: blockError ??= «Ritmo se cerró antes de quitar el bloqueo.», session = null
    L->>N: notify('Bloqueo aún activo', ...)
  end
  L->>S: save()
  L->>R: close()
  L->>A: exit(error?)
  A->>A: app.exit(0 o 1)
```

## 3. Ciclo de una sesión

Estados que ve el usuario y transiciones entre ellos. Los estados en cursiva ocurren dentro de `StateStore.guarded()`: `busy` es `true`, la interfaz desactiva los controles y `tick()` no hace nada hasta que terminan. Cada operación protegida guarda y publica el estado al acabar, también si falla.

```mermaid
stateDiagram-v2
  [*] --> Recuperando
  Recuperando: recover() al arrancar
  state recuperado <<choice>>
  Recuperando --> recuperado
  recuperado --> Listo: sin sección gestionada ni descanso guardado, descarta un foco guardado y limpia blockError
  recuperado --> Descanso: sin sección gestionada y descanso guardado
  recuperado --> Foco: sección gestionada y foco guardado
  recuperado --> BloqueoPendiente: sección gestionada sin foco

  Listo: Listo para empezar (session = null)
  Foco: Foco (sitios bloqueados)
  Descanso: Descanso corto o largo
  BloqueoPendiente: Bloqueo pendiente (blockError)

  Bloqueando: <i>Bloqueando</i>
  Cerrando: <i>Cerrando pomodoro</i>
  Terminando: <i>Terminando foco</i>
  Reintentando: <i>Quitando bloqueo</i>

  Listo --> Bloqueando: startFocus()
  Bloqueando --> Foco: autorizado, endsAt = now + 25 min
  Bloqueando --> Listo: sin dominios, autorización cancelada o error

  Foco --> Cerrando: tick() con now ≥ endsAt
  Cerrando --> Listo: desbloqueado, focusCount + 1, notificación y sonido
  Cerrando --> BloqueoPendiente: falla el desbloqueo, notificación «Bloqueo aún activo»

  Foco --> Terminando: finishFocus()
  Terminando --> Listo: desbloqueado, no cuenta pomodoro
  Terminando --> Foco: falla el desbloqueo, error en la interfaz

  BloqueoPendiente --> Reintentando: retryUnblock()
  Reintentando --> Listo: desbloqueado
  Reintentando --> BloqueoPendiente: falla el desbloqueo

  Listo --> Descanso: startBreak(shortBreak o longBreak)
  Descanso --> Listo: tick() vencido con notificación, o finishBreak()
```

`recover()` no toca un descanso guardado. Si además encuentra la sección gestionada, marca `blockError` y la interfaz muestra **Bloqueo pendiente** hasta que se quite. Un foco guardado que venció con la app cerrada se cierra en el primer `tick()` tras el arranque.

Al cerrar la app con **Foco** o **Bloqueo pendiente**, el cierre ordenado intenta desbloquear. Si lo consigue, la app sale en **Listo**. Si falla, o si vence el tiempo máximo, la app sale igualmente con `blockError` guardado en `state.json`, sin el foco y tras notificar «Bloqueo aún activo». Descartar el foco evita que, al reabrir después de su fin, el tic lo cuente como pomodoro. En el siguiente arranque, `recover()` lleva a **Bloqueo pendiente** si la sección gestionada sigue en `/etc/hosts`, y a **Listo** si macOS terminó de quitarla.

Secuencia del cierre de un pomodoro por el tic, con el camino de error:

```mermaid
sequenceDiagram
  participant T as Timers (LifecycleService)
  participant F as FocusService
  participant S as StateStore
  participant B as SiteBlocker
  participant N as Notifier
  participant P as SoundPlayer
  participant R as Renderer

  T->>F: tick() cada segundo
  F->>S: rollDay()
  Note over F,S: Sale si busy, sin sesión o now < endsAt
  F->>S: guarded(...)
  S->>S: busy = true
  S-->>R: estado público con busy
  F->>B: changeBlock('unblock', domains)
  Note over B: osascript pide autorización y ejecuta block-sites.sh
  alt desbloqueo correcto
    F->>S: session = null, blockError = null, focusCount + 1
    F->>N: notify('Foco completado', ...)
    F->>P: play()
  else autorización cancelada o error
    F->>S: blockError = mensaje, session = null
    F->>N: notify('Bloqueo aún activo', ...)
  end
  S->>S: busy = false, save() en state.json
  S-->>R: estado público por el canal state
```

Si al descanso le toca terminar, el mismo `tick()` pone `session = null` y notifica «Descanso terminado», sin tocar el bloqueo.
