import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base: the build is plain static files that work from any folder on
// any static host (GitHub Pages project sites, Cloudflare Pages, a subpath).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.{ts,tsx}'] },
});
