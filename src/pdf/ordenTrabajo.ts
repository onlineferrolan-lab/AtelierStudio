/**
 * Generación del PDF de orden de trabajo (documento interno para taller y archivo, §1).
 *
 * El contenido definitivo del PDF sigue siendo la pregunta abierta §6.11 (ver
 * PENDIENTES.md), pero a petición directa (2026-07-24) el documento ya NO
 * lleva ningún aviso visible de "provisional" (ni banda superior ni nota al
 * pie): se prioriza que el documento se vea terminado en el uso diario.
 *
 * Diseño: A4 vertical, unidades jsPDF en mm, con la identidad de Ferrolan
 * (logo, rojo de marca #C40731 — mismo valor que `tailwind.config.js`) y la
 * foto/textura del material cuando hay una disponible. Todo el dinero se
 * formatea con `formatearEuros` (céntimos enteros) y las cotas con
 * `formatearCotaCm` (mm → cm); aquí no se calcula nada, solo se maqueta el
 * `ResultadoCotizacion` del motor.
 *
 * La construcción del documento (`construirPdfOrdenTrabajo`) es pura, síncrona
 * y separada del `save()` (`generarPdfOrdenTrabajo`): recibe el logo y la foto
 * del material YA cargados como data URL (o `null` si no hay/falla la carga —
 * nunca bloquea la generación del PDF), así sigue siendo testeable sin red ni
 * descarga. `generarPdfOrdenTrabajo` es quien hace ese `fetch` antes de llamarla.
 */

import { jsPDF } from 'jspdf';
import type { Configuracion, Figura } from '../domain/config';
import type { Centimos, Material, Mm, OrigenMaterial, ResultadoCotizacion } from '../domain/types';
import { eurosACentimos, formatearEuros } from '../domain/money';
import { formatearCotaCm } from '../domain/units';

