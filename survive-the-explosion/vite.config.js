import { defineConfig } from 'vite';

// base './' so the built dist/ works from any folder or static host.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
