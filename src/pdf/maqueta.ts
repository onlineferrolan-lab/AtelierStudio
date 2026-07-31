/**
 * Maquetación compartida de los PDF de Atelier Studio.
 *
 * Aquí vive todo lo que la orden de UNA pieza (`ordenTrabajo.ts`) y la orden de
 * un PEDIDO con varias (`ordenPedido.ts`) tienen en común: la identidad visual
 * de Ferrolan, las medidas del A4, las cajas tituladas, las filas de datos e
 * importes, el croquis de la sección y la carga cacheada de imágenes. Los dos
 * documentos tienen que salir del mismo taller visual; si cada uno se dibujara
 * sus propias cajas acabarían pareciendo de empresas distintas.
 *
 * Nada de esto calcula: solo maqueta lo que le dan ya calculado.
 */

import type { jsPDF } from 'jspdf';
import type { Centimos, Material } from '../domain/types';
import { formatearEuros } from '../domain/money';
import { cajaSeccion, type SeccionPieza } from '../piezas/seccionPieza';

// ---------------------------------------------------------------------------
// Identidad visual (mismos valores que tailwind.config.js → colors.marca)
// ---------------------------------------------------------------------------

export const ROJO_MARCA: readonly [number, number, number] = [196, 7, 49]; // #C40731
/**
 * slate-600. Se usa para las ETIQUETAS; los valores van en negro. Antes era al
 * revés y las cifras — lo que de verdad se lee en el taller — eran lo más
 * flojo de la hoja (2026-07-29, indicación directa).
 */
export const GRIS_TEXTO: readonly [number, number, number] = [71, 85, 105];
export const GRIS_CLARO: readonly [number, number, number] = [241, 245, 249]; // slate-100, placeholders
export const BORDE_CAJA: readonly [number, number, number] = [203, 213, 225]; // slate-300, marcos

/**
 * Logo de Ferrolan. Cuelga de `BASE_URL` (igual que `cabecera.tsx`): la app se
 * sirve bajo `/atelier-studio/`, así que la ruta absoluta `/ferrolan-logo.png`
 * daba 404 en producción y el PDF caía al texto «FERROLAN» en lugar del logo.
 */
const URL_LOGO = `${import.meta.env.BASE_URL}ferrolan-logo.png`;

// ---------------------------------------------------------------------------
// Constantes de maquetación (A4 vertical: 210 × 297 mm)
// ---------------------------------------------------------------------------

export const ANCHO_PAGINA = 210;
export const ALTO_PAGINA = 297;
export const MARGEN_X = 15;
/** Borde derecho para importes alineados a la derecha. */
export const X_DERECHA = ANCHO_PAGINA - MARGEN_X;
export const ANCHO_UTIL = X_DERECHA - MARGEN_X;

/** Alto de la barra de título de una caja. */
export const ALTO_TITULO_CAJA = 6.5;
/** Separación entre bloques. */
export const AIRE = 4;
/** Alto de una fila de datos dentro de una caja. */
export const ALTO_FILA = 4.6;

/** Caja del croquis, a la derecha de los datos de la pieza. */
export const ANCHO_CROQUIS = 64;
export const ALTO_CROQUIS = 35;

/**
 * Formateadores es-ES compartidos: construir un `Intl.*` es caro y su salida
 * es idéntica para las mismas opciones, así que se crean una vez por módulo en
 * lugar de en cada fila o generación.
 */
export const FORMATO_FECHA_LARGA = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'long',
  timeStyle: 'short',
});
const FORMATO_NUMERO_CM = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
export const FORMATO_MERMA = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
export const FORMATO_M2 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 });

/** Número de cm del croquis (1 decimal como máximo, locale es-ES). */
export function formatearNumeroCm(valor: number): string {
  return FORMATO_NUMERO_CM.format(valor);
}

/**
 * Las fuentes estándar de jsPDF (WinAnsi/cp1252) no cubren '≤' ni '≥'
 * (presentes en nombres de tarifa de la configuración): se sustituyen para
 * que el PDF no muestre caracteres corruptos. El resto de textos en español
 * (á, ñ, «», §, ×, —, ·) sí están cubiertos.
 */
export function sanearTextoPdf(texto: string): string {
  return texto.replace(/≤/g, '<=').replace(/≥/g, '>=');
}

// ---------------------------------------------------------------------------
// Bloques de maquetación
// ---------------------------------------------------------------------------

/**
 * Caja con título: recuadro fino y barra superior tenue con el título en rojo.
 * Devuelve la Y donde empieza el contenido.
 *
 * El alto se pasa ya calculado porque cada bloque sabe lo que ocupa: así el marco
 * se dibuja ANTES del contenido y no lo tapa.
 */
