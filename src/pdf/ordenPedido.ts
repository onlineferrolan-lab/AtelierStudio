/**
 * PDF de la orden de trabajo de un PEDIDO: varias piezas en un solo documento
 * (2026-07-31, petición directa).
 *
 * ESTRUCTURA. Primera página el RESUMEN — qué piezas lleva el pedido, qué
 * material hay que comprar y cuánto cuesta todo — y después UNA HOJA POR PIEZA
 * con su ficha de fabricación. Se hace así porque las dos hojas tienen lectores
 * distintos: la primera es de oficina (se compra el material y se cobra), y las
 * de pieza van a la máquina, donde lo único que importa es qué se corta y de qué
 * baldosa. Mezclarlo daría una hoja ilegible para los dos.
 *
 * Las cifras de CAJA no se repiten en las hojas de pieza: en un pedido las cajas
 * son del ARTÍCULO y no de la pieza — es justo el punto de agrupar — así que
 * ponerlas junto a una pieza haría creer que esa caja es solo suya. Van una vez,
 * en el bloque «Material y cajas» del resumen.
 *
 * Todos los bloques (cabecera, ficha de pieza, material, operaciones, producción)
 * son los MISMOS de `ordenTrabajo.ts`, no una copia: una pieza tiene que verse
 * igual venga de una orden suelta o de un pedido.
 *
 * `construirPdfOrdenPedido` es pura y síncrona (imágenes ya cargadas como data
 * URL, `null` si fallan: nunca bloquean); `generarPdfOrdenPedido` es la que hace
 * los `fetch` y el `save()`.
 */

import { jsPDF } from 'jspdf';
import type { Configuracion, Figura } from '../domain/config';
import type { GrupoMaterialPedido, Material, Mm, ResultadoPedido } from '../domain/types';
import { formatearEuros } from '../domain/money';
import { formatearCotaCm } from '../domain/units';
import type { SeccionPieza } from '../piezas/seccionPieza';
import {
  AIRE,
  ALTO_FILA,
  ALTO_TITULO_CAJA,
  ANCHO_UTIL,
  BORDE_CAJA,
  FORMATO_M2,
  GRIS_CLARO,
  GRIS_TEXTO,
  MARGEN_X,
  ROJO_MARCA,
  X_DERECHA,
  bandaTotal,
  cajaTitulada,
  cargarImagenDeMaterial,
  cargarLogo,
  filaImporte,
  pieOperador,
  sanearTextoPdf,
  selloFecha,
} from './maqueta';
import {
  seccionCabecera,
  seccionComentarios,
  seccionMaterial,
  seccionOperaciones,
  seccionPieza,
  seccionProduccion,
} from './ordenTrabajo';

/**
 * Una pieza del pedido, con lo que hace falta para dibujar su hoja. El orden de
 * `piezas` debe ser el mismo que el de `resultado.lineas`: cada línea calculada
 * describe la pieza de su misma posición.
 */
export interface PiezaOrdenPedido {
  readonly figura: Figura;
  readonly material: Material;
  readonly medidasMm: Readonly<Record<string, Mm>>;
  readonly cantidad: number;
  readonly suplementosActivos: readonly string[];
  readonly unidadesSuplemento?: Readonly<Record<string, number>>;
  /** Las baldosas las aporta el cliente: el material no se cobra y la hoja lo dice. */
  readonly azulejosNoIncluidos: boolean;
  /** Croquis de la sección; `null` = la hoja sale igual, solo sin dibujo. */
  readonly seccion?: SeccionPieza | null;
  readonly imagenMaterialDataUrl?: string | null;
}

export interface DatosOrdenPedido {
  readonly piezas: readonly PiezaOrdenPedido[];
  readonly resultado: ResultadoPedido;
  /** Comentarios del comercial para taller; van en el resumen, no en cada pieza. */
  readonly comentarios?: string;
  readonly config: Configuracion;
  readonly fecha: Date;
  readonly logoDataUrl?: string | null;
}

/** Y máxima de contenido antes de tener que abrir página (deja sitio al pie). */
const LIMITE_Y = 272;

