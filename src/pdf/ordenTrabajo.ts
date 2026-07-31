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
 * `ResultadoCotizacion` del motor. Las cajas, filas, croquis y cargas de imagen
 * son las de `maqueta.ts`, compartidas con la orden de pedido.
 *
 * Cada sección recibe SOLO los datos que dibuja (`DatosPieza`, `DatosMaterial`…)
 * y no el `DatosOrdenTrabajo` entero: así `ordenPedido.ts` puede reutilizarlas
 * tal cual para las hojas de cada pieza del pedido, sin fabricar una orden
 * completa de mentira para poder llamarlas.
 *
 * La construcción del documento (`construirPdfOrdenTrabajo`) es pura, síncrona
 * y separada del `save()` (`generarPdfOrdenTrabajo`): recibe el logo y la foto
 * del material YA cargados como data URL (o `null` si no hay/falla la carga —
 * nunca bloquea la generación del PDF), así sigue siendo testeable sin red ni
 * descarga. `generarPdfOrdenTrabajo` es quien hace ese `fetch` antes de llamarla.
 */

import { jsPDF } from 'jspdf';
import type { Configuracion, Figura } from '../domain/config';
import type {
  DesgloseCotizacion,
  DetalleOcupacion,
  LineaManipulacion,
  Material,
  Mm,
  ResultadoCotizacion,
} from '../domain/types';
import { formatearEuros } from '../domain/money';
import { formatearCotaCm } from '../domain/units';
import { seIncrustaEnPdf, type AdjuntoOrden } from '../orden/adjuntos';
import type { SeccionPieza } from '../piezas/seccionPieza';
import {
  AIRE,
  ALTO_FILA,
  ALTO_TITULO_CAJA,
  ANCHO_CROQUIS,
  ANCHO_UTIL,
  BORDE_CAJA,
  FORMATO_FECHA_LARGA,
  FORMATO_M2,
  FORMATO_MERMA,
  GRIS_TEXTO,
  MARGEN_X,
  ROJO_MARCA,
  X_DERECHA,
  bandaTotal,
  bloqueCifra,
  cajaTitulada,
  cargarImagenDeMaterial,
  cargarLogo,
  dibujarCroquisSeccion,
  dibujarFotoMaterial,
  filaCaja,
  filaImporte,
  formatoDeDataUrl,
  lineasDeTexto,
  pieOperador,
  referenciaParaArchivo,
  sanearTextoPdf,
  selloFecha,
  tamanoImagenEnCaja,
} from './maqueta';

export { reiniciarCacheImagenes } from './maqueta';

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
  /** Las baldosas las aporta el cliente: el material no se cobra y la hoja lo dice. */
  readonly azulejosNoIncluidos: boolean;
  readonly mermaPorcentaje: number;
  /** Comentarios libres del comercial para taller ('' = no se imprime el bloque). */
  readonly comentarios?: string;
  /**
   * Documentos que el comercial enganchó a los comentarios. Todos se citan por
   * nombre en la hoja; los que son imagen salen además como páginas al final
   * (`paginasAdjuntos`), que es la única forma de que el plano o la foto lleguen
   * al taller sin servidor de por medio (ver `src/orden/adjuntos.ts`).
   */
  readonly adjuntos?: readonly AdjuntoOrden[];
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
// Nombre de archivo y código de orden
// ---------------------------------------------------------------------------

/**
 * Código de orden que se imprime en la cabecera. Sin contador en servidor (§8:
 * sin base de datos propia en la v1) el sello fecha-hora es el identificador
 * disponible, y basta para que taller y oficina citen la misma hoja.
 */
export function codigoOrdenTrabajo(datos: Pick<DatosOrdenTrabajo, 'fecha'>): string {
  return `OT-${selloFecha(datos.fecha)}`;
}

/** `orden-trabajo_<referencia>_<AAAAMMDD-HHmm>.pdf` (referencia saneada para nombre de archivo). */
export function nombreArchivoOrdenTrabajo(
  datos: Pick<DatosOrdenTrabajo, 'material' | 'fecha'>,
): string {
  return `orden-trabajo_${referenciaParaArchivo(datos.material.referencia)}_${selloFecha(datos.fecha)}.pdf`;
}

