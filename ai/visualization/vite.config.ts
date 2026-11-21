import { defineConfig } from 'vite';

// Local-only bridge to the existing read-only inference endpoint.
// Same path works for dev and built-app preview; no commerce/session credentials.
const proxy = {
  '/api/v1/products': { target: 'http://127.0.0.1:3000', changeOrigin: false },
  '/api/v1/tracking/shared-graph': {
    target: 'http://127.0.0.1:3000',
    changeOrigin: false,
  },
  '/api/v1/tracking/session-graph': {
    target: 'http://127.0.0.1:3000',
    changeOrigin: false,
  },
  '/ai-session': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: false,
    rewrite: () => '/recommend/session',
    timeout: 12000,
    proxyTimeout: 12000,
  },
};
export default defineConfig({ server: { proxy }, preview: { proxy } });
