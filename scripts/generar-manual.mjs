/**
 * Genera el «Manual de usuario» de Atelier Studio como PDF.
 *
 *   npm run manual   ->  public/manual-usuario.pdf
 *
 * Se genera con jsPDF (ya es dependencia del proyecto, la misma que la orden de
 * trabajo) para que el PDF salga vectorial, con el texto seleccionable y con la
 * identidad de Ferrolan. Las capturas de pantalla viven en
 * `docs/manual-usuario/img/` y se rehacen a mano cuando cambia la interfaz.
 *
 * Sale a `public/` porque la app lo sirve: con Ctrl+Alt+H el comercial se lo
 * descarga desde la propia herramienta (ver `src/ui/shell/atajoManual.ts`).
 *
 * El contenido vive en `CONTENIDO`, más abajo: una lista de bloques
 * declarativos (títulos, párrafos, listas, tablas, figuras, avisos y fórmulas)
 * que el motor de maquetación pagina solo. Para tocar el manual basta editar
 * esa lista; no hace falta entender la maquetación.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { jsPDF } from 'jspdf';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_IMG = join(RAIZ, 'docs', 'manual-usuario', 'img');
const SALIDA = join(RAIZ, 'public', 'manual-usuario.pdf');

// ---------------------------------------------------------------------------
// Identidad visual (mismos valores que tailwind.config.js y src/pdf/ordenTrabajo.ts)
// ---------------------------------------------------------------------------

const ROJO = [196, 7, 49];
const ROJO_CLARO = [252, 233, 238];
const GRIS = [71, 85, 105];
const GRIS_SUAVE = [148, 163, 184];
const FONDO_SUAVE = [246, 248, 251];
const NEGRO = [15, 23, 42];

const ANCHO = 210;
const MARGEN = 20;
const ANCHO_UTIL = ANCHO - MARGEN * 2;
const PIE = 274; // límite inferior del cuerpo de texto

/**
 * Las fuentes estándar de jsPDF son WinAnsi (cp1252): no cubren ni los círculos
 * numerados que usa la interfaz ni los símbolos matemáticos. Se sustituyen para
 * que el manual no salga con caracteres corruptos.
 */
const SUSTITUCIONES = [
  [/[①]/g, '1'],
  [/[②]/g, '2'],
  [/[③]/g, '3'],
  [/[④]/g, '4'],
  [/≤/g, '<='],
  [/≥/g, '>='],
  [/≈/g, '~'],
  [/→/g, '->'],
  [/⊏/g, 'C'],
  [/∩/g, 'U'],
  [/✓/g, 'OK'],
  [/[""]/g, '"'],
  [/['']/g, "'"],
  [/…/g, '...'],
  [/[⌀∅]/g, 'diam.'],
];

/** Último carácter de Latin-1 (ÿ); por debajo, WinAnsi coincide con Unicode. */
const MAX_LATIN1 = 0xff;

/**
 * Caracteres que WinAnsi (cp1252) sí trae por encima de Latin-1. Sin esta lista,
 * la red de seguridad se comía la raya larga y salía «Angular ? 2 ud.».
 */
