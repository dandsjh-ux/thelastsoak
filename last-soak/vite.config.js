import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: 'client',
  publicDir: false,
  build: { outDir: path.resolve('dist'), emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: {
    port: 5173,
    fs: { allow: [path.resolve('.')] },
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': 'http://localhost:3001',
    },
  },
});
