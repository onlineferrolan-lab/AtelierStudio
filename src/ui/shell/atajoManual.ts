/**
 * Atajo oculto para descargar el «Manual de usuario» desde la propia
 * herramienta: **Ctrl + Alt + H**.
 *
 * Va sin botón visible a propósito (indicación directa, 2026-07-29): el manual
 * no es parte del flujo de trabajo diario y no debe robar sitio en la pantalla.
 * El atajo queda documentado en el propio manual (portada y último capítulo), en
 * el README y en `docs/09-interfaz-y-estado.md`.
 *
 * Por qué Ctrl+Alt+H y no Ctrl+H: Ctrl+H está reservado por el navegador
 * (historial) y una página no lo puede interceptar de forma fiable. Se compara
 * `event.code` (`KeyH`) y no `event.key` para que funcione igual con teclado
 * español, catalán o inglés.
 *
 * El PDF es un estático servido por la app (`public/manual-usuario.pdf`), que se
 * regenera con `npm run manual` (ver `scripts/generar-manual.mjs`). Si el archivo
 * no existiera, el navegador simplemente no descargaría nada: el atajo no puede
 * romper la aplicación.
 */

import { useEffect } from 'react';

const NOMBRE_DESCARGA = 'Manual de usuario - Atelier Studio.pdf';

/** Ruta del manual, colgada de la base pública (la app vive bajo /atelier-studio/). */
export function rutaManual(): string {
  return `${import.meta.env.BASE_URL}manual-usuario.pdf`;
}

/** true si la combinación pulsada es el atajo del manual (Ctrl+Alt+H). */
export function esAtajoManual(evento: KeyboardEvent): boolean {
  return evento.ctrlKey && evento.altKey && !evento.shiftKey && evento.code === 'KeyH';
}

/** Lanza la descarga del manual sin abandonar la página. */
export function descargarManual(): void {
  const enlace = document.createElement('a');
  enlace.href = rutaManual();
  enlace.download = NOMBRE_DESCARGA;
  enlace.rel = 'noopener';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}

/** Escucha Ctrl+Alt+H mientras el componente está montado. */
export function useAtajoManual(): void {
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent): void => {
      if (!esAtajoManual(evento)) return;
      evento.preventDefault();
      descargarManual();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);
}
