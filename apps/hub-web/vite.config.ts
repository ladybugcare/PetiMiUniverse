import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const require = createRequire(import.meta.url);
const reactRoot = path.dirname(require.resolve('react/package.json'));

export default defineConfig(({ mode }) => ({
  // Expõe também REACT_APP_* ao cliente (útil se copiares .env do CRA/frontend sem renomear para VITE_*).
  envPrefix: ['VITE_', 'REACT_APP_'],
  plugins: [react()],
  server: {
    port: 3002,
    strictPort: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    alias: {
      '@petimi/web-core': path.resolve(__dirname, '../../packages/web-core/src'),
      '@petimi/hub-ui': path.resolve(__dirname, '../../packages/hub-ui/src'),
      'react/jsx-runtime': path.join(
        reactRoot,
        mode === 'development'
          ? 'cjs/react-jsx-runtime.development.js'
          : 'cjs/react-jsx-runtime.production.min.js',
      ),
      'react/jsx-dev-runtime': path.join(reactRoot, 'cjs/react-jsx-runtime.development.js'),
    },
  },
}));
