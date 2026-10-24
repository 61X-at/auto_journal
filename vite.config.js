import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// FE-004 fix: корень Vite — репозиторий, а не tempPage.
// Тогда ../src/main.js доступен приложению и в dev, и в production build.
export default defineConfig({
  root: '.',
  base: './',
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL('./tempPage/index.html', import.meta.url)),
    },
  },
});
