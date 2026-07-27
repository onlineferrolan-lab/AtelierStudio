/**
 * Tests de la fuente de catálogo de muestra (fetch mockeado):
 * búsqueda de texto libre, filtro por marca, normalización de acentos y
 * conversión de unidades (cm → mm, € → céntimos).
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { crearFuenteMuestra } from '../../../src/data/fuenteMuestra';
import type { FuenteCatalogo } from '../../../src/data/catalogo';

/** Página única lo bastante grande para no truncar en estos tests. */
async function buscarTodo(fuente: FuenteCatalogo, texto: string, marca: string | null) {
  const { materiales } = await fuente.buscar({ texto, marca, pagina: 1, tamanoPagina: 50 });
  return materiales;
}

const FIXTURE = {
  _aviso: 'CATÁLOGO DE MUESTRA — DATOS FALSOS (§7.3)',
  articulos: [
    {
      referencia: 'T-001',
      descripcion: 'Mármol Blanco Macael',
      marca: 'Gres Arlanza',
      formato: { largoCm: 60, anchoCm: 60 },
      precioM2Euros: 18.5,
      piezasPorCaja: 4,
      m2PorCaja: 1.44,
      imagen: null,
    },
    {
      referencia: 'T-002',
      descripcion: 'Terrazo gris baño',
      marca: 'Cerámica Veralta',
      formato: { largoCm: 33.3, anchoCm: 33.3 },
      precioM2Euros: 12.75,
      piezasPorCaja: 9,
      m2PorCaja: 1,
      imagen: '/data/img/terrazo.svg',
    },
    {
      referencia: 'T-003',
      descripcion: 'Cemento Bano antideslizante',
      marca: 'Gres Arlanza',
      formato: { largoCm: 120, anchoCm: 60 },
      precioM2Euros: 26,
      piezasPorCaja: 2,
      m2PorCaja: 1.44,
      imagen: '/data/img/cemento.svg',
    },
  ],
};

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  } as unknown as Response;
}

function mockearFetch(cuerpo: unknown = FIXTURE, status = 200) {
  const fetchMock = vi.fn(async () => respuestaJson(cuerpo, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fuenteMuestra', () => {
  it('tiene origen "muestra" (marcado como falso en UI)', () => {
    mockearFetch();
    expect(crearFuenteMuestra().origen).toBe('muestra');
  });

  it('convierte unidades al cargar: cm → mm enteros y € → céntimos enteros', async () => {
    mockearFetch();
    const fuente = crearFuenteMuestra();
    const todos = await buscarTodo(fuente, '', null);
    expect(todos).toHaveLength(3);

    const marmol = todos.find((m) => m.referencia === 'T-001');
    expect(marmol?.formato).toEqual({ largoMm: 600, anchoMm: 600 });
    expect(marmol?.precioM2Centimos).toBe(1850);
    expect(marmol?.esManual).toBe(false);
    expect(marmol?.precioUnidadCentimos).toBeNull();

    // 33,3 cm → 333 mm exactos, sin floats.
    const terrazo = todos.find((m) => m.referencia === 'T-002');
    expect(terrazo?.formato).toEqual({ largoMm: 333, anchoMm: 333 });
  });

  it('busca por texto libre en descripción, referencia y marca', async () => {
    mockearFetch();
    const fuente = crearFuenteMuestra();
    const porReferencia = await buscarTodo(fuente, 'T-003', null);
    expect(porReferencia.map((m) => m.referencia)).toEqual(['T-003']);

    const porMarca = await buscarTodo(fuente, 'veralta', null);
    expect(porMarca.map((m) => m.referencia)).toEqual(['T-002']);
  });

  it('normaliza acentos y mayúsculas en ambos sentidos', async () => {
    mockearFetch();
    const fuente = crearFuenteMuestra();
    // consulta sin acento, dato con acento
    const sinAcento = await buscarTodo(fuente, 'marmol', null);
    expect(sinAcento.map((m) => m.referencia)).toEqual(['T-001']);
    // consulta con acento y mayúsculas, dato sin acento y viceversa
    const conAcento = await buscarTodo(fuente, 'BAÑO', null);
    expect(conAcento.map((m) => m.referencia).sort()).toEqual(['T-002', 'T-003']);
  });

  it('exige todos los términos del texto (búsqueda multi-palabra)', async () => {
    mockearFetch();
    const fuente = crearFuenteMuestra();
    const resultado = await buscarTodo(fuente, 'marmol macael', null);
    expect(resultado.map((m) => m.referencia)).toEqual(['T-001']);
    const sinResultado = await buscarTodo(fuente, 'marmol terrazo', null);
    expect(sinResultado).toHaveLength(0);
  });

  it('filtra por marca y combina marca + texto', async () => {
    mockearFetch();
    const fuente = crearFuenteMuestra();
    const soloArlanza = await buscarTodo(fuente, '', 'Gres Arlanza');
    expect(soloArlanza.map((m) => m.referencia).sort()).toEqual(['T-001', 'T-003']);

    const combinado = await buscarTodo(fuente, 'cemento', 'Gres Arlanza');
    expect(combinado.map((m) => m.referencia)).toEqual(['T-003']);

    const marcaInexistente = await buscarTodo(fuente, '', 'No Existe');
    expect(marcaInexistente).toHaveLength(0);
  });

  it('devuelve las marcas presentes, únicas y ordenadas', async () => {
    mockearFetch();
    const fuente = crearFuenteMuestra();
    expect(await fuente.marcas()).toEqual(['Cerámica Veralta', 'Gres Arlanza']);
  });

  it('cachea el JSON: varias búsquedas, una sola descarga', async () => {
    const fetchMock = mockearFetch();
    const fuente = crearFuenteMuestra();
    await buscarTodo(fuente, 'marmol', null);
    await buscarTodo(fuente, 'terrazzo', null);
    await fuente.marcas();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falla con mensaje claro si el catálogo no se puede cargar', async () => {
    mockearFetch(FIXTURE, 500);
    const fuente = crearFuenteMuestra();
    await expect(buscarTodo(fuente, '', null)).rejects.toThrow(
      /No se pudo cargar el catálogo de muestra/,
    );
  });

  it('pagina los resultados y cuenta el total de coincidencias', async () => {
    mockearFetch();
    const fuente = crearFuenteMuestra();
    const pagina1 = await fuente.buscar({ texto: '', marca: null, pagina: 1, tamanoPagina: 2 });
    expect(pagina1.materiales).toHaveLength(2);
    expect(pagina1.totalCoincidencias).toBe(3);

    const pagina2 = await fuente.buscar({ texto: '', marca: null, pagina: 2, tamanoPagina: 2 });
    expect(pagina2.materiales).toHaveLength(1);
    expect(pagina2.totalCoincidencias).toBe(3);
  });
});