const EXTRA_WINANSI = new Set(Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'));

function sanear(texto) {
  let t = String(texto);
  for (const [patron, reemplazo] of SUSTITUCIONES) t = t.replace(patron, reemplazo);
  // Red de seguridad: un glifo que la fuente no tenga rompería el PDF en silencio.
  return Array.from(t, (c) =>
    c.codePointAt(0) <= MAX_LATIN1 || EXTRA_WINANSI.has(c) ? c : '?',
  ).join('');
}

// ---------------------------------------------------------------------------
// Motor de maquetación
// ---------------------------------------------------------------------------

class Maquetador {
  constructor(doc) {
    this.doc = doc;
    this.y = MARGEN + 6;
    this.indice = [];
    this.capitulo = 0;
  }

  espacio(alto) {
    if (this.y + alto > PIE) {
      this.doc.addPage();
      this.y = MARGEN + 6;
      return true;
    }
    return false;
  }

  texto(txt, { x = MARGEN, ancho = ANCHO_UTIL, tam = 10, estilo = 'normal', color = NEGRO, interlineado = 1.35, sangria = 0 } = {}) {
    const d = this.doc;
    d.setFont('helvetica', estilo);
    d.setFontSize(tam);
    d.setTextColor(...color);
    const lineas = d.splitTextToSize(sanear(txt), ancho - sangria);
    const alto = tam * 0.3528 * interlineado;
    for (const linea of lineas) {
      this.espacio(alto);
      d.text(linea, x + sangria, this.y);
      this.y += alto;
    }
  }

  /** Título de capítulo: página nueva, número grande y entrada de índice. */
  h1(titulo) {
    const d = this.doc;
    if (this.y > MARGEN + 8) {
      d.addPage();
      this.y = MARGEN + 6;
    }
    this.capitulo += 1;
    this.indice.push({ titulo, numero: this.capitulo, pagina: d.getNumberOfPages() });
    d.setFillColor(...ROJO);
    d.rect(MARGEN, this.y - 5, 1.6, 11, 'F');
    d.setFont('helvetica', 'bold');
    d.setFontSize(19);
    d.setTextColor(...ROJO);
    d.text(sanear(`${this.capitulo}. ${titulo}`), MARGEN + 5, this.y + 3);
    this.y += 13;
    d.setDrawColor(...ROJO_CLARO);
    d.setLineWidth(0.6);
    d.line(MARGEN, this.y, ANCHO - MARGEN, this.y);
    this.y += 8;
  }

  h2(titulo) {
    this.espacio(16);
    this.y += 3;
    this.texto(titulo, { tam: 12.5, estilo: 'bold', color: NEGRO, interlineado: 1.2 });
    this.y += 2.5;
  }

  p(txt) {
    this.texto(txt, { tam: 10, color: GRIS });
    this.y += 2.6;
  }

  /** Lista con viñeta; cada elemento puede ser "Título: resto" y se resalta el título. */
  lista(elementos, { numerada = false } = {}) {
    const d = this.doc;
    elementos.forEach((elemento, i) => {
      const marca = numerada ? `${i + 1}.` : '·';
      const sangria = numerada ? 7 : 5;
      const corte = elemento.indexOf(': ');
      const alto = 10 * 0.3528 * 1.35;
      this.espacio(alto);
      d.setFont('helvetica', 'bold');
      d.setFontSize(10);
      d.setTextColor(...(numerada ? ROJO : GRIS_SUAVE));
      d.text(sanear(marca), MARGEN + 1, this.y);
      if (corte > 0 && corte < 46) {
        const rotulo = elemento.slice(0, corte + 1);
        d.setTextColor(...NEGRO);
        d.text(sanear(rotulo), MARGEN + sangria, this.y);
        const anchoRotulo = d.getTextWidth(sanear(rotulo)) + 1.4;
        const yInicio = this.y;
        d.setFont('helvetica', 'normal');
        d.setTextColor(...GRIS);
        const resto = d.splitTextToSize(
          sanear(elemento.slice(corte + 2)),
          ANCHO_UTIL - sangria - anchoRotulo,
        );
        // Primera línea junto al rótulo; las siguientes, alineadas a la sangría.
        d.text(resto[0] ?? '', MARGEN + sangria + anchoRotulo, yInicio);
        this.y += alto;
        if (resto.length > 1) {
          const seguidas = d.splitTextToSize(
            sanear(resto.slice(1).join(' ')),
            ANCHO_UTIL - sangria,
          );
          for (const linea of seguidas) {
            this.espacio(alto);
            d.text(linea, MARGEN + sangria, this.y);
            this.y += alto;
          }
        }
      } else {
        this.texto(elemento, { x: MARGEN + sangria, ancho: ANCHO_UTIL - sangria, color: GRIS });
      }
    });
    this.y += 2.6;
  }

  /** Tabla con cabecera. `anchos` en fracciones que suman 1. */
  tabla(cabecera, filas, anchos) {
    const d = this.doc;
    const cols = anchos.map((f) => f * ANCHO_UTIL);
    const alturaFila = (celdas, tam, estilo) => {
      d.setFont('helvetica', estilo);
      d.setFontSize(tam);
      const lineas = celdas.map((c, i) => d.splitTextToSize(sanear(c), cols[i] - 4).length);
      return Math.max(...lineas) * tam * 0.3528 * 1.28 + 3.2;
    };
    const pintar = (celdas, tam, estilo, color) => {
      d.setFont('helvetica', estilo);
      d.setFontSize(tam);
      d.setTextColor(...color);
      let x = MARGEN;
      celdas.forEach((celda, i) => {
        const lineas = d.splitTextToSize(sanear(celda), cols[i] - 4);
        lineas.forEach((linea, j) => {
          d.text(linea, x + 2, this.y + 3.4 + j * tam * 0.3528 * 1.28);
        });
        x += cols[i];
      });
    };

    const altoCabecera = alturaFila(cabecera, 9, 'bold');
    this.espacio(altoCabecera + 14);
    d.setFillColor(...ROJO);
    d.rect(MARGEN, this.y, ANCHO_UTIL, altoCabecera, 'F');
    pintar(cabecera, 9, 'bold', [255, 255, 255]);
    this.y += altoCabecera;

    filas.forEach((fila, i) => {
      const alto = alturaFila(fila, 9, 'normal');
      if (this.espacio(alto)) {
        // Repetir la cabecera al saltar de página: la tabla sigue leyéndose.
        d.setFillColor(...ROJO);
        d.rect(MARGEN, this.y, ANCHO_UTIL, altoCabecera, 'F');
        pintar(cabecera, 9, 'bold', [255, 255, 255]);
        this.y += altoCabecera;
      }
      if (i % 2 === 1) {
        d.setFillColor(...FONDO_SUAVE);
        d.rect(MARGEN, this.y, ANCHO_UTIL, alto, 'F');
      }
      pintar(fila, 9, 'normal', GRIS);
      this.y += alto;
    });
    d.setDrawColor(...GRIS_SUAVE);
    d.setLineWidth(0.2);
    d.line(MARGEN, this.y, ANCHO - MARGEN, this.y);
    this.y += 6;
  }

  /** Aviso destacado: fondo suave y barra roja. Para advertencias y datos provisionales. */
  nota(titulo, cuerpo) {
    const d = this.doc;
    d.setFont('helvetica', 'normal');
    d.setFontSize(9.5);
    const lineas = d.splitTextToSize(sanear(cuerpo), ANCHO_UTIL - 12);
    const alto = lineas.length * 9.5 * 0.3528 * 1.32 + 11;
    this.espacio(alto + 3);
    d.setFillColor(...FONDO_SUAVE);
    d.rect(MARGEN, this.y, ANCHO_UTIL, alto, 'F');
    d.setFillColor(...ROJO);
    d.rect(MARGEN, this.y, 1.6, alto, 'F');
    d.setFont('helvetica', 'bold');
    d.setFontSize(9.5);
    d.setTextColor(...ROJO);
    d.text(sanear(titulo.toUpperCase()), MARGEN + 6, this.y + 5.4);
    d.setFont('helvetica', 'normal');
    d.setTextColor(...GRIS);
    lineas.forEach((linea, i) => {
      d.text(linea, MARGEN + 6, this.y + 10.6 + i * 9.5 * 0.3528 * 1.32);
    });
    this.y += alto + 5;
  }

  /** Fórmula o cálculo, en bloque monoespaciado. */
  formula(lineas) {
    const d = this.doc;
    const alto = lineas.length * 4.6 + 7;
    this.espacio(alto + 3);
    d.setFillColor(...FONDO_SUAVE);
    d.rect(MARGEN, this.y, ANCHO_UTIL, alto, 'F');
    d.setFont('courier', 'normal');
    d.setFontSize(9);
    d.setTextColor(...NEGRO);
    lineas.forEach((linea, i) => {
      d.text(sanear(linea), MARGEN + 4, this.y + 5.6 + i * 4.6);
    });
    this.y += alto + 5;
    d.setFont('helvetica', 'normal');
  }

  /** Figura: imagen centrada y escalada al ancho pedido, con pie numerado. */
  figura(archivo, pie, { anchoMax = ANCHO_UTIL } = {}) {
    const d = this.doc;
    const ruta = join(DIR_IMG, archivo);
    if (!existsSync(ruta)) {
      this.nota('Falta una captura', `No se encontró ${archivo} en docs/manual-usuario/img/.`);
      return;
    }
    const datos = `data:image/png;base64,${readFileSync(ruta).toString('base64')}`;
    const props = d.getImageProperties(datos);
    // Se limita también el alto: una captura muy alta debe caber en una página.
    const altoDisponible = PIE - MARGEN - 18;
    const escala = Math.min(anchoMax / props.width, altoDisponible / props.height);
    const w = props.width * escala;
    const h = props.height * escala;
    this.espacio(h + 9);
    const x = MARGEN + (ANCHO_UTIL - w) / 2;
    d.addImage(datos, 'PNG', x, this.y, w, h);
    d.setDrawColor(226, 232, 240);
    d.setLineWidth(0.3);
    d.rect(x, this.y, w, h);
    this.y += h + 4;
    if (pie) {
      d.setFont('helvetica', 'italic');
      d.setFontSize(8.5);
      d.setTextColor(...GRIS_SUAVE);
      const lineas = d.splitTextToSize(sanear(pie), ANCHO_UTIL);
      for (const linea of lineas) {
        d.text(linea, ANCHO / 2, this.y, { align: 'center' });
        this.y += 4;
      }
    }
    this.y += 4;
  }
}

// ---------------------------------------------------------------------------
// Portada, índice y pies de página
// ---------------------------------------------------------------------------

function dibujarPortada(doc, fecha) {
  const logo = join(RAIZ, 'public', 'ferrolan-logo.png');
  if (existsSync(logo)) {
    const datos = `data:image/png;base64,${readFileSync(logo).toString('base64')}`;
    const props = doc.getImageProperties(datos);
    const w = 52;
    doc.addImage(datos, 'PNG', MARGEN, 32, w, (props.height * w) / props.width);
  }
  doc.setFillColor(...ROJO);
  doc.rect(MARGEN, 74, 26, 1.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.setTextColor(...NEGRO);
  doc.text('Manual de usuario', MARGEN, 96);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(15);
  doc.setTextColor(...ROJO);
  doc.text('Atelier Studio', MARGEN, 108);

  doc.setFontSize(11);
  doc.setTextColor(...GRIS);
  const intro = doc.splitTextToSize(
    sanear(
      'Configurador de presupuestos de piezas cerámicas cortadas a medida: elige el ' +
        'material, la figura y las medidas, y la herramienta calcula el material ' +
        'necesario, la manipulación y el precio, y genera la orden de trabajo para taller.',
    ),
    ANCHO_UTIL - 30,
  );
  let y = 122;
  for (const linea of intro) {
    doc.text(linea, MARGEN, y);
    y += 6;
  }

  doc.setDrawColor(...ROJO_CLARO);
  doc.setLineWidth(0.6);
  doc.line(MARGEN, 232, ANCHO - MARGEN, 232);
  doc.setFontSize(9.5);
  doc.setTextColor(...GRIS);
  doc.text(sanear('Documento de uso interno · Ferrolan'), MARGEN, 240);
  doc.text(sanear(`Edición: ${fecha}`), MARGEN, 246);
  doc.text(
    sanear('Para volver a descargar este manual: botón «Manual» de la cabecera, o Ctrl + Alt + H'),
    MARGEN,
    252,
  );
}

function dibujarIndice(doc, indice, paginaIndice, desplazamiento) {
  doc.setPage(paginaIndice);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(...ROJO);
  doc.text('Contenido', MARGEN, MARGEN + 9);
  doc.setDrawColor(...ROJO_CLARO);
  doc.setLineWidth(0.6);
  doc.line(MARGEN, MARGEN + 13, ANCHO - MARGEN, MARGEN + 13);

  let y = MARGEN + 26;
  for (const entrada of indice) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...ROJO);
    doc.text(`${entrada.numero}.`, MARGEN, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...NEGRO);
    doc.text(sanear(entrada.titulo), MARGEN + 8, y);
    const pagina = String(entrada.pagina + desplazamiento);
    doc.setTextColor(...GRIS);
    doc.text(pagina, ANCHO - MARGEN, y, { align: 'right' });
    // Puntos de guía hasta el número de página.
    const desde = MARGEN + 8 + doc.getTextWidth(sanear(entrada.titulo)) + 2;
    const hasta = ANCHO - MARGEN - doc.getTextWidth(pagina) - 2;
    if (hasta > desde) {
      doc.setDrawColor(...GRIS_SUAVE);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([0.4, 1.2], 0);
      doc.line(desde, y - 0.8, hasta, y - 0.8);
      doc.setLineDashPattern([], 0);
    }
    y += 8.4;
  }
}

