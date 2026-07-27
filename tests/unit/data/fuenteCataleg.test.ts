/**
 * Tests del cliente del catálogo de cerámica real (§6.13): mapeo de los 31
 * campos documentados (mides nullable, idmarca sin nombre), llamadas al
 * proxy `/api/cataleg/` (fetch mockeado, sin clave — la clave es cosa de
 * nginx/vite.config.ts, no de este módulo) y manejo de 404/429/errores.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mm } from '../../../src/domain/units';
import {
  mapearArticuloCataleg,
  extraerFormatoDeDescripcion,
  piezasPorCajaDesdeEncaixat,
  obtenerArticuloCataleg,
  obtenerArticulosCataleg,
  consultarSaludCataleg,
  urlImagenPrestashop,
  type ArticuloCatalegJson,
} from '../../../src/data/fuenteCataleg';

const ARTICULO_CON_MIDES: ArticuloCatalegJson = {
  codigo: '39265414',
  descrip: 'Peldaño mármol crema',
  seccion: 'CE',
  idmarca: 12,
  tarp: 22.9,
  tarc: 20.1,
  tara: 18.5,
  taradc: 17.0,
  llarg: 120,
  ample: 60,
  peces_caixa: 2,
  encaixat: 1.44,
};

const ARTICULO_SIN_FITXA_WEB: ArticuloCatalegJson = {
  codigo: '11111111',
  descrip: 'Sin fitxa web',
  tarp: 10,
  llarg: null,
  ample: null,
};

function respuestaJson(cuerpo: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(headers),
    json: async () => cuerpo,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mapearArticuloCataleg', () => {
  it('mapea codigo→referencia, descrip→descripcion, tarp→céntimos/m², llarg/ample cm→mm', () => {
    const r = mapearArticuloCataleg(ARTICULO_CON_MIDES, 'https://img.example.com');
    expect(r.tipo).toBe('material');
    if (r.tipo !== 'material') throw new Error('esperaba material');
    expect(r.material.referencia).toBe('39265414');
    expect(r.material.descripcion).toBe('Peldaño mármol crema');
    expect(r.material.precioM2Centimos).toBe(2290);
    expect(r.material.formato).toEqual({ largoMm: 1200, anchoMm: 600 });
    expect(r.material.piezasPorCaja).toBe(2);
    expect(r.material.m2PorCaja).toBe(1.44);
    expect(r.material.imagenUrl).toBe('https://img.example.com/39265414.jpg');
    expect(r.material.esManual).toBe(false);
    // idmarca es un id numérico, no un nombre resuelto: marca queda null.
    expect(r.material.marca).toBeNull();
  });

  it("devuelve 'sin_medidas' (no un formato inventado) cuando llarg/ample son null y la descripción no trae formato", () => {
    const r = mapearArticuloCataleg(ARTICULO_SIN_FITXA_WEB);
    expect(r.tipo).toBe('sin_medidas');
    if (r.tipo !== 'sin_medidas') throw new Error('esperaba sin_medidas');
    expect(r.referencia).toBe('11111111');
    expect(r.descripcion).toBe('Sin fitxa web');
    expect(r.precioM2Centimos).toBe(1000);
  });

  it('sin llarg/ample extrae el formato de la descripción («45X45» → 450×450 mm)', () => {
    const r = mapearArticuloCataleg({
      ...ARTICULO_SIN_FITXA_WEB,
      codigo: '93218891',
      descrip: 'CORTEN BEIGE SEMIPULIDO 45X45 TAU',
    });
    if (r.tipo !== 'material') throw new Error('esperaba material');
    expect(r.material.formato).toEqual({ largoMm: 450, anchoMm: 450 });
    expect(r.material.precioM2Centimos).toBe(1000); // tarp real se conserva
  });

  it('las mides del API mandan sobre el formato de la descripción', () => {
    const r = mapearArticuloCataleg({
      ...ARTICULO_CON_MIDES, // llarg 120, ample 60
      descrip: 'Peldaño mármol crema 33X33',
    });
    if (r.tipo !== 'material') throw new Error('esperaba material');
    expect(r.material.formato).toEqual({ largoMm: 1200, anchoMm: 600 });
  });

  it('admite tarp como string con coma decimal', () => {
    const r = mapearArticuloCataleg({ ...ARTICULO_CON_MIDES, tarp: '22,90' });
    if (r.tipo !== 'material') throw new Error('esperaba material');
    expect(r.material.precioM2Centimos).toBe(2290);
  });

  it('tarp ausente → precioM2Centimos null (el comercial lo edita a mano)', () => {
    const sinTarp = { ...ARTICULO_CON_MIDES };
    delete sinTarp.tarp;
    const r = mapearArticuloCataleg(sinTarp);
    if (r.tipo !== 'material') throw new Error('esperaba material');
    expect(r.material.precioM2Centimos).toBeNull();
  });

  it('falla rápido y con mensaje claro si falta codigo o descrip', () => {
    expect(() => mapearArticuloCataleg({ descrip: 'x', llarg: 60, ample: 60 })).toThrow(/sin 'codigo'/);
    expect(() => mapearArticuloCataleg({ codigo: 'A', llarg: 60, ample: 60 })).toThrow(/sin 'descrip'/);
  });
});

describe('extraerFormatoDeDescripcion', () => {
  it('reconoce «45X45», «60 x 120», «7,2×45» y devuelve mm enteros', () => {
    expect(extraerFormatoDeDescripcion('CORTEN BEIGE SEMIPULIDO 45X45 TAU')).toEqual({
      largoMm: 450,
      anchoMm: 450,
    });
    expect(extraerFormatoDeDescripcion('KALOS BLANCO 60 x 120')).toEqual({ largoMm: 600, anchoMm: 1200 });
    expect(extraerFormatoDeDescripcion('RODAPIÉ 7,2×45 MATE')).toEqual({ largoMm: 72, anchoMm: 450 });
  });

  it('devuelve null sin patrón de formato o con medidas a cero', () => {
    expect(extraerFormatoDeDescripcion('Sin fitxa web')).toBeNull();
    expect(extraerFormatoDeDescripcion('M27 2KY//')).toBeNull();
    expect(extraerFormatoDeDescripcion('PIEZA 0X45')).toBeNull();
  });
});

describe('piezasPorCajaDesdeEncaixat (regla de taller: m²/caja ÷ m²/pieza)', () => {
  it('30x60 con 1,08 m²/caja → 6 piezas (ejemplo de la regla)', () => {
    expect(piezasPorCajaDesdeEncaixat(1.08, { largoMm: mm(300), anchoMm: mm(600) })).toBe(6);
  });

  it('redondea al entero más próximo (datos reales: 1,42/0,2025 = 7,01 → 7; 1,13/0,5625 = 2,01 → 2)', () => {
    expect(piezasPorCajaDesdeEncaixat(1.42, { largoMm: mm(450), anchoMm: mm(450) })).toBe(7);
    expect(piezasPorCajaDesdeEncaixat(1.13, { largoMm: mm(750), anchoMm: mm(750) })).toBe(2);
  });

  it('null si no hay encaixat, es ≤ 0 o saldría menos de 1 pieza', () => {
    expect(piezasPorCajaDesdeEncaixat(null, { largoMm: mm(300), anchoMm: mm(600) })).toBeNull();
    expect(piezasPorCajaDesdeEncaixat(0, { largoMm: mm(300), anchoMm: mm(600) })).toBeNull();
    expect(piezasPorCajaDesdeEncaixat(0.1, { largoMm: mm(750), anchoMm: mm(750) })).toBeNull();
  });

  it('mapearArticuloCataleg calcula piezasPorCaja cuando peces_caixa es null (con formato de la descripción)', () => {
    const r = mapearArticuloCataleg({
      ...ARTICULO_SIN_FITXA_WEB,
      descrip: 'GEOTILES SAHARA NOIR PULIDO 30X60',
      encaixat: 1.08,
    });
    if (r.tipo !== 'material') throw new Error('esperaba material');
    expect(r.material.formato).toEqual({ largoMm: 300, anchoMm: 600 });
    expect(r.material.piezasPorCaja).toBe(6);
    expect(r.material.m2PorCaja).toBe(1.08);
  });

  it('peces_caixa del API manda sobre el cálculo', () => {
    const r = mapearArticuloCataleg({
      ...ARTICULO_CON_MIDES, // llarg 120, ample 60 → 0,72 m²; encaixat 1,44 → daría 2
      peces_caixa: 5,
    });
    if (r.tipo !== 'material') throw new Error('esperaba material');
    expect(r.material.piezasPorCaja).toBe(5);
  });
});

describe('urlImagenPrestashop', () => {
  it('construye <base>/<referencia>.jpg y quita barras sobrantes', () => {
    expect(urlImagenPrestashop('CE-1', 'https://img.example.com/')).toBe('https://img.example.com/CE-1.jpg');
  });

  it('devuelve null sin base configurada', () => {
    expect(urlImagenPrestashop('CE-1', null)).toBeNull();
  });
});

describe('obtenerArticuloCataleg', () => {
  it('consulta /api/cataleg/?accio=article&codi=... sin cabecera de clave (la añade el proxy)', async () => {
    const fetchMock = vi.fn(async () => respuestaJson({ ok: true, article: ARTICULO_CON_MIDES }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await obtenerArticuloCataleg('39265414');
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/cataleg/?accio=article&codi=39265414');
    // Ningún encabezado X-API-Key: este módulo nunca ve la clave (una sola llamada, un solo argumento).
    expect((fetchMock.mock.calls[0] as unknown[]).length).toBe(1);
  });

  it("404 → { ok:false, error:'no_trobat' }", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuestaJson({ ok: false, error: 'no_trobat' }, 404)));
    const r = await obtenerArticuloCataleg('XXX');
    expect(r).toEqual({ ok: false, error: 'no_trobat' });
  });

  it('429 devuelve un error legible con el Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuestaJson({}, 429, { 'Retry-After': '60' })));
    const r = await obtenerArticuloCataleg('X');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('esperaba error');
    expect(r.error).toMatch(/60 s/);
  });

  it('errores de red se devuelven como resultado, no como excepción', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const r = await obtenerArticuloCataleg('X');
    expect(r.ok).toBe(false);
  });
});

describe('obtenerArticulosCataleg', () => {
  it('trocea en tandas de 50 códigos y agrega encontrados/no_trobats', async () => {
    const codigos = Array.from({ length: 120 }, (_, i) => `C${i}`);
    const fetchMock = vi.fn(async (url: string) =>
      respuestaJson({
        ok: true,
        articles: [{ ...ARTICULO_CON_MIDES, codigo: url.includes('C0') ? 'C0' : 'C1' }],
        no_trobats: ['no-existe'],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { encontrados, noEncontrados } = await obtenerArticulosCataleg(codigos);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 120 / 50 → 3 tandas
    expect(noEncontrados).toEqual(['no-existe', 'no-existe', 'no-existe']);
    expect(encontrados.size).toBeGreaterThan(0);
  });
});

describe('consultarSaludCataleg', () => {
  it('mapea articles/actualitzat sin necesitar clave', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuestaJson({ ok: true, articles: 54911, actualitzat: '2026-07-23T09:22:45+00:00' })),
    );
    const salud = await consultarSaludCataleg();
    expect(salud).toEqual({ ok: true, articulos: 54911, actualizado: '2026-07-23T09:22:45+00:00' });
  });
});