export interface DatosOrdenTrabajo {
  readonly material: Material;
  readonly origen: OrigenMaterial;
  readonly figura: Figura;
  readonly medidasMm: Readonly<Record<string, Mm>>;
  readonly cantidad: number;
  readonly suplementosActivos: readonly string[];
  readonly pintado: boolean;
  readonly precioMaterialEditadoEuros: string;
  readonly mermaPorcentaje: number;
  readonly resultado: ResultadoCotizacion;
  readonly config: Configuracion;
  readonly fecha: Date;
  /** Logo de Ferrolan (`/ferrolan-logo.png`) como data URL; `null`/ausente = sin logo (no bloquea). */
  readonly logoDataUrl?: string | null;
  /** Foto/textura de `material.imagenUrl` como data URL; `null`/ausente = placeholder «Sin imagen». */
  readonly imagenMaterialDataUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Identidad visual (mismos valores que tailwind.config.js → colors.marca)
// ---------------------------------------------------------------------------

const ROJO_MARCA: readonly [number, number, number] = [196, 7, 49]; // #C40731
const ROJO_CLARO: readonly [number, number, number] = [252, 233, 238]; // #FCE9EE
const GRIS_TEXTO: readonly [number, number, number] = [71, 85, 105]; // slate-600, para valores
const GRIS_CLARO: readonly [number, number, number] = [241, 245, 249]; // slate-100, placeholders

const URL_LOGO = '/ferrolan-logo.png';

// ---------------------------------------------------------------------------
// Constantes de maquetación (A4 vertical: 210 × 297 mm)
// ---------------------------------------------------------------------------

const ANCHO_PAGINA = 210;
const MARGEN_X = 15;
/** Límite inferior de escritura; al superarlo se salta de página. */
const LIMITE_Y = 280;
/** Columna donde empiezan los valores en las filas etiqueta/valor. */
const X_VALOR = 78;
/** Borde derecho para importes alineados a la derecha. */
const X_DERECHA = ANCHO_PAGINA - MARGEN_X;
const ALTO_FILA = 5.5;
/** Foto del material: caja cuadrada a la izquierda de sus datos (§ seccionMaterial). */
const LADO_FOTO_MATERIAL = 30;

interface Cursor {
  y: number;
}

/**
 * Las fuentes estándar de jsPDF (WinAnsi/cp1252) no cubren '≤' ni '≥'
 * (presentes en nombres de tarifa de la configuración): se sustituyen para
 * que el PDF no muestre caracteres corruptos. El resto de textos en español
 * (á, ñ, «», §, ×, —, ·) sí están cubiertos.
 */
function sanearTextoPdf(texto: string): string {
  return texto.replace(/≤/g, '<=').replace(/≥/g, '>=');
}

function asegurarEspacio(doc: jsPDF, cur: Cursor, altoNecesario: number): void {
  if (cur.y + altoNecesario > LIMITE_Y) {
    doc.addPage();
    cur.y = MARGEN_X;
  }
}

/** Título de sección con acento de marca (barra roja) y regla bajo el texto. */
function tituloSeccion(doc: jsPDF, cur: Cursor, titulo: string): void {
  asegurarEspacio(doc, cur, 14);
  cur.y += 4;
  doc.setFillColor(...ROJO_MARCA);
  doc.rect(MARGEN_X, cur.y - 3.6, 1.3, 4.6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ROJO_MARCA);
  doc.text(sanearTextoPdf(titulo.toUpperCase()), MARGEN_X + 3.5, cur.y);
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(...ROJO_CLARO);
  doc.setLineWidth(0.4);
  doc.line(MARGEN_X, cur.y + 1.8, X_DERECHA, cur.y + 1.8);
  cur.y += 7.5;
}

function filaDato(doc: jsPDF, cur: Cursor, etiqueta: string, valor: string): void {
  asegurarEspacio(doc, cur, ALTO_FILA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(sanearTextoPdf(etiqueta), MARGEN_X, cur.y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(sanearTextoPdf(valor), X_VALOR, cur.y);
  doc.setTextColor(0, 0, 0);
  cur.y += ALTO_FILA;
}

/** Ancho fijo reservado a la etiqueta en `filaCompacta`, para que el valor no se solape con ella. */
const ANCHO_ETIQUETA_COMPACTA = 27;

/** Etiqueta + valor en una sola línea, en dos columnas fijas (junto a la foto del material). */
function filaCompacta(doc: jsPDF, y: number, x: number, etiqueta: string, valor: string): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(sanearTextoPdf(etiqueta), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(sanearTextoPdf(valor), x + ANCHO_ETIQUETA_COMPACTA, y);
  doc.setTextColor(0, 0, 0);
}

function filaImporte(
  doc: jsPDF,
  cur: Cursor,
  concepto: string,
  importe: Centimos,
  opciones: { negrita?: boolean; sangria?: number } = {},
): void {
  asegurarEspacio(doc, cur, ALTO_FILA);
  doc.setFont('helvetica', opciones.negrita ? 'bold' : 'normal');
  doc.setFontSize(10);
  doc.text(sanearTextoPdf(concepto), MARGEN_X + (opciones.sangria ?? 0), cur.y);
  doc.text(formatearEuros(importe), X_DERECHA, cur.y, { align: 'right' });
  cur.y += ALTO_FILA;
}

// ---------------------------------------------------------------------------
// Imágenes: tamaño en mm a partir del data URL, sin deformar (§ logo y foto)
// ---------------------------------------------------------------------------

/** Ancho/alto en mm que caben en una caja `maxAncho × maxAlto` sin deformar la imagen. */
function tamanoImagenEnCaja(
  doc: jsPDF,
  dataUrl: string,
  maxAncho: number,
  maxAlto: number,
): { ancho: number; alto: number } {
  const props = doc.getImageProperties(dataUrl);
  const escala = Math.min(maxAncho / props.width, maxAlto / props.height);
  return { ancho: props.width * escala, alto: props.height * escala };
}

function formatoDeDataUrl(dataUrl: string): string {
  const m = /^data:image\/(\w+);/.exec(dataUrl);
  return (m?.[1] ?? 'JPEG').toUpperCase();
}

// ---------------------------------------------------------------------------
// Nombre de archivo
// ---------------------------------------------------------------------------

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** `orden-trabajo_<referencia>_<AAAAMMDD-HHmm>.pdf` (referencia saneada para nombre de archivo). */
export function nombreArchivoOrdenTrabajo(
  datos: Pick<DatosOrdenTrabajo, 'material' | 'fecha'>,
): string {
  const referencia =
    datos.material.referencia
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sin-referencia';
  const f = datos.fecha;
  const sello = `${f.getFullYear()}${dosDigitos(f.getMonth() + 1)}${dosDigitos(f.getDate())}-${dosDigitos(f.getHours())}${dosDigitos(f.getMinutes())}`;
  return `orden-trabajo_${referencia}_${sello}.pdf`;
}

// ---------------------------------------------------------------------------
// Construcción del documento (pura: no llama a save() ni a fetch())
// ---------------------------------------------------------------------------

function formatearPrecioEditado(precioMaterialEditadoEuros: string): string {
  const valor = Number.parseFloat(precioMaterialEditadoEuros.trim().replace(',', '.'));
  if (Number.isNaN(valor)) return `${precioMaterialEditadoEuros} €`;
  return formatearEuros(eurosACentimos(valor));
}

function seccionCabecera(doc: jsPDF, cur: Cursor, datos: DatosOrdenTrabajo): void {
  const altoCabecera = 16;
  if (datos.logoDataUrl) {
    const { ancho, alto } = tamanoImagenEnCaja(doc, datos.logoDataUrl, 34, altoCabecera);
    doc.addImage(
      datos.logoDataUrl,
      formatoDeDataUrl(datos.logoDataUrl),
      MARGEN_X,
      cur.y,
      ancho,
      alto,
    );
  } else {
    // Sin logo (no se pudo cargar): nombre de la empresa en rojo de marca, no bloquea.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...ROJO_MARCA);
    doc.text('FERROLAN', MARGEN_X, cur.y + 9);
    doc.setTextColor(0, 0, 0);
  }

  const xTexto = MARGEN_X + 42;
  let yTexto = cur.y + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...ROJO_MARCA);
  doc.text('ATELIER STUDIO', xTexto, yTexto);
  doc.setTextColor(0, 0, 0);
  yTexto += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('Orden de trabajo — documento interno', xTexto, yTexto);
  doc.setTextColor(0, 0, 0);

  const fechaTxt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short' }).format(
    datos.fecha,
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(`Generada: ${fechaTxt}`, X_DERECHA, cur.y + 5, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  cur.y += altoCabecera + 4;
  doc.setDrawColor(...ROJO_MARCA);
  doc.setLineWidth(0.8);
  doc.line(MARGEN_X, cur.y, X_DERECHA, cur.y);
  cur.y += 6;
}

/** Caja de la foto/textura del material (o placeholder «Sin imagen»), lado izquierdo de la sección. */
function dibujarFotoMaterial(doc: jsPDF, x: number, y: number, dataUrl: string | null | undefined): void {
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.3);
  if (dataUrl) {
    const { ancho, alto } = tamanoImagenEnCaja(doc, dataUrl, LADO_FOTO_MATERIAL, LADO_FOTO_MATERIAL);
    // Fondo neutro (mismo criterio que ImagenMaterial en la app) para fotos con transparencia.
    doc.setFillColor(...GRIS_CLARO);
    doc.rect(x, y, LADO_FOTO_MATERIAL, LADO_FOTO_MATERIAL, 'F');
    doc.addImage(
      dataUrl,
      formatoDeDataUrl(dataUrl),
      x + (LADO_FOTO_MATERIAL - ancho) / 2,
      y + (LADO_FOTO_MATERIAL - alto) / 2,
      ancho,
      alto,
    );
    doc.rect(x, y, LADO_FOTO_MATERIAL, LADO_FOTO_MATERIAL, 'S');
  } else {
    doc.setFillColor(...GRIS_CLARO);
    doc.rect(x, y, LADO_FOTO_MATERIAL, LADO_FOTO_MATERIAL, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400, igual que el placeholder de la app
    doc.text('Sin imagen', x + LADO_FOTO_MATERIAL / 2, y + LADO_FOTO_MATERIAL / 2, {
      align: 'center',
      baseline: 'middle',
    });
    doc.setTextColor(0, 0, 0);
  }
}

function seccionMaterial(doc: jsPDF, cur: Cursor, datos: DatosOrdenTrabajo): void {
  tituloSeccion(doc, cur, 'Material');
  const { material, origen, resultado } = datos;

  asegurarEspacio(doc, cur, LADO_FOTO_MATERIAL);
  const yInicioColumnas = cur.y;
  dibujarFotoMaterial(doc, MARGEN_X, yInicioColumnas - 4, datos.imagenMaterialDataUrl);

  const xTexto = MARGEN_X + LADO_FOTO_MATERIAL + 6;
  let yTexto = yInicioColumnas;
  filaCompacta(doc, yTexto, xTexto, 'Descripción', material.descripcion);
  yTexto += ALTO_FILA;
  filaCompacta(doc, yTexto, xTexto, 'Referencia', material.referencia);
  yTexto += ALTO_FILA;
  filaCompacta(doc, yTexto, xTexto, 'Marca', material.marca ?? '—');
  yTexto += ALTO_FILA;
  filaCompacta(
    doc,
    yTexto,
    xTexto,
    'Formato',
    `${formatearCotaCm(material.formato.largoMm)} × ${formatearCotaCm(material.formato.anchoMm)}`,
  );
  yTexto += ALTO_FILA;
  if (material.esManual) {
    doc.setFillColor(...ROJO_MARCA);
    doc.roundedRect(xTexto, yTexto - 3.6, 26, 4.8, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('ENTRADA MANUAL', xTexto + 13, yTexto - 0.4, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    yTexto += ALTO_FILA;
  }

  // Origen y precio siguen en la MISMA columna que Descripción/Referencia/...
  // (no a ancho completo): todos los datos del material forman un solo bloque.
  filaCompacta(
    doc,
    yTexto,
    xTexto,
    'Origen',
    origen === 'stock'
      ? 'Stock — se factura por piezas (caja abierta permitida)'
      : 'Pedido — se facturan cajas completas',
  );
  yTexto += ALTO_FILA;
  // El precio editado por el comercial se muestra junto a la tarifa original (§1).
  // formatearEuros ya añade el símbolo €, así que la unidad va sin él (evita "€ €/m²").
  const unidadPrecio = material.esManual ? '/unidad' : '/m²';
  if (datos.precioMaterialEditadoEuros.trim() !== '') {
    filaCompacta(
      doc,
      yTexto,
      xTexto,
      'Precio aplicado',
      `${formatearPrecioEditado(datos.precioMaterialEditadoEuros)}${unidadPrecio} (editado por el comercial)`,
    );
    yTexto += ALTO_FILA;
    filaCompacta(
      doc,
      yTexto,
      xTexto,
      'Tarifa original',
      `${formatearEuros(resultado.precioMaterialOriginal)}${unidadPrecio}`,
    );
    yTexto += ALTO_FILA;
  } else {
    filaCompacta(
      doc,
      yTexto,
      xTexto,
      'Precio aplicado',
      `${formatearEuros(resultado.precioMaterialOriginal)}${unidadPrecio}`,
    );
    yTexto += ALTO_FILA;
  }

  cur.y = Math.max(yInicioColumnas - 4 + LADO_FOTO_MATERIAL + 3, yTexto + 1.5);
}

function seccionPieza(doc: jsPDF, cur: Cursor, datos: DatosOrdenTrabajo): void {
  tituloSeccion(doc, cur, 'Pieza');
  const { figura } = datos;
  filaDato(doc, cur, 'Figura', sanearTextoPdf(figura.nombre));

  // Tabla de medidas: etiquetas de la configuración de la figura + valores en cm.
  asegurarEspacio(doc, cur, ALTO_FILA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Medidas', MARGEN_X, cur.y);
  cur.y += ALTO_FILA;
  for (const campo of figura.medidas) {
    const valor = datos.medidasMm[campo.id];
    const etiqueta = campo.etiqueta.replace(/\s*\(cm\)\s*$/, '');
    filaDato(doc, cur, `  ${etiqueta}`, valor !== undefined ? formatearCotaCm(valor) : '—');
  }
  filaDato(doc, cur, 'Cantidad', `${datos.cantidad} ${datos.cantidad === 1 ? 'pieza' : 'piezas'}`);
  if (figura.tienePintado) {
    filaDato(doc, cur, 'Pintado', datos.pintado ? 'Sí' : 'No');
  }
  if (datos.suplementosActivos.length > 0) {
    asegurarEspacio(doc, cur, ALTO_FILA);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Suplementos', MARGEN_X, cur.y);
    cur.y += ALTO_FILA;
    for (const id of datos.suplementosActivos) {
      const nombre = datos.config.suplementos[id]?.nombre ?? id;
      filaDato(doc, cur, `  · ${nombre}`, 'activo');
    }
  } else {
    filaDato(doc, cur, 'Suplementos', 'ninguno');
  }
}

function seccionProduccion(doc: jsPDF, cur: Cursor, datos: DatosOrdenTrabajo): void {
  tituloSeccion(doc, cur, 'Producción');
  const { resultado } = datos;
  asegurarEspacio(doc, cur, ALTO_FILA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Componentes de la pieza', MARGEN_X, cur.y);
  cur.y += ALTO_FILA;
  for (const c of resultado.componentes) {
    filaDato(
      doc,
      cur,
      `  ${c.id}`,
      `${formatearCotaCm(c.largoMm)} × ${formatearCotaCm(c.anchoMm)}`,
    );
  }
  const { ocupacion } = resultado;
  filaDato(
    doc,
    cur,
    'Ocupación en baldosa',
    `${formatearCotaCm(ocupacion.ocupacionMm)} de ${formatearCotaCm(ocupacion.dimensionUtilMm)} · ` +
      `${ocupacion.numCortes} cortes${ocupacion.baldosaGirada ? ' · baldosa girada 90°' : ''}`,
  );
  filaDato(doc, cur, 'Baldosas necesarias', String(resultado.baldosasNecesarias));
  const mermaTxt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(
    datos.mermaPorcentaje,
  );
  filaDato(
    doc,
    cur,
    'Baldosas con merma',
    `${resultado.baldosasConMerma} (merma aplicada: ${mermaTxt} %)`,
  );
  filaDato(doc, cur, 'Unidades facturadas', String(resultado.unidadesFacturadas));
  filaDato(doc, cur, 'Cajas facturadas', String(resultado.cajasFacturadas));
  const m2Txt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(
    resultado.m2Facturados,
  );
  filaDato(doc, cur, 'm² facturados', `${m2Txt} m²`);
}

function seccionCotizacion(doc: jsPDF, cur: Cursor, datos: DatosOrdenTrabajo): void {
  tituloSeccion(doc, cur, 'Cotización');
  const { desglose, lineasManipulacion } = datos.resultado;
  filaImporte(doc, cur, 'Material', desglose.materialCentimos);
  filaImporte(doc, cur, 'Manipulación', desglose.manipulacionCentimos, { negrita: true });
  for (const linea of lineasManipulacion) {
    filaImporte(doc, cur, linea.concepto, linea.centimos, { sangria: 6 });
  }
  filaImporte(doc, cur, 'Arranque de máquina', desglose.arranqueCentimos);
  asegurarEspacio(doc, cur, 3);
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.3);
  doc.line(MARGEN_X, cur.y, X_DERECHA, cur.y);
  cur.y += 4;
  filaImporte(doc, cur, 'Total sin IVA', desglose.totalSinIvaCentimos, { negrita: true });
  filaImporte(doc, cur, `IVA (${datos.config.parametros.ivaPorcentaje} %)`, desglose.ivaCentimos);

  // Total con IVA: caja en rojo de marca, con aire propio, para que sea
  // inequívocamente el número que importa (no una fila más del desglose).
  const altoCaja = 11;
  asegurarEspacio(doc, cur, altoCaja + 5);
  cur.y += 3;
  doc.setFillColor(...ROJO_MARCA);
  doc.roundedRect(MARGEN_X, cur.y, X_DERECHA - MARGEN_X, altoCaja, 1.5, 1.5, 'F');
  const yCentro = cur.y + altoCaja / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL CON IVA', MARGEN_X + 4, yCentro, { baseline: 'middle' });
  doc.text(formatearEuros(desglose.totalConIvaCentimos), X_DERECHA - 4, yCentro, {
    align: 'right',
    baseline: 'middle',
  });
  doc.setTextColor(0, 0, 0);
  cur.y += altoCaja + 4;
}

/** Construye el documento jsPDF de la orden de trabajo. Función pura: no descarga ni hace fetch. */
export function construirPdfOrdenTrabajo(datos: DatosOrdenTrabajo): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cur: Cursor = { y: 18 };

  seccionCabecera(doc, cur, datos);
  seccionMaterial(doc, cur, datos);
  seccionPieza(doc, cur, datos);
  seccionProduccion(doc, cur, datos);
  seccionCotizacion(doc, cur, datos);

  return doc;
}

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

/** Genera y descarga el PDF de la orden de trabajo. Devuelve el nombre del archivo guardado. */
export async function generarPdfOrdenTrabajo(datos: DatosOrdenTrabajo): Promise<string> {
  const [logoDataUrl, imagenMaterialDataUrl] = await Promise.all([
    cargarImagenComoDataUrl(URL_LOGO),
    datos.material.imagenUrl ? cargarImagenComoDataUrl(datos.material.imagenUrl) : Promise.resolve(null),
  ]);
  const doc = construirPdfOrdenTrabajo({ ...datos, logoDataUrl, imagenMaterialDataUrl });
  const nombre = nombreArchivoOrdenTrabajo(datos);
  doc.save(nombre);
  return nombre;
}
