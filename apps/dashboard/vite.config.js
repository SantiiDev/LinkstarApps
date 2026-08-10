import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Puerto fijo y explícito: en el monorepo los dos frontends se levantan a la
    // vez, y sin strictPort el que arranca segundo se corre solo de puerto y
    // deja de coincidir con el FRONTEND_URL que espera la API por CORS.
    // Ventas usa 5174.
    port: 5173,
    strictPort: true,
  },
})
