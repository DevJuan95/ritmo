![Ritmo: un bloque de atención a la vez](docs/capturas/banner.png)

> Pomodoros, tareas del día, sitios en pausa y rutas de estudio, en una sola app para macOS.
> Una herramienta personal para estudiar con foco y llevar la cuenta de cada sesión.

![Pantalla Hoy: temporizador de 25 minutos, plan del día y sitios en pausa](docs/capturas/hoy.png)

## ✨ Qué hace

| Función | Qué hace |
| --- | --- |
| ⏱️ **Foco** | Sesiones de 25 minutos con descansos de 5 o 15. Al terminar suena una señal y llega una notificación, aunque Ritmo esté en segundo plano. |
| 🚫 **Sitios en pausa** | Bloquea redes sociales y cualquier dominio que añadas mientras dura el foco. |
| 🗓️ **Planner** | Tareas por día y un calendario mensual para completarlas y moverlas de fecha. Las pendientes esperan en su día hasta que las muevas. |
| ✅ **Seguimiento** | Un contador de pomodoros del día, que vuelve a cero cada día. |
| 🧭 **Rutas de estudio** | El roadmap de un tema: objetivo, nivel, pomodoros al día, enfoque, etapas (qué dominar, qué no priorizar todavía, proyecto y recursos), proyecto final y reglas de estudio. Lo escribes tú o lo genera Claude Code o Codex a partir de un brief, y lo revisas antes de guardarlo. Las tareas del Planner se vinculan a una etapa y cada etapa muestra su avance. |
| 🤖 **Tareas propuestas** | Claude Code o Codex proponen las próximas tareas de una ruta según su roadmap (etapas, proyectos, recursos y reglas de estudio) y tu avance. Las revisas, las editas y eliges el día antes de añadirlas al Planner. |
| 🔒 **Todo local** | Sin cuentas, servidores ni sincronización. Solo sale del Mac lo que envías al agente cuando pulsas «Generar roadmap» o «Proponer tareas». |

![Un descanso en curso y el Planner con el calendario del mes](docs/capturas/descanso-y-planner.png)

## 🚀 Empezar

Para instalarla en un Mac con Apple Silicon, genera el `.dmg` y arrastra Ritmo a Aplicaciones:

```bash
npm install
npm run dist:mac   # release/Ritmo-<versión>-arm64.dmg
```

La app va firmada ad hoc, sin cuenta de Apple Developer ni notarización: la primera vez, ábrela con clic derecho → **Abrir**. Si macOS aun así la bloquea, ve a **Ajustes del Sistema → Privacidad y seguridad** y pulsa «Abrir igualmente».

Para abrirla desde el código necesitas Node.js 24 (ver `.nvmrc`) y npm:

```bash
npm install
npm start
```

> 🔐 En el primer pomodoro, macOS pide una autorización de administrador para instalar el helper que bloquea los sitios; después no vuelve a pedirla. Cómo funciona, qué riesgos implica y cómo desinstalarlo: [`docs/bloqueo-de-sitios.md`](docs/bloqueo-de-sitios.md).

## 🧭 Rutas de estudio con Claude Code o Codex

El agente elegido en **Ajustes** te acompaña en cuatro pasos, de un brief a las tareas del día:

1. **Brief.** En **Rutas**, pulsa «Crear con el agente» y cuenta en texto libre qué quieres aprender, desde dónde partes y cuánto tiempo tienes; por ejemplo, «Senior Backend → Tech Lead / Architect / FDE, con Java como vehículo, 2 h al día». Al pulsar «Generar roadmap», Ritmo le envía solo ese brief.
2. **Roadmap.** El agente devuelve un roadmap completo: tema, objetivo, nivel, pomodoros al día, el enfoque recomendado (por ejemplo, 60-70 % sistemas distribuidos y 30-40 % Java), las etapas en orden, cada una con un resumen, lo que hay que dominar, lo que no priorizar todavía, un proyecto y recursos, un proyecto final y las reglas de estudio. Puede tardar unos minutos; mientras tanto ves el tiempo que lleva y puedes cancelarlo.
3. **Revisión.** El roadmap se abre como borrador en el editor de la ruta nueva, sin guardar. Cambias lo que quieras, añades, quitas o reordenas etapas y pulsas «Crear ruta». Si prefieres empezar de cero, «Nueva ruta» abre el mismo editor vacío. Cada ruta guardada aparece como una tarjeta en la lista de Rutas, con su avance; al abrirla ves su página con tres pestañas: **Etapas** (el roadmap, con la etapa en curso abierta y las demás plegadas), **Próximas tareas** y **Opciones** (editar la ruta). «Eliminar ruta», en la cabecera de la ruta, pide confirmación en un diálogo y borra la ruta, sus etapas y sus tareas vinculadas de todos los días.
4. **Tareas propuestas.** En la pestaña Próximas tareas de una ruta, «Proponer tareas» pide al agente un JSON con hasta 10 tareas que siguen el roadmap (la etapa en curso, su proyecto y sus recursos, el enfoque y las reglas, sin lo que aún no toca priorizar): título, etapa, pomodoros, cuándo está hecha y por qué. Las propuestas se quedan «a lápiz» hasta que las añades al Planner, vinculadas a su etapa; completarlas hace avanzar la etapa, y la siguiente petición lo tiene en cuenta.

