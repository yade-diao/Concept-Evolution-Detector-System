import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],

  server: {
    port: 5173,
    // Proxy API calls to the Flask backend during development
    proxy: {
      '/api':    { target: 'http://localhost:8080', changeOrigin: true },
      '/static': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },

  build: {
    // Production build goes into Flask's static folder so Flask can serve the SPA
    outDir: '../web/static/dist',
    emptyOutDir: true,
  },
})