export function cajaTitulada(doc: jsPDF, y: number, alto: number, titulo: string): number {
  doc.setFillColor(...GRIS_CLARO);
  doc.rect(MARGEN_X, y, ANCHO_UTIL, ALTO_TITULO_CAJA, 'F');
  doc.setDrawColor(...BORDE_CAJA);
  doc.setLineWidth(0.3);
  doc.rect(MARGEN_X, y, ANCHO_UTIL, alto);
  doc.line(MARGEN_X, y + ALTO_TITULO_CAJA, X_DERECHA, y + ALTO_TITULO_CAJA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...ROJO_MARCA);
  doc.text(sanearTextoPdf(titulo.toUpperCase()), MARGEN_X + 3, y + 4.6);
  doc.setTextColor(0, 0, 0);
  return y + ALTO_TITULO_CAJA + 5;
}

/**
 * Cifra que el taller busca de un vistazo: rótulo pequeño arriba y el valor
 * grande debajo. Es el recurso que hace legible la ficha de la pieza — antes las
 * medidas eran una fila más de texto de 10 pt entre veinte.
 */
export function bloqueCifra(
  doc: jsPDF,
  x: number,
  y: number,
  etiqueta: string,
  valor: string,
  tamValor = 14,
): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(sanearTextoPdf(etiqueta.toUpperCase()), x, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(tamValor);
  doc.setTextColor(0, 0, 0);
  doc.text(sanearTextoPdf(valor), x, y + tamValor * 0.42);
}

/** Fila etiqueta/valor dentro de una caja: etiqueta gris, valor en negro. */
export function filaCaja(
  doc: jsPDF,
  x: number,
  y: number,
  anchoEtiqueta: number,
  etiqueta: string,
  valor: string,
  tam = 8.5,
): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(tam);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(sanearTextoPdf(etiqueta), x, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(sanearTextoPdf(valor), x + anchoEtiqueta, y);
}

/** Importe a la derecha, con su concepto a la izquierda. */
export function filaImporte(
  doc: jsPDF,
  y: number,
  concepto: string,
  importe: Centimos,
  opciones: { negrita?: boolean; sangria?: number; tam?: number } = {},
): void {
  doc.setFont('helvetica', opciones.negrita ? 'bold' : 'normal');
  doc.setFontSize(opciones.tam ?? 8.5);
  if (opciones.negrita) doc.setTextColor(0, 0, 0);
  else doc.setTextColor(...GRIS_TEXTO);
  doc.text(sanearTextoPdf(concepto), MARGEN_X + 3 + (opciones.sangria ?? 0), y);
  doc.setTextColor(0, 0, 0);
  doc.text(formatearEuros(importe), X_DERECHA - 3, y, { align: 'right' });
}

/** Cuántas líneas ocupará un texto al ajustarlo a un ancho. */
export function lineasDeTexto(doc: jsPDF, texto: string, ancho: number, tam: number): string[] {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(tam);
  return doc.splitTextToSize(sanearTextoPdf(texto), ancho) as string[];
}

/**
 * Banda de total en rojo, el número que se cobra. La usan las dos órdenes; en la
 * del pedido es además lo único que se mira de la primera página.
 */