// ---------------------------------------------------------------------------
// Código y nombre de archivo
// ---------------------------------------------------------------------------

/**
 * `PED-<AAAAMMDD-HHMM>`. Prefijo distinto del `OT-` de una pieza suelta a
 * propósito: taller y oficina tienen que poder decir por teléfono si están
 * mirando un pedido o una orden de una pieza.
 */
export function codigoPedido(datos: Pick<DatosOrdenPedido, 'fecha'>): string {
  return `PED-${selloFecha(datos.fecha)}`;
}

export function nombreArchivoOrdenPedido(
  datos: Pick<DatosOrdenPedido, 'piezas' | 'fecha'>,
): string {
  const n = datos.piezas.length;
  return `pedido_${n}-${n === 1 ? 'pieza' : 'piezas'}_${selloFecha(datos.fecha)}.pdf`;
}

// ---------------------------------------------------------------------------
// Tablas del resumen
// ---------------------------------------------------------------------------

interface Columna {
  readonly ancho: number;
  readonly derecha?: boolean;
}

/**
 * Fila de tabla con columnas de ancho fijo. Las de importe/cantidad van
 * alineadas a la derecha para que las cifras se comparen de un vistazo en
 * vertical, que es como se leen.
 */
function filaTabla(
  doc: jsPDF,
  y: number,
  columnas: readonly Columna[],
  valores: readonly string[],
  opciones: { negrita?: boolean; tam?: number; gris?: boolean } = {},
): void {
  doc.setFont('helvetica', opciones.negrita ? 'bold' : 'normal');
  doc.setFontSize(opciones.tam ?? 8);
  if (opciones.gris) doc.setTextColor(...GRIS_TEXTO);
  else doc.setTextColor(0, 0, 0);
  let x = MARGEN_X + 3;
  columnas.forEach((col, i) => {
    const texto = sanearTextoPdf(valores[i] ?? '');
    if (col.derecha) doc.text(texto, x + col.ancho - 2, y, { align: 'right' });
    else doc.text(recortar(doc, texto, col.ancho - 2), x, y);
    x += col.ancho;
  });
  doc.setTextColor(0, 0, 0);
}

/** Recorta con puntos suspensivos lo que no quepa en el ancho de la columna. */
function recortar(doc: jsPDF, texto: string, ancho: number): string {
  if (doc.getTextWidth(texto) <= ancho) return texto;
  let corto = texto;
  while (corto.length > 1 && doc.getTextWidth(`${corto}…`) > ancho) {
    corto = corto.slice(0, -1);
  }
  return `${corto}…`;
}

/** Anchos de la tabla de piezas (suman ANCHO_UTIL − 6 = 174). */
const COLUMNAS_PIEZAS: readonly Columna[] = [
  { ancho: 8 }, // nº
  { ancho: 46 }, // figura
  { ancho: 44 }, // medidas
  { ancho: 28 }, // material
  { ancho: 12, derecha: true }, // uds.
  { ancho: 16, derecha: true }, // baldosas
  { ancho: 20, derecha: true }, // manipulación
];

/**
 * Las medidas de la pieza en una línea, en el orden que las declara la figura.
 * La unidad va UNA vez al final («30 × 50 × 4 cm») y no en cada cota: repetirla
 * tres veces no aporta nada y la columna es estrecha.
 */
function medidasEnLinea(pieza: PiezaOrdenPedido): string {
  const cotas = pieza.figura.medidas
    .filter((campo) => pieza.medidasMm[campo.id] !== undefined)
    .map((campo) => formatearCotaCm(pieza.medidasMm[campo.id]).replace(/\s*cm$/, ''));
  return cotas.length > 0 ? `${cotas.join(' × ')} cm` : '';
}

/**
 * Qué piezas lleva el pedido. Es el índice del documento: cada fila se
 * corresponde con una hoja de las de después, por su número.
 */