Solo hay una petición al agente a la vez, sea de roadmap o de tareas.

- **Con tu suscripción, no con la API.** Ritmo usa la sesión de `claude` o `codex` que ya tienes iniciada y quita del entorno del CLI `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` y similares. Si el CLI no tiene sesión o usa una clave de API, Ajustes te dice cómo resolverlo. Las peticiones cuentan para los límites de uso de tu plan; por defecto van con un modelo ligero (`haiku` o `gpt-6-luna`), que puedes cambiar.
- **Encuentra el CLI.** Una app abierta desde Finder no hereda el `PATH` de la terminal, así que Ritmo busca el ejecutable en `~/.local/bin`, Homebrew, npm y otras carpetas habituales, y en el `PATH` de tu shell. En Ajustes puedes fijar la ruta y el modelo de cada uno.
- **Sin permisos.** El agente responde sin herramientas (Claude Code) o con un sandbox de solo lectura (Codex), en un directorio temporal que se borra al terminar. Cada petición tiene un tiempo máximo (3 minutos para las tareas y 7 para el roadmap) y se puede cancelar; al cerrar Ritmo también se cancela. Una respuesta que no cumple el esquema da un error claro y no crea nada.
- **Privacidad.** Antes de la primera petición a cada proveedor, Ritmo te dice qué le enviará: al generar un roadmap, solo el brief; al proponer tareas, el tema, el objetivo, el nivel, el roadmap y las instrucciones de la ruta, y el título, el día y el estado de sus tareas. Nada se envía sin que pulses el botón.

Desde la terminal, Claude Code o Codex también pueden leer tus rutas y añadir tareas con el servidor MCP de Ritmo, mientras la app está abierta. Cómo registrarlo: [`docs/desarrollo.md`](docs/desarrollo.md#servidor-mcp).

## 🛠️ Desarrollo

| Comando | Qué hace |
| --- | --- |
| `npm start` | Compila a `out/` con electron-vite y abre la app |
| `npm run dist:mac` | Genera `Ritmo.app` y su `.dmg` para Apple Silicon en `release/` |
| `npm run dev` | Abre la app con recarga en caliente de la interfaz |
| `npm run typecheck` | Comprueba los tipos sin generar archivos |
| `npm test` | Compila y ejecuta todas las pruebas |
| `npm run coverage` | Pruebas con cobertura (c8); falla bajo los umbrales de `.c8rc.json` |

**Stack:** Electron · React · Tailwind CSS · shadcn/ui · SQLite · TypeScript

El código está en `src/`: `main/` (proceso principal, en módulos por contexto), `preload/` (API limitada para la interfaz), `renderer/` (React), `shared/` (contratos y validaciones) y `mcp/` (el servidor MCP para Claude Code y Codex); los scripts del bloqueo y el icono, en `resources/`. Cada PR hacia `main` pasa el check `ci` (`npm ci`, `npm run typecheck` y `npm test` en macOS).

📚 [Arquitectura](docs/arquitectura.md) · [Glosario](docs/glosario.md) · [Desarrollo](docs/desarrollo.md) · [Bloqueo de sitios](docs/bloqueo-de-sitios.md) · [Pautas para agentes](AGENTS.md)

## 🤖 Hecho con IA

Todo el código, las pruebas y la documentación los generaron agentes de IA. Mi papel es definir qué quiero, revisar el resultado y decidir qué se integra. Está pensado para mi uso personal y no ha pasado por la revisión de un proyecto mantenido para terceros.