export function bandaTotal(
  doc: jsPDF,
  y: number,
  alto: number,
  rotulo: string,
  importe: Centimos,
): void {
  doc.setFillColor(...ROJO_MARCA);
  doc.rect(MARGEN_X + 1.5, y, ANCHO_UTIL - 3, alto, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(rotulo, MARGEN_X + 5, y + alto / 2, { baseline: 'middle' });
  doc.text(formatearEuros(importe), X_DERECHA - 5, y + alto / 2, {
    align: 'right',
    baseline: 'middle',
  });
  doc.setTextColor(0, 0, 0);
}

/**
 * Pie de la hoja: «OPERADOR:» y una raya para firmar a mano (2026-07-30,
 * indicación directa — antes había tres campos y sobraban).
 *
 * Se queda al pie (286 mm) salvo que la hoja venga cargada, en cuyo caso baja lo
 * justo para no pisar el último bloque. Con tope en 291 para no salirse del A4.
 */
export function pieOperador(doc: jsPDF, yContenido: number): void {
  const y = Math.min(291, Math.max(286, yContenido + 6));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text('OPERADOR:', MARGEN_X, y);
  const xRaya = MARGEN_X + doc.getTextWidth('OPERADOR:') + 3;
  doc.setDrawColor(...GRIS_TEXTO);
  doc.setLineWidth(0.3);
  doc.line(xRaya, y, X_DERECHA, y);
}

// ---------------------------------------------------------------------------
// Imágenes: tamaño en mm a partir del data URL, sin deformar (§ logo y foto)
// ---------------------------------------------------------------------------

/** Ancho/alto en mm que caben en una caja `maxAncho × maxAlto` sin deformar la imagen. */
export function tamanoImagenEnCaja(
  doc: jsPDF,
  dataUrl: string,
  maxAncho: number,
  maxAlto: number,
): { ancho: number; alto: number } {
  const props = doc.getImageProperties(dataUrl);
  const escala = Math.min(maxAncho / props.width, maxAlto / props.height);
  return { ancho: props.width * escala, alto: props.height * escala };
}

export function formatoDeDataUrl(dataUrl: string): string {
  const m = /^data:image\/(\w+);/.exec(dataUrl);
  return (m?.[1] ?? 'JPEG').toUpperCase();
}

/** Foto del material, o un recuadro «Sin imagen» del mismo tamaño. */
export function dibujarFotoMaterial(
  doc: jsPDF,
  x: number,
  y: number,
  lado: number,
  dataUrl: string | null | undefined,
): void {
  doc.setDrawColor(...BORDE_CAJA);
  doc.setLineWidth(0.3);
  if (dataUrl) {
    const { ancho, alto } = tamanoImagenEnCaja(doc, dataUrl, lado, lado);
    doc.addImage(dataUrl, formatoDeDataUrl(dataUrl), x, y, ancho, alto);
    doc.rect(x, y, ancho, alto);
    return;
  }
  doc.setFillColor(...GRIS_CLARO);
  doc.rect(x, y, lado, lado, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('Sin imagen', x + lado / 2, y + lado / 2, { align: 'center', baseline: 'middle' });
  doc.setTextColor(0, 0, 0);
}

/**
 * Croquis de la sección transversal de la pieza, con el fondo y el alto acotados.
 *
 * Viene de `construirSeccion` — la MISMA sección que extruye el visor 3D (ver
 * `src/piezas/seccionPieza.ts`), así que el dibujo del taller y el modelo no
 * pueden discrepar. Se dibuja a escala, encajado en la caja, con el frente de la
 * pieza a la derecha (como se mira de pie ante el peldaño).
 */
export function dibujarCroquisSeccion(
  doc: jsPDF,
  seccion: SeccionPieza,
  x: number,
  y: number,
): void {
  const caja = cajaSeccion(seccion);
  const anchoUtil = caja.zMax - caja.zMin || 1;
  const altoUtil = caja.yMax - caja.yMin || 1;
  // Margen interior para que las cotas quepan sin salirse de la caja.
  const margen = 9;
  const escala = Math.min(
    (ANCHO_CROQUIS - margen * 2) / anchoUtil,
    (ALTO_CROQUIS - margen * 2) / altoUtil,
  );
  const anchoDib = anchoUtil * escala;
  const altoDib = altoUtil * escala;
  const x0 = x + (ANCHO_CROQUIS - anchoDib) / 2;
  const y0 = y + (ALTO_CROQUIS - altoDib) / 2;
  // y del PDF crece hacia abajo; la sección tiene y hacia arriba.
  const px = (z: number): number => x0 + (z - caja.zMin) * escala;
  const py = (yc: number): number => y0 + altoDib - (yc - caja.yMin) * escala;

  // Relleno gris muy tenue + contorno, para que la forma se lea de un vistazo.
  const contorno = seccion.contorno.map(([z, yc]) => [px(z), py(yc)] as const);
  doc.setFillColor(...GRIS_CLARO);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  const [inicio, ...resto] = contorno;
  doc.lines(
    resto.map(([cx, cy], i) => {
      const previo = i === 0 ? inicio : resto[i - 1];
      return [cx - previo[0], cy - previo[1]];
    }),
    inicio[0],
    inicio[1],
    [1, 1],
    'FD',
    true,
  );

  // Juntas de encolado (chaflán a 45°, dientes, retorno) a trazo fino.
  doc.setLineWidth(0.2);
  doc.setDrawColor(120, 120, 120);
  for (const [[z1, y1], [z2, y2]] of seccion.juntas) {
    doc.line(px(z1), py(y1), px(z2), py(y2));
  }

  // Cotas del envolvente: fondo abajo, alto a la izquierda.
  doc.setLineWidth(0.2);
  doc.setDrawColor(...GRIS_TEXTO);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS_TEXTO);
  const yCota = y0 + altoDib + 4.5;
  doc.line(x0, yCota, x0 + anchoDib, yCota);
  doc.text(`${formatearNumeroCm(anchoUtil)} cm`, x0 + anchoDib / 2, yCota + 3, {
    align: 'center',
  });
  const xCota = x0 - 4.5;
  doc.line(xCota, y0, xCota, y0 + altoDib);
  doc.text(`${formatearNumeroCm(altoUtil)} cm`, xCota - 1, y0 + altoDib / 2, {
    align: 'right',
    baseline: 'middle',
  });
  doc.setTextColor(0, 0, 0);
}

// ---------------------------------------------------------------------------
// Nombre de archivo y código de orden
// ---------------------------------------------------------------------------

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Sello fecha-hora `AAAAMMDD-HHMM`, compartido por el nombre de archivo y el
 * código de orden visible: así la hoja impresa y el archivo se refieren
 * siempre a lo mismo.
 */
export function selloFecha(f: Date): string {
  return (
    `${f.getFullYear()}${dosDigitos(f.getMonth() + 1)}${dosDigitos(f.getDate())}` +
    `-${dosDigitos(f.getHours())}${dosDigitos(f.getMinutes())}`
  );
}

/** Trozo de referencia utilizable en un nombre de archivo. */
export function referenciaParaArchivo(referencia: string): string {
  return (
    referencia
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sin-referencia'
  );
}

// ---------------------------------------------------------------------------
// Carga cacheada de imágenes (logo y fotos de material)
// ---------------------------------------------------------------------------

/** Descarga (fetch, sin bloquear si falla) una imagen y la devuelve como data URL, o null. */
async function cargarImagenComoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result as string);
      lector.onerror = () => reject(new Error('No se pudo leer la imagen'));
      lector.readAsDataURL(blob);
    });
  } catch {
    // Red caída, CORS del proveedor de la imagen, etc.: el PDF se genera igual, sin la imagen.
    return null;
  }
}

