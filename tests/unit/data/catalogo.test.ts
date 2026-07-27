/**
 * Tests de la entrada manual de material (§1.①) y de `obtenerFuenteCatalogo`
 * (siempre el índice real, ver `fuenteIndiceCataleg.test.ts` para el detalle
 * de búsqueda/enriquecido en lote).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearMaterialManual, obtenerFuenteCatalogo, type DatosMaterialManual } from '../../../src/data/catalogo';

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: async () => cuerpo,
  } as unknown as Response;
}

const DATOS: DatosMaterialManual = {
  descripcion: 'Gres rojo cortado a mano',
  largoCm: 33.3,
  anchoCm: 25,
  precioUnidadEuros: 4.5,
  imagenUrl: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('crearMaterialManual', () => {
  it('convierte cm → mm y €/unidad → céntimos, y marca esManual', () => {
    const m = crearMaterialManual(DATOS);
    expect(m.formato).toEqual({ largoMm: 333, anchoMm: 250 });
    expect(m.precioUnidadCentimos).toBe(450);
    expect(m.esManual).toBe(true);
    expect(m.descripcion).toBe('Gres rojo cortado a mano');
    expect(m.imagenUrl).toBeNull();
  });

  it('el material manual no tiene tarifa por m² ni datos de caja', () => {
    const m = crearMaterialManual(DATOS);
    expect(m.precioM2Centimos).toBeNull();
    expect(m.piezasPorCaja).toBeNull();
    expect(m.m2PorCaja).toBeNull();
    expect(m.marca).toBeNull();
  });

  it('genera referencias locales únicas MANUAL-<timestamp>', () => {
    const ahora = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1001);
    const a = crearMaterialManual(DATOS);
    const b = crearMaterialManual(DATOS);
    expect(a.referencia).toBe('MANUAL-1000');
    expect(b.referencia).toBe('MANUAL-1001');
    expect(a.referencia).not.toBe(b.referencia);
    ahora.mockRestore();
  });

  it('conserva la imagen opcional cuando se indica', () => {
    const m = crearMaterialManual({ ...DATOS, imagenUrl: 'blob:foto-local' });
    expect(m.imagenUrl).toBe('blob:foto-local');
  });

  it('valida los campos mínimos con mensajes claros', () => {
    expect(() => crearMaterialManual({ ...DATOS, descripcion: '  ' })).toThrow(/descripción/);
    expect(() => crearMaterialManual({ ...DATOS, largoCm: 0 })).toThrow(/mayores que 0/);
    expect(() => crearMaterialManual({ ...DATOS, anchoCm: -5 })).toThrow(/mayores que 0/);
    expect(() => crearMaterialManual({ ...DATOS, precioUnidadEuros: -1 })).toThrow(/negativo/);
  });
});

describe('obtenerFuenteCatalogo', () => {
  it('devuelve el índice real (origen "cataleg")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuestaJson({ _aviso: '', generadoEn: '', articulos: [] })),
    );
    const fuente = obtenerFuenteCatalogo();
    expect(fuente.origen).toBe('cataleg');
    expect(await fuente.marcas()).toEqual([]);
  });
});
