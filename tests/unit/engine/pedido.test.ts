/**
 * Pedido con varias piezas (`calcularPedido`).
 *
 * Lo que de verdad se comprueba aquí es la razón de ser del pedido: que las
 * CAJAS se cuenten una vez por artículo y no una vez por corte. El resto de la
 * aritmética (ocupación, merma, tarifas, márgenes) ya tiene sus tests y no se
 * repite: lo que se verifica es que el pedido no la altera.
 *
 * Margen 0 a propósito, como en `cotizacion.test.ts`: así los importes esperados
 * son el coste y se leen.
 */

import { describe, expect, it } from 'vitest';
import { calcularCotizacion } from '../../../src/domain/engine/cotizacion';
import { calcularPedido, claveGrupoMaterial } from '../../../src/domain/engine/pedido';
import { centimos } from '../../../src/domain/money';
import { mm } from '../../../src/domain/units';
import { cargarConfigReal, entradaBase, materialErp, materialManual } from './util';

const config = cargarConfigReal();

/** Extrae el resultado o falla el test con los mensajes del motor. */
function exigirOk(salida: ReturnType<typeof calcularPedido>) {
  if (!salida.ok) {
    throw new Error(
      `El pedido no cotizó: ${salida.errores.map((e) => e.error.mensaje).join(' | ')}`,
    );
  }
  return salida.resultado;
}

describe('calcularPedido — una sola línea', () => {
  it('da exactamente lo mismo que calcularCotizacion', () => {
    const entrada = entradaBase();
    const pedido = exigirOk(calcularPedido([entrada], config));
    const suelta = calcularCotizacion(entrada, config);
    if (!suelta.ok) throw new Error('la cotización suelta debería ser válida');

    expect(pedido.desglose).toEqual(suelta.resultado.desglose);
    expect(pedido.grupos).toHaveLength(1);
    expect(pedido.grupos[0].cajasFacturadas).toBe(suelta.resultado.cajasFacturadas);
    expect(pedido.grupos[0].unidadesFacturadas).toBe(suelta.resultado.unidadesFacturadas);
    expect(pedido.grupos[0].m2Facturados).toBe(suelta.resultado.m2Facturados);
    expect(pedido.lineas[0].lineasManipulacion).toEqual(suelta.resultado.lineasManipulacion);
    expect(pedido.lineas[0].baldosasConMerma).toBe(suelta.resultado.baldosasConMerma);
  });

  it('no anuncia ahorro donde no lo hay', () => {
    const pedido = exigirOk(calcularPedido([entradaBase()], config));
    expect(pedido.cajasAhorradas).toBe(0);
    expect(pedido.ahorroCentimos).toBe(0);
    expect(pedido.totalSinAgruparCentimos).toBe(pedido.desglose.totalSinIvaCentimos);
  });
});

