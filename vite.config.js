import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

function updateServiceWorkerPlugin() {
  return {
    name: 'update-service-worker',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const swPath = path.join(distDir, 'sw.js');
      const htmlPath = path.join(distDir, 'index.html');

      if (fs.existsSync(swPath) && fs.existsSync(htmlPath)) {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        const assetMatches = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
          (m) => m[1]
        );

        let sw = fs.readFileSync(swPath, 'utf-8');
        const extraAssets = JSON.stringify(assetMatches);
        sw = sw.replace(
          'const ASSETS_TO_CACHE = [',
          `const ASSETS_TO_CACHE = [...${extraAssets},`
        );
        fs.writeFileSync(swPath, sw);
        console.log('Injected Vite bundle assets into dist/sw.js:', assetMatches);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), updateServiceWorkerPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