function bloquePiezas(doc: jsPDF, y: number, datos: DatosOrdenPedido): number {
  const { piezas, resultado } = datos;
  const ALTO = ALTO_TITULO_CAJA + 5 + (piezas.length + 1) * ALTO_FILA + 1;
  const yc = cajaTitulada(doc, y, ALTO, `Piezas del pedido (${piezas.length})`);

  filaTabla(
    doc,
    yc,
    COLUMNAS_PIEZAS,
    ['#', 'Figura', 'Medidas', 'Material', 'Uds.', 'Baldosas', 'Manipul.'],
    { gris: true, tam: 7 },
  );
  doc.setDrawColor(...BORDE_CAJA);
  doc.setLineWidth(0.2);
  doc.line(MARGEN_X + 3, yc + 1.5, X_DERECHA - 3, yc + 1.5);

  piezas.forEach((pieza, i) => {
    const linea = resultado.lineas[i];
    filaTabla(doc, yc + (i + 1) * ALTO_FILA, COLUMNAS_PIEZAS, [
      String(i + 1),
      pieza.figura.nombre,
      medidasEnLinea(pieza),
      pieza.material.referencia,
      String(pieza.cantidad),
      String(linea.baldosasConMerma),
      formatearEuros(linea.manipulacionCentimos),
    ]);
  });
  return y + ALTO + AIRE;
}

/** Anchos de la tabla de cifras de un grupo de material. */
const COLUMNAS_CAJAS: readonly Columna[] = [
  { ancho: 74 }, // artículo
  { ancho: 20, derecha: true }, // baldosas
  { ancho: 16, derecha: true }, // cajas
  { ancho: 18, derecha: true }, // unidades
  { ancho: 20, derecha: true }, // m²
  { ancho: 26, derecha: true }, // importe
];

/**
 * Material y cajas: el bloque por el que existe el pedido. Enseña, por artículo,
 * cuántas baldosas se van a usar de verdad y cuántas cajas hay que comprar — que
 * es lo que se cobra — y remata diciendo cuántas cajas se ahorran por compartir
 * caja entre cortes distintos. Sin esa última línea el comercial no tiene forma
 * de justificar el precio frente a pedir las piezas por separado.
 */
function bloqueMaterial(doc: jsPDF, y: number, datos: DatosOrdenPedido): number {
  const { grupos, cajasAhorradas, ahorroCentimos } = datos.resultado;
  const hayAhorro = cajasAhorradas > 0;
  const filas = grupos.length * 2 + 1; // cabecera + dos por grupo
  const ALTO = ALTO_TITULO_CAJA + 5 + filas * ALTO_FILA + (hayAhorro ? ALTO_FILA + 2 : 0) + 1;
  const yc = cajaTitulada(doc, y, ALTO, 'Material y cajas');

  filaTabla(
    doc,
    yc,
    COLUMNAS_CAJAS,
    ['Artículo', 'Baldosas', 'Cajas', 'Unidades', 'm²', 'Importe'],
    { gris: true, tam: 7 },
  );
  doc.setDrawColor(...BORDE_CAJA);
  doc.setLineWidth(0.2);
  doc.line(MARGEN_X + 3, yc + 1.5, X_DERECHA - 3, yc + 1.5);

  let yf = yc + ALTO_FILA;
  for (const grupo of grupos) {
    filaTabla(
      doc,
      yf,
      COLUMNAS_CAJAS,
      [
        grupo.material.descripcion,
        String(grupo.baldosasConMerma),
        String(grupo.cajasFacturadas),
        String(grupo.unidadesFacturadas),
        FORMATO_M2.format(grupo.m2Facturados),
        formatearEuros(grupo.materialCentimos),
      ],
      { negrita: true, tam: 8.5 },
    );
    yf += ALTO_FILA;
    // A lo ANCHO de la caja, no por la primera columna: es una frase, y en 74 mm
    // se cortaba justo donde dice de qué piezas sale el material.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(sanearTextoPdf(detalleGrupo(grupo)), MARGEN_X + 3, yf);
    doc.setTextColor(0, 0, 0);
    yf += ALTO_FILA;
  }

  if (hayAhorro) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...ROJO_MARCA);
    doc.text(
      sanearTextoPdf(
        `Compartiendo caja entre cortes se ahorran ${cajasAhorradas} ` +
          `${cajasAhorradas === 1 ? 'caja' : 'cajas'}: ${formatearEuros(ahorroCentimos)} menos que pidiendo las piezas por separado.`,
      ),
      MARGEN_X + 3,
      yf + 1,
    );
    doc.setTextColor(0, 0, 0);
  }
  return y + ALTO + AIRE;
}

