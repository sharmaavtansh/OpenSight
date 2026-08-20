import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Python API owns /api; Vite serves the UI and proxies through to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8420',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