/**
 * Caché del logo a nivel de módulo: la URL es fija (`URL_LOGO`) y TODO PDF la
 * pide, así que re-descargarla y re-codificarla a data URL en cada generación
 * era trabajo tirado. Solo se cachea el éxito: si la descarga falla (red
 * caída), el siguiente PDF lo reintenta, igual que antes de la caché.
 */
let promesaLogo: Promise<string | null> | null = null;

export function cargarLogo(): Promise<string | null> {
  promesaLogo ??= cargarImagenComoDataUrl(URL_LOGO).then((dataUrl) => {
    if (dataUrl === null) promesaLogo = null; // fallo transitorio: no cachear, reintentar la próxima vez
    return dataUrl;
  });
  return promesaLogo;
}

/**
 * Fotos de material por URL. El caso típico es regenerar el PDF de la MISMA
 * pieza varias veces (cambiar medidas o suplementos): la foto — que puede venir
 * de un proveedor externo — no cambia, y se ahorra el fetch. En un pedido con
 * varias piezas del mismo artículo se ahorra además una descarga por pieza.
 * Acotada porque el catálogo tiene ~21k artículos y sin tope se acumularían data
 * URLs en memoria durante toda la sesión. Como con el logo, los fallos no se cachean.
 */
const MAX_IMAGENES_MATERIAL_CACHE = 20;
const cacheImagenesMaterial = new Map<string, Promise<string | null>>();

export function cargarImagenMaterial(url: string): Promise<string | null> {
  let promesa = cacheImagenesMaterial.get(url);
  if (promesa === undefined) {
    if (cacheImagenesMaterial.size >= MAX_IMAGENES_MATERIAL_CACHE) {
      // Map itera en orden de inserción: la primera clave es la más antigua.
      const masAntigua = cacheImagenesMaterial.keys().next().value;
      if (masAntigua !== undefined) cacheImagenesMaterial.delete(masAntigua);
    }
    promesa = cargarImagenComoDataUrl(url).then((dataUrl) => {
      if (dataUrl === null) cacheImagenesMaterial.delete(url); // fallo transitorio: reintentar la próxima vez
      return dataUrl;
    });
    cacheImagenesMaterial.set(url, promesa);
  }
  return promesa;
}

/** Foto de un material (o null si no tiene o falla la descarga). */
export function cargarImagenDeMaterial(material: Material): Promise<string | null> {
  return material.imagenUrl ? cargarImagenMaterial(material.imagenUrl) : Promise.resolve(null);
}

/**
 * Vacía las cachés de imágenes. Las cachés viven a nivel de módulo y sobreviven
 * de un test a otro, así que sin esto un caso que ya descargó el logo hace que el
 * siguiente no pida nada y falle al contar las llamadas a `fetch`. En la app no
 * se usa: el módulo se carga una vez por sesión y cachear es justo lo que se
 * quiere.
 */
export function reiniciarCacheImagenes(): void {
  promesaLogo = null;
  cacheImagenesMaterial.clear();
}
