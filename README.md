# Ritmo

Ritmo es una herramienta personal para mejorar mis sesiones de estudio y llevar el seguimiento de ellas. No pretende ser un producto ni competir con otras apps de productividad: existe para cubrir mis propias necesidades al estudiar.

## Para qué sirve

- **Enfocarme**: sesiones de foco de 25 minutos con descansos de 5 o 15, al estilo pomodoro. Al completarse el foco suena una señal y aparece una notificación, aunque Ritmo esté en segundo plano.
- **Evitar distracciones**: bloquea sitios como redes sociales mientras dura el foco.
- **Planificar**: tareas organizadas por día, con un planner para moverlas entre fechas.
- **Hacer seguimiento**: un contador de pomodoros para ver cuántos completé hoy; se reinicia cada día.

La app funciona solo en macOS y guarda todo localmente; no hay cuentas, servidores ni sincronización.

## Proyecto generado con IA

Todo el código, las pruebas y la documentación de este repositorio fueron generados con agentes de IA. Mi papel es definir qué quiero, revisar los resultados y decidir qué se integra. Las pautas que siguen los agentes están en [`AGENTS.md`](AGENTS.md).

Por eso conviene leer el código con esa perspectiva: está pensado para mi uso personal y no ha pasado por la revisión que tendría un proyecto mantenido para terceros.

## Iniciar

Necesitas Node.js 24 (ver `.nvmrc`) y npm.

```bash
npm install
npm start
```

El código de Electron, la interfaz y las pruebas está en TypeScript. La interfaz usa React, Tailwind CSS y componentes locales de shadcn/ui; Vite la compila sin CDN. `npm start` compila a `dist/` antes de abrir la app. Para comprobar tipos sin generar archivos usa `npm run typecheck`.

## Estructura

- `src/main/`: arranque de Electron, SQLite para las tareas, estado del temporizador, sesiones de foco, bloqueo de sitios e IPC.
- `src/preload.ts`: API limitada que conecta la interfaz con el proceso principal.
- `src/renderer/`: entrada React, pantallas `screens/`, componentes de la aplicación y lógica de presentación en `view.ts`.
- `src/components/ui/`: componentes editables de shadcn/ui. `components.json` configura su CLI.
- `src/shared/`: contratos TypeScript y validaciones compartidas.

El vocabulario del dominio (sesión, foco, pomodoro, bloqueo pendiente…) está en [`docs/glosario.md`](docs/glosario.md), y los diagramas de procesos, servicios y del ciclo de una sesión, en [`docs/arquitectura.md`](docs/arquitectura.md).

`src/main.ts` y `src/preload.ts` son las entradas CommonJS de Electron. `src/renderer/main.tsx` es la entrada de la interfaz. La compilación usa `tsconfig.json` para Electron, pruebas y las funciones puras de `view.ts`; `tsconfig.renderer.json` comprueba el renderer y Vite lo empaqueta como archivos locales. La ventana abre hasta 1280 × 840 píxeles, limitada por el área útil de la pantalla.

El icono de Ritmo se muestra en el Dock al abrir la app. Si quieres regenerarlo, ejecuta `python3 scripts/generate-icon.py`; la compilación copia `assets/icon.png` a `dist/`.

En el primer pomodoro, macOS pide autorización de administrador para instalar un helper limitado en `/Library/PrivilegedHelperTools/ritmo-block-sites` y su regla en `/etc/sudoers.d/ritmo`. Después, Ritmo lo usa sin pedir autorización al iniciar o terminar cada foco. Si el script cambia tras una actualización, macOS vuelve a pedir autorización para actualizar el helper. El helper solo permite modificar la sección identificada de Ritmo en `/etc/hosts`. Si no puede quitar el bloqueo, la app muestra **Quitar bloqueo** para reintentar. Al salir (Cmd+Q, Ctrl+C en `npm start`, `SIGTERM` o apagado de macOS), la app espera la operación en curso e intenta quitar el bloqueo, con unos 2 minutos para cada fase. Si no lo consigue, sale igualmente, lo avisa con una notificación y ofrece **Quitar bloqueo** al volver a abrirla; el foco interrumpido no cuenta como pomodoro. Si la app se cierra de forma inesperada, al volver a abrirla detecta la sección y permite retirarla.

Para desinstalar el helper, elimina `/etc/sudoers.d/ritmo` y `/Library/PrivilegedHelperTools/ritmo-block-sites` con permisos de administrador, después de quitar cualquier bloqueo activo.

La lista inicial bloquea `facebook.com`, `linkedin.com`, `x.com` y `twitter.com`. Puedes añadir o quitar dominios antes de iniciar el foco. El bloqueo aplica al dominio exacto y a `www.`; `/etc/hosts` no permite bloquear todos los subdominios, y ciertas configuraciones de DNS o red podrían evitarlo. Esta versión funciona en macOS.

Las tareas se guardan localmente en SQLite dentro de los datos de la app. **Hoy** muestra las tareas planificadas para el día actual; **Planner** permite elegir otro día, crear tareas, editarlas, completarlas y moverlas. Las tareas pendientes permanecen en su fecha original hasta que las muevas. El contador de pomodoros se reinicia cada día.

Los dominios y el estado del temporizador siguen en `state.json`. Al abrir una instalación anterior, Ritmo importa sus tareas a SQLite y conserva una copia del JSON como `state.json.backup`. La app todavía no incluye funciones de IA; quedan para una etapa futura.

## Verificar

```bash
npm test
npm run coverage
```

Cada PR hacia `main` ejecuta el check `ci` de GitHub Actions (`npm ci`, `npm run typecheck` y `npm test` en macOS). `main` está protegida: solo acepta cambios por PR con ese check aprobado.

`npm run coverage` compila, ejecuta todas las pruebas con [c8](https://github.com/bcoe/c8) y muestra la cobertura de cada módulo de `src/`, incluidos los que ninguna prueba carga (aparecen con 0 %). El informe HTML queda en `coverage/index.html`. Falla si la cobertura baja de los umbrales de `.c8rc.json`.