describe('calcularPedido — cajas compartidas (la razón de ser del pedido)', () => {
  // Material de 4 piezas por caja: dos cortes distintos que necesitan 1 baldosa
  // cada uno caben de sobra en UNA caja.
  const pocasPiezas = { cantidad: 1, mermaPorcentaje: 0 } as const;

  it('cuenta las cajas una vez por artículo, no una por corte', () => {
    const a = entradaBase({ ...pocasPiezas, figuraId: 'figura-2' });
    const b = entradaBase({
      ...pocasPiezas,
      figuraId: 'figura-1',
      medidasMm: { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(40) },
    });

    const pedido = exigirOk(calcularPedido([a, b], config));
    expect(pedido.grupos).toHaveLength(1);
    const [grupo] = pedido.grupos;

    // Cada línea sigue necesitando su propia baldosa (no se mezclan cortes).
    expect(pedido.lineas.map((l) => l.baldosasConMerma)).toEqual([1, 1]);
    expect(grupo.baldosasConMerma).toBe(2);
    // Pero las 2 baldosas salen de UNA caja de 4, no de dos cajas.
    expect(grupo.cajasFacturadas).toBe(1);
    expect(grupo.cajasSinAgrupar).toBe(2);
    expect(grupo.unidadesFacturadas).toBe(4);
    expect(grupo.baldosasSobrantes).toBe(2);
    expect(pedido.cajasAhorradas).toBe(1);
  });

  it('el ahorro es la diferencia real con cotizar cada pieza por separado', () => {
    const a = entradaBase({ ...pocasPiezas, figuraId: 'figura-2' });
    const b = entradaBase({ ...pocasPiezas, figuraId: 'figura-1' });
    const pedido = exigirOk(calcularPedido([a, b], config));

    const sueltaA = calcularCotizacion(a, config);
    const sueltaB = calcularCotizacion(b, config);
    if (!sueltaA.ok || !sueltaB.ok) throw new Error('las sueltas deberían cotizar');
    const sumaSueltas =
      sueltaA.resultado.desglose.totalSinIvaCentimos +
      sueltaB.resultado.desglose.totalSinIvaCentimos;

    expect(pedido.totalSinAgruparCentimos).toBe(sumaSueltas);
    expect(pedido.ahorroCentimos).toBe(sumaSueltas - pedido.desglose.totalSinIvaCentimos);
    expect(pedido.ahorroCentimos).toBeGreaterThan(0);
  });

  it('llena cajas enteras antes de abrir la siguiente', () => {
    // 5 líneas de 1 baldosa cada una, en cajas de 4 → 2 cajas, no 5.
    const lineas = Array.from({ length: 5 }, () => entradaBase({ ...pocasPiezas }));
    const pedido = exigirOk(calcularPedido(lineas, config));
    const [grupo] = pedido.grupos;
    expect(grupo.baldosasConMerma).toBe(5);
    expect(grupo.cajasFacturadas).toBe(2);
    expect(grupo.cajasSinAgrupar).toBe(5);
    expect(grupo.unidadesFacturadas).toBe(8);
    expect(pedido.cajasAhorradas).toBe(3);
  });

  it('no comparte caja entre artículos distintos', () => {
    const a = entradaBase({ ...pocasPiezas });
    const b = entradaBase({
      ...pocasPiezas,
      material: materialErp({ referencia: 'TEST-OTRO' }),
    });
    const pedido = exigirOk(calcularPedido([a, b], config));
    expect(pedido.grupos).toHaveLength(2);
    expect(pedido.grupos.map((g) => g.cajasFacturadas)).toEqual([1, 1]);
    expect(pedido.cajasAhorradas).toBe(0);
  });

  it('agrupa material manual igual que el del catálogo', () => {
    const manual = materialManual();
    const a = entradaBase({ ...pocasPiezas, material: manual });
    const b = entradaBase({ ...pocasPiezas, material: manual, figuraId: 'figura-1' });
    const pedido = exigirOk(calcularPedido([a, b], config));
    expect(pedido.grupos).toHaveLength(1);
    expect(pedido.grupos[0].cajasFacturadas).toBe(1);
    // Material manual: precio por unidad × unidades facturadas (4 × 8 €).
    expect(pedido.grupos[0].materialCentimos).toBe(centimos(3200));
  });
});

describe('calcularPedido — arranque de máquina', () => {
  const pocasPiezas = { cantidad: 1, mermaPorcentaje: 0 } as const;

  it('cobra uno solo cuando todas las piezas salen del mismo material', () => {
    const lineas = [
      entradaBase({ ...pocasPiezas, figuraId: 'figura-2' }),
      entradaBase({ ...pocasPiezas, figuraId: 'figura-1' }),
      entradaBase({ ...pocasPiezas, figuraId: 'figura-2' }),
    ];
    const pedido = exigirOk(calcularPedido(lineas, config));
    expect(pedido.desglose.arranqueCentimos).toBe(config.parametros.arranqueCentimos);
  });

  it('cobra uno por material cuando hay varios', () => {
    const lineas = [
      entradaBase({ ...pocasPiezas }),
      entradaBase({ ...pocasPiezas, material: materialErp({ referencia: 'TEST-OTRO' }) }),
    ];
    const pedido = exigirOk(calcularPedido(lineas, config));
    expect(pedido.desglose.arranqueCentimos).toBe(config.parametros.arranqueCentimos * 2);
  });
});

