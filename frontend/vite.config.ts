import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // ced-api during development. In a deployment the two are served from one
    // origin (or VITE_API_URL points at the real host), so this proxy exists
    // only so `npm run dev` needs no CORS configuration on the Java side.
    proxy: {
      '/api': { target: 'http://localhost:8081', changeOrigin: true },
    },
  },
  worker: { format: 'es' },
  // The suite runs the real algorithm over the real benchmarks; a window of a
  // 200-sample stream is seconds, not milliseconds.
  test: { testTimeout: 120_000, hookTimeout: 120_000 },
  build: { outDir: 'dist', sourcemap: true },
})
