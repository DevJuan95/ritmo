# Guía para agentes: Ritmo

Ritmo es una aplicación de productividad para macOS hecha con Electron y TypeScript. Ofrece sesiones de foco y descanso, tareas diarias y bloqueo de dominios durante el foco. Lee `README.md` para el comportamiento visible para el usuario.

## Mapa del proyecto

- `src/main.ts` inicia el proceso principal; `src/main/` contiene la ventana, el estado, las sesiones, el IPC y el bloqueo de sitios.
- `src/preload.ts` expone `window.ritmo` al renderer. Mantén el aislamiento de contexto y la API limitada.
- `src/renderer/app.ts` inicia la interfaz; los módulos de `src/renderer/` renderizan el temporizador, las tareas y los dominios. No hay framework de interfaz.
- `src/shared/contracts.ts` define los tipos de estado y la API; `src/shared/validation.ts` valida entradas y define valores por defecto.
- `src/block-sites.sh` administra una sección identificada en `/etc/hosts`. `test/` contiene pruebas de validación y del script.
- `src/styles.css` usa Tailwind CSS y daisyUI. `dist/` es generado y está ignorado por Git.

## Comandos

- `npm install`: instala dependencias.
- `npm run typecheck`: comprueba los tipos del proceso principal y del renderer sin generar archivos.
- `npm test`: compila y ejecuta las pruebas con `node --test`.
- `npm run build`: genera la app en `dist/`.
- `npm start`: compila y abre Electron; requiere macOS para probar el bloqueo real.
- `npm run watch:css`: recompila estilos durante cambios de interfaz.

## Al cambiar código

- Conserva sincronizados los contratos de `src/shared/contracts.ts`, el puente de `src/preload.ts`, los manejadores de `src/main/ipc.ts` y sus llamadas desde el renderer.
- Valida en el proceso principal toda entrada recibida por IPC. El renderer no tiene acceso directo a Node ni a Electron.
- Respeta la persistencia local de `StateStore` y el reinicio diario de tareas y contador. Las operaciones de foco que cambian el estado pasan por `guarded`.
- En el bloqueo de sitios, preserva las entradas ajenas a la sección de Ritmo y la recuperación tras un cierre inesperado. No ejecutes pruebas contra el `/etc/hosts` real: la prueba del script usa `RITMO_TEST_HOSTS` con un archivo temporal.
- Antes de cerrar un cambio de código, ejecuta `npm run typecheck` y las pruebas pertinentes. Si cambias la compilación o recursos copiados a `dist/`, ejecuta también `npm run build`.
- No edites `dist/` ni `node_modules/` directamente. Respeta los cambios locales existentes que no pertenezcan a la tarea.