/** Segunda línea de un grupo: de qué piezas sale y qué queda sin usar en la caja. */
function detalleGrupo(grupo: GrupoMaterialPedido): string {
  const piezas = grupo.indicesLinea.map((i) => `#${i + 1}`).join(', ');
  const partes = [
    `ref. ${grupo.material.referencia}`,
    grupo.material.piezasPorCaja != null ? `${grupo.material.piezasPorCaja} ud./caja` : null,
    `${grupo.indicesLinea.length === 1 ? 'pieza' : 'piezas'} ${piezas}`,
    grupo.baldosasSobrantes > 0
      ? `${grupo.baldosasSobrantes} ${grupo.baldosasSobrantes === 1 ? 'baldosa sobrante' : 'baldosas sobrantes'}`
      : 'sin sobrante',
  ].filter((p): p is string => p !== null);
  // El arranque va aquí porque se cobra uno por material, no uno por pieza.
  partes.push(`arranque ${formatearEuros(grupo.arranqueCentimos)}`);
  return partes.join('  ·  ');
}

/**
 * Importes del pedido. Una línea por artículo en material y una por pieza en
 * manipulación, con el desglose de tarifas de cada pieza sangrado debajo — el
 * mismo detalle que da la orden de una pieza, para que el pedido no esconda de
 * dónde sale el precio.
 */
function bloqueImportes(doc: jsPDF, y: number, datos: DatosOrdenPedido): number {
  const { resultado } = datos;
  const { desglose, grupos, lineas } = resultado;

  const ALTO = altoImportes(resultado);
  const ALTO_TOTAL = 11;
  const yc = cajaTitulada(doc, y, ALTO, 'Importes del pedido');

  let yf = yc + 1;
  filaImporte(doc, yf, 'Material', desglose.materialCentimos, { negrita: true });
  yf += ALTO_FILA;
  for (const grupo of grupos) {
    filaImporte(
      doc,
      yf,
      `${grupo.material.descripcion} — ${grupo.cajasFacturadas} ${grupo.cajasFacturadas === 1 ? 'caja' : 'cajas'}`,
      grupo.materialCentimos,
      { sangria: 5, tam: 8 },
    );
    yf += ALTO_FILA;
  }

  filaImporte(doc, yf, 'Manipulación', desglose.manipulacionCentimos, { negrita: true });
  yf += ALTO_FILA;
  lineas.forEach((linea, i) => {
    const pieza = datos.piezas[i];
    filaImporte(
      doc,
      yf,
      `#${i + 1} · ${pieza.figura.nombre} — ${linea.cantidad} ud.`,
      linea.manipulacionCentimos,
      { sangria: 5, tam: 8 },
    );
    yf += ALTO_FILA;
    // El desglose de tarifas solo si hay MÁS DE UNA: con una sola, la línea
    // sangrada repetiría el mismo importe que la de la pieza.
    if (linea.lineasManipulacion.length > 1) {
      for (const detalle of linea.lineasManipulacion) {
        filaImporte(doc, yf, detalle.concepto, detalle.centimos, { sangria: 10, tam: 7 });
        yf += ALTO_FILA;
      }
    }
  });

  filaImporte(
    doc,
    yf,
    `Arranque de máquina (${grupos.length} ${grupos.length === 1 ? 'material' : 'materiales'})`,
    desglose.arranqueCentimos,
  );
  yf += ALTO_FILA + 3;
  doc.setDrawColor(...BORDE_CAJA);
  doc.setLineWidth(0.3);
  doc.line(MARGEN_X + 3, yf - 4, X_DERECHA - 3, yf - 4);
  filaImporte(doc, yf, 'Total sin IVA', desglose.totalSinIvaCentimos, { negrita: true });
  yf += ALTO_FILA;
  filaImporte(
    doc,
    yf,
    `IVA (${datos.config.parametros.ivaPorcentaje} %)`,
    desglose.ivaCentimos,
  );

  bandaTotal(
    doc,
    y + ALTO - ALTO_TOTAL - 1.5,
    ALTO_TOTAL,
    'TOTAL CON IVA',
    desglose.totalConIvaCentimos,
  );
  return y + ALTO + AIRE;
}

