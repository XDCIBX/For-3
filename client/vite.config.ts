import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// mode "demo" — однофайловая веб-демо (одиночная игра с ботами), шрифт из Google Fonts
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: './',
    server: { port: 5173 },
    resolve: {
      alias: demo ? [{ find: /^@fontsource\/rubik\/.*\.css$/, replacement: fileURLToPath(new URL('./src/empty.css', import.meta.url)) }] : [],
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 1500,
      assetsInlineLimit: 0,
      outDir: demo ? 'dist-demo' : 'dist',
      rollupOptions: demo ? { output: { inlineDynamicImports: true } } : {},
    },
  };
});
