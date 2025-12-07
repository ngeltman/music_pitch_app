import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true, // Expose to LAN
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },
  plugins: [react()],
})
