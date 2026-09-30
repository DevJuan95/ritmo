# Desarrollo

## Compilación

`electron-vite` (`electron.vite.config.ts`) compila tres entradas a `out/`: `src/main/index.ts` (proceso principal), `src/preload/index.ts` (preload) y `src/renderer/index.html`, que carga `src/renderer/src/main.tsx`. El renderer se empaqueta como archivos locales, sin CDN. `npm start` compila y abre la app; `npm run dev` la abre con el renderer servido por Vite, con recarga en caliente, y quita la CSP de `index.html`, que la compilación conserva.

`tsconfig.json` comprueba el proceso principal, el preload, `shared/`, las funciones puras de `view.ts` y las pruebas; `tsc` las compila a `dist/` solo para ejecutarlas con `node --test` y medir la cobertura. `tsconfig.renderer.json` comprueba el renderer.

`resources/` guarda los archivos que la app usa tal cual, sin compilar: `block-sites.sh`, `install-block-helper.sh` y el icono. `app.ts` pasa su ruta (`<app.getAppPath()>/resources`) al contenedor.

Los componentes de `src/renderer/src/components/ui/` son de shadcn/ui y se pueden editar; `components.json` configura su CLI.

La ventana abre hasta 1280 × 840 píxeles, limitada por el área útil de la pantalla.

## Datos locales

Las tareas y las rutas de estudio se guardan en SQLite (`ritmo.db`) dentro de los datos de la app. Los dominios y el estado del temporizador siguen en `state.json`. Al abrir una instalación anterior, Ritmo importa sus tareas a SQLite y conserva una copia del JSON como `state.json.backup`.

## Icono

El icono se muestra en el Dock al abrir la app. Para regenerarlo, ejecuta `python3 scripts/generate-icon.py`; el resultado queda en `resources/icon.png`.

## Capturas del README

Las capturas de `docs/capturas/` salen de la app real, abierta con datos de ejemplo en un directorio de datos temporal (`--user-data-dir`), a 1280 × 808 y escala 2×. El banner y los marcos de ventana se componen después en HTML con los colores y tipografías de `src/renderer/src/styles.css`, y se exportan a PNG con Electron.
