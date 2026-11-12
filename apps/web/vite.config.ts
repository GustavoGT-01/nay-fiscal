import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // libera o endereco do tunel Cloudflare (tunnel.bat); NAY_ALLOWED_HOST permite um dominio proprio
    allowedHosts: ['.trycloudflare.com', ...(process.env.NAY_ALLOWED_HOST ? [process.env.NAY_ALLOWED_HOST] : [])],
    proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT ?? 3333}` },
  },
});
