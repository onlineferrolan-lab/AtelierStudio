/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Prefijo '' (no solo VITE_): CATALEG_API_KEY es intencionadamente NO
  // VITE_-prefijada para que Vite nunca la incruste en el bundle del
  // navegador (ver .env.example). Solo se usa aquí, en Node, para el proxy
  // de desarrollo — el equivalente en producción es nginx.conf.template.
  const env = loadEnv(mode, '.', '');

  return {
    // La app vive bajo https://studio.ferrolan.es/atelier-studio/ (Plesk). Todas
    // las rutas de estáticos del código cuelgan de import.meta.env.BASE_URL.
    // Para un despliegue en raíz (p. ej. Docker con nginx.conf.template):
    // BASE_PUBLICA=/ (variable de entorno; el flag --base=/ se rompe en
    // Windows/Git Bash por la conversión de rutas de MSYS — en Windows usar
    // `MSYS2_ENV_CONV_EXCL=BASE_PUBLICA BASE_PUBLICA=/ npm run build`).
    base: env.BASE_PUBLICA ?? '/atelier-studio/',
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // Mismo contrato que en producción (nginx): el navegador solo ve
        // /api/cataleg/, sin clave. Ver PENDIENTES.md y src/data/fuenteCataleg.ts.
        '/api/cataleg': {
          target: 'https://studio.ferrolan.es',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/cataleg/, '/cataleg'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (env.CATALEG_API_KEY) {
                proxyReq.setHeader('X-API-Key', env.CATALEG_API_KEY);
              }
            });
          },
        },
      },
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          // Separa las dependencias pesadas en chunks propios (avisos >500 kB).
          manualChunks: {
            react: ['react', 'react-dom'],
            three: ['three'],
            jspdf: ['jspdf'],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
    },
  };
});
