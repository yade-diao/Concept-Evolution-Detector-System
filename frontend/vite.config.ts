import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

const BUNDLED = fileURLToPath(new URL('../datasets/bundled', import.meta.url))

/**
 * Serve the benchmarks at `/datasets`, in development and in the build.
 *
 * They live outside this package - one copy, read by the Python reference, by
 * the port's tests and by the application - so this is what puts them on the
 * page's own origin instead of keeping a second copy here. The deployment
 * serves the built directory, which is why the build copies them in rather than
 * pointing at them.
 */
function datasets(): Plugin {
  const types: Record<string, string> = {
    '.mat': 'application/octet-stream',
    '.json': 'application/json',
  }

  return {
    name: 'ced-datasets',

    configureServer(server) {
      server.middlewares.use('/datasets', (request, response, next) => {
        // Everything under that directory and nothing above it: the path is
        // normalised and then re-checked rather than trusted.
        const requested = decodeURIComponent((request.url ?? '/').split('?')[0])
        const path = resolve(join(BUNDLED, normalize(requested)))
        if (!path.startsWith(BUNDLED) || !existsSync(path) || !statSync(path).isFile()) {
          next()
          return
        }
        response.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream')
        response.setHeader('Content-Length', statSync(path).size)
        createReadStream(path).pipe(response)
      })
    },

    closeBundle() {
      cpSync(BUNDLED, fileURLToPath(new URL('./dist/datasets', import.meta.url)),
        { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [react(), datasets()],
  server: {
    port: 5173,
    // ced-api during development. In a deployment the two are served from one
    // origin, so this proxy exists only so `npm run dev` needs no CORS
    // configuration on the Java side.
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
