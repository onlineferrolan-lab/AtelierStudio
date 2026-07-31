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
  piezasPorCaja: 8,
  subfamilia: 9411,
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

  it('no tiene tarifa por m² ni marca, pero sí datos de caja', () => {
    const m = crearMaterialManual(DATOS);
    expect(m.precioM2Centimos).toBeNull();
    expect(m.marca).toBeNull();
    // Desde 2026-07-30 se factura por cajas completas: sin estos datos no se
    // podría cotizar un material manual.
    expect(m.piezasPorCaja).toBe(8);
  });

  /**
   * Los m²/caja NO se piden al comercial: se derivan del formato. Importa que el
   * valor derivado sobreviva a la cuantización del motor (Math.round(x × 1e6)),
   * porque de ahí sale el importe del material.
   */
  it('deriva los m²/caja del formato, sin pérdida al cuantizar a mm²', () => {
    const m = crearMaterialManual(DATOS);
    expect(m.m2PorCaja).toBe(0.666); // 8 × 33,3 × 25 cm = 0,666 m²
    expect(Math.round((m.m2PorCaja as number) * 1_000_000)).toBe(8 * 333 * 250);
  });

  /**
   * La subfamilia es la clave del MARGEN comercial, así que desde 2026-07-31 es
   * obligatoria: sin ella el material no se puede cotizar. Antes se recogía como
   * opcional «para el futuro»; ese futuro ya llegó.
   */
  it('guarda la subfamilia, que es de donde sale el margen', () => {
    expect(crearMaterialManual({ ...DATOS, subfamilia: 1420 }).subfamilia).toBe(1420);
  });

  it('rechaza una subfamilia ausente o que no sea un entero', () => {
    expect(() => crearMaterialManual({ ...DATOS, subfamilia: 12.5 })).toThrow(/subfamilia/);
    expect(() => crearMaterialManual({ ...DATOS, subfamilia: -3 })).toThrow(/subfamilia/);
    expect(() =>
      crearMaterialManual({ ...DATOS, subfamilia: null as unknown as number }),
    ).toThrow(/subfamilia/);
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
    expect(() => crearMaterialManual({ ...DATOS, piezasPorCaja: 0 })).toThrow(/piezas por caja/);
    expect(() => crearMaterialManual({ ...DATOS, piezasPorCaja: 2.5 })).toThrow(/piezas por caja/);
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
