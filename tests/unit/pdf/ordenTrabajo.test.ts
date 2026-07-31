/**
 * Tests del PDF de orden de trabajo: construcción pura del documento (sin save())
 * y nombre de archivo. El `ResultadoCotizacion` se construye a mano.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  codigoOrdenTrabajo,
  construirPdfOrdenTrabajo,
  generarPdfOrdenTrabajo,
  nombreArchivoOrdenTrabajo,
  reiniciarCacheImagenes,
  type DatosOrdenTrabajo,
} from '../../../src/pdf/ordenTrabajo';
import { seccionEscuadra, seccionRomo } from '../../../src/piezas/seccionPieza';
import type { AdjuntoOrden } from '../../../src/orden/adjuntos';

// PNG 1×1 válido (parseable por doc.getImageProperties sin canvas, jsdom-friendly).
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
import type { Configuracion, Figura } from '../../../src/domain/config';
import type { Material, ResultadoCotizacion } from '../../../src/domain/types';
import { centimos, eurosACentimos, eurosAMilesimas } from '../../../src/domain/money';
import { mm } from '../../../src/domain/units';

const figura: Figura = {
  id: 'figura-1',
  nombre: 'Figura 1 — Peldaño en L',
  estado: 'activa',
  motivoPendiente: null,
  croquisPendiente: true,
  medidas: [
    { id: 'longitud', etiqueta: 'Largo (cm)', minCm: 1, maxCm: null, opcionesCm: null },
    { id: 'fondo', etiqueta: 'Ancho (cm)', minCm: 1, maxCm: null, opcionesCm: null },
    {
      id: 'alturaFrontal',
      etiqueta: 'Altura frontal (cm)',
      minCm: 1,
      maxCm: null,
      opcionesCm: null,
    },
  ],
  componentes: [
    { id: 'tapa', largoDe: 'longitud', anchoDe: 'fondo' },
    { id: 'frontal', largoDe: 'longitud', anchoDe: 'alturaFrontal' },
  ],
  tarifa: {
    tipo: 'porUmbral',
    medida: 'alturaFrontal',
    umbralMm: mm(50),
    tarifaIdMenorOIgual: 'f1-frontal-le5',
    tarifaIdMayor: 'f1-frontal-gt5',
  },
  longitudTarifa: { tipo: 'medida', medida: 'longitud' },
  tarifaAdicional: null, // solo la tabica es compuesta
  suplementos: ['angular-f14', 'ranuras-f14'],
  tienePintado: false,
};

const config: Configuracion = {
  parametros: {
    discoMm: mm(3),
    toleranciaMm: mm(2),
    saneadoPorLadoMm: mm(5),
    mermaPorcentajeDefecto: 10,
    mermaEditable: true,
    mermaLadoMenorCm: 60,
    mermaPorcentajeLadoMenor: 10,
    mermaLadoMayorCm: 120,
    mermaPorcentajeLadoMayor: 20,
    mermaExtraFiguraPuntos: 5,
    mermaFigurasConExtra: ['figura-1'],
    arranqueCentimos: eurosACentimos(60),
    ivaPorcentaje: 21,
  },
  tarifas: {
    'f1-frontal-le5': {
      id: 'f1-frontal-le5',
      nombre: 'Figura 1 — frontal ≤ 5 cm',
      milesimasPorCm: eurosAMilesimas(0.19),
    },
  },
  suplementos: {
    'angular-f14': {
      id: 'angular-f14',
      nombre: 'Angular',
      tipo: 'porPieza',
      precioCentimos: eurosACentimos(2),
      precioMilesimasPorCm: null,
    },
    'ranuras-f14': {
      id: 'ranuras-f14',
      nombre: 'Tres ranuras antideslizantes',
      tipo: 'porCm',
      precioCentimos: null,
      precioMilesimasPorCm: eurosAMilesimas(0.02),
    },
  },
  figuras: [figura],
  margenes: { longitudSubfamilia: 4, subfamilias: {} },
};

const material: Material = {
  referencia: 'KALOS BLANCO 60/120',
  descripcion: 'Kalos Blanco Mate',
  marca: 'Stn Cerámica',
  formato: { largoMm: mm(1200), anchoMm: mm(600) },
  precioM2Centimos: eurosACentimos(18.5),
  precioUnidadCentimos: null,
  piezasPorCaja: 2,
  m2PorCaja: 1.44,
  subfamilia: null,
  imagenUrl: null,
  esManual: false,
};

const resultado: ResultadoCotizacion = {
  componentes: [
    { id: 'tapa', largoMm: mm(1000), anchoMm: mm(300) },
    { id: 'frontal', largoMm: mm(1000), anchoMm: mm(40) },
  ],
  ocupacion: {
    ocupacionMm: mm(576),
    dimensionUtilMm: mm(600),
    numCortes: 2,
    baldosaGirada: false,
    piezasPorBaldosa: 1,
  },
  baldosasNecesarias: 4,
  baldosasConMerma: 5,
  // Coherente con la facturación por cajas: 5 baldosas / 2 por caja → 3 cajas
  // (6 piezas, 4,32 m²). `cajasFacturadas: 0` ya no es un estado posible.
  unidadesFacturadas: 6,
  cajasFacturadas: 3,
  m2Facturados: 4.32,
  lineasManipulacion: [
    { concepto: 'Figura 1 — frontal ≤ 5 cm · 1000 cm lineales', centimos: centimos(19000) },
    { concepto: 'Angular · 5 piezas', centimos: centimos(1000) },
  ],
  desglose: {
    materialCentimos: centimos(7992), // 4,32 m² × 18,50 €/m²
    manipulacionCentimos: centimos(20000),
    arranqueCentimos: centimos(6000),
    totalSinIvaCentimos: centimos(33992),
    ivaCentimos: centimos(7138), // half-up de 339,92 × 0,21 = 71,3832
    totalConIvaCentimos: centimos(41130),
  },
  precioMaterialOriginal: centimos(1850),
  margen: {
    tipo: 'pvp',
    centesimas: 6600,
    subfamilia: '9411',
    nombreSubfamilia: 'CASA INFINITA',
    manual: false,
  },
};

const datosBase: DatosOrdenTrabajo = {
  material,
  figura,
  medidasMm: { longitud: mm(1000), fondo: mm(300), alturaFrontal: mm(40) },
  cantidad: 5,
  suplementosActivos: ['angular-f14', 'ranuras-f14'],
  pintado: false,
  precioMaterialEditadoEuros: '',
  mermaPorcentaje: 10,
  resultado,
  config,
  fecha: new Date(2026, 5, 9, 14, 7), // 9 de junio de 2026, 14:07 (hora local)
};

describe('croquis de la pieza y código de orden', () => {
  // La orden tiene que caber en UNA página: el total con IVA quedaba huérfano en
  // una segunda página casi vacía, y el croquis + el pie de control apretaron más.
  it('cabe en una página con el croquis, incluso en el caso más largo (Figura 4)', () => {
    const seccion = seccionEscuadra({
      fondo: 32,
      alto: 7,
      grosor: 1,
      dientes: 0,
      retorno: 4,
      espejo: false,
    });
    const figura4: Figura = {
      ...figura,
      medidas: [
        ...figura.medidas,
        { id: 'retorno', etiqueta: 'Retorno (cm)', minCm: 1, maxCm: null, opcionesCm: null },
      ],
      componentes: [
        ...figura.componentes,
        { id: 'retorno', largoDe: 'longitud', anchoDe: 'retorno' },
      ],
    };
    const doc = construirPdfOrdenTrabajo({
      ...datosBase,
      figura: figura4,
      medidasMm: { ...datosBase.medidasMm, retorno: mm(40) },
      resultado: {
        ...resultado,
        componentes: [...resultado.componentes, { id: 'retorno', largoMm: mm(1000), anchoMm: mm(40) }],
      },
      logoDataUrl: PNG_1X1,
      seccion,
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('dibuja también una sección con arcos (media caña del peldaño romo)', () => {
    const seccion = seccionRomo({ fondo: 33, grosor: 1, doble: true });
    const doc = construirPdfOrdenTrabajo({ ...datosBase, seccion });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('sin sección el PDF se genera igual, solo sin croquis', () => {
    expect(construirPdfOrdenTrabajo({ ...datosBase, seccion: null }).getNumberOfPages()).toBe(1);
  });

  it('con comentarios, sigue siendo una sola página', () => {
    const doc = construirPdfOrdenTrabajo({
      ...datosBase,
      comentarios:
        'Cortar el frontal a 45° en las dos piezas de esquina. El cliente recoge el ' +
        'viernes en Castellbisbal; avisar a Marcel. Ojo con la veta: las 12 piezas ' +
        'tienen que salir de la misma partida y sin mezclar tonos.',
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('sin comentarios no se imprime el bloque y cabe igual', () => {
    expect(construirPdfOrdenTrabajo({ ...datosBase, comentarios: '' }).getNumberOfPages()).toBe(1);
    expect(construirPdfOrdenTrabajo({ ...datosBase, comentarios: '   ' }).getNumberOfPages()).toBe(1);
  });

  it('el peor caso (4 suplementos + comentarios largos) sigue en una página', () => {
    const doc = construirPdfOrdenTrabajo({
      ...datosBase,
      suplementosActivos: ['angular-f14', 'ranuras-f14', 'goteron-f14', 'espesado-f14'],
      unidadesSuplemento: { 'angular-f14': 2 },
      comentarios: 'Aviso largo. '.repeat(30),
      resultado: {
        ...resultado,
        lineasManipulacion: [
          ...resultado.lineasManipulacion,
          { concepto: 'Ranura (goterón) — 50 cm × 5 ud.', centimos: centimos(500) },
          { concepto: 'Material espesado — 50 cm × 5 ud.', centimos: centimos(1500) },
          { concepto: 'Tres ranuras antideslizantes — 50 cm × 5 ud.', centimos: centimos(500) },
        ],
      },
      logoDataUrl: PNG_1X1,
      imagenMaterialDataUrl: PNG_1X1,
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('el código de orden usa el mismo sello fecha-hora que el nombre del archivo', () => {
    expect(codigoOrdenTrabajo(datosBase)).toBe('OT-20260609-1407');
    expect(nombreArchivoOrdenTrabajo(datosBase)).toContain('20260609-1407');
  });
});

describe('construirPdfOrdenTrabajo', () => {
  it('construye el documento sin lanzar y con al menos una página', () => {
    const doc = construirPdfOrdenTrabajo(datosBase);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('genera también con material manual, precio editado y croquis provisional', () => {
    const materialManual: Material = {
      referencia: 'MANUAL-01',
      descripcion: 'Pieza suelta de almacén',
      marca: null,
      formato: { largoMm: mm(600), anchoMm: mm(600) },
      precioM2Centimos: null,
      precioUnidadCentimos: eurosACentimos(9.75),
      piezasPorCaja: null,
      m2PorCaja: null,
      subfamilia: null,
      imagenUrl: null,
      esManual: true,
    };
    const datos: DatosOrdenTrabajo = {
      ...datosBase,
      material: materialManual,
      pintado: true,
      precioMaterialEditadoEuros: '8,50',
      mermaPorcentaje: 12.5,
      resultado: { ...resultado, cajasFacturadas: 3, unidadesFacturadas: 6 },
      fecha: new Date(2026, 0, 31, 9, 30),
    };
    const doc = construirPdfOrdenTrabajo(datos);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('incluye el logo y la foto del material cuando llegan como data URL', () => {
    const doc = construirPdfOrdenTrabajo({
      ...datosBase,
      logoDataUrl: PNG_1X1,
      imagenMaterialDataUrl: PNG_1X1,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});

describe('generarPdfOrdenTrabajo', () => {
  // El logo y las fotos se cachean a nivel de módulo: sin vaciarlas, el primer
  // caso que descarga el logo deja a los siguientes sin `fetch` que contar.
  beforeEach(() => {
    reiniciarCacheImagenes();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function pngComoBlob(): Blob {
    const base64 = PNG_1X1.split(',')[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: 'image/png' });
  }

  it('carga el logo y la foto del material antes de guardar (una petición cada uno)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => pngComoBlob() }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const datos: DatosOrdenTrabajo = {
      ...datosBase,
      material: { ...datosBase.material, imagenUrl: 'https://ferrolan.es/1/foto.jpg' },
    };
    const nombre = await generarPdfOrdenTrabajo(datos);

    expect(nombre).toBe(nombreArchivoOrdenTrabajo(datos));
    // El logo cuelga de la base pública (la app se sirve bajo /atelier-studio/):
    // con ruta absoluta a la raíz daba 404 en producción y el PDF perdía el logo.
    expect(fetchMock).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}ferrolan-logo.png`);
    expect(fetchMock).toHaveBeenCalledWith('https://ferrolan.es/1/foto.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sin imagenUrl en el material, solo pide el logo', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => pngComoBlob() }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await generarPdfOrdenTrabajo(datosBase); // datosBase.material.imagenUrl === null
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // El logo cuelga de la base pública (la app se sirve bajo /atelier-studio/):
    // con ruta absoluta a la raíz daba 404 en producción y el PDF perdía el logo.
    expect(fetchMock).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}ferrolan-logo.png`);
  });

  it('si falla la descarga de las imágenes (red caída), genera el PDF igualmente', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('red caída');
      }),
    );
    await expect(generarPdfOrdenTrabajo(datosBase)).resolves.toBe(nombreArchivoOrdenTrabajo(datosBase));
  });

  // El logo y las fotos se cachean entre generaciones (la URL del logo es fija y
  // rehacer el data URL en cada PDF era trabajo tirado). Lo delicado es que un
  // fallo NO se cachee: si no, una caída de red dejaría los PDF sin logo para el
  // resto de la sesión.
  it('el logo se descarga una sola vez aunque se generen varios PDF', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => pngComoBlob() }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await generarPdfOrdenTrabajo(datosBase);
    await generarPdfOrdenTrabajo(datosBase);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un fallo de red no se cachea: el PDF siguiente vuelve a intentar el logo', async () => {
    const fallo = vi.fn(async () => {
      throw new Error('red caída');
    });
    vi.stubGlobal('fetch', fallo);
    await generarPdfOrdenTrabajo(datosBase);
    expect(fallo).toHaveBeenCalledTimes(1);

    // Vuelve la red: el logo tiene que pedirse otra vez, no quedarse en null.
    const ok = vi.fn(async () => ({ ok: true, blob: async () => pngComoBlob() }) as unknown as Response);
    vi.stubGlobal('fetch', ok);
    await generarPdfOrdenTrabajo(datosBase);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('la foto del material se cachea por URL', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => pngComoBlob() }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const conFoto: DatosOrdenTrabajo = {
      ...datosBase,
      material: { ...datosBase.material, imagenUrl: 'https://ferrolan.es/1/foto.jpg' },
    };

    await generarPdfOrdenTrabajo(conFoto);
    await generarPdfOrdenTrabajo(conFoto);

    // Logo + foto una vez cada uno, no dos.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

/**
 * Adjuntos de la orden. Lo que se comprueba es el reparto: TODOS se citan por
 * nombre en la hoja, y solo los que son imagen añaden página (jsPDF no fusiona
 * documentos). Y que un adjunto ilegible no impide generar el PDF.
 */
