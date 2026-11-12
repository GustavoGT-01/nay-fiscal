import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // o servidor de desenvolvimento so atende localhost (padrao do Vite): o tunel (tunnel.bat) usa o front compilado
    // servido pela API. NAY_ALLOWED_HOST libera um dominio proprio, se realmente precisar.
    allowedHosts: process.env.NAY_ALLOWED_HOST ? [process.env.NAY_ALLOWED_HOST] : [],
    proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT ?? 3333}` },
  },
});
