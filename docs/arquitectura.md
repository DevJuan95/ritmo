# Arquitectura

Cómo se conectan los procesos de Electron, los servicios del proceso principal, sus puertos y sus adaptadores, y cómo avanza una sesión. Los términos se definen en [`glosario.md`](glosario.md).

Si cambias un puerto, un servicio, su cableado en `src/main/app.ts` o el ciclo de una sesión, actualiza estos diagramas en el mismo cambio.

## 1. Procesos

El renderer no tiene acceso a Node ni a Electron. Todo pasa por `window.ritmo`, que `preload.ts` expone con `contextBridge`. Cada método invoca un canal IPC; `ipc.ts` lo conecta con un servicio, que valida la entrada. El estado vuelve por un solo canal, `state`, cada vez que `StateStore` guarda o empieza una operación protegida.

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

`src/main/app.ts` es la raíz de composición: crea las implementaciones reales y las inyecta. Solo `app.ts` y `preload.ts` importan `electron`; el resto de módulos de `src/main/` recibe lo que necesita de Electron (`ipcMain`, `Notification`, `webContents.send`) a través de los puertos de `ports.ts`.

```mermaid
flowchart TB
  app["app.ts<br/>raíz de composición"]:::electron

  subgraph servicios["Servicios (no importan Electron)"]
    ipc["registerHandlers<br/>ipc.ts"]
    focus["FocusService<br/>focus.ts"]
    taskService["TaskService<br/>task-service.ts"]
    domainService["DomainService<br/>domains.ts"]
    store["StateStore<br/>state.ts"]
    repo["TaskRepository<br/>tasks.ts"]
  end

  subgraph adaptadores["Adaptadores (no importan Electron)"]
    blocker["createSiteBlocker<br/>site-blocker.ts"]
    notifier["createNotifier<br/>notifier.ts"]
    sound["createSoundPlayer<br/>sound-player.ts"]
  end

  subgraph externos["Efectos externos"]
    ipcMain["ipcMain"]:::electron
    send["webContents.send('state')"]:::electron
    notification["Notification"]:::electron
    osascript["osascript con privilegios<br/>→ block-sites.sh"]
    hosts[("/etc/hosts")]
    afplay["afplay Glass.aiff"]
    json[("state.json")]
    db[("ritmo.db<br/>SQLite")]
  end

  app -. "crea e inyecta" .-> servicios
  app -. "crea e inyecta" .-> adaptadores

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

  store -- "tasks" --> repo
  store -- "PublishState" --> send
  store --> json
  repo --> db

  blocker --> osascript --> hosts
  blocker -- "hasManagedBlock: lectura" --> hosts
  notifier --> notification
  sound --> afplay

  classDef electron fill:#fde2e2,stroke:#c0392b,color:#000
```

En rojo, lo que depende de Electron. Las flechas continuas son dependencias en tiempo de ejecución, rotuladas con el puerto cuando lo hay; las discontinuas indican que `app.ts` crea el módulo.

Cableado exacto de `app.ts`:

| Módulo | Cómo lo crea `app.ts` | Puertos sin inyectar |
| --- | --- | --- |
| `TaskRepository` | `new TaskRepository(<userData>/ritmo.db)` | `Clock` (`Date.now`) e `IdGenerator` (`crypto.randomUUID`) toman su valor por defecto. |
| `StateStore` | `new StateStore(<userData>/state.json, { tasks, publish })`; `publish` envía el estado por `webContents.send('state', …)` si la ventana existe. | `Clock` (`Date.now`). |
| `FocusService` | `new FocusService(store, { blocker: createSiteBlocker(), notifier: createNotifier(Notification), sound: createSoundPlayer() })` | — |
| `TaskService` | `new TaskService(store, tasks)` | — |
| `DomainService` | `new DomainService(store)` | — |
| Manejadores IPC | `registerHandlers(ipcMain, { store, focus, tasks: TaskService, domains: DomainService })` | — |

Orden de arranque: repositorio y almacén, `focus.recover()`, manejadores IPC, ventana, `store.rollDay()`, cierre inmediato de un foco que venció con la app cerrada, e intervalo de 1 s que llama a `focus.tick()`. En `before-quit`, si `mustReleaseBeforeQuit()`, la app desbloquea dentro de `guarded` antes de salir. `app.ts` usa `Date.now()` directamente al arrancar; los servicios usan `store.now()`.

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

Al cerrar la app con **Foco** o **Bloqueo pendiente**, `before-quit` intenta desbloquear. Si lo consigue, la app sale; si no, guarda el error en `blockError`, muestra la ventana y un diálogo, y la app sigue abierta en **Bloqueo pendiente**.

Secuencia del cierre de un pomodoro por el tic, con el camino de error:

```mermaid
sequenceDiagram
  participant T as setInterval (app.ts)
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
