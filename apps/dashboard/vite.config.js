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

    // Probar la suscripción de Mercado Pago exige que el dashboard sea
    // alcanzable desde afuera: MP valida el back_url al crear el preapproval y
    // rechaza localhost con "Invalid value for back_url, must be a valid URL".
    // La forma de conseguirlo en desarrollo es un túnel (cloudflared), y Vite
    // bloquea por Host header cualquier dominio que no conozca. Esto sólo
    // afecta al server de desarrollo; el build no lo mira.
    allowedHosts: ['.trycloudflare.com'],
  },
})
