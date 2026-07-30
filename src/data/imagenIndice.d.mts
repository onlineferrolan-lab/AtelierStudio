/**
 * Tipos de `imagenIndice.mjs`.
 *
 * La implementación es `.mjs` (JavaScript plano) a propósito: la importan la app
 * —vía Vite— y `scripts/generar-indice-cataleg.mjs`, que es Node puro y corre en
 * el cron de Plesk sin devDependencies, así que no puede cargar TypeScript. Este
 * fichero le devuelve los tipos al lado TS, para que la regla exista UNA sola
 * vez y no pueda divergir entre indexador y app.
 */

/** Decodifica entidades HTML del título, incluso doblemente escapadas. */
export function desescaparTitulo(titulo: string): string;

/** Slug de PrestaShop para un título: minúsculas sin diacríticos, con guiones. */
export function slugImagen(titulo: string): string;

/** Reconstruye la URL de imagen a partir del id, el título y la referencia. */
export function urlImagenDesdeId(
  idImagen: number,
  titulo: string,
  referencia: string,
): string;

/**
 * Campo «imagen» del índice → URL utilizable. Número = id compactado (se
 * reconstruye); cadena = URL literal (excepción, se usa tal cual).
 */
export function urlImagenDeIndice(
  imagen: number | string,
  titulo: string,
  referencia: string,
): string;

/**
 * Decide cómo guardar una URL en el índice: el id (número) si reconstruirla da
 * exactamente la misma URL, o la URL completa (cadena) si no. El `titulo` tiene
 * que venir ya desescapado, el mismo que se guardará en el índice.
 */
export function compactarImagen(
  urlReal: string,
  titulo: string,
  referencia: string,
): number | string;
