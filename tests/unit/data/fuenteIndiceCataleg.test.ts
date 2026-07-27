/**
 * Tests de la fuente real basada en el índice del sitemap
 * (`fuenteIndiceCataleg.ts`): búsqueda local por texto + enriquecido en LOTE
 * al API real, con la imagen del índice prevaleciendo sobre la del API
 * (que no tiene campo de imagen).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearFuenteIndiceCataleg } from '../../../src/data/fuenteIndiceCataleg';

const INDICE_JSON = {
  _aviso: 'generado',
  generadoEn: '2026-07-24T00:00:00Z',
  articulos: [
    { referencia: '94111301', titulo: 'KHAN WHITE MATE 75X75', imagenUrl: 'https://ferrolan.es/1/khan.jpg' },
    { referencia: '94111302', titulo: 'KHAN CREAM MATE 75X75', imagenUrl: 'https://ferrolan.es/2/khan-cream.jpg' },
    { referencia: '11111111', titulo: 'SIN FITXA WEB', imagenUrl: 'https://ferrolan.es/3/sin-fitxa.jpg' },
  ],
};

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: async () => cuerpo,
  } as unknown as Response;
}

function mockFetch(rutas: Record<string, unknown>): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    for (const [patron, cuerpo] of Object.entries(rutas)) {
      if (url.includes(patron)) return respuestaJson(cuerpo);
    }
    throw new Error(`URL no mockeada: ${url}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('crearFuenteIndiceCataleg.buscar', () => {
  it('filtra el índice local por texto y enriquece los candidatos en UNA llamada en lote', async () => {
    const fetchMock = mockFetch({
      '/indice.json': INDICE_JSON,
      'accio=articles': {
        ok: true,
        articles: [
          { codigo: '94111301', descrip: 'Khan White Real', tarp: 30.05, llarg: 75, ample: 75 },
        ],
        no_trobats: [],
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const fuente = crearFuenteIndiceCataleg('/indice.json');
    const { materiales, totalCoincidencias } = await fuente.buscar({
      texto: 'khan white',
      marca: null,
      pagina: 1,
      tamanoPagina: 24,
    });

    expect(totalCoincidencias).toBe(1);
    expect(materiales).toHaveLength(1);
    expect(materiales[0].referencia).toBe('94111301');
    expect(materiales[0].descripcion).toBe('Khan White Real'); // del API real, no del índice
    expect(materiales[0].precioM2Centimos).toBe(3005);
    // La imagen es la del índice (real, PrestaShop), no la del API de catálogo.
    expect(materiales[0].imagenUrl).toBe('https://ferrolan.es/1/khan.jpg');

    const llamadaLote = fetchMock.mock.calls.find((c) => String(c[0]).includes('accio=articles'));
    expect(llamadaLote?.[0]).toContain('codis=94111301');
  });

  it('omite candidatos sin mides reales (no se inventa un formato)', async () => {
    const fetchMock = mockFetch({
      '/indice.json': INDICE_JSON,
      'accio=articles': {
        ok: true,
        articles: [{ codigo: '11111111', descrip: 'Sin fitxa', tarp: 10, llarg: null, ample: null }],
        no_trobats: [],
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const fuente = crearFuenteIndiceCataleg('/indice.json');
    const resultado = await fuente.buscar({ texto: 'sin fitxa', marca: null, pagina: 1, tamanoPagina: 24 });
    expect(resultado.materiales).toEqual([]);
    // La coincidencia local sí existía (1): se omite al enriquecer, no al filtrar.
    expect(resultado.totalCoincidencias).toBe(1);
  });

  it('devuelve [] sin llamar al API si no hay candidatos locales', async () => {
    const fetchMock = mockFetch({ '/indice.json': INDICE_JSON });
    vi.stubGlobal('fetch', fetchMock);

    const fuente = crearFuenteIndiceCataleg('/indice.json');
    const resultado = await fuente.buscar({
      texto: 'no existe ningún producto así',
      marca: null,
      pagina: 1,
      tamanoPagina: 24,
    });
    expect(resultado).toEqual({ materiales: [], totalCoincidencias: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // solo la carga del índice, sin lote
  });

  it('con filtro de marca devuelve [] (el índice no conoce marcas)', async () => {
    vi.stubGlobal('fetch', mockFetch({ '/indice.json': INDICE_JSON }));
    const fuente = crearFuenteIndiceCataleg('/indice.json');
    expect(await fuente.buscar({ texto: '', marca: 'Cualquiera', pagina: 1, tamanoPagina: 24 })).toEqual({
      materiales: [],
      totalCoincidencias: 0,
    });
  });

  it('sin coincidencia local y texto = referencia exacta: consulta directa al API por código', async () => {
    const fetchMock = mockFetch({
      '/indice.json': INDICE_JSON,
      'accio=article': {
        ok: true,
        article: { codigo: '55550001', descrip: 'Solo en ERP, sin web', tarp: 12.5, llarg: 60, ample: 120 },
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const fuente = crearFuenteIndiceCataleg('/indice.json');
    const { materiales, totalCoincidencias } = await fuente.buscar({
      texto: '55550001',
      marca: null,
      pagina: 1,
      tamanoPagina: 24,
    });

    expect(totalCoincidencias).toBe(1);
    expect(materiales).toHaveLength(1);
    expect(materiales[0].referencia).toBe('55550001');
    expect(materiales[0].descripcion).toBe('Solo en ERP, sin web');
    expect(materiales[0].precioM2Centimos).toBe(1250);
    expect(materiales[0].formato).toEqual({ largoMm: 600, anchoMm: 1200 });
    // Sin imagen de índice ni base PrestaShop configurada: imagen null.
    expect(materiales[0].imagenUrl).toBeNull();

    const llamadaDirecta = fetchMock.mock.calls.find((c) => String(c[0]).includes('accio=article&'));
    expect(llamadaDirecta?.[0]).toContain('codi=55550001');
    // Nunca se pide el lote: no había candidatos locales.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('accio=articles'))).toBe(false);
  });

  it('referencia exacta no encontrada en el API (404): devuelve [] sin romper', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/indice.json')) return respuestaJson(INDICE_JSON);
      if (url.includes('accio=article')) return respuestaJson({}, 404);
      throw new Error(`URL no mockeada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const fuente = crearFuenteIndiceCataleg('/indice.json');
    const resultado = await fuente.buscar({ texto: '99999999', marca: null, pagina: 1, tamanoPagina: 24 });
    expect(resultado).toEqual({ materiales: [], totalCoincidencias: 0 });
  });

  it('referencia exacta con artículo sin mides en el API: se omite (Entrada manual)', async () => {
    const fetchMock = mockFetch({
      '/indice.json': INDICE_JSON,
      'accio=article': {
        ok: true,
        article: { codigo: '55550002', descrip: 'Sin fitxa web', tarp: 8, llarg: null, ample: null },
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const fuente = crearFuenteIndiceCataleg('/indice.json');
    const resultado = await fuente.buscar({ texto: '55550002', marca: null, pagina: 1, tamanoPagina: 24 });
    expect(resultado).toEqual({ materiales: [], totalCoincidencias: 0 });
  });

  it('pagina los candidatos locales antes de pedir el lote (respeta TAMANO_PAGINA_MAXIMO)', async () => {
    const fetchMock = mockFetch({
      '/indice.json': INDICE_JSON,
      'accio=articles': {
        ok: true,
        articles: [{ codigo: '94111302', descrip: 'Khan Cream Real', tarp: 20, llarg: 75, ample: 75 }],
        no_trobats: [],
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const fuente = crearFuenteIndiceCataleg('/indice.json');
    // texto vacío = las 3 del índice; página 2 de tamaño 1 → solo la segunda (94111302).
    const { materiales, totalCoincidencias } = await fuente.buscar({
      texto: '',
      marca: null,
      pagina: 2,
      tamanoPagina: 1,
    });
    expect(totalCoincidencias).toBe(3);
    expect(materiales.map((m) => m.referencia)).toEqual(['94111302']);
    const llamadaLote = fetchMock.mock.calls.find((c) => String(c[0]).includes('accio=articles'));
    expect(llamadaLote?.[0]).toContain('codis=94111302');
  });
});

describe('crearFuenteIndiceCataleg.marcas', () => {
  it('siempre devuelve [] (fuerza la carga del índice para detectar fallos pronto)', async () => {
    vi.stubGlobal('fetch', mockFetch({ '/indice.json': INDICE_JSON }));
    const fuente = crearFuenteIndiceCataleg('/indice.json');
    expect(await fuente.marcas()).toEqual([]);
  });

  it('propaga un error claro si el índice no se puede cargar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuestaJson({}, 404)));
    const fuente = crearFuenteIndiceCataleg('/indice.json');
    await expect(fuente.marcas()).rejects.toThrow(/no se pudo cargar el índice/i);
  });
});
