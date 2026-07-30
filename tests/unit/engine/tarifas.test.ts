/**
 * Tests de resolución de tarifas y longitud de tarifa contra la configuración
 * real (tarifas del PDF de taller, §2): fija / porUmbral / pintable.
 */

import { figuraPorId, longitudTarifaMm, resolverTarifa } from '../../../src/domain/engine';
import type { Figura } from '../../../src/domain/config';
import type { Mm } from '../../../src/domain/types';
import { mm } from '../../../src/domain/units';
import { cargarConfigReal } from './util';

const config = cargarConfigReal();

function figura(id: string): Figura {
  const f = figuraPorId(config, id);
  if (!f) throw new Error(`Figura '${id}' no encontrada en la configuración de pruebas`);
  return f;
}

function medidas(entradas: Record<string, number>): Record<string, Mm> {
  return Object.fromEntries(Object.entries(entradas).map(([k, v]) => [k, mm(v)]));
}

describe('resolverTarifa — tarifas del PDF por figura (§2)', () => {
  it.each([
    ['figura-2', 'figura-2', 230],
    ['figura-3', 'figura-3', 250],
    ['figura-4', 'figura-4', 290],
    ['peldano-romo', 'peldano-romo', 45],
    ['corte', 'corte', 17],
  ] as const)('%s → tarifa %s de %i milésimas/cm', (figuraId, tarifaId, milesimas) => {
    const f = figura(figuraId);
    const medidasMinimas = medidas(
      Object.fromEntries(f.medidas.map((m) => [m.id, Math.max(10, Math.round(m.minCm * 10))])),
    );
    const tarifa = resolverTarifa(f, medidasMinimas, false, config);
    expect(tarifa.id).toBe(tarifaId);
    expect(tarifa.milesimasPorCm).toBe(milesimas);
  });

  it('Figura 1 con frontal de exactamente 5 cm → tarifa ≤ 5 cm (0,19 €/cm)', () => {
    const tarifa = resolverTarifa(
      figura('figura-1'),
      medidas({ alturaFrontal: 50 }),
      false,
      config,
    );
    expect(tarifa.id).toBe('f1-frontal-le5');
    expect(tarifa.milesimasPorCm).toBe(190);
  });

  it('Figura 1 con frontal de 5,1 cm → tarifa > 5 cm (0,23 €/cm)', () => {
    const tarifa = resolverTarifa(
      figura('figura-1'),
      medidas({ alturaFrontal: 51 }),
      false,
      config,
    );
    expect(tarifa.id).toBe('f1-frontal-gt5');
    expect(tarifa.milesimasPorCm).toBe(230);
  });

  it.each([
    [false, 'rodapie-estandar', 17],
    [true, 'rodapie-estandar-pintado', 25],
  ] as const)(
    'rodapié estándar pintado=%s → %s (%i milésimas/cm)',
    (pintado, tarifaId, milesimas) => {
      const tarifa = resolverTarifa(
        figura('rodapie-estandar'),
        medidas({ longitud: 500, altura: 72 }),
        pintado,
        config,
      );
      expect(tarifa.id).toBe(tarifaId);
      expect(tarifa.milesimasPorCm).toBe(milesimas);
    },
  );

  it.each([
    [false, 'rodapie-no-estandar', 34],
    [true, 'rodapie-no-estandar-pintado', 42],
  ] as const)(
    'rodapié no estándar pintado=%s → %s (%i milésimas/cm)',
    (pintado, tarifaId, milesimas) => {
      const tarifa = resolverTarifa(
        figura('rodapie-no-estandar'),
        medidas({ longitud: 500, altura: 100 }),
        pintado,
        config,
      );
      expect(tarifa.id).toBe(tarifaId);
      expect(tarifa.milesimasPorCm).toBe(milesimas);
    },
  );

  it('figura sin tarifa (pendiente, §6) lanza error de configuración', () => {
    // Sin figuras pendientes en la configuración real (retiradas 2026-07-29):
    // el caso se reproduce con una figura sintética sin regla de tarifa.
    const sinTarifa: Figura = { ...figura('figura-2'), tarifa: null };
    expect(() => resolverTarifa(sinTarifa, {}, false, config)).toThrow(/no tiene tarifa/);
  });
});

describe('longitudTarifaMm', () => {
  it('figuras con regla "medida": la longitud de la pieza', () => {
    expect(longitudTarifaMm(figura('figura-2'), medidas({ longitud: 1234 }))).toBe(1234);
    expect(
      longitudTarifaMm(figura('rodapie-estandar'), medidas({ longitud: 500, altura: 72 })),
    ).toBe(500);
  });

  it('corte: perímetro 2·(largo+ancho) — PROVISIONAL pendiente de croquis', () => {
    expect(longitudTarifaMm(figura('corte'), medidas({ largo: 300, ancho: 200 }))).toBe(1000);
  });

  it('figura sin regla de longitud (pendiente) lanza error de configuración', () => {
    // Las figuras pendientes se retiraron de la galería (2026-07-29); el caso
    // se reproduce con una figura sintética sin regla de longitud (§6.5/§6.6).
    const sinLongitud: Figura = { ...figura('figura-2'), longitudTarifa: null };
    expect(() => longitudTarifaMm(sinLongitud, {})).toThrow(/no tiene regla de longitud/);
  });
});