describe('calcularPedido — totales y determinismo', () => {
  it('el total sin IVA es la suma exacta de sus partes', () => {
    const lineas = [
      entradaBase({ cantidad: 3 }),
      entradaBase({ cantidad: 2, figuraId: 'figura-1' }),
      entradaBase({ cantidad: 1, material: materialErp({ referencia: 'TEST-OTRO' }) }),
    ];
    const { desglose, grupos, lineas: calculadas } = exigirOk(calcularPedido(lineas, config));

    const material = grupos.reduce((a, g) => a + g.materialCentimos, 0);
    const manipulacion = calculadas.reduce((a, l) => a + l.manipulacionCentimos, 0);
    const arranque = grupos.reduce((a, g) => a + g.arranqueCentimos, 0);

    expect(desglose.materialCentimos).toBe(material);
    expect(desglose.manipulacionCentimos).toBe(manipulacion);
    expect(desglose.arranqueCentimos).toBe(arranque);
    expect(desglose.totalSinIvaCentimos).toBe(material + manipulacion + arranque);
    expect(desglose.totalConIvaCentimos).toBe(
      desglose.totalSinIvaCentimos + desglose.ivaCentimos,
    );
  });

  it('cada línea de manipulación suma su total (redondeo línea a línea)', () => {
    const pedido = exigirOk(
      calcularPedido([entradaBase({ cantidad: 3, suplementos: [] })], config),
    );
    for (const linea of pedido.lineas) {
      const suma = linea.lineasManipulacion.reduce((a, l) => a + l.centimos, 0);
      expect(linea.manipulacionCentimos).toBe(suma);
    }
  });

  it('mismo input → mismo resultado', () => {
    const lineas = [entradaBase(), entradaBase({ figuraId: 'figura-1', cantidad: 2 })];
    expect(calcularPedido(lineas, config)).toEqual(calcularPedido(lineas, config));
  });

  it('el orden de los grupos es el de primera aparición', () => {
    const otro = materialErp({ referencia: 'TEST-OTRO' });
    const pedido = exigirOk(
      calcularPedido(
        [
          entradaBase({ material: otro }),
          entradaBase(),
          entradaBase({ material: otro, figuraId: 'figura-1' }),
        ],
        config,
      ),
    );
    expect(pedido.grupos.map((g) => g.material.referencia)).toEqual(['TEST-OTRO', 'TEST-6060']);
    expect(pedido.grupos[0].indicesLinea).toEqual([0, 2]);
    expect(pedido.grupos[1].indicesLinea).toEqual([1]);
  });
});

describe('calcularPedido — errores como valor', () => {
  it('rechaza un pedido vacío sin lanzar', () => {
    const salida = calcularPedido([], config);
    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.errores[0].indiceLinea).toBeNull();
    expect(salida.errores[0].error.mensaje).toMatch(/ninguna pieza/i);
  });

  it('señala en qué línea está cada error', () => {
    const salida = calcularPedido(
      [entradaBase(), entradaBase({ cantidad: 0 }), entradaBase({ figuraId: 'no-existe' })],
      config,
    );
    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.errores.map((e) => e.indiceLinea)).toEqual([1, 2]);
  });

  it('no cotiza si dos piezas del mismo artículo discrepan en «azulejos no incluidos»', () => {
    const salida = calcularPedido(
      [entradaBase(), entradaBase({ azulejosNoIncluidos: true })],
      config,
    );
    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.errores[0].error.mensaje).toMatch(/azulejos no incluidos/i);
  });

  it('no cotiza si dos piezas del mismo artículo llevan distinto margen', () => {
    const salida = calcularPedido(
      [entradaBase(), entradaBase({ margenManualCentesimas: 5000 })],
      config,
    );
    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.errores[0].error.mensaje).toMatch(/distinto margen/i);
  });

  it('«azulejos no incluidos» en las dos líneas sí cotiza, y el material sale a 0', () => {
    const pedido = exigirOk(
      calcularPedido(
        [
          entradaBase({ azulejosNoIncluidos: true }),
          entradaBase({ azulejosNoIncluidos: true, figuraId: 'figura-1' }),
        ],
        config,
      ),
    );
    expect(pedido.grupos).toHaveLength(1);
    expect(pedido.grupos[0].azulejosNoIncluidos).toBe(true);
    expect(pedido.grupos[0].materialCentimos).toBe(centimos(0));
    // El precio de tarifa se conserva aunque no se cobre: es dato del artículo.
    expect(pedido.grupos[0].precioMaterial).toBe(centimos(2500));
  });
});

describe('claveGrupoMaterial', () => {
  it('empareja el mismo artículo y separa artículos distintos', () => {
    expect(claveGrupoMaterial(materialErp())).toBe(claveGrupoMaterial(materialErp()));
    expect(claveGrupoMaterial(materialErp())).not.toBe(
      claveGrupoMaterial(materialErp({ referencia: 'OTRA' })),
    );
  });

  it('separa artículos con datos de caja incoherentes en vez de mezclarlos', () => {
    expect(claveGrupoMaterial(materialErp())).not.toBe(
      claveGrupoMaterial(materialErp({ piezasPorCaja: 6 })),
    );
  });

  it('separa el material manual del artículo de catálogo con la misma referencia', () => {
    expect(claveGrupoMaterial(materialErp({ referencia: 'X' }))).not.toBe(
      claveGrupoMaterial(materialManual({ referencia: 'X' })),
    );
  });
});
