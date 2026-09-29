import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// La CSP de index.html bloquea el script en línea de React Refresh y el WebSocket de HMR.
// Solo se quita en `vite` (dev:renderer); la app compilada la conserva.
const devWithoutCsp: Plugin = {
  name: 'ritmo-dev-without-csp',
  apply: 'serve',
  transformIndexHtml: html => html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
};

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react(), tailwindcss(), devWithoutCsp],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    outDir: '../dist/src',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'renderer.js', assetFileNames: '[name][extname]' } }
  }
});
