/**
 * Merma sugerida por formato (indicación directa 2026-07-31).
 *
 * Los dos extremos que dio dirección son los anclajes del test: «30x60 y
 * menores → 10 %» y «60x120 → 20 %, y de ahí en adelante se queda en 20». En
 * medio, escalado LINEAL sobre el lado mayor.
 *
 * Se fija también el caso que más fácil se malinterpreta: una baldosa de 60x60
 * se queda en el 10 % porque su lado mayor sigue siendo 60, aunque tenga el
 * doble de superficie que la de 30x60. Si algún día se decide que la merma va
 * por superficie y no por lado mayor, este test es el que debe saltar.
 */

import {
  mermaPorFormatoCentesimas,
  mermaSugeridaCentesimas,
  mermaSugeridaPorcentaje,
} from '../../../src/domain/engine';
import { mm } from '../../../src/domain/units';
import { cargarConfigReal } from './util';

const config = cargarConfigReal();
const formato = (largoCm: number, anchoCm: number) => ({
  largoMm: mm(largoCm * 10),
  anchoMm: mm(anchoCm * 10),
});

describe('merma por formato: los extremos que dio dirección', () => {
  it('30x60 y menores → 10 %', () => {
    for (const [largo, ancho] of [
      [30, 60],
      [20, 20],
      [30, 30],
      [45, 45],
      [10, 60],
    ] as const) {
      expect(mermaPorFormatoCentesimas(formato(largo, ancho), config)).toBe(1000);
    }
  });

  it('60x120 → 20 %, y cualquier cosa mayor se queda en 20 %', () => {
    expect(mermaPorFormatoCentesimas(formato(60, 120), config)).toBe(2000);
    expect(mermaPorFormatoCentesimas(formato(120, 120), config)).toBe(2000);
    expect(mermaPorFormatoCentesimas(formato(120, 280), config)).toBe(2000);
    expect(mermaPorFormatoCentesimas(formato(100, 300), config)).toBe(2000);
  });

  /**
   * 60x60 tiene el DOBLE de superficie que 30x60 pero el MISMO lado mayor, así
   * que le toca el mismo 10 %. Es la consecuencia directa de interpolar sobre el
   * lado y no sobre el área.
   */
  it('60x60 se queda en 10 %: manda el lado mayor, no la superficie', () => {
    expect(mermaPorFormatoCentesimas(formato(60, 60), config)).toBe(1000);
    expect(mermaPorFormatoCentesimas(formato(30, 60), config)).toBe(1000);
  });
});

describe('merma por formato: escalado lineal en medio', () => {
  it.each([
    [90, 90, 1500], // punto medio exacto: 10 + (20-10) × (90-60)/60
    [75, 75, 1250],
    [80, 80, 1333], // 16,666… puntos → 1333 centésimas (half-up)
    [100, 100, 1667],
    [60, 90, 1500], // manda el lado mayor: 90 da lo mismo que 90x90
    [29.5, 120, 2000], // el lado mayor es 120 → tope
  ])('%s x %s cm → %i centésimas', (largo, ancho, esperado) => {
    expect(mermaPorFormatoCentesimas(formato(largo, ancho), config)).toBe(esperado);
  });

  it('crece de forma monótona con el lado mayor', () => {
    const lados = [60, 70, 80, 90, 100, 110, 120];
    const valores = lados.map((l) => mermaPorFormatoCentesimas(formato(l, l), config));
    for (let i = 1; i < valores.length; i += 1) {
      expect(valores[i]).toBeGreaterThan(valores[i - 1]);
    }
    expect(valores[0]).toBe(1000);
    expect(valores[valores.length - 1]).toBe(2000);
  });

  it('siempre devuelve centésimas ENTERAS (nada de floats arrastrados)', () => {
    for (let lado = 60; lado <= 120; lado += 0.5) {
      const v = mermaPorFormatoCentesimas(formato(lado, lado), config);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1000);
      expect(v).toBeLessThanOrEqual(2000);
    }
  });
});

describe('extra de las figuras numeradas', () => {
  it('suma 5 PUNTOS, no un 5 % relativo', () => {
    // 30x60 → 10 %; con figura numerada, 15 % (no 10,5 %).
    expect(mermaSugeridaCentesimas(formato(30, 60), 'figura-1', config)).toBe(1500);
    // 60x120 → 20 %; con figura numerada, 25 %. No hay tope por encima del tramo.
    expect(mermaSugeridaCentesimas(formato(60, 120), 'figura-4', config)).toBe(2500);
  });

  it('lo llevan las 8 figuras con número: figura-1..4 y pasamanos-1..4', () => {
    for (const id of [
      'figura-1',
      'figura-2',
      'figura-3',
      'figura-4',
      'pasamanos-1',
      'pasamanos-2',
      'pasamanos-3',
      'pasamanos-4',
    ]) {
      expect(mermaSugeridaCentesimas(formato(30, 60), id, config)).toBe(1500);
    }
  });

  it('NO lo llevan las figuras sin número ni el caso «aún sin figura»', () => {
    for (const id of [
      'peldano-romo',
      'pasamanos-romo',
      'rodapie-estandar',
      'rodapie-no-estandar',
      'corte',
    ]) {
      expect(mermaSugeridaCentesimas(formato(30, 60), id, config)).toBe(1000);
    }
    expect(mermaSugeridaCentesimas(formato(30, 60), null, config)).toBe(1000);
  });
});

describe('mermaSugeridaPorcentaje', () => {
  it('devuelve puntos porcentuales, no centésimas', () => {
    expect(mermaSugeridaPorcentaje(formato(30, 60), null, config)).toBe(10);
    expect(mermaSugeridaPorcentaje(formato(90, 90), null, config)).toBe(15);
    expect(mermaSugeridaPorcentaje(formato(80, 80), null, config)).toBe(13.33);
    expect(mermaSugeridaPorcentaje(formato(60, 120), 'figura-1', config)).toBe(25);
  });
});
