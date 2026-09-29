![Ritmo: un bloque de atención a la vez](docs/capturas/banner.png)

> Pomodoros, tareas del día y sitios en pausa, en una sola app para macOS.
> Una herramienta personal para estudiar con foco y llevar la cuenta de cada sesión.

![Pantalla Hoy: temporizador de 25 minutos, plan del día y sitios en pausa](docs/capturas/hoy.png)

## ✨ Qué hace

| Función | Qué hace |
| --- | --- |
| ⏱️ **Foco** | Sesiones de 25 minutos con descansos de 5 o 15. Al terminar suena una señal y llega una notificación, aunque Ritmo esté en segundo plano. |
| 🚫 **Sitios en pausa** | Bloquea redes sociales y cualquier dominio que añadas mientras dura el foco. |
| 🗓️ **Planner** | Tareas por día y un calendario mensual para completarlas y moverlas de fecha. Las pendientes esperan en su día hasta que las muevas. |
| ✅ **Seguimiento** | Un contador de pomodoros del día, que vuelve a cero cada día. |
| 🔒 **Todo local** | Sin cuentas, servidores ni sincronización. |

![Un descanso en curso y el Planner con el calendario del mes](docs/capturas/descanso-y-planner.png)

## 🚀 Empezar

Necesitas macOS, Node.js 24 (ver `.nvmrc`) y npm.

```bash
npm install
npm start
```

> 🔐 En el primer pomodoro, macOS pide una autorización de administrador para instalar el helper que bloquea los sitios; después no vuelve a pedirla. Cómo funciona, qué riesgos implica y cómo desinstalarlo: [`docs/bloqueo-de-sitios.md`](docs/bloqueo-de-sitios.md).

## 🛠️ Desarrollo

| Comando | Qué hace |
| --- | --- |
| `npm start` | Compila a `out/` con electron-vite y abre la app |
| `npm run dev` | Abre la app con recarga en caliente de la interfaz |
| `npm run typecheck` | Comprueba los tipos sin generar archivos |
| `npm test` | Compila y ejecuta todas las pruebas |
| `npm run coverage` | Pruebas con cobertura (c8); falla bajo los umbrales de `.c8rc.json` |

**Stack:** Electron · React · Tailwind CSS · shadcn/ui · SQLite · TypeScript

El código está en `src/`: `main/` (proceso principal, en módulos por contexto), `preload/` (API limitada para la interfaz), `renderer/` (React) y `shared/` (contratos y validaciones); los scripts del bloqueo y el icono, en `resources/`. Cada PR hacia `main` pasa el check `ci` (`npm ci`, `npm run typecheck` y `npm test` en macOS).

📚 [Arquitectura](docs/arquitectura.md) · [Glosario](docs/glosario.md) · [Desarrollo](docs/desarrollo.md) · [Bloqueo de sitios](docs/bloqueo-de-sitios.md) · [Pautas para agentes](AGENTS.md)

## 🤖 Hecho con IA

Todo el código, las pruebas y la documentación los generaron agentes de IA. Mi papel es definir qué quiero, revisar el resultado y decidir qué se integra. Está pensado para mi uso personal y no ha pasado por la revisión de un proyecto mantenido para terceros.
