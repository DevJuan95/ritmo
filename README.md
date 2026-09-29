# Ritmo

App de productividad para macOS hecha con Electron. Incluye pomodoros de 25 minutos, descansos de 5 o 15 minutos, una lista diaria de tareas y bloqueo de sitios durante el foco.

## Iniciar

Necesitas Node.js y npm.

```bash
npm install
npm start
```

El código de Electron, la interfaz y las pruebas está en TypeScript. La interfaz usa Tailwind CSS y daisyUI con un tema propio; el CSS se compila localmente y no necesita CDN. `npm start` compila a `dist/` antes de abrir la app. Para comprobar tipos sin generar archivos usa `npm run typecheck`. Durante cambios de estilos puedes ejecutar `npm run watch:css` en otra terminal.

El icono de Ritmo se muestra en el Dock al abrir la app. Si quieres regenerarlo, ejecuta `python3 scripts/generate-icon.py`; la compilación copia `assets/icon.png` a `dist/`.

Al iniciar un pomodoro, macOS pide autorización de administrador para añadir una sección identificada a `/etc/hosts`. Al terminar, cancela o cerrar la app, pide autorización para quitarla. Si se deniega la autorización al terminar, la app muestra **Quitar bloqueo** para reintentar. Si la app se cierra de forma inesperada, al volver a abrirla detecta la sección y permite retirarla.

La lista inicial bloquea `facebook.com`, `linkedin.com`, `x.com` y `twitter.com`. Puedes añadir o quitar dominios antes de iniciar el foco. El bloqueo aplica al dominio exacto y a `www.`; `/etc/hosts` no permite bloquear todos los subdominios, y ciertas configuraciones de DNS o red podrían evitarlo. Esta versión funciona en macOS.

Las tareas, dominios y estado del temporizador se guardan localmente en los datos de la app. La lista de tareas se reinicia cada día. Aún no hay integración con IA; el proyecto deja esa función para una etapa futura.

## Verificar

```bash
npm test
```
