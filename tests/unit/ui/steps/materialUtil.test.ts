/**
 * Tests de las utilidades de presentación de materiales (`materialUtil.ts`):
 * formato en cm, datos de caja (piezas/m²) y precio de VENTA (con margen).
 */

import { describe, expect, it } from 'vitest';
import type { Material, ResolucionMargen } from '../../../../src/domain/types';
import { eurosACentimos } from '../../../../src/domain/money';
import { mm } from '../../../../src/domain/units';
import {
  cajaMaterialTexto,
  formatoMaterialTexto,
  precioMaterialVista,
} from '../../../../src/ui/steps/materialUtil';

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

/** Margen resuelto de prueba: `centesimas` en centésimas de punto (6600 = 66 %). */
function margenOk(centesimas: number): ResolucionMargen {
  return {
    ok: true,
    margen: {
      tipo: 'pvp',
      centesimas,
      subfamilia: '7748',
      nombreSubfamilia: 'GEOTILES',
      manual: false,
    },
  };
}

describe('precioMaterialVista', () => {
  it('€/m² para material de catálogo', () => {
    expect(precioMaterialVista(materialBase(), margenOk(0)).texto).toMatch(/\/m²$/);
  });

  /**
   * El precio que se enseña es de VENTA, no la tarifa: 22,90 € de coste con el
   * 66 % de margen son 38,01 € (2290 × 1,66 = 3801,4 → 3801 céntimos, half-up).
   */
  it('aplica el margen a la tarifa (22,90 € al 66 % → 38,01 €)', () => {
    const vista = precioMaterialVista(materialBase(), margenOk(6600));
    expect(vista.texto).toMatch(/^38,01\s€\/m²$/);
    expect(vista.aviso).toBeNull();
  });

  it('con margen 0 % el precio es la tarifa intacta', () => {
    expect(precioMaterialVista(materialBase(), margenOk(0)).texto).toMatch(/^22,90\s€\/m²$/);
  });

  it('aplica el margen también al precio por unidad del material manual', () => {
    const manual: Material = {
      ...materialBase(),
      esManual: true,
      precioM2Centimos: null,
      precioUnidadCentimos: eurosACentimos(10),
    };
    expect(precioMaterialVista(manual, margenOk(5000)).texto).toMatch(/^15,00\s€\/unidad$/);
  });

  /**
   * Sin margen NO se enseña la tarifa: sería un coste con pinta de precio de venta.
   * Se dice qué falta y dónde ponerlo, como hace el motor al negarse a cotizar.
   */
  it('sin margen no muestra precio: avisa con la subfamilia que falta', () => {
    const vista = precioMaterialVista(materialBase(), { ok: false, subfamilia: '7748' });
    expect(vista.texto).toBe('Precio sin margen');
    expect(vista.texto).not.toContain('22,90');
    expect(vista.aviso).toContain('7748');
    expect(vista.aviso).toContain('Parámetros avanzados');
  });

  it('sin subfamilia deducible lo dice igualmente', () => {
    const vista = precioMaterialVista(materialBase(), { ok: false, subfamilia: null });
    expect(vista.texto).toBe('Precio sin margen');
    expect(vista.aviso).toContain('77485284');
  });

  it('sin dato de tarifa no habla de margen', () => {
    const sinPrecio: Material = { ...materialBase(), precioM2Centimos: null };
    const vista = precioMaterialVista(sinPrecio, { ok: false, subfamilia: null });
    expect(vista.texto).toBe('Precio no disponible');
    expect(vista.aviso).toBeNull();
  });
});
