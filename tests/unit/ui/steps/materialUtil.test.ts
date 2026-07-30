/**
 * Tests de las utilidades de presentación de materiales (`materialUtil.ts`):
 * formato en cm, datos de caja (piezas/m²) y precio de tarifa.
 */

import { describe, expect, it } from 'vitest';
import type { Material } from '../../../../src/domain/types';
import { eurosACentimos } from '../../../../src/domain/money';
import { mm } from '../../../../src/domain/units';
import { cajaMaterialTexto, formatoMaterialTexto, precioMaterialTexto } from '../../../../src/ui/steps/materialUtil';

function materialBase(): Material {
  return {
    referencia: '77485284',
    descripcion: 'GEOTILES SAHARA NOIR PULIDO 30X60',
    marca: null,
    formato: { largoMm: mm(300), anchoMm: mm(600) },
    precioM2Centimos: eurosACentimos(22.9),
    precioUnidadCentimos: null,
    piezasPorCaja: 6,
    m2PorCaja: 1.08,
    subfamilia: null,
    imagenUrl: null,
    esManual: false,
  };
}

describe('formatoMaterialTexto', () => {
  it('formatea el formato en cm', () => {
    expect(formatoMaterialTexto(materialBase())).toBe('30×60 cm');
  });
});

describe('cajaMaterialTexto', () => {
  it('muestra piezas y m² por caja con formato es-ES', () => {
    expect(cajaMaterialTexto(materialBase())).toBe('6 piezas/caja · 1,08 m²/caja');
  });

  it('muestra solo la parte disponible', () => {
    expect(cajaMaterialTexto({ ...materialBase(), m2PorCaja: null })).toBe('6 piezas/caja');
    expect(cajaMaterialTexto({ ...materialBase(), piezasPorCaja: null })).toBe('1,08 m²/caja');
  });

  it('null si no hay ningún dato de caja (entrada manual)', () => {
    expect(cajaMaterialTexto({ ...materialBase(), piezasPorCaja: null, m2PorCaja: null })).toBeNull();
  });
});

describe('precioMaterialTexto', () => {
  it('€/m² para material de catálogo', () => {
    expect(precioMaterialTexto(materialBase())).toMatch(/\/m²$/);
  });
});
