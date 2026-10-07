import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
// Local event: the durable Node server owns state and media.
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4318', '/media': 'http://127.0.0.1:4318' } },
  plugins: [vinext()],
});
