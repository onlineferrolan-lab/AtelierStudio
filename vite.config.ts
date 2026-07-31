/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Ruta ABSOLUTA de disco a partir de una relativa a este fichero.
 *
 * Se hace con `URL` y no con `node:url` porque el proyecto no tiene
 * `@types/node` (tsconfig solo carga vite/client y vitest/globals) y no merece
 * la pena añadirlo por una ruta. En Windows `pathname` sale como
 * «/C:/…»: se le quita la barra de delante y se decodifica el %20 de los
 * espacios, porque esbuild recibe la ruta tal cual.
 */
function rutaAbsoluta(relativa: string): string {
  const ruta = decodeURIComponent(new URL(relativa, import.meta.url).pathname);
  return ruta.replace(/^\/(?=[A-Za-z]:)/, '');
}

/** Sustituto de las dependencias opcionales de jsPDF (ver `resolve.alias`). */
const RUTA_JSPDF_OPCIONAL = rutaAbsoluta('./src/pdf/jspdfSinDependenciasOpcionales.mjs');

export default defineConfig(({ mode }) => {
  // Prefijo '' (no solo VITE_): CATALEG_API_KEY es intencionadamente NO
  // VITE_-prefijada para que Vite nunca la incruste en el bundle del
  // navegador (ver .env.example). Solo se usa aquí, en Node, para el proxy
  // de desarrollo — el equivalente en producción es nginx.conf.template.
  const env = loadEnv(mode, '.', '');

  return {
    // La app vive bajo https://studio.ferrolan.es/atelier-studio/ (Plesk sirve
    // la subcarpeta del docroot automáticamente, sin directivas extra). Todas
    // las rutas de estáticos del código cuelgan de import.meta.env.BASE_URL.
    // Para un despliegue en raíz (p. ej. Docker con nginx.conf.template):
    // BASE_PUBLICA=/ (variable de entorno; el flag --base=/ se rompe en
    // Windows/Git Bash por la conversión de rutas de MSYS — en Windows usar
    // `MSYS2_ENV_CONV_EXCL=BASE_PUBLICA BASE_PUBLICA=/ npm run build`).
    base: env.BASE_PUBLICA ?? '/atelier-studio/',
    plugins: [react()],
    resolve: {
      // jsPDF carga html2canvas, canvg y dompurify con import() dinámico, solo
      // para doc.html() y doc.addSvgAsImage(). Aquí no se usa ninguna de las dos
      // (la orden se dibuja con rect/text/line/addImage), así que Rollup emitía
      // 353 kB de chunks que nunca se descargaban: ficheros muertos en `dist`.
      // Se sustituyen por un módulo vacío que explica el motivo si se invoca.
      // Para volver a usar esas API: borrar estos tres alias.
      //
      // La ruta tiene que ser ABSOLUTA de disco. Con '/src/pdf/…' el build
      // funcionaba (Rollup la resuelve desde la raíz del proyecto) pero `npm run
      // dev` se caía: el prebundle de esbuild la interpreta como ruta absoluta
      // del sistema y buscaba C:\src\pdf\… Se detectó solo al arrancar el dev
      // server; ni los tests ni el build lo veían.
      alias: {
        html2canvas: RUTA_JSPDF_OPCIONAL,
        canvg: RUTA_JSPDF_OPCIONAL,
        dompurify: RUTA_JSPDF_OPCIONAL,
      },
    },
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
      // Los sourcemaps pesaban 4,9 MB en `dist` y publicaban el código fuente.
      // Se generan solo si se piden a propósito (SOURCEMAPS=1) para depurar un
      // despliegue concreto.
      sourcemap: env.SOURCEMAPS === '1',
      rollupOptions: {
        output: {
          // Separa las dependencias pesadas en chunks propios (avisos >500 kB).
          // Solo react va en un chunk propio: es lo único que se carga siempre.
          // three y jspdf NO se listan aquí a propósito — declararlos como
          // manualChunks los metía en el grafo inicial y Vite les ponía un
          // <link rel="modulepreload">, así que se descargaban en la primera
          // pantalla pese a importarse de forma dinámica. Dejando que Rollup los
          // parta solo, quedan como chunks asíncronos de verdad.
          manualChunks: {
            react: ['react', 'react-dom'],
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