function dibujarPies(doc, fecha) {
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(MARGEN, PIE + 5, ANCHO - MARGEN, PIE + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS_SUAVE);
    doc.text(sanear(`Atelier Studio · Manual de usuario · ${fecha}`), MARGEN, PIE + 10);
    doc.text(`${p} / ${total}`, ANCHO - MARGEN, PIE + 10, { align: 'right' });
  }
}

export function construirManual(fecha = new Date()) {
  const fechaTxt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(fecha);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  dibujarPortada(doc, fechaTxt);

  doc.addPage();
  const m = new Maquetador(doc);
  m.y = MARGEN + 6;
  CONTENIDO(m);

  // El índice se inserta al final, cuando ya se conocen las páginas reales.
  doc.insertPage(2);
  dibujarIndice(doc, m.indice, 2, 1);
  dibujarPies(doc, fechaTxt);
  return doc;
}

// ---------------------------------------------------------------------------
// CONTENIDO DEL MANUAL
// ---------------------------------------------------------------------------

function CONTENIDO(m) {
  // === 1 ====================================================================
  m.h1('Qué es Atelier Studio y para qué sirve');
  m.p(
    'Atelier Studio es la herramienta interna con la que se presupuestan piezas ' +
      'cerámicas cortadas a medida: peldaños, pasamanos, rodapiés y cortes de pieza. ' +
      'Sustituye el cálculo a mano y la hoja de cálculo, y produce dos cosas a la vez: ' +
      'el precio para el cliente y la orden de trabajo que baja a taller.',
  );
  m.p('Con la herramienta haces, siempre en este orden:');
  m.lista(
    [
      'Eliges el material del catálogo (o lo introduces a mano si no está).',
      'Eliges la figura que hay que fabricar.',
      'Introduces las medidas en centímetros y cuántas piezas hacen falta.',
      'Marcas los suplementos que lleve (angular, ranuras, goterón, espesado).',
      'Revisas la cotización y generas el PDF de la orden de trabajo.',
    ],
    { numerada: true },
  );
  m.h2('Qué calcula por ti');
  m.lista([
    'Cuántas baldosas hacen falta: a partir de las medidas de la pieza y del formato de la baldosa, incluyendo el corte y la merma.',
    'Cuánto material se factura: por piezas si sale de stock, o por cajas completas si hay que pedirlo.',
    'La manipulación: la tarifa por centímetro lineal de la figura, más los suplementos y el arranque de máquina.',
    'El precio final: total sin IVA, IVA y total con IVA.',
    'La orden de trabajo: un PDF de una página con el material, las medidas, el croquis de la pieza y el desglose.',
  ]);
  m.h2('Qué NO hace (todavía)');
  m.p(
    'Conviene tenerlo claro para no buscar lo que no está. Estas cosas quedan fuera ' +
      'de esta versión y se decidirán después de usarla en real:',
  );
  m.lista([
    'No guarda histórico: no hay lista de presupuestos anteriores ni forma de recuperar uno de ayer. El PDF es el único registro, guárdalo. (El pedido en curso sí aguanta una recarga: ver el capítulo del pedido.)',
    'No hay usuarios ni permisos: quien abre la herramienta puede hacer todo.',
    'No aprovecha recortes: no reutiliza el sobrante de una baldosa para otro presupuesto.',
    'No pide material al proveedor ni toca el ERP: solo lee el catálogo.',
  ]);

  // === 2 ====================================================================
  m.h1('La pantalla de un vistazo');
  m.p(
    'La pantalla se divide en dos zonas. A la izquierda, los cuatro pasos y la ' +
      'cotización; es donde trabajas. A la derecha, un panel con dos pestañas: el ' +
      'catálogo de materiales y el visor 3D de la pieza.',
  );
  m.figura(
    '01-vista-general.png',
    'Figura 1. Pantalla principal: los pasos y la cotización a la izquierda, el catálogo y el visor a la derecha.',
  );
  m.h2('Cómo se abren y se cierran los pasos');
  m.p(
    'Al empezar solo está abierto el paso 1. Cuando completas un paso, la ' +
      'herramienta abre sola el siguiente para guiarte, pero no cierra nunca lo que ' +
      'ya tenías abierto: si quieres cerrar una tarjeta, haz clic en su cabecera. ' +
      'Así puedes volver atrás y ajustar una medida mientras ves los suplementos.',
  );
  m.p(
    'La cotización de abajo se recalcula sola con cada cambio: no hay botón de ' +
      '«calcular». Mientras falten datos, las líneas aparecen con un guión.',
  );

  // === 3 ====================================================================
  m.h1('Paso 1: Material');
  m.p(
    'El material es la baldosa de la que se corta la pieza. De él salen el formato ' +
      '(largo x ancho), el precio por metro cuadrado y los datos de caja, que son los ' +
      'que permiten calcular cuántas baldosas hacen falta y cuánto cuestan.',
  );
  m.figura('02-paso-material.png', 'Figura 2. Paso 1 con un material ya seleccionado.', {
    anchoMax: 128,
  });
  m.h2('Buscar en el catálogo');
  m.p(
    'Pulsa «Seleccionar del catálogo» y usa el buscador del panel derecho. Puedes ' +
      'buscar por descripción («ducale henna») o por referencia. Si escribes solo ' +
      'números y no aparece nada, la herramienta consulta esa referencia exacta ' +
      'directamente en el catálogo, así que las referencias que no tienen ficha web ' +
      'también se encuentran.',
  );
  m.p(
    'Al elegir un artículo, la tarjeta del paso 1 muestra descripción, referencia, ' +
      'formato, piezas y metros por caja, y el precio. Con «Cambiar» eliges otro y ' +
      'con «Quitar» lo dejas vacío.',
  );
  m.p(
    'Los precios del catálogo son de VENTA: cada baldosa se muestra ya con el margen ' +
      'de su subfamilia aplicado, así que el precio que lees en el panel derecho es el ' +
      'que luego usa la cotización. Si un artículo pone «Precio sin margen» es que su ' +
      'subfamilia no está en la tabla del ERP: pasa el ratón por encima para ver cuál ' +
      'falta y escribe el margen a mano en «Parámetros avanzados».',
  );
  m.h2('Siempre se factura por cajas completas');
  m.p(
    'El material se cobra por cajas enteras, no por baldosas sueltas: el proveedor no ' +
      'sirve media caja. La herramienta calcula cuántas baldosas hacen falta, redondea ' +
      'hacia arriba a cajas completas y factura todas las piezas de esas cajas, aunque ' +
      'sobren. El sobrante se cobra al cliente.',
  );
  m.lista([
    'Por eso en la cotización verás más piezas facturadas que baldosas necesarias: la diferencia es el resto de la caja.',
    'Hace falta que el artículo traiga «piezas por caja» y «m² por caja». Si el catálogo no los trae, la herramienta avisa con un error en vez de inventarlos.',
    'Antes había un selector «Stock / Pedido» que cambiaba esto. Ya no existe: desde el 30-07-2026 se factura por cajas en los dos casos, así que no cambiaba ningún importe.',
  ]);
  m.h2('El margen comercial');
  m.p(
    'Los precios que da la herramienta son de VENTA: llevan ya el margen aplicado ' +
      'al material, a la manipulación (suplementos incluidos) y al arranque de ' +
      'máquina. El margen sale de la subfamilia del artículo, que son los cuatro ' +
      'primeros dígitos de su referencia, y lo mantiene el ERP.',
  );
  m.lista([
    'Hay dos: PVP y contratista. Por defecto se aplica el de PVP, que es el más alto de los dos.',
    'Se cambia en «Parámetros avanzados», al final de la cotización. Está plegado para que no se toque sin querer, pero al abrirlo te dice siempre qué margen se está aplicando y de qué subfamilia sale: conviene mirarlo antes de dar un precio.',
    'Si el artículo no está en la tabla de márgenes, la herramienta NO calcula el precio: lo dice y te deja escribir el margen a mano en ese mismo apartado.',
    'Ningún precio de la pantalla es de coste: llevan margen la cotización, los suplementos del paso 4 y también las tarjetas del catálogo y del paso 1. Al cambiar de PVP a contratista se recalculan todas.',
  ]);
  m.nota(
    'El precio que tecleas en un alta manual es COSTE',
    'El precio de un material dado de alta en «Entrada manual» se entiende como precio ' +
      'de compra: la herramienta le suma el margen encima, igual que a la tarifa del ' +
      'catálogo. No escribas ahí el precio de venta.',
  );

  m.h2('Cuando el cliente trae las baldosas');
  m.p(
    'Bajo la cotización hay una casilla «Azulejos no incluidos». Márcala cuando el ' +
      'cliente aporta él la cerámica y solo se le cobra el trabajo del taller: el ' +
      'material sale a 0 y la línea del desglose lo dice, igual que en el PDF.',
  );
  m.p(
    'El resto del cálculo NO cambia: se siguen dando las baldosas necesarias, la ' +
      'merma y las cajas. Es a propósito, porque es justo lo que el cliente tiene que ' +
      'traer; si te pide seis cajas y aparece que hacen falta siete, esa cifra sigue ' +
      'ahí para decírselo antes de empezar.',
  );
  m.nota(
    'Antes había un campo para editar el precio',
    'Se podía escribir un precio de material distinto del de tarifa. Ya no existe: en la ' +
      'práctica lo que hacía falta no era retocar la tarifa, sino dejar el material fuera ' +
      'del presupuesto, y para eso está esta casilla.',
  );
  m.h2('Entrada manual');
  m.p(
    'Si el material no está en el catálogo, abre «Entrada manual» e introduce ' +
      'descripción, formato, precio y piezas por caja. Las piezas por caja son ' +
      'obligatorias porque se factura por cajas completas; los metros por caja los ' +
      'calcula la herramienta a partir del formato, no hace falta teclearlos. ' +
      'En ese caso el precio se entiende por unidad ' +
      '(por pieza), no por metro cuadrado, y el PDF marca el material como ' +
      '«ENTRADA MANUAL». Los materiales manuales no sirven para pedidos por cajas ' +
      'completas, porque no hay datos de caja.',
  );

  // === 4 ====================================================================
  m.h1('Paso 2: Figura');
  m.p(
    'La figura es la forma de la pieza acabada. Determina qué medidas te pide la ' +
      'herramienta, de cuántas partes se compone la pieza (y por tanto cuánto ' +
      'material ocupa en la baldosa) y qué tarifa de manipulación se aplica.',
  );
  m.figura('03-paso-figura.png', 'Figura 3. Galería de figuras. La miniatura muestra la sección de cada pieza.', {
    anchoMax: 128,
  });
  m.p(
    'Cada tarjeta lleva un dibujo de la pieza en perspectiva. Lo que distingue unas ' +
      'de otras se ve en el extremo cercano del dibujo, donde queda a la vista la ' +
      'sección: ahí se aprecian el grueso del canto, los dientes y el retorno.',
  );
  m.tabla(
    ['Figura', 'Qué es', 'Medidas que pide'],
    [
      ['Figura 1', 'Peldaño en L: tapa y frontal a ras, canto de un grosor', 'Ancho, largo, altura frontal'],
      ['Figura 2', 'Como la 1, con la nariz de dos grosores (un diente)', 'Ancho, largo, altura frontal'],
      ['Figura 3', 'Como la 1, con la nariz de tres grosores (dos dientes)', 'Ancho, largo, altura frontal'],
      ['Figura 4', 'Peldaño con retorno: el canto se engrosa hacia dentro', 'Ancho, largo, altura frontal, retorno'],
      ['Tabica', 'Una figura 1 con un zócalo colgado por DETRAS del frontal, retranqueado un grosor. Se cobran las dos partes', 'Ancho, largo, altura frontal, altura del zócalo'],
      ['Peldaño romo', 'Losa de un grosor con el canto delantero redondeado', 'Ancho, largo'],
      ['Pasamanos 1 a 4', 'La figura equivalente con la manipulación en los dos cantos', 'Las de su peldaño equivalente'],
      ['Pasamanos romo', 'Losa con el canto redondeado por los dos lados', 'Ancho, largo'],
      ['Rodapié 7,2 y Rodapié 8', 'Listón de pie de la altura que dice su nombre: la altura no se teclea', 'Largo (o metros y unidades)'],
      ['Rodapié a medida', 'El mismo listón con la altura que haga falta', 'Largo (o metros y unidades), altura'],
      ['Canto recto, microbiselado o romado', 'Cada altura viene en tres cantos: sin rematar, con el filo matado o en media caña. El canto NO cambia el precio', 'Las de su altura'],
      ['Corte de piezas', 'Pieza plana rectangular, sin canto manipulado', 'Largo, ancho'],
    ],
    [0.19, 0.5, 0.31],
  );
  m.nota(
    'Croquis provisional',
    'Las figuras llevan la insignia «croquis provisional». La forma está deducida de ' +
      'los dibujos de la tarifa del taller, pero el croquis acotado oficial todavía no ' +
      'ha llegado. Las medidas que introduces y el precio no dependen de ese dibujo, ' +
      'pero antes de dar por definitiva una pieza rara conviene confirmarla con taller.',
  );

  // === 5 ====================================================================
  m.h1('Paso 3: Medidas y cantidad');
  m.p(
    'Aquí se introducen las medidas de la pieza acabada, en centímetros, y cuántas ' +
      'unidades iguales hacen falta. Los decimales se escriben con coma (33,5).',
  );
  m.figura('04-paso-medidas.png', 'Figura 4. Medidas de la figura y cantidad.', { anchoMax: 128 });
  m.lista([
    'Ancho: la profundidad de la tapa, es decir lo que se pisa en un peldaño. Se pide primero.',
    'Largo: el largo de la pieza acabada, y la medida sobre la que se cobra la manipulación.',
    'Altura frontal: lo que baja el frontal por delante.',
    'Retorno: solo en la Figura 4 y el Pasamanos 4; cuánto engrosa el canto hacia dentro.',
    'Cantidad: número de piezas iguales. Multiplica la manipulación y el material, pero el arranque de máquina se cobra una sola vez.',
  ]);
  m.h2('Rodapiés: dos maneras de pedirlos');
  m.p(
    'Los rodapiés se venden por metro lineal, así que arriba del paso aparece un ' +
      'conmutador con las dos maneras de pedirlos. Elige la que traiga el cliente y no ' +
      'tengas que echar tú la cuenta.',
  );
  m.lista([
    'Por largo y cantidad: lo de siempre. Dices cuánto mide cada pieza y cuántas quieres.',
    'Por metros y unidades: dices cuántos metros quieres EN TOTAL y en cuántas piezas los quieres repartidos. El largo de cada una lo calcula la herramienta y te lo enseña debajo del campo.',
  ]);
  m.p(
    'Debajo de los metros verás el largo que sale por pieza y los metros que suman de ' +
      'verdad. Los dos números pueden no cuadrar al milímetro: el largo se redondea a ' +
      'milímetros, que es como se corta. Por ejemplo, 10 m en 3 piezas son 333,3 cm cada ' +
      'una, o sea 9,999 m en total.',
  );
  m.p(
    'Cambiar de una manera a la otra no borra lo que ya habías escrito, así que puedes ' +
      'ir y volver para comparar las dos. En los rodapiés de 7,2 y de 8 la altura no se ' +
      'teclea: va en el nombre de la figura y sale puesta.',
  );
  m.h2('Cuándo se pone un campo en rojo');
  m.p(
    'Un campo se marca en rojo cuando ya has pasado por él y lo has dejado vacío o ' +
      'con un valor imposible; no en cuanto empiezas a escribir en otro. Si cierras el ' +
      'paso sin rellenarlo, al volver verás en rojo todo lo que falta. Es decir: la ' +
      'herramienta no te riñe mientras trabajas, solo cuando te saltas algo.',
  );
  m.h2('«La pieza no cabe»');
  m.p(
    'Es el error más habitual. Significa que, con el formato de baldosa elegido, las ' +
      'partes de la pieza no salen de una sola baldosa. El mensaje da los dos números ' +
      'que hay que comparar. Las salidas son: elegir un material de formato mayor, ' +
      'reducir la medida que se pasa, o partir el trabajo en piezas más cortas.',
  );
  m.nota(
    'Todas las partes, de la misma baldosa',
    'La tapa y el frontal de una misma pieza se cortan siempre de la misma baldosa, ' +
      'para que la veta y el tono casen. Por eso no vale que «quepan sumando dos ' +
      'baldosas»: tienen que caber juntas en una.',
  );

  // === 6 ====================================================================
  m.h1('Paso 4: Suplementos');
  m.p(
    'Los suplementos son trabajos añadidos sobre la pieza. Solo aparecen los que ' +
      'aplican a la figura elegida, y cada uno indica su precio y su unidad.',
  );
  m.figura('05-paso-suplementos.png', 'Figura 5. Suplementos disponibles para la figura.', {
    anchoMax: 128,
  });
  m.tabla(
    ['Suplemento', 'Qué es', 'Cómo se cobra'],
    [
      [
        'Angular',
        'Remate en ángulo del peldaño, para doblar la esquina de la escalera',
        'Por pieza, y solo por las que lo lleven (ver abajo)',
      ],
      [
        'Tres ranuras antideslizantes',
        'Tres ranuras en la huella, paralelas al canto delantero',
        'Por cm lineal, en todas las piezas',
      ],
      [
        'Ranura (goterón)',
        'Ranura en el canto inferior del frontal, corta el agua que baja por la contrahuella',
        'Por cm lineal, en todas las piezas',
      ],
      ['Material espesado', 'La pieza se hace más gruesa', 'Por cm lineal, en todas las piezas'],
      [
        'Inglete',
        'Solo corte de piezas: el canto se corta a inglete para unir dos piezas en esquina',
        'Por cm lineal, sobre el perímetro de la pieza',
      ],
      [
        'Microbisel',
        'Solo corte de piezas: se mata el filo del canto con un bisel muy pequeño',
        'Por cm lineal, sobre el perímetro de la pieza',
      ],
      [
        'Sin microbisel',
        'Solo corte de piezas: el canto se deja tal cual sale de la sierra',
        'No cuesta nada; se marca para que conste en la orden',
      ],
    ],
    [0.28, 0.42, 0.3],
  );
  m.p(
    'Los suplementos que van por centímetro se calculan sobre el largo de la pieza ' +
      'y se aplican a todas las unidades del presupuesto.',
  );
  m.h2('Angular: eliges a cuántas piezas se lo pones');
  m.p(
    'El angular es la excepción, porque no es un trabajo a lo largo de la pieza sino un ' +
      'remate de su extremo: en un tramo de escalera solo lo llevan las piezas que doblan ' +
      'la esquina, no todas. Por eso, al marcarlo aparece un campo para decir a cuántas ' +
      'piezas se aplica.',
  );
  m.figura(
    '09-suplemento-por-pieza.png',
    'Figura 6. Al marcar Angular se elige a cuántas piezas se aplica; los de por cm van a todas.',
    { anchoMax: 128 },
  );
  m.lista([
    'Al marcarlo se propone 1 pieza, no todas: es lo más habitual y evita cobrar de más sin darse cuenta.',
    'No puedes poner más piezas de las que has pedido; si lo intentas, la herramienta avisa.',
    'En la cotización se ve como «Angular — 2 ud.», con el importe de esas 2 piezas.',
    'La orden de trabajo lo indica como «2 de 12 piezas», para que taller sepa cuáles rematar.',
  ]);
  m.nota(
    'Es el único suplemento que funciona así',
    'Los otros tres se cobran por centímetro lineal, recorren la pieza de punta a punta y ' +
      'se aplican a todas las unidades. El angular es el único que se cobra por pieza, y ' +
      'por eso es el único que pregunta a cuántas.',
  );

  m.h2('Comentarios para taller');
  m.p(
    'Debajo de los suplementos hay un campo de texto libre para lo que no cabe en ' +
      'ninguna casilla: indicaciones de corte, plazos, quién recoge el material, avisos ' +
      'de obra. Sale tal cual en la orden de trabajo, en un bloque propio y destacado, ' +
      'para que en taller no se pase por alto.',
  );
  m.lista([
    'Es opcional y no afecta al precio: es una anotación, no un dato de cálculo.',
    'Caben unos 400 caracteres, que es lo que entra en la hoja sin descolocarla.',
    'Si lo dejas vacío, el bloque no se imprime.',
    'No se borra al cambiar de figura: es de la orden, no de la pieza.',
  ]);

  m.h2('Adjuntar documentos');
  m.p(
    'El clip que hay junto a «Comentarios para taller» engancha documentos a la orden: ' +
      'el plano que ha mandado el cliente, una foto de la obra, la captura de una ' +
      'medición. Caben 6 documentos y hasta 5 MB cada uno.',
  );
  m.p(
    'Todos se citan por su nombre en la hoja, y los que son IMAGEN salen además como ' +
      'página completa al final del PDF. Los que no son imagen —un PDF, por ejemplo— solo ' +
      'se pueden citar, y aparecen marcados «(aparte)»: la herramienta no sabe fusionar ' +
      'documentos, así que en taller tienen que saber que existe un archivo que no está ' +
      'impreso ahí y hay que pedirlo a oficina.',
  );
  m.lista([
    'Son de la orden, no de la pieza: no se borran al cambiar de figura, y en un pedido de varias piezas van una sola vez.',
    'Solo viven en la sesión: si recargas la página se pierden (a diferencia del pedido). Adjúntalos justo antes de generar el PDF.',
    'Si una imagen sale ilegible, el PDF se genera igual: se salta esa página y el nombre sigue citado en la hoja.',
  ]);

  // === 7 ====================================================================
  m.h1('La cotización');
  m.p(
    'El bloque de cotización está siempre visible al pie de los pasos y se ' +
      'actualiza con cada cambio. Arriba muestra el recuento de producción y debajo el ' +
      'desglose del precio.',
  );
  m.figura('06-cotizacion.png', 'Figura 7. Cotización con el recuento de producción y el desglose.', {
    anchoMax: 118,
  });
  m.tabla(
    ['Línea', 'Qué significa'],
    [
      ['Piezas por baldosa', 'Cuántas piezas completas salen de una baldosa'],
      ['Baldosas necesarias', 'Las que hacen falta para la cantidad pedida, sin merma'],
      ['Baldosas con merma', 'Las anteriores más el porcentaje de merma, redondeando hacia arriba'],
      ['Piezas facturadas', 'Baldosas que se cobran (en pedido, las de las cajas completas)'],
      ['m² facturados', 'Metros cuadrados que se cobran'],
      ['Material', 'Coste de las baldosas facturadas'],
      ['Manipulación', 'Tarifa de la figura más los suplementos, con su detalle'],
      ['Arranque de máquina', 'Importe fijo, una sola vez por orden'],
      ['Total sin IVA / IVA / Total con IVA', 'Suma, impuesto y total a cobrar'],
    ],
    [0.34, 0.66],
  );
  m.h2('La merma');
  m.p(
    'La merma es el porcentaje de baldosas de más que se piden para cubrir roturas y ' +
      'fallos de corte. Se aplica sobre las baldosas, no sobre el precio, y siempre ' +
      'redondea hacia arriba: 12 baldosas con 10 % son 14, no 13,2.',
  );
  m.p(
    'No es un valor fijo: la herramienta la PROPONE según el formato de la baldosa, ' +
      'porque cuanto más grande es la pieza más fácil es que se rompa. Debajo del campo ' +
      'verás siempre cuál es la sugerida; si escribes otra, la sugerida se queda a la ' +
      'vista, para que conste que la cambiaste a propósito.',
  );
  m.lista([
    'Baldosas de lado mayor 60 cm o menos (30x60, 60x60, 20x20...): 10 %.',
    'Baldosas de lado mayor 120 cm o más (60x120, 120x120...): 20 %.',
    'Entre medias sube de forma proporcional: 75 cm son 12,5 % y 90 cm son 15 %.',
    'Las figuras con número (Figura 1 a 4 y Pasamanos 1 a 4) suman 5 puntos más, por la manipulación que llevan: una Figura 2 sobre baldosa de 30x60 va al 15 %.',
  ]);
  m.nota(
    'Lo que manda es el lado mayor, no la superficie',
    'Una baldosa de 60x60 tiene el doble de superficie que una de 30x60, pero su lado ' +
      'mayor sigue siendo 60 cm, así que le toca el mismo 10 %. Si en taller se ve que no ' +
      'es así, avisa: es un ajuste de una línea.',
  );

  // === 8 ====================================================================
  m.h1('Varias piezas en un pedido');
  m.p(
    'Un presupuesto puede llevar VARIAS piezas. Si el cliente pide un peldaño y un ' +
      'rodapié, no hace falta hacer dos presupuestos: configuras la primera pieza como ' +
      'siempre y pulsas «Añadir al pedido», que está bajo «Generar PDF». La pieza pasa a ' +
      'una lista y el editor se queda libre para la siguiente.',
  );
  m.p(
    'Al añadir una pieza se CONSERVA el material: lo normal es encadenar varios cortes ' +
      'de la misma cerámica, y volver a buscarla en el catálogo cada vez sería trabajo ' +
      'tirado. Cambiarlo es un clic; volver a elegirlo, media docena.',
  );

  m.h2('Por qué sale más barato que hacerlos por separado');
  m.p(
    'Es la razón de que exista el pedido. El material se factura por CAJAS COMPLETAS, y ' +
      'las piezas del mismo artículo comparten caja: se cuentan las baldosas de todas ' +
      'juntas y se compran las cajas una sola vez. El arranque de máquina también se cobra ' +
      'una vez por artículo, no una por pieza.',
  );
  m.p(
    'Dos cortes de la misma cerámica que por separado habrían pedido una caja cada uno, ' +
      'juntos pueden salir de una sola. El PDF del pedido remata diciendo cuántas cajas se ' +
      'ahorran y cuánto dinero es, para que la cifra se pueda enseñar al cliente.',
  );
  m.nota(
    'Todas las piezas de un mismo artículo se cotizan igual',
    'Si dos piezas salen de la misma cerámica, tienen que llevar el mismo margen y la misma ' +
      'respuesta a «Azulejos no incluidos»: como comparten caja, no hay forma de comprarla ' +
      'medio incluida. Si no coinciden, la herramienta no cotiza y te dice qué línea revisar.',
  );

  m.h2('La lista del pedido');
  m.lista([
    'Cada línea se puede quitar, duplicar o volver a editar: al editarla vuelve al editor y sale de la lista.',
    'El pedido SOBREVIVE a una recarga de la página. Un carrito de diez piezas es media mañana, así que se guarda en el navegador; lo que no se guarda es la pieza a medio configurar del editor, ni los comentarios, ni los adjuntos.',
    '«Reiniciar» limpia la pieza del editor, los comentarios y los adjuntos, pero NO el pedido: vaciar diez piezas por un clic de más sería un accidente caro. Para eso está «Vaciar pedido», que pide confirmación.',
    'Los comentarios y los adjuntos son del pedido entero, no de cada pieza: se escriben una vez.',
  ]);

  m.h2('El PDF del pedido');
  m.p(
    'Con piezas en la lista, el botón genera la ORDEN DEL PEDIDO: una primera hoja de ' +
      'resumen con la tabla de piezas, el material agrupado por artículo, los comentarios ' +
      'y los importes del pedido completo, y después UNA HOJA POR PIEZA con su ficha, su ' +
      'croquis y su producción, igual que la orden de una pieza sola.',
  );
  m.lista([
    'El código del documento empieza por PED- en vez de OT-, para que por teléfono se sepa si se está mirando un pedido o la orden de una pieza.',
    'Las cajas NO se repiten en la hoja de cada pieza: son del artículo y van en el resumen. La hoja de pieza recuerda de qué caja sale y con qué otras piezas la comparte.',
    'Si hay adjuntos, sus páginas van al final, detrás de las hojas de pieza: son del pedido entero, no de una pieza concreta.',
  ]);

  // === 9 ====================================================================
  m.h1('El visor 3D');
  m.p(
    'La pestaña «Visor 3D» del panel derecho dibuja la pieza con las medidas que has ' +
      'introducido. Sirve para comprobar de un vistazo que lo que has escrito es la ' +
      'pieza que tenías en la cabeza, antes de mandarla a taller.',
  );
  m.figura('07-visor-3d.png', 'Figura 8. Visor 3D con la pieza acotada y la textura del material.', {
    anchoMax: 105,
  });
  m.lista([
    'Girar: arrastra con el botón izquierdo del ratón.',
    'Acercar: rueda del ratón.',
    'Volver a la vista inicial: botón «Restablecer cámara».',
    'Cotas: cada medida aparece rotulada sobre la pieza y siempre legible.',
    'Textura: se aplica la foto del material. Si no hay imagen o falla la descarga, la pieza se ve en gris y aparece el aviso «Textura no disponible»; no impide trabajar.',
  ]);
  m.p(
    'Con cantidad mayor que uno se dibuja una sola pieza y se indica al pie ' +
      '(«Se muestra 1 pieza de 12»). La vista del conjunto instalado no entra en esta versión.',
  );
  m.h2('Los suplementos también se ven');
  m.p(
    'Los tres suplementos que se cobran por centímetro cambian la forma de la pieza y el ' +
      'visor los dibuja: las tres ranuras en la huella, el goterón en el canto inferior ' +
      'del frontal y el material espesado como una tapa del doble de grueso. El angular ' +
      'no se dibuja: es un remate del extremo y su forma exacta sigue pendiente de taller.',
  );
  m.nota(
    'Las ranuras son finas de verdad',
    'Una ranura mide unos 3 mm en una pieza de un metro, así que a tamaño completo se ve ' +
      'como una línea muy fina, y sobre una textura con mucha veta puede costar ' +
      'distinguirla; acércate con la rueda del ratón si quieres comprobarla. El goterón se ' +
      'aprecia mejor, porque queda recortado en el canto de abajo del frontal.',
  );

  // === 10 ================================================================
  m.h1('La orden de trabajo en PDF');
  m.p(
    'El botón «Generar PDF» descarga la orden de trabajo: una hoja A4 con todo lo ' +
      'que taller necesita y el desglose del precio. Solo se activa cuando la ' +
      'cotización es válida, para que no baje a taller una orden incompleta.',
  );
  m.figura('08-orden-trabajo.png', 'Figura 9. Orden de trabajo generada por la herramienta.', {
    anchoMax: 132,
  });
  m.p(
    'La hoja está ordenada por quien la lee: primero lo que hay que fabricar y con ' +
      'qué, y al final el dinero, que en taller no se mira. Los bloques, de arriba abajo:',
  );
  m.lista([
    'Cabecera: el código de orden, arriba a la derecha y en grande, con el formato OT-AAAAMMDD-HHMM. Es el identificador para citar la hoja y coincide con el nombre del archivo.',
    'Pieza a fabricar: el bloque más grande. Figura, la cantidad destacada en rojo, las medidas como cifras grandes en el mismo orden en que se piden, y el croquis acotado de la sección a la derecha.',
    'Material: foto, descripción, referencia, formato, datos de caja y precio de tarifa. Si has marcado «Azulejos no incluidos», en lugar del precio pone NO INCLUIDOS (aporta cliente), que es lo que explica que el material no aparezca cobrado. Los datos de caja son los que explican en taller por qué se facturan más piezas de las necesarias.',
    'Operaciones: los suplementos en una línea, cada uno con su alcance — «(todas)» los de por cm, «(2 de 12)» el angular.',
    'Comentarios para taller: lo que hayas escrito en el campo de comentarios, sobre fondo tenue, con la lista de adjuntos citados por nombre debajo. Si no hay ni comentarios ni adjuntos, este bloque no aparece.',
    'Producción: el despiece de la pieza, cuánto ocupa en la baldosa, los cortes, y el recuento de baldosas y metros.',
    'Importes: el mismo desglose de la pantalla, con el total con IVA en la banda roja.',
    'OPERADOR: al pie, con una raya para firmar a mano quién ha hecho la pieza.',
    'Páginas de adjunto: si has enganchado imágenes, cada una sale al final a página completa, con su nombre y el código de la orden en la cabecera.',
  ]);
  m.p(
    'El archivo se guarda como orden-trabajo_REFERENCIA_AAAAMMDD-HHMM.pdf. Como la ' +
      'herramienta no guarda histórico, este PDF es el único registro del presupuesto: ' +
      'archívalo donde corresponda.',
  );
  m.p(
    'Con varias piezas en el pedido el botón genera un documento distinto, la orden del ' +
      'PEDIDO, con una hoja de resumen y una hoja por pieza: se explica en el capítulo ' +
      '«Varias piezas en un pedido».',
  );

  // === 11 ================================================================
  m.h1('Cómo calcula el programa');
  m.p(
    'Este capítulo explica el cálculo completo, en el mismo orden en que lo hace la ' +
      'herramienta. Sirve para entender de dónde sale cada cifra y para poder ' +
      'comprobarla a mano si un presupuesto no cuadra.',
  );
  m.h2('10.1 Por qué las cuentas salen exactas');
  m.p(
    'Todas las medidas se manejan internamente en milímetros enteros y todo el ' +
      'dinero en céntimos enteros. No se usan decimales por dentro. Esto evita los ' +
      'errores de redondeo que se acumulan en una hoja de cálculo: dos presupuestos ' +
      'iguales dan siempre exactamente el mismo importe, al céntimo.',
  );
  m.h2('10.2 De la figura a las partes de la pieza');
  m.p(
    'Cada figura tiene una receta que dice de qué partes se compone y de qué medida ' +
      'sale cada una. Un peldaño de la Figura 1 son dos partes: la tapa (largo x ' +
      'ancho) y el frontal (largo x altura frontal). Un pasamanos añade el frontal ' +
      'del lado opuesto. Esas partes son las que hay que colocar sobre la baldosa.',
  );
  m.h2('10.3 Cuánto ocupa la pieza en la baldosa');
  m.p(
    'Las partes se colocan una al lado de otra sobre la baldosa. El espacio que ' +
      'necesitan no es solo la suma de sus anchos: hay que contar lo que se come el ' +
      'disco en cada corte, el saneado de los dos bordes de la baldosa y una ' +
      'tolerancia de fabricación.',
  );
  m.formula([
    'ocupación = suma de los anchos de las partes',
    '          + (número de partes - 1) x ancho de disco',
    '          + 2 x saneado por lado',
    '          + tolerancia',
  ]);
  m.p(
    'Con los valores actuales (disco 0,3 cm, saneado 0,5 cm por lado, tolerancia ' +
      '0,2 cm), la pieza cabe si la ocupación entra en una dimensión de la baldosa y ' +
      'el largo de las partes entra en la otra. La herramienta prueba la baldosa en su ' +
      'orientación natural y, si no cabe, girada 90 grados; usa la primera que ' +
      'funcione y lo indica en el PDF.',
  );
  m.h2('10.4 Cuántas piezas salen de una baldosa');
  m.p(
    'Si la pieza es pequeña, de una baldosa salen varias. La herramienta calcula ' +
      'cuántas caben a lo ancho y cuántas a lo largo, contando otra vez el disco entre ' +
      'piezas, y multiplica. Tres piezas de 10 x 10 cm no gastan tres baldosas de ' +
      '110 x 110: gastan una.',
  );
  m.h2('10.5 Baldosas y merma');
  m.formula([
    'baldosas necesarias = cantidad / piezas por baldosa   (redondeando hacia arriba)',
    'baldosas con merma  = baldosas necesarias x (1 + merma%)   (hacia arriba)',
  ]);
  m.h2('10.6 Cuánto material se factura');
  m.lista([
    'Se redondea hacia arriba a cajas completas: cajas = las baldosas con merma divididas entre las piezas por caja, redondeando hacia arriba.',
    'Se facturan todas las baldosas de esas cajas, aunque sobren; el sobrante se cobra al cliente.',
  ]);
  m.h2('10.7 El coste del material');
  m.p(
    'Se multiplican los metros cuadrados facturados por el precio por metro ' +
      'cuadrado (el de tarifa o el que hayas editado). En stock los metros salen de las ' +
      'baldosas facturadas; en pedido, de los metros por caja que da el catálogo. En un ' +
      'material de entrada manual el precio es por unidad y se multiplica por las ' +
      'unidades facturadas.',
  );
  m.h2('10.8 La manipulación');
  m.p(
    'La tarifa de la figura es un precio por centímetro lineal. Se aplica a la ' +
      'largo de la pieza para obtener el importe de UNA pieza, se redondea a ' +
      'céntimos una sola vez, y después se multiplica por la cantidad. Este orden ' +
      'importa: redondear una vez por pieza y multiplicar después da un importe ' +
      'distinto (y correcto) frente a redondear el total.',
  );
  m.formula([
    'importe de una pieza = tarifa (euros/cm) x largo (cm)   -> redondeo a céntimos',
    'línea de manipulación = importe de una pieza x cantidad',
  ]);
  m.p(
    'Algunas figuras tienen dos tarifas según una medida: la Figura 1 cobra un ' +
      'precio si el frontal mide 5 cm o menos y otro si pasa de 5 cm. Los rodapiés ' +
      'se tarifan por altura: el canto (recto, microbiselado o romado) no cambia el ' +
      'precio. El corte de piezas se tarifa sobre el perímetro completo, es decir ' +
      '2 x (largo + ancho).',
  );
  m.p(
    'Los suplementos se añaden como líneas propias. Los de por centímetro se calculan ' +
      'igual que la tarifa principal y se aplican a todas las piezas. Los de por pieza ' +
      '(hoy solo el angular) multiplican su precio por LAS PIEZAS QUE LO LLEVEN, las que ' +
      'eliges en el paso 4, no por la cantidad entera del presupuesto.',
  );
  m.h2('10.9 Arranque de máquina');
  m.p(
    'Es un importe fijo que cubre la preparación de la máquina y se cobra UNA VEZ ' +
      'por orden, no por pieza. Es la razón por la que agrupar piezas iguales en un ' +
      'solo presupuesto sale más barato que hacer varios.',
  );
  m.h2('10.10 Totales');
  m.formula([
    'total sin IVA = material + manipulación + arranque de máquina',
    'IVA           = total sin IVA x 21 %',
    'total con IVA = total sin IVA + IVA',
  ]);

  // === 12 ================================================================
  m.h1('Ejemplo completo, número a número');
  m.p(
    'Este es el presupuesto de las capturas de este manual, con todos los pasos ' +
      'intermedios. Siguiendo las mismas entradas —incluidas las piezas por caja, que ' +
      'salen del catálogo y deciden cuánto material se factura— tienes que obtener ' +
      'exactamente estas cifras.',
  );
  m.tabla(
    ['Dato de partida', 'Valor'],
    [
      ['Material', 'BALDOCER DUCALE HENNA 60X120 (ref. 77356201)'],
      ['Formato de la baldosa', '60 x 120 cm'],
      ['Piezas por caja', '2  (1,44 m² por caja)'],
      ['Precio del material', '26,73 euros/m²'],
      ['Figura', 'Figura 1 (peldaño en L)'],
      ['Ancho / largo / altura frontal', '33 cm / 100 cm / 4 cm'],
      ['Cantidad', '12 piezas'],
      ['Suplementos', 'ninguno'],
      ['Merma', '10 %'],
    ],
    [0.42, 0.58],
  );
  m.h2('Paso a paso');
  m.p('1. Partes de la pieza: tapa de 100 x 33 cm y frontal de 100 x 4 cm.');
  m.formula([
    '2. Ocupación en la baldosa:',
    '   33 + 4                       = 37,0 cm  (anchos de las partes)',
    '   + 1 corte x 0,3              =  0,3 cm  (disco)',
    '   + 2 x 0,5                    =  1,0 cm  (saneado)',
    '   + 0,2                        =  0,2 cm  (tolerancia)',
    '                                = 38,5 cm',
    '',
    '   La baldosa es de 60 x 120 cm. En su orientación natural el largo de la',
    '   pieza (100 cm) no entra en los 60 cm, así que se gira 90 grados:',
    '   38,5 cm entran en 60 cm y 100 cm entran en 120 cm. Cabe. 1 corte.',
  ]);
  m.formula([
    '3. Piezas por baldosa:  1   (la pieza ocupa casi todo el ancho útil)',
    '4. Baldosas necesarias: 12 / 1 = 12',
    '5. Baldosas con merma:  12 x 1,10 = 13,2  ->  14  (hacia arriba)',
    '6. Cajas facturadas: 14 / 2 piezas por caja = 7 cajas (14 piezas).',
    '   Aquí no sobra nada porque 14 es múltiplo de 2; si la caja fuera de 3,',
    '   harían falta 5 cajas y se facturarían 15 piezas.',
    '7. m² facturados: 7 cajas x 1,44 m²/caja = 10,08 m²',
  ]);
  m.formula([
    '8. Material:      10,08 m² x 26,73 euros/m²      = 269,44 euros',
    '9. Manipulación:  0,19 euros/cm x 100 cm         =  19,00 euros por pieza',
    '                  19,00 x 12                     = 228,00 euros',
    '10. Arranque de máquina (una vez)                =  60,00 euros',
    '',
    '    Total sin IVA:  269,44 + 228,00 + 60,00      = 557,44 euros',
    '    IVA (21 %):     557,44 x 0,21                = 117,06 euros',
    '    TOTAL CON IVA                                = 674,50 euros',
  ]);
  m.nota(
    'Por qué la tarifa es 0,19',
    'La Figura 1 tiene dos tarifas según la altura del frontal: 0,19 euros/cm si mide ' +
      '5 cm o menos, y 0,23 euros/cm si pasa de 5 cm. Aquí el frontal mide 4 cm, así ' +
      'que se aplica la primera. Si en este mismo ejemplo el frontal midiera 6 cm, la ' +
      'manipulación pasaría a 276,00 euros y el total con IVA a 732,60 euros.',
  );

  // === 13 ================================================================
  m.h1('Mensajes de error y qué hacer');
  m.tabla(
    ['Mensaje', 'Qué pasa y cómo se resuelve'],
    [
      [
        'La pieza mide X cm; el formato solo llega a Y cm.',
        'La pieza es más larga que la baldosa en cualquier orientación. Elige un material de formato mayor o reparte el trabajo en piezas más cortas.',
      ],
      [
        'La pieza necesita X cm de ancho; el formato solo permite Y cm.',
        'Los largos caben, pero las partes apiladas no. Reduce el ancho o la altura frontal, o cambia a una baldosa más ancha.',
      ],
      [
        '«Ancho» es obligatoria.',
        'Falta una medida. Se marca al salir del campo vacío o al volver a abrir el paso.',
      ],
      [
        'La cantidad debe ser un número entero mayor que 0.',
        'La cantidad no admite decimales ni cero.',
      ],
      [
        'No puedes aplicar «Angular» a 5 piezas: solo hay 3.',
        'Has puesto más piezas con angular que unidades pedidas. Baja las piezas con angular, o sube la cantidad.',
      ],
      [
        'El material ... no tiene tarifa TARP (euros/m²): no se puede cotizar el material. Marca «Azulejos no incluidos» si los aporta el cliente.',
        'El catálogo no trae precio para ese artículo, y no hay precio que teclear a mano. Si el cliente aporta la cerámica, marca la casilla y se cotiza solo el trabajo; si no, elige otro artículo o dalo de alta en «Entrada manual» con su precio.',
      ],
      [
        'El material no tiene el dato «piezas por caja»; no se puede facturar un pedido por cajas completas.',
        'Ese artículo no trae los datos de caja que hacen falta para facturar por cajas completas. Usa otro material, o dalo de alta a mano indicando las piezas por caja.',
      ],
      [
        'Textura no disponible',
        'Solo afecta al visor: no hay foto del material o no se pudo descargar. El cálculo y el PDF no se ven afectados.',
      ],
      [
        'No se pudo iniciar el visor 3D (WebGL no disponible).',
        'El navegador o el equipo no puede dibujar en 3D. El resto de la herramienta funciona igual.',
      ],
    ],
    [0.37, 0.63],
  );

  // === 14 ================================================================
  m.h1('Valores provisionales y límites conocidos');
  m.p(
    'Hay decisiones que todavía están pendientes de taller o de dirección. La ' +
      'herramienta funciona con valores de trabajo razonables, pero conviene saber ' +
      'cuáles son para no dar por definitivo un presupuesto que dependa mucho de ellos.',
  );
  m.tabla(
    ['Dato', 'Valor en uso', 'Estado'],
    [
      ['Ancho del disco de corte', '0,3 cm', 'Pendiente de confirmar con taller'],
      ['Saneado por lado', '0,5 cm', 'Pendiente de confirmar con taller'],
      ['Tolerancia de fabricación', '0,2 cm', 'Pendiente de confirmar con taller'],
      ['Merma', 'Según el formato', 'La sugiere la herramienta; siempre editable'],
      ['Merma «mínimo 3»', 'No aplicada', 'Falta saber qué significa la regla'],
      ['Grosor de la baldosa', '1 cm (solo para dibujar)', 'El dato real no está en el catálogo'],
      ['Croquis de las figuras', 'Deducido de la tarifa', 'Falta el croquis acotado oficial'],
      ['Medidas de las ranuras', '3 mm de ancho, 2 de profundidad', 'Solo afecta al dibujo; falta acotarlas'],
      ['Cuánto espesa el espesado', 'Dobla el grosor de la tapa', 'Solo afecta al dibujo; pendiente'],
      ['Forma del angular', 'No se dibuja', 'Falta saber si es inglete a 45° o remate de canto'],
      ['Tarifa de los pasamanos', 'La del peldaño equivalente', 'Pendiente de tarifa propia'],
      ['Transporte (40 euros)', 'No incluido', 'Se decide fuera de la herramienta'],
    ],
    [0.3, 0.32, 0.38],
  );
  m.nota(
    'Antes de cerrar un presupuesto grande',
    'Estos valores afectan a cuántas baldosas salen y, con ello, al coste del ' +
      'material. En trabajos grandes o con piezas muy justas de medida, contrasta el ' +
      'resultado con taller antes de comprometer el precio con el cliente.',
  );

  // === 15 ================================================================
  m.h1('Atajos, referencias y dónde preguntar');
  m.h2('Atajo de teclado');
  m.lista([
    'Botón «Manual» en la cabecera, arriba a la derecha: descarga este manual.',
    'Ctrl + Alt + H: lo mismo, sin soltar el teclado.',
  ]);
  m.h2('De dónde salen los datos');
  m.lista([
    'Catálogo de materiales: réplica de solo lectura del catálogo de cerámica del ERP, que se actualiza dos veces al día. Si un artículo nuevo no aparece, puede tardar hasta un día.',
    'Tarifas de manipulación y suplementos: tarifa de Torelos Castellbisbal de junio de 2023.',
    'IVA y arranque de máquina: configuración de la herramienta.',
  ]);
  m.h2('Contactos de la tarifa de taller');
  m.lista([
    'Marcel Pidelaserra: 653 918 165',
    'Torelos Castellbisbal: 692 132 179',
    'Correo: toreloscastellbisbal@gmail.com',
  ]);
  m.h2('Si algo no cuadra');
  m.p(
    'Antes de dar por buena una cifra rara: comprueba las piezas por caja del material, la ' +
      'merma, el margen que se está aplicando y si está marcado «Azulejos no incluidos». ' +
      'Esas cosas explican casi todas las diferencias. Si el problema es el cálculo en sí, guarda el PDF de la ' +
      'orden (lleva todos los datos de entrada y el código de orden) y pásalo a quien ' +
      'mantenga la herramienta: con ese PDF se puede reproducir el caso exacto.',
  );
}

// ---------------------------------------------------------------------------

const doc = construirManual();
writeFileSync(SALIDA, Buffer.from(doc.output('arraybuffer')));
console.log(`Manual generado: ${SALIDA} (${doc.getNumberOfPages()} páginas)`);
