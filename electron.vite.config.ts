import path from 'node:path';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// La CSP de index.html bloquea el script en línea de React Refresh y el WebSocket de HMR.
// Solo se quita en `electron-vite dev`; la app compilada la conserva.
const devWithoutCsp: Plugin = {
  name: 'ritmo-dev-without-csp',
  apply: 'serve',
  transformIndexHtml: html => html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
};

// Entradas: src/main/index.ts, src/mcp/index.ts (el servidor MCP, que se ejecuta con `node out/main/mcp.js`),
// src/preload/index.ts y src/renderer/index.html; salida en out/.
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: path.resolve(__dirname, 'src/main/index.ts'), mcp: path.resolve(__dirname, 'src/mcp/index.ts') }
      }
    }
  },
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss(), devWithoutCsp],
    resolve: { alias: { '@': path.resolve(__dirname, 'src/renderer/src') } }
  }
});
