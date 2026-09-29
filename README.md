# Ritmo

Ritmo es una herramienta personal para mejorar mis sesiones de estudio y llevar el seguimiento de ellas. No pretende ser un producto ni competir con otras apps de productividad: existe para cubrir mis propias necesidades al estudiar.

## Para qué sirve

- **Enfocarme**: sesiones de foco de 25 minutos con descansos de 5 o 15, al estilo pomodoro.
- **Evitar distracciones**: bloquea sitios como redes sociales mientras dura el foco.
- **Planificar**: tareas organizadas por día, con un planner para moverlas entre fechas.
- **Hacer seguimiento**: un contador de pomodoros para ver cuántos completé hoy; se reinicia cada día.

La app funciona solo en macOS y guarda todo localmente; no hay cuentas, servidores ni sincronización.

## Proyecto generado con IA

Todo el código, las pruebas y la documentación de este repositorio fueron generados con agentes de IA. Mi papel es definir qué quiero, revisar los resultados y decidir qué se integra. Las pautas que siguen los agentes están en [`AGENTS.md`](AGENTS.md).

Por eso conviene leer el código con esa perspectiva: está pensado para mi uso personal y no ha pasado por la revisión que tendría un proyecto mantenido para terceros.

## Iniciar

Necesitas Node.js y npm.

```bash
npm install
npm start
```

El código de Electron, la interfaz y las pruebas está en TypeScript. La interfaz usa Tailwind CSS y daisyUI con un tema propio; el CSS se compila localmente y no necesita CDN. `npm start` compila a `dist/` antes de abrir la app. Para comprobar tipos sin generar archivos usa `npm run typecheck`. Durante cambios de estilos puedes ejecutar `npm run watch:css` en otra terminal.

## Estructura

- `src/main/`: arranque de Electron, SQLite para las tareas, estado del temporizador, sesiones de foco, bloqueo de sitios e IPC.
- `src/preload.ts`: API limitada que conecta la interfaz con el proceso principal.
- `src/renderer/`: interfaz organizada por temporizador, tareas y dominios; esbuild la empaqueta en un archivo local sin framework.
- `src/shared/`: contratos TypeScript y validaciones compartidas.

`src/main.ts` y `src/preload.ts` son las entradas CommonJS de Electron. `src/renderer/app.ts` es la entrada de la interfaz. La compilación usa `tsconfig.json` para Electron y pruebas, y `tsconfig.renderer.json` para comprobar los tipos de la interfaz.

El icono de Ritmo se muestra en el Dock al abrir la app. Si quieres regenerarlo, ejecuta `python3 scripts/generate-icon.py`; la compilación copia `assets/icon.png` a `dist/`.

Al iniciar un pomodoro, macOS pide autorización de administrador para añadir una sección identificada a `/etc/hosts`. Al terminar, cancela o cerrar la app, pide autorización para quitarla. Si se deniega la autorización al terminar, la app muestra **Quitar bloqueo** para reintentar. Si la app se cierra de forma inesperada, al volver a abrirla detecta la sección y permite retirarla.

La lista inicial bloquea `facebook.com`, `linkedin.com`, `x.com` y `twitter.com`. Puedes añadir o quitar dominios antes de iniciar el foco. El bloqueo aplica al dominio exacto y a `www.`; `/etc/hosts` no permite bloquear todos los subdominios, y ciertas configuraciones de DNS o red podrían evitarlo. Esta versión funciona en macOS.

Las tareas se guardan localmente en SQLite dentro de los datos de la app. **Hoy** muestra las tareas planificadas para el día actual; **Planner** permite elegir otro día, crear tareas, editarlas, completarlas y moverlas. Las tareas pendientes permanecen en su fecha original hasta que las muevas. El contador de pomodoros se reinicia cada día.

Los dominios y el estado del temporizador siguen en `state.json`. Al abrir una instalación anterior, Ritmo importa sus tareas a SQLite y conserva una copia del JSON como `state.json.backup`. La app todavía no incluye funciones de IA; quedan para una etapa futura.

## Verificar

```bash
npm test
```