// ---------------------------------------------------------------------------
// Secciones. Cada una toma solo lo suyo, para que `ordenPedido.ts` las reutilice.
// ---------------------------------------------------------------------------

export interface DatosCabecera {
  readonly titulo: string;
  readonly subtitulo: string;
  readonly codigo: string;
  readonly fecha: Date;
  readonly logoDataUrl?: string | null;
}

/**
 * Cabecera: logo, el nombre del documento en grande y el código de orden a la
 * derecha. El código va destacado porque es por lo que se cita la hoja.
 */
export function seccionCabecera(doc: jsPDF, datos: DatosCabecera): number {
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
  doc.text(sanearTextoPdf(datos.titulo), MARGEN_X + 40, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(sanearTextoPdf(datos.subtitulo), MARGEN_X + 40, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...ROJO_MARCA);
  doc.text(datos.codigo, X_DERECHA, y + 6, { align: 'right' });
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

export interface DatosPieza {
  readonly figura: Figura;
  readonly medidasMm: Readonly<Record<string, Mm>>;
  readonly cantidad: number;
  readonly seccion?: SeccionPieza | null;
}

/**
 * Ficha de la pieza: lo primero y más grande de la hoja, porque es lo que el
 * taller tiene que fabricar. Figura, cantidad destacada, las medidas como cifras
 * grandes y el croquis de la sección a la derecha.
 */
export function seccionPieza(
  doc: jsPDF,
  y: number,
  datos: DatosPieza,
  titulo = 'Pieza a fabricar',
): number {
  const { figura } = datos;
  const ALTO = 48;
  const yc = cajaTitulada(doc, y, ALTO, titulo);
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

export interface DatosMaterial {
  readonly material: Material;
  /** Las baldosas las aporta el cliente: en vez del precio se rotula que no van incluidas. */
  readonly azulejosNoIncluidos: boolean;
  readonly imagenMaterialDataUrl?: string | null;
}

/** Material del que se corta: foto, descripción y los datos de compra. */
export function seccionMaterial(doc: jsPDF, y: number, datos: DatosMaterial): number {
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
export function formatoMaterial(material: Material): string {
  return `${formatearCotaCm(material.formato.largoMm)} × ${formatearCotaCm(material.formato.anchoMm)}`;
}

/** Precio de tarifa del material, con su unidad (€/m² del ERP o €/unidad manual). */
export function precioMaterialTarifa(material: Material): string {
  if (material.esManual) {
    return material.precioUnidadCentimos === null
      ? '—'
      : `${formatearEuros(material.precioUnidadCentimos)}/ud.`;
  }
  return material.precioM2Centimos === null
    ? '—'
    : `${formatearEuros(material.precioM2Centimos)}/m²`;
}

export interface DatosOperaciones {
  readonly figura: Figura;
  readonly cantidad: number;
  readonly suplementosActivos: readonly string[];
  readonly unidadesSuplemento?: Readonly<Record<string, number>>;
  readonly config: Configuracion;
}

/** Las operaciones en texto corrido, o null si la pieza no lleva ninguna. */
export function textoOperaciones(datos: DatosOperaciones): string | null {
  const partes = datos.suplementosActivos.map((id) => {
    const suplemento = datos.config.suplementos[id];
    const nombre = suplemento?.nombre ?? id;
    if (suplemento?.tipo === 'porPieza') {
      const unidades = datos.unidadesSuplemento?.[id] ?? 1;
      return `${nombre} (${unidades} de ${datos.cantidad})`;
    }
    return `${nombre} (todas)`;
  });
  return partes.length > 0 ? partes.join('  ·  ') : null;
}

/**
 * Operaciones añadidas (suplementos) en una sola línea corrida: son pocas y
 * cortas, y una caja con cuatro filas gastaba media hoja. De cada una se dice a
 * cuántas piezas alcanza, que es lo que el taller necesita saber.
 */
export function seccionOperaciones(doc: jsPDF, y: number, datos: DatosOperaciones): number {
  const operaciones = textoOperaciones(datos);
  const texto = operaciones ?? 'Sin operaciones adicionales.';

  const lineas = lineasDeTexto(doc, texto, ANCHO_UTIL - 6, 9);
  const ALTO = ALTO_TITULO_CAJA + 5 + lineas.length * ALTO_FILA;
  const yc = cajaTitulada(doc, y, ALTO, 'Operaciones');
  doc.setFont('helvetica', operaciones !== null ? 'bold' : 'normal');
  doc.setFontSize(9);
  if (operaciones !== null) doc.setTextColor(0, 0, 0);
  else doc.setTextColor(...GRIS_TEXTO);
  lineas.forEach((linea, i) => doc.text(linea, MARGEN_X + 3, yc + i * ALTO_FILA));
  doc.setTextColor(0, 0, 0);
  return y + ALTO + AIRE;
}

/**
 * Lista de adjuntos para la hoja: `plano.png · medicion.pdf (aparte)`. El
 * «(aparte)» marca los que NO se pueden incrustar (jsPDF no fusiona documentos):
 * el taller tiene que saber que existe un archivo que no está impreso aquí.
 */
function textoAdjuntos(adjuntos: readonly AdjuntoOrden[]): string {
  const nombres = adjuntos.map((a) => (seIncrustaEnPdf(a) ? a.nombre : `${a.nombre} (aparte)`));
  return `Adjuntos (${adjuntos.length}): ${nombres.join('  ·  ')}`;
}

/**
 * Tope de líneas de la lista de adjuntos. La hoja es de UNA página y de alto
 * fijo: seis nombres largos podrían empujar los importes fuera del A4, así que
 * se recorta con «…» — los nombres completos van en la cabecera de cada página
 * de adjunto.
 */
const MAX_LINEAS_ADJUNTOS = 2;

/**
 * Comentarios del comercial para taller, con la lista de documentos adjuntos
 * debajo. Solo se imprime si hay texto o hay adjuntos, y con fondo tenue para que
 * se vea que es una indicación y no un dato calculado.
 */
export function seccionComentarios(
  doc: jsPDF,
  y: number,
  comentarios: string | undefined,
  adjuntos: readonly AdjuntoOrden[] = [],
): number {
  const texto = (comentarios ?? '').trim();
  if (texto === '' && adjuntos.length === 0) return y;

  const lineas = texto === '' ? [] : lineasDeTexto(doc, texto, ANCHO_UTIL - 6, 9);
  const todasAdjuntos =
    adjuntos.length === 0 ? [] : lineasDeTexto(doc, textoAdjuntos(adjuntos), ANCHO_UTIL - 6, 8);
  const lineasAdjuntos =
    todasAdjuntos.length <= MAX_LINEAS_ADJUNTOS
      ? todasAdjuntos
      : [...todasAdjuntos.slice(0, MAX_LINEAS_ADJUNTOS - 1), `${todasAdjuntos[MAX_LINEAS_ADJUNTOS - 1]} …`];

  const ALTO = ALTO_TITULO_CAJA + 5 + (lineas.length + lineasAdjuntos.length) * ALTO_FILA;
  const yc = cajaTitulada(doc, y, ALTO, 'Comentarios para taller');
  doc.setFillColor(255, 252, 240);
  doc.rect(MARGEN_X + 0.3, y + ALTO_TITULO_CAJA + 0.3, ANCHO_UTIL - 0.6, ALTO - ALTO_TITULO_CAJA - 0.6, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  lineas.forEach((linea, i) => doc.text(linea, MARGEN_X + 3, yc + i * ALTO_FILA));

  // Los adjuntos, más pequeños y en gris: acompañan al aviso, no son el aviso.
  doc.setFontSize(8);
  doc.setTextColor(...GRIS_TEXTO);
  lineasAdjuntos.forEach((linea, i) =>
    doc.text(linea, MARGEN_X + 3, yc + (lineas.length + i) * ALTO_FILA),
  );
  doc.setTextColor(0, 0, 0);
  return y + ALTO + AIRE;
}

export interface DatosProduccion {
  readonly componentes: ResultadoCotizacion['componentes'];
  readonly ocupacion: DetalleOcupacion;
  readonly mermaPorcentaje: number;
  readonly baldosasNecesarias: number;
  readonly baldosasConMerma: number;
  /**
   * Cifras de caja. En una orden de una pieza son las suyas; en un pedido son
   * las del ARTÍCULO, compartidas con las demás piezas del mismo material, así
   * que se omiten de la hoja de la pieza (`null`) para no dar a entender que
   * esas cajas son solo de ella. Van en el resumen de la primera página.
   */
  readonly facturacion?: {
    readonly unidadesFacturadas: number;
    readonly cajasFacturadas: number;
    readonly m2Facturados: number;
  } | null;
}

/**
 * Páginas de adjuntos: una por cada documento adjunto que sea imagen (plano
 * fotografiado, foto de la obra, captura de la medición), a página completa y en
 * horizontal si la imagen es más ancha que alta.
 *
 * Es la única vía para que el documento del comercial llegue al taller: sin
 * servidor (§8) lo único que se manda es este PDF. Los adjuntos que no son
 * imagen no se pueden incrustar y quedan citados por nombre en la hoja.
 *
 * Una imagen ilegible NUNCA rompe la generación: se salta, igual que el logo o la
 * foto del material cuando falla su descarga.
 */
function paginasAdjuntos(doc: jsPDF, datos: DatosOrdenTrabajo): void {
  const imagenes = (datos.adjuntos ?? []).filter(seIncrustaEnPdf);
  imagenes.forEach((adjunto, i) => {
    let props: { width: number; height: number };
    try {
      props = doc.getImageProperties(adjunto.dataUrl);
    } catch {
      return; // data URL corrupto o formato que jsPDF no sabe leer: solo se cita por nombre
    }

    doc.addPage('a4', props.width > props.height ? 'landscape' : 'portrait');
    const anchoPagina = doc.internal.pageSize.getWidth();
    const altoPagina = doc.internal.pageSize.getHeight();
    const xDerecha = anchoPagina - MARGEN_X;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...ROJO_MARCA);
    doc.text(`ADJUNTO ${i + 1}/${imagenes.length}`, MARGEN_X, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(sanearTextoPdf(adjunto.nombre), MARGEN_X + 26, 16);
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(codigoOrdenTrabajo(datos), xDerecha, 16, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(...ROJO_MARCA);
    doc.setLineWidth(0.6);
    doc.line(MARGEN_X, 19, xDerecha, 19);

    // La imagen se centra en el hueco que queda bajo la cabecera: una foto
    // panorámica pegada arriba dejaba media hoja en blanco debajo.
    const yHueco = 19 + AIRE + 1;
    const altoHueco = altoPagina - yHueco - MARGEN_X;
    const { ancho, alto } = tamanoImagenEnCaja(
      doc,
      adjunto.dataUrl,
      anchoPagina - MARGEN_X * 2,
      altoHueco,
    );
    try {
      doc.addImage(
        adjunto.dataUrl,
        formatoDeDataUrl(adjunto.dataUrl),
        (anchoPagina - ancho) / 2,
        yHueco + (altoHueco - alto) / 2,
        ancho,
        alto,
      );
    } catch {
      // La imagen se parseó pero no se pudo pintar: la página se queda con su
      // cabecera y una nota, para que en taller no parezca una hoja perdida.
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GRIS_TEXTO);
      doc.text('No se pudo incrustar esta imagen; pídela a oficina.', MARGEN_X, yHueco + 6);
      doc.setTextColor(0, 0, 0);
    }
  });
}


/**
 * Producción: de dónde sale la pieza y cuánto material se gasta. Va después de
 * la ficha porque el taller la consulta al ir a por las baldosas, no al empezar.
 */
export function seccionProduccion(doc: jsPDF, y: number, datos: DatosProduccion): number {
  const { ocupacion } = datos;
  // 34, no 30: la banda de cifras del final necesita aire hasta el marco.
  const ALTO = 34;
  const yc = cajaTitulada(doc, y, ALTO, 'Producción');

  const componentes = datos.componentes
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
  const cifras: (readonly [string, string])[] = [
    ['Piezas/baldosa', String(ocupacion.piezasPorBaldosa)],
    ['Baldosas', String(datos.baldosasNecesarias)],
    [`Con merma +${mermaTxt} %`, String(datos.baldosasConMerma)],
  ];
  if (datos.facturacion) {
    cifras.push(
      ['Unidades fact.', String(datos.facturacion.unidadesFacturadas)],
      ['Cajas fact.', String(datos.facturacion.cajasFacturadas)],
      ['m² fact.', `${FORMATO_M2.format(datos.facturacion.m2Facturados)} m²`],
    );
  }
  const paso = (ANCHO_UTIL - 6) / cifras.length;
  cifras.forEach(([etiqueta, valor], i) => {
    bloqueCifra(doc, MARGEN_X + 3 + i * paso, yc + 13, etiqueta, valor, 9.5);
  });
  return y + ALTO + AIRE;
}

export interface DatosImportes {
  readonly desglose: DesgloseCotizacion;
  readonly lineasManipulacion: readonly LineaManipulacion[];
  readonly ivaPorcentaje: number;
  /** Cambia el rótulo de la fila de material a «no incluido: lo aporta el cliente». */
  readonly azulejosNoIncluidos: boolean;
}

/** Importes. Es lo único de la hoja que no mira el taller: va al final. */
export function seccionImportes(doc: jsPDF, y: number, datos: DatosImportes): number {
  const { desglose, lineasManipulacion } = datos;
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
  filaImporte(doc, yf, `IVA (${datos.ivaPorcentaje} %)`, desglose.ivaCentimos);

  // Total con IVA dentro de la caja, en negativo: el número que se cobra.
  bandaTotal(
    doc,
    y + ALTO - ALTO_TOTAL - 1.5,
    ALTO_TOTAL,
    'TOTAL CON IVA',
    desglose.totalConIvaCentimos,
  );
  return y + ALTO + AIRE;
}

// ---------------------------------------------------------------------------
// Construcción del documento (pura: no llama a save() ni a fetch())
// ---------------------------------------------------------------------------

/**
 * Construye el documento jsPDF de la orden de trabajo. Función pura: no descarga
 * ni hace fetch.
 *
 * El orden de los bloques es el del taller: qué hay que fabricar, con qué
 * material, qué operaciones lleva, qué avisos hay, de dónde sale y — al final,
 * porque no lo miran en el taller — cuánto cuesta.
 *
 * La HOJA es siempre una página; detrás pueden ir las páginas de adjuntos
 * (`paginasAdjuntos`), que se añaden con el pie ya dibujado para no alterar la
 * maquetación de la primera.
 */
export function construirPdfOrdenTrabajo(datos: DatosOrdenTrabajo): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = seccionCabecera(doc, {
    titulo: 'ORDEN DE TRABAJO',
    subtitulo: 'Atelier Studio · documento interno',
    codigo: codigoOrdenTrabajo(datos),
    fecha: datos.fecha,
    logoDataUrl: datos.logoDataUrl,
  });
  y = seccionPieza(doc, y, datos);
  y = seccionMaterial(doc, y, datos);
  y = seccionOperaciones(doc, y, datos);
  y = seccionComentarios(doc, y, datos.comentarios, datos.adjuntos);
  y = seccionProduccion(doc, y, {
    componentes: datos.resultado.componentes,
    ocupacion: datos.resultado.ocupacion,
    mermaPorcentaje: datos.mermaPorcentaje,
    baldosasNecesarias: datos.resultado.baldosasNecesarias,
    baldosasConMerma: datos.resultado.baldosasConMerma,
    facturacion: {
      unidadesFacturadas: datos.resultado.unidadesFacturadas,
      cajasFacturadas: datos.resultado.cajasFacturadas,
      m2Facturados: datos.resultado.m2Facturados,
    },
  });
  const yFinal = seccionImportes(doc, y, {
    desglose: datos.resultado.desglose,
    lineasManipulacion: datos.resultado.lineasManipulacion,
    ivaPorcentaje: datos.config.parametros.ivaPorcentaje,
    azulejosNoIncluidos: datos.azulejosNoIncluidos,
  });
  pieOperador(doc, yFinal - AIRE);
  paginasAdjuntos(doc, datos);
  return doc;
}

/** Genera y descarga el PDF de la orden de trabajo. Devuelve el nombre del archivo guardado. */
export async function generarPdfOrdenTrabajo(datos: DatosOrdenTrabajo): Promise<string> {
  const [logoDataUrl, imagenMaterialDataUrl] = await Promise.all([
    cargarLogo(),
    cargarImagenDeMaterial(datos.material),
  ]);
  const doc = construirPdfOrdenTrabajo({ ...datos, logoDataUrl, imagenMaterialDataUrl });
  const nombre = nombreArchivoOrdenTrabajo(datos);
  doc.save(nombre);
  return nombre;
}