/**
 * Alto del bloque de importes. Lo usan el propio bloque y el reparto en páginas,
 * así que vive en una sola función: si divergieran, el marco de la caja se
 * dibujaría de un tamaño y el contenido de otro.
 */
function altoImportes(resultado: ResultadoPedido): number {
  // Por pieza: su línea + el desglose de tarifas solo cuando hay más de una.
  const filasDetalle = resultado.lineas.reduce(
    (acc, l) => acc + 1 + (l.lineasManipulacion.length > 1 ? l.lineasManipulacion.length : 0),
    0,
  );
  // Material + un grupo + Manipulación + detalle + Arranque + (Total sin IVA, IVA).
  const filas = 1 + resultado.grupos.length + 1 + filasDetalle + 1 + 2;
  return ALTO_TITULO_CAJA + 5 + filas * ALTO_FILA + 3 + 11 + 1.5;
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

/** Abre página y repite la cabecera, para que ninguna hoja quede sin identificar. */
function abrirPagina(doc: jsPDF, datos: DatosOrdenPedido, subtitulo: string): number {
  doc.addPage();
  return seccionCabecera(doc, {
    titulo: 'ORDEN DE TRABAJO',
    subtitulo,
    codigo: codigoPedido(datos),
    fecha: datos.fecha,
    logoDataUrl: datos.logoDataUrl,
  });
}

/**
 * Aviso de continuidad al pie de las hojas de pieza: quien recoge una hoja
 * suelta de la máquina tiene que saber que forma parte de un pedido mayor.
 */
function pieDePieza(doc: jsPDF, indice: number, total: number, codigo: string): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(
    sanearTextoPdf(`${codigo} · pieza ${indice} de ${total} · las cajas y los importes van en la hoja de resumen`),
    MARGEN_X,
    293,
  );
  doc.setTextColor(0, 0, 0);
}

/**
 * Construye el PDF del pedido. Función pura: no descarga ni hace fetch.
 *
 * Primero el resumen (piezas, material y cajas, comentarios, importes) y después
 * una hoja por pieza. Si el resumen no cabe en una página, los importes pasan a
 * la siguiente antes que partirse por la mitad: un desglose cortado a mitad de
 * columna no lo lee nadie.
 */
export function construirPdfOrdenPedido(datos: DatosOrdenPedido): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const total = datos.piezas.length;
  const codigo = codigoPedido(datos);

  let y = seccionCabecera(doc, {
    titulo: 'ORDEN DE TRABAJO',
    subtitulo: `Atelier Studio · pedido de ${total} ${total === 1 ? 'pieza' : 'piezas'} · documento interno`,
    codigo,
    fecha: datos.fecha,
    logoDataUrl: datos.logoDataUrl,
  });

  y = bloquePiezas(doc, y, datos);
  y = bloqueMaterial(doc, y, datos);
  y = seccionComentarios(doc, y, datos.comentarios);

  if (y + altoImportes(datos.resultado) > LIMITE_Y) {
    y = abrirPagina(doc, datos, 'Importes del pedido (continuación)');
  }
  const yFinal = bloqueImportes(doc, y, datos);
  pieOperador(doc, yFinal - AIRE);

  // Una hoja por pieza, en el orden de la tabla de la primera página.
  datos.piezas.forEach((pieza, i) => {
    const linea = datos.resultado.lineas[i];
    let yp = abrirPagina(
      doc,
      datos,
      `Atelier Studio · pieza ${i + 1} de ${total} del pedido · documento interno`,
    );
    yp = seccionPieza(doc, yp, pieza, `Pieza ${i + 1} de ${total}`);
    yp = seccionMaterial(doc, yp, pieza);
    yp = seccionOperaciones(doc, yp, { ...pieza, config: datos.config });
    yp = seccionProduccion(doc, yp, {
      componentes: linea.componentes,
      ocupacion: linea.ocupacion,
      mermaPorcentaje: linea.mermaPorcentaje,
      baldosasNecesarias: linea.baldosasNecesarias,
      baldosasConMerma: linea.baldosasConMerma,
      // Las cajas son del artículo, no de esta pieza: van en el resumen.
      facturacion: null,
    });
    recordatorioDeCaja(doc, yp, datos, linea.claveGrupo, i + 1);
    pieOperador(doc, yp + 20);
    pieDePieza(doc, i + 1, total, codigo);
  });

  return doc;
}