describe('adjuntos', () => {
  const imagen: AdjuntoOrden = {
    id: 'adjunto-1',
    nombre: 'plano-cliente.png',
    tipoMime: 'image/png',
    bytes: 70,
    dataUrl: PNG_1X1,
  };
  const documento: AdjuntoOrden = {
    id: 'adjunto-2',
    nombre: 'medicion.pdf',
    tipoMime: 'application/pdf',
    bytes: 2048,
    dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
  };

  /** El PDF se genera sin comprimir, así que los textos se pueden buscar en crudo. */
  function textoDelPdf(datos: DatosOrdenTrabajo): string {
    return construirPdfOrdenTrabajo(datos).output();
  }

  it('cita todos los adjuntos por nombre en la hoja', () => {
    const salida = textoDelPdf({ ...datosBase, adjuntos: [imagen, documento] });
    expect(salida).toContain('Adjuntos');
    expect(salida).toContain('plano-cliente.png');
    expect(salida).toContain('medicion.pdf');
    // Los que no se pueden incrustar se marcan: en taller tienen que saber que
    // existe un archivo que no está impreso en la hoja.
    expect(salida).toContain('aparte');
  });

  it('añade una página por cada adjunto que es imagen', () => {
    expect(
      construirPdfOrdenTrabajo({ ...datosBase, adjuntos: [imagen] }).getNumberOfPages(),
    ).toBe(2);
    expect(
      construirPdfOrdenTrabajo({
        ...datosBase,
        adjuntos: [imagen, { ...imagen, id: 'adjunto-3', nombre: 'obra.jpg' }],
      }).getNumberOfPages(),
    ).toBe(3);
  });

  it('las páginas de adjunto se numeran y llevan el código de la orden', () => {
    const salida = textoDelPdf({ ...datosBase, adjuntos: [imagen, documento] });
    // 1/1: el PDF del cliente no cuenta, porque no genera página.
    expect(salida).toContain('ADJUNTO 1/1');
    expect(salida).toContain('OT-20260609-1407');
  });

  it('un adjunto que no es imagen no añade página, solo la cita', () => {
    const doc = construirPdfOrdenTrabajo({ ...datosBase, adjuntos: [documento] });
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.output()).toContain('medicion.pdf');
  });

  it('sin adjuntos la hoja no cambia: una página y sin bloque de comentarios', () => {
    expect(construirPdfOrdenTrabajo({ ...datosBase, adjuntos: [] }).getNumberOfPages()).toBe(1);
    expect(construirPdfOrdenTrabajo({ ...datosBase, adjuntos: [] }).output()).not.toContain(
      'Adjuntos',
    );
  });

  /**
   * Con adjuntos pero sin comentarios el bloque se imprime igual: si no, los
   * nombres de los documentos no saldrían en ninguna parte de la hoja.
   */
  it('imprime el bloque de comentarios aunque solo haya adjuntos', () => {
    const salida = textoDelPdf({ ...datosBase, comentarios: '', adjuntos: [documento] });
    expect(salida).toContain('COMENTARIOS PARA TALLER');
    expect(salida).toContain('medicion.pdf');
  });

  /**
   * Igual que el logo o la foto del material cuando falla la descarga: un adjunto
   * ilegible NO puede impedir que salga la orden de trabajo.
   */
  it('un data URL corrupto se salta sin romper la generación', () => {
    const corrupto: AdjuntoOrden = {
      ...imagen,
      nombre: 'roto.png',
      dataUrl: 'data:image/png;base64,esto-no-es-un-png',
    };
    const doc = construirPdfOrdenTrabajo({ ...datosBase, adjuntos: [corrupto, imagen] });
    // La imagen buena sí sale; la corrupta no añade página.
    expect(doc.getNumberOfPages()).toBe(2);
    expect(doc.output()).toContain('roto.png'); // pero se cita en la hoja
  });

  it('con el máximo de adjuntos y comentarios largos, la HOJA sigue siendo una página', () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({
      ...documento,
      id: `adjunto-${i}`,
      nombre: `documento-de-nombre-muy-largo-del-cliente-${i}.pdf`,
    }));
    const doc = construirPdfOrdenTrabajo({
      ...datosBase,
      comentarios: 'Aviso largo. '.repeat(30),
      adjuntos: seis,
    });
    // Ninguno es imagen: si la lista se hubiera desbordado, no lo veríamos aquí,
    // pero sí que el conteo de páginas sigue en la hoja sola.
    expect(doc.getNumberOfPages()).toBe(1);
  });
});

describe('nombreArchivoOrdenTrabajo', () => {
  it('produce orden-trabajo_<referencia>_<AAAAMMDD-HHmm>.pdf con la referencia saneada', () => {
    expect(nombreArchivoOrdenTrabajo(datosBase)).toBe(
      'orden-trabajo_KALOS-BLANCO-60-120_20260609-1407.pdf',
    );
  });

  it('usa la fecha/hora local con ceros a la izquierda', () => {
    expect(nombreArchivoOrdenTrabajo({ ...datosBase, fecha: new Date(2026, 0, 5, 9, 7) })).toBe(
      'orden-trabajo_KALOS-BLANCO-60-120_20260105-0907.pdf',
    );
  });
});
