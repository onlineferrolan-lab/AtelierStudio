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
import { cajaSeccion, type SeccionPieza } from '../piezas/seccionPieza';

export interface DatosOrdenTrabajo {
  readonly material: Material;
  readonly origen: OrigenMaterial;
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
  readonly precioMaterialEditadoEuros: string;
  readonly mermaPorcentaje: number;
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
const ROJO_CLARO: readonly [number, number, number] = [252, 233, 238]; // #FCE9EE
/**
 * slate-600. Se usa para las ETIQUETAS; los valores van en negro. Antes era al
 * revés y las cifras — lo que de verdad se lee en el taller — eran lo más
 * flojo de la hoja (2026-07-29, indicación directa).
 */
const GRIS_TEXTO: readonly [number, number, number] = [71, 85, 105];
const GRIS_CLARO: readonly [number, number, number] = [241, 245, 249]; // slate-100, placeholders

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
/** Límite inferior de escritura; al superarlo se salta de página. */
const LIMITE_Y = 285;
/** Columna donde empiezan los valores en las filas etiqueta/valor. */
const X_VALOR = 78;
/** Borde derecho para importes alineados a la derecha. */
const X_DERECHA = ANCHO_PAGINA - MARGEN_X;
const ALTO_FILA = 5;
/** Foto del material: caja cuadrada a la izquierda de sus datos (§ seccionMaterial). */
const LADO_FOTO_MATERIAL = 30;

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
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(sanearTextoPdf(etiqueta), MARGEN_X, cur.y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(sanearTextoPdf(valor), X_VALOR, cur.y);
  cur.y += ALTO_FILA;
}

/** Ancho fijo reservado a la etiqueta en `filaCompacta`, para que el valor no se solape con ella. */
const ANCHO_ETIQUETA_COMPACTA = 27;

/** Etiqueta + valor en una sola línea, en dos columnas fijas (junto a la foto del material). */
function filaCompacta(doc: jsPDF, y: number, x: number, etiqueta: string, valor: string): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(sanearTextoPdf(etiqueta), x, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(sanearTextoPdf(valor), x + ANCHO_ETIQUETA_COMPACTA, y);
}

/**
 * Pares etiqueta/valor repartidos en dos columnas, de izquierda a derecha y de
 * arriba abajo. Para listas de cifras cortas (recuentos de producción), que
 * apiladas gastan el doble de alto sin leerse mejor.
 */
function filasEnDosColumnas(
  doc: jsPDF,
  cur: Cursor,
  pares: readonly (readonly [string, string])[],
): void {
  const anchoColumna = (X_DERECHA - MARGEN_X) / 2;
  const filas = Math.ceil(pares.length / 2);
  asegurarEspacio(doc, cur, filas * ALTO_FILA);
  pares.forEach(([etiqueta, valor], i) => {
    const columna = i % 2;
    const fila = Math.floor(i / 2);
    filaCompacta(
      doc,
      cur.y + fila * ALTO_FILA,
      MARGEN_X + columna * anchoColumna,
      etiqueta,
      valor,
    );
  });
  cur.y += filas * ALTO_FILA;
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

  const fechaTxt = FORMATO_FECHA_LARGA.format(datos.fecha);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(`Generada: ${fechaTxt}`, X_DERECHA, cur.y + 5, { align: 'right' });
  // Código de orden: sin él la hoja impresa no se podía citar (solo el nombre
  // del archivo lo llevaba). Ver `codigoOrdenTrabajo`.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(codigoOrdenTrabajo(datos), X_DERECHA, cur.y + 11.5, { align: 'right' });

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
  // Croquis de la sección a la derecha: el taller necesita ver la FORMA, no solo
  // el nombre de la figura (Figuras 1–3 solo se distinguen por el grueso de la
  // nariz). Se ancla al inicio de la sección y el texto sigue en la izquierda.
  if (datos.seccion) {
    asegurarEspacio(doc, cur, ALTO_CROQUIS);
    dibujarCroquisSeccion(doc, datos.seccion, X_DERECHA - ANCHO_CROQUIS, cur.y - 3);
  }

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
      const suplemento = datos.config.suplementos[id];
      const nombre = suplemento?.nombre ?? id;
      // Los de por pieza no van en todas: se dice en cuántas (ver DatosOrdenTrabajo).
      const detalle =
        suplemento?.tipo === 'porPieza'
          ? `${datos.unidadesSuplemento?.[id] ?? 1} de ${datos.cantidad} piezas`
          : 'toda la pieza';
      filaDato(doc, cur, `  · ${nombre}`, detalle);
    }
  } else {
    filaDato(doc, cur, 'Suplementos', 'ninguno');
  }
}

