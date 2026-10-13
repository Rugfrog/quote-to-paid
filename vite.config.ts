import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.PORT ?? '3001';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true, // lets you open the app on your phone over the same Wi-Fi
    proxy: {
      // Trailing slashes matter: '/api' alone would also catch the source file /api.ts.
      '/api/': `http://localhost:${apiPort}`,
      '/uploads/': `http://localhost:${apiPort}`,
    },
  },
});
