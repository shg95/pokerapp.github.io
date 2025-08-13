import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/', // user/org repo uses root
  plugins: [react()],
  resolve: { alias: { '@': '/src' } },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