/** Caja del croquis, a la derecha de los datos de la pieza. */
const ANCHO_CROQUIS = 84;
const ALTO_CROQUIS = 42;

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

function seccionProduccion(doc: jsPDF, cur: Cursor, datos: DatosOrdenTrabajo): void {
  tituloSeccion(doc, cur, 'Producción');
  const { resultado } = datos;
  asegurarEspacio(doc, cur, ALTO_FILA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Componentes de la pieza', MARGEN_X, cur.y);
  cur.y += ALTO_FILA;
  filasEnDosColumnas(
    doc,
    cur,
    resultado.componentes.map(
      (c) =>
        [`  ${c.id}`, `${formatearCotaCm(c.largoMm)} × ${formatearCotaCm(c.anchoMm)}`] as const,
    ),
  );
  const { ocupacion } = resultado;
  filaDato(
    doc,
    cur,
    'Ocupación en baldosa',
    `${formatearCotaCm(ocupacion.ocupacionMm)} de ${formatearCotaCm(ocupacion.dimensionUtilMm)} · ` +
      `${ocupacion.numCortes} ${ocupacion.numCortes === 1 ? 'corte' : 'cortes'}` +
      `${ocupacion.baldosaGirada ? ' · baldosa girada 90°' : ''}`,
  );
  const mermaTxt = FORMATO_MERMA.format(datos.mermaPorcentaje);
  const m2Txt = FORMATO_M2.format(resultado.m2Facturados);
  // Cifras de recuento en dos columnas: son cortas, y apiladas empujaban el
  // total con IVA a una segunda página casi vacía.
  filasEnDosColumnas(doc, cur, [
    ['Piezas/baldosa', String(ocupacion.piezasPorBaldosa)],
    ['Baldosas', String(resultado.baldosasNecesarias)],
    ['Con merma', `${resultado.baldosasConMerma} (+${mermaTxt} %)`],
    ['Unidades fact.', String(resultado.unidadesFacturadas)],
    ['Cajas fact.', String(resultado.cajasFacturadas)],
    ['m² facturados', `${m2Txt} m²`],
  ]);
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
  // Bloque de cierre (regla + Total sin IVA + IVA + caja del total) de una pieza:
  // reservar su alto junta evita que el total con IVA quede huérfano en otra página.
  const ALTO_CIERRE = 4 + 2 * ALTO_FILA + 3 + 11 + 4;
  asegurarEspacio(doc, cur, ALTO_CIERRE);
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.3);
  doc.line(MARGEN_X, cur.y, X_DERECHA, cur.y);
  cur.y += 4;
  filaImporte(doc, cur, 'Total sin IVA', desglose.totalSinIvaCentimos, { negrita: true });
  filaImporte(doc, cur, `IVA (${datos.config.parametros.ivaPorcentaje} %)`, desglose.ivaCentimos);

  // Total con IVA: caja en rojo de marca, con aire propio, para que sea
  // inequívocamente el número que importa (no una fila más del desglose).
  const altoCaja = 11;
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

/**
 * Pie de control de taller: quién cortó la pieza, cuándo y quién lo revisó. Son
 * campos para rellenar A MANO sobre la hoja impresa (2026-07-29, indicación
 * directa); la app no los guarda — el flujo de estados de órdenes queda fuera
 * del alcance de la v1 (§8).
 */
function pieControl(doc: jsPDF, cur: Cursor): void {
  const ALTO_PIE = 16;
  asegurarEspacio(doc, cur, ALTO_PIE);
  cur.y += 6;
  doc.setDrawColor(...GRIS_TEXTO);
  doc.setLineWidth(0.2);
  const campos = ['Cortado por', 'Fecha', 'Revisado por'];
  const ancho = (X_DERECHA - MARGEN_X) / campos.length;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  campos.forEach((campo, i) => {
    const x = MARGEN_X + i * ancho;
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(campo, x, cur.y);
    doc.line(x + doc.getTextWidth(campo) + 2, cur.y, x + ancho - 6, cur.y);
  });
  doc.setTextColor(0, 0, 0);
  cur.y += ALTO_PIE - 6;
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
  pieControl(doc, cur);

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
