# Desarrollo

## Compilación

`src/main.ts` y `src/preload.ts` son las entradas CommonJS de Electron; `src/renderer/main.tsx` es la entrada de la interfaz. `tsconfig.json` compila Electron, las pruebas y las funciones puras de `view.ts`; `tsconfig.renderer.json` comprueba el renderer y Vite lo empaqueta como archivos locales, sin CDN. `npm start` compila a `dist/` antes de abrir la app.

Los componentes de `src/components/ui/` son de shadcn/ui y se pueden editar; `components.json` configura su CLI.

La ventana abre hasta 1280 × 840 píxeles, limitada por el área útil de la pantalla.

## Datos locales

Las tareas se guardan en SQLite (`ritmo.db`) dentro de los datos de la app. Los dominios y el estado del temporizador siguen en `state.json`. Al abrir una instalación anterior, Ritmo importa sus tareas a SQLite y conserva una copia del JSON como `state.json.backup`.

## Icono

El icono se muestra en el Dock al abrir la app. Para regenerarlo, ejecuta `python3 scripts/generate-icon.py`; la compilación copia `assets/icon.png` a `dist/`.

## Capturas del README

Las capturas de `docs/capturas/` salen de la app real, abierta con datos de ejemplo en un directorio de datos temporal (`--user-data-dir`), a 1280 × 808 y escala 2×. El banner y los marcos de ventana se componen después en HTML con los colores y tipografías de `src/styles.css`, y se exportan a PNG con Electron.
