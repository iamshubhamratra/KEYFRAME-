import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev: vite on :5173 proxies API + media to the KEYFRAME server on :8080.
// Build:
//   • all-in-one host → ../server/public/dist (default), served by Express.
//   • split (Vercel)  → set VITE_OUT_DIR=dist so output stays inside web/.
// API origin for the split is set via VITE_API_URL (see src/api.js).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: process.env.VITE_OUT_DIR || '../server/public/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/videos': 'http://localhost:8080',
      '/frames': 'http://localhost:8080',
    },
  },
})
