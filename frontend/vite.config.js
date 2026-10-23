import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O backend (Express) só habilita CORS para o Socket.IO, não para o REST.
// Por isso o dev server faz proxy de /api e /socket.io: o navegador enxerga
// tudo como mesma origem e nenhuma configuração extra de CORS é necessária.
const backend = process.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/socket.io': { target: backend, changeOrigin: true, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
  },
});
