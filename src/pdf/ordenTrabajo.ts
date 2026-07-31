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
import type { Centimos, Material, Mm, ResultadoCotizacion } from '../domain/types';
import { formatearEuros } from '../domain/money';
import { formatearCotaCm } from '../domain/units';
import { cajaSeccion, type SeccionPieza } from '../piezas/seccionPieza';

export interface DatosOrdenTrabajo {
  readonly material: Material;
  readonly figura: Figura;
  readonly medidasMm: Readonly<Record<string, Mm>>;
  readonly cantidad: number;
  readonly suplementosActivos: readonly string[];
  /**
   * Piezas a las que se aplica cada suplemento POR PIEZA («Angular»). Sin
   * entrada se entiende UNA pieza, igual que en el motor.
   */
  readonly unidadesSuplemento?: Readonly<Record<string, number>>;
  readonly pintado: boolean;
  /** Las baldosas las aporta el cliente: el material no se cobra y la hoja lo dice. */
  readonly azulejosNoIncluidos: boolean;
  readonly mermaPorcentaje: number;
  /** Comentarios libres del comercial para taller ('' = no se imprime el bloque). */
  readonly comentarios?: string;
  readonly resultado: ResultadoCotizacion;
  readonly config: Configuracion;
  readonly fecha: Date;
  /** Logo de Ferrolan (`/ferrolan-logo.png`) como data URL; `null`/ausente = sin logo (no bloquea). */
  readonly logoDataUrl?: string | null;
  /** Foto/textura de `material.imagenUrl` como data URL; `null`/ausente = placeholder «Sin imagen». */
  readonly imagenMaterialDataUrl?: string | null;
  /**
   * Sección transversal de la pieza (`construirSeccion` del visor, misma fuente
   * que el 3D) para dibujar el croquis. `null`/ausente = sin croquis: el PDF se
   * genera igual, solo sin el dibujo.
   */
  readonly seccion?: SeccionPieza | null;
}

// ---------------------------------------------------------------------------
// Identidad visual (mismos valores que tailwind.config.js → colors.marca)
// ---------------------------------------------------------------------------

const ROJO_MARCA: readonly [number, number, number] = [196, 7, 49]; // #C40731
/**
 * slate-600. Se usa para las ETIQUETAS; los valores van en negro. Antes era al
 * revés y las cifras — lo que de verdad se lee en el taller — eran lo más
 * flojo de la hoja (2026-07-29, indicación directa).
 */
const GRIS_TEXTO: readonly [number, number, number] = [71, 85, 105];
const GRIS_CLARO: readonly [number, number, number] = [241, 245, 249]; // slate-100, placeholders
const BORDE_CAJA: readonly [number, number, number] = [203, 213, 225]; // slate-300, marcos

/**
 * Logo de Ferrolan. Cuelga de `BASE_URL` (igual que `cabecera.tsx`): la app se
 * sirve bajo `/atelier-studio/`, así que la ruta absoluta `/ferrolan-logo.png`
 * daba 404 en producción y el PDF caía al texto «FERROLAN» en lugar del logo.
 */
const URL_LOGO = `${import.meta.env.BASE_URL}ferrolan-logo.png`;

// ---------------------------------------------------------------------------
// Constantes de maquetación (A4 vertical: 210 × 297 mm)
// ---------------------------------------------------------------------------

const ANCHO_PAGINA = 210;
const MARGEN_X = 15;
/** Borde derecho para importes alineados a la derecha. */
const X_DERECHA = ANCHO_PAGINA - MARGEN_X;

/**
 * Formateadores es-ES compartidos: construir un `Intl.*` es caro y su salida
 * es idéntica para las mismas opciones, así que se crean una vez por módulo en
 * lugar de en cada fila o generación.
 */
const FORMATO_FECHA_LARGA = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'long',
  timeStyle: 'short',
});
const FORMATO_NUMERO_CM = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const FORMATO_MERMA = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const FORMATO_M2 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 });

/**
 * Las fuentes estándar de jsPDF (WinAnsi/cp1252) no cubren '≤' ni '≥'
 * (presentes en nombres de tarifa de la configuración): se sustituyen para
 * que el PDF no muestre caracteres corruptos. El resto de textos en español
 * (á, ñ, «», §, ×, —, ·) sí están cubiertos.
 */
