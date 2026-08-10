import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // El dashboard usa 5173. Ver apps/dashboard/vite.config.js.
    port: 5174,
    strictPort: true,
  },
})
