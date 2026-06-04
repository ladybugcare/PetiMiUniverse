import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Expõe também REACT_APP_* ao cliente (útil se copiares .env do CRA/frontend sem renomear para VITE_*).
  envPrefix: ['VITE_', 'REACT_APP_'],
  plugins: [react()],
  server: {
    port: 3002,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@petimi/web-core': path.resolve(__dirname, '../../packages/web-core/src'),
      '@petimi/hub-ui': path.resolve(__dirname, '../../packages/hub-ui/src'),
    },
  },
});
