/**
 * Adjuntos de la orden: documentos que el comercial engancha a los comentarios
 * para taller (el plano que manda el cliente, la foto de la obra, la captura de
 * la medición…).
 *
 * Viven SOLO en la sesión del navegador: la v1 no tiene base de datos propia
 * (§8), así que lo único que llega al taller es el PDF. De ahí el reparto:
 *
 *  - los adjuntos que son IMAGEN se incrustan como páginas de la orden de
 *    trabajo, así que el plano o la foto viajan con la hoja;
 *  - el resto (PDF del cliente, DWG, hoja de cálculo…) solo se puede CITAR por
 *    nombre en la hoja — jsPDF no sabe fusionar documentos. Ver PENDIENTES.md
 *    §4.16: archivarlos o enviarlos requiere servidor.
 *
 * Módulo aparte de `src/pdf/` a propósito: el estado global y el paso de
 * comentarios necesitan estos tipos y helpers, y `ordenTrabajo.ts` arrastra
 * jsPDF (~580 kB), que se carga solo al pulsar «Generar PDF».
 */

export interface AdjuntoOrden {
  /** Identificador de sesión (no persiste): para la lista y el botón de quitar. */
  readonly id: string;
  readonly nombre: string;
  /** Tipo MIME que declara el navegador ('' cuando no lo reconoce). */
  readonly tipoMime: string;
  readonly bytes: number;
  /** Contenido como data URL: es lo que permite incrustar las imágenes en el PDF. */
  readonly dataUrl: string;
}

/**
 * Topes. Los adjuntos se guardan en memoria como data URL (base64, ~1,37× el
 * tamaño del archivo) y el estado se copia en cada tecla del formulario, así que
 * no pueden ser grandes. Con 6 × 5 MB el caso peor ronda los 40 MB de base64,
 * que el navegador aguanta sin penalizar el tecleo.
 */
export const MAX_ADJUNTOS = 6;
export const MAX_BYTES_ADJUNTO = 5 * 1024 * 1024;

/**
 * Formatos de imagen que jsPDF incrusta directamente desde un data URL, sin
 * pasar por canvas (no disponible en el jsdom de los tests). Los demás — GIF,
 * BMP, HEIC del móvil, SVG — se tratan como documento: se citan por nombre.
 */
const MIME_IMAGEN_PDF: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** true si el adjunto puede salir como página de la orden de trabajo. */
export function seIncrustaEnPdf(adjunto: AdjuntoOrden): boolean {
  return MIME_IMAGEN_PDF.has(adjunto.tipoMime.trim().toLowerCase());
}

const FORMATO_TAMANO = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

/** Tamaño legible (`842 B`, `31,4 kB`, `1,2 MB`) para la lista y los avisos. */
export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${FORMATO_TAMANO.format(bytes / 1024)} kB`;
  return `${FORMATO_TAMANO.format(bytes / (1024 * 1024))} MB`;
}

/**
 * Motivo por el que un archivo NO se puede adjuntar, o null si se puede. Devuelve
 * el mensaje ya redactado (mismo criterio que el motor: el error es un valor, no
 * una excepción) porque lo pinta tal cual el paso de comentarios.
 *
 * `yaAdjuntos` es cuántos hay puestos ya, contando los de la misma tanda: al
 * seleccionar cinco archivos de golpe con uno ya puesto, el sexto es el que sobra.
 */
export function errorDeArchivo(
  archivo: { readonly name: string; readonly size: number },
  yaAdjuntos: number,
): string | null {
  if (yaAdjuntos >= MAX_ADJUNTOS) {
    return `Solo se pueden adjuntar ${MAX_ADJUNTOS} documentos por orden.`;
  }
  if (archivo.size === 0) {
    return `«${archivo.name}» está vacío.`;
  }
  if (archivo.size > MAX_BYTES_ADJUNTO) {
    return `«${archivo.name}» pesa ${formatearTamano(archivo.size)}; el máximo por documento es ${formatearTamano(MAX_BYTES_ADJUNTO)}.`;
  }
  return null;
}

/**
 * Contador de ids de sesión. Se usa un contador en lugar del nombre del archivo
 * porque el comercial puede adjuntar dos veces `foto.jpg` desde carpetas
 * distintas y la lista tiene que poder quitar el que se señale.
 */
let siguienteId = 1;

/** Lee un archivo del selector y lo convierte en adjunto (data URL). */
export async function leerArchivoComoAdjunto(archivo: File): Promise<AdjuntoOrden> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result as string);
    lector.onerror = () => reject(new Error(`No se pudo leer «${archivo.name}».`));
    lector.readAsDataURL(archivo);
  });
  return {
    id: `adjunto-${siguienteId++}`,
    nombre: archivo.name,
    // Un archivo sin extensión conocida llega con type ''; se guarda tal cual y
    // simplemente no se incrusta en el PDF.
    tipoMime: archivo.type,
    bytes: archivo.size,
    dataUrl,
  };
}