/**
 * Nota al pie de la hoja de pieza: de qué caja sale y con qué otras piezas la
 * comparte. Es la información que evita el error que motivó el pedido — abrir
 * una caja nueva para cada corte teniendo baldosas de sobra en la anterior.
 */
function recordatorioDeCaja(
  doc: jsPDF,
  y: number,
  datos: DatosOrdenPedido,
  claveGrupo: string,
  numeroPieza: number,
): void {
  const grupo = datos.resultado.grupos.find((g) => g.clave === claveGrupo);
  if (!grupo) return;
  const otras = grupo.indicesLinea.map((i) => i + 1).filter((n) => n !== numeroPieza);
  const cajas = `${grupo.cajasFacturadas} ${grupo.cajasFacturadas === 1 ? 'caja' : 'cajas'}`;

  const texto =
    otras.length > 0
      ? `Material compartido: ${cajas} de este artículo (${grupo.unidadesFacturadas} baldosas) ` +
        `para esta pieza y ${otras.length === 1 ? 'la pieza' : 'las piezas'} ` +
        `${otras.map((n) => `#${n}`).join(', ')}. No abras una caja nueva sin agotar la anterior.`
      : `Este artículo solo lo usa esta pieza: ${cajas} (${grupo.unidadesFacturadas} baldosas), ` +
        `${grupo.baldosasSobrantes} de sobra.`;

  const ALTO = 12;
  doc.setFillColor(...GRIS_CLARO);
  doc.setDrawColor(...BORDE_CAJA);
  doc.setLineWidth(0.3);
  doc.rect(MARGEN_X, y, ANCHO_UTIL, ALTO, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...ROJO_MARCA);
  doc.text('CAJAS', MARGEN_X + 3, y + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  const lineas = doc.splitTextToSize(sanearTextoPdf(texto), ANCHO_UTIL - 6) as string[];
  lineas.slice(0, 2).forEach((l, i) => doc.text(l, MARGEN_X + 3, y + 8 + i * 3.6));
}

/** Genera y descarga el PDF del pedido. Devuelve el nombre del archivo guardado. */
export async function generarPdfOrdenPedido(datos: DatosOrdenPedido): Promise<string> {
  // Las fotos se piden por ARTÍCULO, no por pieza: un pedido de ocho peldaños
  // del mismo material haría ocho veces la misma descarga (la caché de
  // `maqueta.ts` la resolvería, pero es trabajo que no hace falta ni encolar).
  const porUrl = new Map<string, Promise<string | null>>();
  for (const pieza of datos.piezas) {
    const url = pieza.material.imagenUrl;
    if (url !== null && !porUrl.has(url)) porUrl.set(url, cargarImagenDeMaterial(pieza.material));
  }
  const [logoDataUrl, imagenes] = await Promise.all([
    cargarLogo(),
    Promise.all([...porUrl.entries()].map(async ([url, p]) => [url, await p] as const)),
  ]);
  const porUrlResuelta = new Map(imagenes);

  const doc = construirPdfOrdenPedido({
    ...datos,
    logoDataUrl,
    piezas: datos.piezas.map((pieza) => ({
      ...pieza,
      imagenMaterialDataUrl:
        pieza.material.imagenUrl !== null
          ? (porUrlResuelta.get(pieza.material.imagenUrl) ?? null)
          : null,
    })),
  });
  const nombre = nombreArchivoOrdenPedido(datos);
  doc.save(nombre);
  return nombre;
}
