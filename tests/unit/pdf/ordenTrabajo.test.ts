/**
 * Tests del PDF de orden de trabajo: construcción pura del documento (sin save())
 * y nombre de archivo. El `ResultadoCotizacion` se construye a mano.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  construirPdfOrdenTrabajo,
  generarPdfOrdenTrabajo,
  nombreArchivoOrdenTrabajo,
  type DatosOrdenTrabajo,
} from '../../../src/pdf/ordenTrabajo';

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
    { id: 'longitud', etiqueta: 'Longitud (cm)', minCm: 1, maxCm: null, opcionesCm: null },
    { id: 'fondo', etiqueta: 'Fondo (cm)', minCm: 1, maxCm: null, opcionesCm: null },
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
  imagenUrl: null,
  esManual: false,
};

const resultado: ResultadoCotizacion = {
  componentes: [
    { id: 'tapa', largoMm: mm(1000), anchoMm: mm(300) },
    { id: 'frontal', largoMm: mm(1000), anchoMm: mm(40) },
  ],
  ocupacion: { ocupacionMm: mm(576), dimensionUtilMm: mm(600), numCortes: 2, baldosaGirada: false },
  baldosasNecesarias: 4,
  baldosasConMerma: 5,
  unidadesFacturadas: 5,
  cajasFacturadas: 0,
  m2Facturados: 3.6,
  lineasManipulacion: [
    { concepto: 'Figura 1 — frontal ≤ 5 cm · 1000 cm lineales', centimos: centimos(19000) },
    { concepto: 'Angular · 5 piezas', centimos: centimos(1000) },
  ],
  desglose: {
    materialCentimos: centimos(6660),
    manipulacionCentimos: centimos(20000),
    arranqueCentimos: centimos(6000),
    totalSinIvaCentimos: centimos(32660),
    ivaCentimos: centimos(6859),
    totalConIvaCentimos: centimos(39519),
  },
  precioMaterialOriginal: centimos(1850),
};

const datosBase: DatosOrdenTrabajo = {
  material,
  origen: 'stock',
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

describe('construirPdfOrdenTrabajo', () => {
  it('construye el documento sin lanzar y con al menos una página', () => {
    const doc = construirPdfOrdenTrabajo(datosBase);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('genera también con material manual, precio editado, origen pedido y croquis provisional', () => {
    const materialManual: Material = {
      referencia: 'MANUAL-01',
      descripcion: 'Pieza suelta de almacén',
      marca: null,
      formato: { largoMm: mm(600), anchoMm: mm(600) },
      precioM2Centimos: null,
      precioUnidadCentimos: eurosACentimos(9.75),
      piezasPorCaja: null,
      m2PorCaja: null,
      imagenUrl: null,
      esManual: true,
    };
    const datos: DatosOrdenTrabajo = {
      ...datosBase,
      material: materialManual,
      origen: 'pedido',
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
    expect(fetchMock).toHaveBeenCalledWith('/ferrolan-logo.png');
    expect(fetchMock).toHaveBeenCalledWith('https://ferrolan.es/1/foto.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sin imagenUrl en el material, solo pide el logo', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => pngComoBlob() }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await generarPdfOrdenTrabajo(datosBase); // datosBase.material.imagenUrl === null
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/ferrolan-logo.png');
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