function sanearTextoPdf(texto: string): string {
  return texto.replace(/≤/g, '<=').replace(/≥/g, '>=');
}

const ANCHO_UTIL = X_DERECHA - MARGEN_X;

/** Alto de la barra de título de una caja. */
const ALTO_TITULO_CAJA = 6.5;
/** Separación entre bloques. */
const AIRE = 4;
/** Alto de una fila de datos dentro de una caja. */
const ALTO_FILA = 4.6;

/**
 * Caja con título: recuadro fino y barra superior tenue con el título en rojo.
 * Devuelve la Y donde empieza el contenido.
 *
 * El alto se pasa ya calculado porque cada bloque sabe lo que ocupa: así el marco
 * se dibuja ANTES del contenido y no lo tapa. La hoja es de alto fijo (una
 * página, ver `construirPdfOrdenTrabajo`), no hay flujo entre páginas.
 */
function cajaTitulada(doc: jsPDF, y: number, alto: number, titulo: string): number {
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
function bloqueCifra(
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
function filaCaja(
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
function filaImporte(
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
function lineasDeTexto(doc: jsPDF, texto: string, ancho: number, tam: number): string[] {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(tam);
  return doc.splitTextToSize(sanearTextoPdf(texto), ancho) as string[];
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
/**
 * Sello fecha-hora `AAAAMMDD-HHMM`, compartido por el nombre de archivo y el
 * código de orden visible: así la hoja impresa y el archivo se refieren
 * siempre a lo mismo.
 */
function selloFecha(f: Date): string {
  return (
    `${f.getFullYear()}${dosDigitos(f.getMonth() + 1)}${dosDigitos(f.getDate())}` +
    `-${dosDigitos(f.getHours())}${dosDigitos(f.getMinutes())}`
  );
}

/**
 * Código de orden que se imprime en la cabecera. Sin contador en servidor (§8:
 * sin base de datos propia en la v1) el sello fecha-hora es el identificador
 * disponible, y basta para que taller y oficina citen la misma hoja.
 */
export function codigoOrdenTrabajo(datos: Pick<DatosOrdenTrabajo, 'fecha'>): string {
  return `OT-${selloFecha(datos.fecha)}`;
}

export function nombreArchivoOrdenTrabajo(
  datos: Pick<DatosOrdenTrabajo, 'material' | 'fecha'>,
): string {
  const referencia =
    datos.material.referencia
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sin-referencia';
  return `orden-trabajo_${referencia}_${selloFecha(datos.fecha)}.pdf`;
}

// ---------------------------------------------------------------------------
// Construcción del documento (pura: no llama a save() ni a fetch())
// ---------------------------------------------------------------------------

/** Número de cm del croquis (1 decimal como máximo, locale es-ES). */
function formatearNumeroCm(valor: number): string {
  return FORMATO_NUMERO_CM.format(valor);
}

/**
 * Cabecera: logo, el nombre del documento en grande y el código de orden a la
 * derecha. El código va destacado porque es por lo que se cita la hoja.
 */
function seccionCabecera(doc: jsPDF, datos: DatosOrdenTrabajo): number {
  const y = 14;
  if (datos.logoDataUrl) {
    const { ancho, alto } = tamanoImagenEnCaja(doc, datos.logoDataUrl, 30, 13);
    doc.addImage(datos.logoDataUrl, formatoDeDataUrl(datos.logoDataUrl), MARGEN_X, y, ancho, alto);
  } else {
    // Sin logo (no se pudo cargar): el nombre en rojo de marca; no bloquea.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...ROJO_MARCA);
    doc.text('FERROLAN', MARGEN_X, y + 8);
    doc.setTextColor(0, 0, 0);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(0, 0, 0);
  doc.text('ORDEN DE TRABAJO', MARGEN_X + 40, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('Atelier Studio · documento interno', MARGEN_X + 40, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...ROJO_MARCA);
  doc.text(codigoOrdenTrabajo(datos), X_DERECHA, y + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(FORMATO_FECHA_LARGA.format(datos.fecha), X_DERECHA, y + 11.5, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  const yRegla = y + 16;
  doc.setDrawColor(...ROJO_MARCA);
  doc.setLineWidth(1);
  doc.line(MARGEN_X, yRegla, X_DERECHA, yRegla);
  return yRegla + AIRE + 1;
}

/**
 * Ficha de la pieza: lo primero y más grande de la hoja, porque es lo que el
 * taller tiene que fabricar. Figura, cantidad destacada, las medidas como cifras
 * grandes y el croquis de la sección a la derecha.
 */
function seccionPieza(doc: jsPDF, y: number, datos: DatosOrdenTrabajo): number {
  const { figura } = datos;
  const ALTO = 48;
  const yc = cajaTitulada(doc, y, ALTO, 'Pieza a fabricar');
  const anchoTexto = ANCHO_CROQUIS + 6;
  const xCroquis = X_DERECHA - anchoTexto;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(sanearTextoPdf(figura.nombre), MARGEN_X + 3, yc + 3);

  // Cantidad en negativo: es el número por el que se cuenta el trabajo.
  const textoCantidad = `${datos.cantidad} ${datos.cantidad === 1 ? 'PIEZA' : 'PIEZAS'}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const anchoCantidad = doc.getTextWidth(sanearTextoPdf(textoCantidad)) + 8;
  doc.setFillColor(...ROJO_MARCA);
  doc.roundedRect(MARGEN_X + 3, yc + 7, anchoCantidad, 8.5, 1.2, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(sanearTextoPdf(textoCantidad), MARGEN_X + 3 + anchoCantidad / 2, yc + 11.4, {
    align: 'center',
    baseline: 'middle',
  });
  doc.setTextColor(0, 0, 0);

  // Medidas como cifras grandes, en el orden en que las declara la figura.
  const medidas = figura.medidas.map((campo) => ({
    etiqueta: campo.etiqueta.replace(/\s*\(cm\)\s*$/, ''),
    valor:
      datos.medidasMm[campo.id] !== undefined
        ? formatearCotaCm(datos.medidasMm[campo.id])
        : '—',
  }));
  const anchoMedidas = xCroquis - (MARGEN_X + 3) - 4;
  const paso = medidas.length > 0 ? anchoMedidas / medidas.length : anchoMedidas;
  medidas.forEach((m, i) => {
    bloqueCifra(doc, MARGEN_X + 3 + i * paso, yc + 23, m.etiqueta, m.valor, 12);
  });

  if (datos.seccion) {
    dibujarCroquisSeccion(doc, datos.seccion, xCroquis, yc - 1);
  }
  return y + ALTO + AIRE;
}

/** Foto del material, o un recuadro «Sin imagen» del mismo tamaño. */
function dibujarFotoMaterial(
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

/** Material del que se corta: foto, descripción y los datos de compra. */
function seccionMaterial(doc: jsPDF, y: number, datos: DatosOrdenTrabajo): number {
  const { material } = datos;
  // 33 para que la fila de marca no quede pegada al marco cuando existe.
  const ALTO = 33;
  const yc = cajaTitulada(doc, y, ALTO, 'Material');
  const LADO = 18;
  dibujarFotoMaterial(doc, MARGEN_X + 3, yc - 2, LADO, datos.imagenMaterialDataUrl);
  const x = MARGEN_X + 3 + LADO + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(sanearTextoPdf(material.descripcion), x, yc + 1);
  if (material.esManual) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...ROJO_MARCA);
    doc.text('ENTRADA MANUAL', x, yc + 5);
    doc.setTextColor(0, 0, 0);
  }

  // Donde antes iba el origen (stock/pedido, suprimido el 2026-07-30) va el dato
  // de caja: es lo que explica en taller por qué se facturan más piezas que las
  // necesarias, porque se cobra la caja completa.
  const caja =
    material.piezasPorCaja != null
      ? `${material.piezasPorCaja} ud./caja${material.m2PorCaja != null ? ` · ${FORMATO_M2.format(material.m2PorCaja)} m²` : ''}`
      : '—';
  // Con «azulejos no incluidos» el taller tiene que saber que las baldosas las
  // trae el cliente: es lo que explica que el material no aparezca cobrado.
  const precio = datos.azulejosNoIncluidos
    ? 'NO INCLUIDOS (aporta cliente)'
    : precioMaterialTarifa(material);

  const xCol2 = x + 78;
  let yf = yc + 9;
  filaCaja(doc, x, yf, 20, 'Referencia', material.referencia);
  filaCaja(doc, xCol2, yf, 18, 'Formato', formatoMaterial(material));
  yf += ALTO_FILA;
  filaCaja(doc, x, yf, 20, 'Caja', caja);
  filaCaja(doc, xCol2, yf, 18, 'Precio', precio);
  yf += ALTO_FILA;
  if (material.marca) filaCaja(doc, x, yf, 20, 'Marca', material.marca);
  return y + ALTO + AIRE;
}

/** Formato de la baldosa en cm, tal como se lee en el catálogo. */
function formatoMaterial(material: Material): string {
  return `${formatearCotaCm(material.formato.largoMm)} × ${formatearCotaCm(material.formato.anchoMm)}`;
}

/** Precio de tarifa del material, con su unidad (€/m² del ERP o €/unidad manual). */
function precioMaterialTarifa(material: Material): string {
  if (material.esManual) {
    return material.precioUnidadCentimos === null
      ? '—'
      : `${formatearEuros(material.precioUnidadCentimos)}/ud.`;
  }
  return material.precioM2Centimos === null
    ? '—'
    : `${formatearEuros(material.precioM2Centimos)}/m²`;
}

/**
 * Operaciones añadidas (suplementos) en una sola línea corrida: son pocas y
 * cortas, y una caja con cuatro filas gastaba media hoja. De cada una se dice a
 * cuántas piezas alcanza, que es lo que el taller necesita saber.
 */
function seccionOperaciones(doc: jsPDF, y: number, datos: DatosOrdenTrabajo): number {
  const partes = datos.suplementosActivos.map((id) => {
    const suplemento = datos.config.suplementos[id];
    const nombre = suplemento?.nombre ?? id;
    if (suplemento?.tipo === 'porPieza') {
      const unidades = datos.unidadesSuplemento?.[id] ?? 1;
      return `${nombre} (${unidades} de ${datos.cantidad})`;
    }
    return `${nombre} (todas)`;
  });
  if (datos.figura.tienePintado && datos.pintado) partes.push('Pintado');
  const texto = partes.length > 0 ? partes.join('  ·  ') : 'Sin operaciones adicionales.';

  const lineas = lineasDeTexto(doc, texto, ANCHO_UTIL - 6, 9);
  const ALTO = ALTO_TITULO_CAJA + 5 + lineas.length * ALTO_FILA;
  const yc = cajaTitulada(doc, y, ALTO, 'Operaciones');
  doc.setFont('helvetica', partes.length > 0 ? 'bold' : 'normal');
  doc.setFontSize(9);
  if (partes.length > 0) doc.setTextColor(0, 0, 0);
  else doc.setTextColor(...GRIS_TEXTO);
  lineas.forEach((linea, i) => doc.text(linea, MARGEN_X + 3, yc + i * ALTO_FILA));
  doc.setTextColor(0, 0, 0);
  return y + ALTO + AIRE;
}

/**
 * Comentarios del comercial para taller. Solo se imprime si hay texto, y con
 * fondo tenue para que se vea que es una indicación y no un dato calculado.
 */
function seccionComentarios(doc: jsPDF, y: number, datos: DatosOrdenTrabajo): number {
  const texto = (datos.comentarios ?? '').trim();
  if (texto === '') return y;
  const lineas = lineasDeTexto(doc, texto, ANCHO_UTIL - 6, 9);
  const ALTO = ALTO_TITULO_CAJA + 5 + lineas.length * ALTO_FILA;
  const yc = cajaTitulada(doc, y, ALTO, 'Comentarios para taller');
  doc.setFillColor(255, 252, 240);
  doc.rect(MARGEN_X + 0.3, y + ALTO_TITULO_CAJA + 0.3, ANCHO_UTIL - 0.6, ALTO - ALTO_TITULO_CAJA - 0.6, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  lineas.forEach((linea, i) => doc.text(linea, MARGEN_X + 3, yc + i * ALTO_FILA));
  return y + ALTO + AIRE;
}

/** Caja del croquis, a la derecha de los datos de la pieza. */
const ANCHO_CROQUIS = 64;
const ALTO_CROQUIS = 35;

/**
 * Croquis de la sección transversal de la pieza, con el fondo y el alto acotados.
 *
 * Viene de `construirSeccion` — la MISMA sección que extruye el visor 3D (ver
 * `src/piezas/seccionPieza.ts`), así que el dibujo del taller y el modelo no
 * pueden discrepar. Se dibuja a escala, encajado en la caja, con el frente de la
 * pieza a la derecha (como se mira de pie ante el peldaño).
 */
function dibujarCroquisSeccion(
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

/**
 * Producción: de dónde sale la pieza y cuánto material se gasta. Va después de
 * la ficha porque el taller la consulta al ir a por las baldosas, no al empezar.
 */
function seccionProduccion(doc: jsPDF, y: number, datos: DatosOrdenTrabajo): number {
  const { resultado } = datos;
  const { ocupacion } = resultado;
  // 34, no 30: la banda de cifras del final necesita aire hasta el marco.
  const ALTO = 34;
  const yc = cajaTitulada(doc, y, ALTO, 'Producción');

  const componentes = resultado.componentes
    .map((c) => `${c.id} ${formatearCotaCm(c.largoMm)} × ${formatearCotaCm(c.anchoMm)}`)
    .join('  ·  ');
  filaCaja(doc, MARGEN_X + 3, yc + 1, 24, 'Despiece', componentes, 8.5);
  filaCaja(
    doc,
    MARGEN_X + 3,
    yc + 1 + ALTO_FILA,
    24,
    'En la baldosa',
    `${formatearCotaCm(ocupacion.ocupacionMm)} de ${formatearCotaCm(ocupacion.dimensionUtilMm)}  ·  ` +
      `${ocupacion.numCortes} ${ocupacion.numCortes === 1 ? 'corte' : 'cortes'}` +
      `${ocupacion.baldosaGirada ? '  ·  baldosa girada 90°' : ''}`,
    8.5,
  );

  const mermaTxt = FORMATO_MERMA.format(datos.mermaPorcentaje);
  const cifras: readonly (readonly [string, string])[] = [
    ['Piezas/baldosa', String(ocupacion.piezasPorBaldosa)],
    ['Baldosas', String(resultado.baldosasNecesarias)],
    [`Con merma +${mermaTxt} %`, String(resultado.baldosasConMerma)],
    ['Unidades fact.', String(resultado.unidadesFacturadas)],
    ['Cajas fact.', String(resultado.cajasFacturadas)],
    ['m² fact.', `${FORMATO_M2.format(resultado.m2Facturados)} m²`],
  ];
  const paso = (ANCHO_UTIL - 6) / cifras.length;
  cifras.forEach(([etiqueta, valor], i) => {
    bloqueCifra(doc, MARGEN_X + 3 + i * paso, yc + 13, etiqueta, valor, 9.5);
  });
  return y + ALTO + AIRE;
}

/** Importes. Es lo único de la hoja que no mira el taller: va al final. */
function seccionImportes(doc: jsPDF, y: number, datos: DatosOrdenTrabajo): number {
  const { desglose, lineasManipulacion } = datos.resultado;
  // Material + Manipulación + sus líneas + Arranque + Total sin IVA + IVA.
  const filas = 5 + lineasManipulacion.length;
  const ALTO_TOTAL = 11;
  // El +3 es el aire extra que separa los totales del desglose (ver más abajo).
  const ALTO = ALTO_TITULO_CAJA + 5 + filas * ALTO_FILA + 3 + ALTO_TOTAL + 1.5;
  const yc = cajaTitulada(doc, y, ALTO, 'Importes');

  let yf = yc + 1;
  filaImporte(
    doc,
    yf,
    datos.azulejosNoIncluidos ? 'Material (no incluido: lo aporta el cliente)' : 'Material',
    desglose.materialCentimos,
  );
  yf += ALTO_FILA;
  filaImporte(doc, yf, 'Manipulación', desglose.manipulacionCentimos, { negrita: true });
  yf += ALTO_FILA;
  for (const linea of lineasManipulacion) {
    filaImporte(doc, yf, linea.concepto, linea.centimos, { sangria: 5, tam: 8 });
    yf += ALTO_FILA;
  }
  filaImporte(doc, yf, 'Arranque de máquina', desglose.arranqueCentimos);
  // Aire antes de los totales: la raya iba tan justa que «Total sin IVA» parecía
  // otra línea del desglose en vez de su cierre.
  yf += ALTO_FILA + 3;
  doc.setDrawColor(...BORDE_CAJA);
  doc.setLineWidth(0.3);
  doc.line(MARGEN_X + 3, yf - 4, X_DERECHA - 3, yf - 4);
  filaImporte(doc, yf, 'Total sin IVA', desglose.totalSinIvaCentimos, { negrita: true });
  yf += ALTO_FILA;
  filaImporte(doc, yf, `IVA (${datos.config.parametros.ivaPorcentaje} %)`, desglose.ivaCentimos);

  // Total con IVA dentro de la caja, en negativo: el número que se cobra.
  const yTotal = y + ALTO - ALTO_TOTAL - 1.5;
  doc.setFillColor(...ROJO_MARCA);
  doc.rect(MARGEN_X + 1.5, yTotal, ANCHO_UTIL - 3, ALTO_TOTAL, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL CON IVA', MARGEN_X + 5, yTotal + ALTO_TOTAL / 2, { baseline: 'middle' });
  doc.text(formatearEuros(desglose.totalConIvaCentimos), X_DERECHA - 5, yTotal + ALTO_TOTAL / 2, {
    align: 'right',
    baseline: 'middle',
  });
  doc.setTextColor(0, 0, 0);
  return y + ALTO + AIRE;
}

/**
 * Pie de la hoja: solo «OPERADOR:» y una raya para firmar a mano (2026-07-30,
 * indicación directa — antes había tres campos y sobraban).
 *
 * Se queda al pie (286 mm) salvo que la hoja venga cargada — cuatro suplementos,
 * muchas líneas de manipulación y comentarios largos —, en cuyo caso baja lo justo
 * para no pisar la caja de importes. Con tope en 291 para no salirse del A4.
 */
function pieOperador(doc: jsPDF, yContenido: number): void {
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

/**
 * Construye el documento jsPDF de la orden de trabajo. Función pura: no descarga
 * ni hace fetch.
 *
 * El orden de los bloques es el del taller: qué hay que fabricar, con qué
 * material, qué operaciones lleva, qué avisos hay, de dónde sale y — al final,
 * porque no lo miran en el taller — cuánto cuesta.
 */
export function construirPdfOrdenTrabajo(datos: DatosOrdenTrabajo): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = seccionCabecera(doc, datos);
  y = seccionPieza(doc, y, datos);
  y = seccionMaterial(doc, y, datos);
  y = seccionOperaciones(doc, y, datos);
  y = seccionComentarios(doc, y, datos);
  y = seccionProduccion(doc, y, datos);
  const yFinal = seccionImportes(doc, y, datos);
  pieOperador(doc, yFinal - AIRE);
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

/**
 * Caché del logo a nivel de módulo: la URL es fija (`URL_LOGO`) y TODO PDF la
 * pide, así que re-descargarla y re-codificarla a data URL en cada generación
 * era trabajo tirado. Solo se cachea el éxito: si la descarga falla (red
 * caída), el siguiente PDF lo reintenta, igual que antes de la caché.
 */
let promesaLogo: Promise<string | null> | null = null;

function cargarLogo(): Promise<string | null> {
  promesaLogo ??= cargarImagenComoDataUrl(URL_LOGO).then((dataUrl) => {
    if (dataUrl === null) promesaLogo = null; // fallo transitorio: no cachear, reintentar la próxima vez
    return dataUrl;
  });
  return promesaLogo;
}

/**
 * Fotos de material por URL. El caso típico es regenerar el PDF de la MISMA
 * pieza varias veces (cambiar medidas o suplementos): la foto — que puede venir
 * de un proveedor externo — no cambia, y se ahorra el fetch. Acotada porque el
 * catálogo tiene ~21k artículos y sin tope se acumularían data URLs en memoria
 * durante toda la sesión. Como con el logo, los fallos no se cachean.
 */
const MAX_IMAGENES_MATERIAL_CACHE = 20;
const cacheImagenesMaterial = new Map<string, Promise<string | null>>();

function cargarImagenMaterial(url: string): Promise<string | null> {
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

/** Genera y descarga el PDF de la orden de trabajo. Devuelve el nombre del archivo guardado. */
export async function generarPdfOrdenTrabajo(datos: DatosOrdenTrabajo): Promise<string> {
  const [logoDataUrl, imagenMaterialDataUrl] = await Promise.all([
    cargarLogo(),
    datos.material.imagenUrl
      ? cargarImagenMaterial(datos.material.imagenUrl)
      : Promise.resolve(null),
  ]);
  const doc = construirPdfOrdenTrabajo({ ...datos, logoDataUrl, imagenMaterialDataUrl });
  const nombre = nombreArchivoOrdenTrabajo(datos);
  doc.save(nombre);
  return nombre;
}
