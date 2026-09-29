import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    outDir: '../dist/src',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'renderer.js', assetFileNames: '[name][extname]' } }
  }
});
