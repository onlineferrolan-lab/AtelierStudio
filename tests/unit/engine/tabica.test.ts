/**
 * Tabica: figura COMPUESTA (indicación directa 2026-07-31).
 *
 * «Una figura 1 con un corte debajo a modo de zócalo; el precio es el de las dos
 * combinadas; los parámetros son independientes salvo el largo, que es común.»
 *
 * Lo que fijan estos tests:
 *  - Que el precio es la SUMA de las dos partes, cada una en su línea y con su
 *    propio redondeo por pieza (no un redondeo sobre otro redondeo).
 *  - Que el largo es COMPARTIDO: la parte de figura 1 se tarifa por el largo y
 *    el zócalo por su perímetro, que usa ese mismo largo.
 *  - Que el zócalo cuenta como un componente más de la MISMA pieza, así que
 *    entra en la ocupación de la baldosa (veta §4) y puede hacer que no quepa.
 */

import { calcularCotizacion, figuraPorId } from '../../../src/domain/engine';
import { seccionTabica, cajaSeccion } from '../../../src/piezas/seccionPieza';
import type { ResultadoCotizacion, SalidaMotor } from '../../../src/domain/types';
import { mm } from '../../../src/domain/units';
import { cargarConfigReal, entradaBase, materialErp } from './util';

const config = cargarConfigReal();

function esperarOk(salida: SalidaMotor): ResultadoCotizacion {
  if (!salida.ok) {
    throw new Error(`Se esperaba ok:true; errores: ${salida.errores.map((e) => e.mensaje).join(' | ')}`);
  }
  return salida.resultado;
}

/** 50 cm de largo, 30 de ancho, caída de 4 y zócalo de 10. */
const medidas = {
  longitud: mm(500),
  fondo: mm(300),
  alturaFrontal: mm(40),
  alturaZocalo: mm(100),
};

describe('la tabica existe y está bien declarada', () => {
  const tabica = figuraPorId(config, 'tabica');

  it('es una figura activa con las cuatro medidas', () => {
    expect(tabica).toBeDefined();
    expect(tabica?.estado).toBe('activa');
    expect(tabica?.medidas.map((m) => m.id)).toEqual([
      'fondo',
      'longitud',
      'alturaFrontal',
      'alturaZocalo',
    ]);
  });

  it('la caída hereda el mínimo de 4 cm de la figura 1', () => {
    expect(tabica?.medidas.find((m) => m.id === 'alturaFrontal')?.minCm).toBe(4);
  });

  it('tiene tres componentes y el largo es el único parámetro compartido', () => {
    expect(tabica?.componentes.map((c) => c.id)).toEqual(['tapa', 'frontal', 'zocalo']);
    // Los tres se tarifan/dibujan a lo largo de la MISMA medida.
    expect(tabica?.componentes.every((c) => c.largoDe === 'longitud')).toBe(true);
    // Y cada uno tiene su propio ancho.
    expect(tabica?.componentes.map((c) => c.anchoDe)).toEqual([
      'fondo',
      'alturaFrontal',
      'alturaZocalo',
    ]);
  });

  it('lleva la segunda tarifa: corte, por el perímetro del zócalo', () => {
    expect(tabica?.tarifaAdicional?.tarifa).toEqual({ tipo: 'fija', tarifaId: 'corte' });
    expect(tabica?.tarifaAdicional?.longitudTarifa).toEqual({
      tipo: 'perimetro',
      largoDe: 'longitud',
      anchoDe: 'alturaZocalo',
    });
  });
});

describe('precio: la suma de las dos partes', () => {
  const r = esperarOk(
    calcularCotizacion(
      entradaBase({ figuraId: 'tabica', medidasMm: medidas, cantidad: 1, mermaPorcentaje: 0 }),
      config,
    ),
  );

  /**
   * A mano, con las tarifas reales:
   *  - Figura 1 con caída de 4 cm (≤ 5) → 0,19 €/cm × 50 cm = 9,50 €.
   *  - Corte del zócalo → 0,017 €/cm × perímetro 2×(50+10) = 120 cm = 2,04 €.
   *  Total manipulación: 11,54 €.
   */
  it('dos líneas de manipulación, una por parte', () => {
    expect(r.lineasManipulacion).toEqual([
      { concepto: 'Figura 1 — frontal ≤ 5 cm — 50 cm × 1 ud.', centimos: 950 },
      { concepto: 'Corte de piezas — 120 cm × 1 ud.', centimos: 204 },
    ]);
    expect(r.desglose.manipulacionCentimos).toBe(1154);
  });

  it('la caída manda sobre la tarifa de la parte «figura 1», como en la figura 1', () => {
    const alta = esperarOk(
      calcularCotizacion(
        entradaBase({
          figuraId: 'tabica',
          medidasMm: { ...medidas, alturaFrontal: mm(60) },
          cantidad: 1,
          mermaPorcentaje: 0,
        }),
        config,
      ),
    );
    // > 5 cm → 0,23 €/cm × 50 = 11,50 €; el zócalo no cambia (2,04 €).
    expect(alta.lineasManipulacion[0].centimos).toBe(1150);
    expect(alta.lineasManipulacion[1].centimos).toBe(204);
  });

  it('el zócalo se tarifa por su perímetro, que comparte el largo', () => {
    const zocaloAlto = esperarOk(
      calcularCotizacion(
        entradaBase({
          figuraId: 'tabica',
          medidasMm: { ...medidas, alturaZocalo: mm(200) },
          cantidad: 1,
          mermaPorcentaje: 0,
        }),
        config,
      ),
    );
    // Perímetro 2×(50+20) = 140 cm × 0,017 = 2,38 €. La parte de figura 1 no varía.
    expect(zocaloAlto.lineasManipulacion[0].centimos).toBe(950);
    expect(zocaloAlto.lineasManipulacion[1].centimos).toBe(238);
  });

  /**
   * Cada parte redondea UNA vez por pieza y luego se multiplica por la cantidad,
   * igual que el resto del motor. Con 7 piezas: 950×7 + 204×7 = 8078 céntimos.
   * Si se sumaran las dos tarifas antes de redondear, saldría otro céntimo.
   */
  it('cada parte redondea por pieza y luego multiplica por la cantidad', () => {
    const siete = esperarOk(
      calcularCotizacion(
        entradaBase({ figuraId: 'tabica', medidasMm: medidas, cantidad: 7, mermaPorcentaje: 0 }),
        config,
      ),
    );
    expect(siete.lineasManipulacion.map((l) => l.centimos)).toEqual([950 * 7, 204 * 7]);
    expect(siete.desglose.manipulacionCentimos).toBe(8078);
  });
});

/**
 * La forma. Esto se modeló MAL a la primera —el zócalo a ras del frontal,
 * prolongando la cara delantera— y hubo que corregirlo: va por DETRÁS,
 * retranqueado un grosor, colgando de la cara inferior de la tapa. Los tests
 * fijan justo esa diferencia, que es la que distingue una tabica de un frontal
 * alto.
 */
describe('geometría: el zócalo va por detrás, no a ras', () => {
  const fondo = 33;
  const grosor = 1;
  const seccion = seccionTabica({ fondo, alturaFrontal: 4, alturaZocalo: 15, grosor });
  const zetas = seccion.contorno.map(([z]) => z);
  const yes = seccion.contorno.map(([, y]) => y);

  it('la cara del zócalo está RETRANQUEADA un grosor respecto a la del frontal', () => {
    // El frontal llega hasta el frente (z = fondo); el zócalo, un grosor menos.
    expect(Math.max(...zetas)).toBe(fondo);
    // Existe un tramo vertical en z = fondo − grosor (cara delantera del zócalo)
    // y otro en fondo − 2·grosor (su cara trasera).
    expect(zetas).toContain(fondo - grosor);
    expect(zetas).toContain(fondo - 2 * grosor);
    // Y NINGÚN punto del zócalo llega al frente: si lo hiciera, estaría a ras.
    const puntosBajos = seccion.contorno.filter(([, y]) => y < 11); // por debajo de la caída
    expect(puntosBajos.every(([z]) => z <= fondo - grosor)).toBe(true);
  });

  it('los dos cuelgan de la cara inferior de la tapa, y el zócalo baja más', () => {
    const caja = cajaSeccion(seccion);
    // Alto total = el que más baja (15) + el grosor de la tapa.
    expect(caja.yMax - caja.yMin).toBe(15 + grosor);
    expect(caja.yMin).toBe(0);
    // La base del frontal queda POR ENCIMA de la del zócalo: 15 − 4 = 11.
    expect(yes).toContain(11);
  });

  it('marca las dos juntas: tapa/frontal y frontal/zócalo', () => {
    expect(seccion.juntas).toHaveLength(2);
    const [tapaFrontal, frontalZocalo] = seccion.juntas;
    // La primera es horizontal, bajo la tapa; la segunda vertical, entre piezas.
    expect(tapaFrontal[0][1]).toBe(tapaFrontal[1][1]);
    expect(frontalZocalo[0][0]).toBe(frontalZocalo[1][0]);
    expect(frontalZocalo[0][0]).toBe(fondo - grosor);
  });

  it('no se autointerseca cuando el zócalo es MÁS CORTO que la caída', () => {
    const corta = seccionTabica({ fondo, alturaFrontal: 15, alturaZocalo: 4, grosor });
    const caja = cajaSeccion(corta);
    expect(caja.yMax - caja.yMin).toBe(15 + grosor); // manda la caída
    expect(corta.contorno.length).toBeGreaterThanOrEqual(6);
  });

  it('con caída y zócalo iguales no deja vértices repetidos', () => {
    const igual = seccionTabica({ fondo, alturaFrontal: 8, alturaZocalo: 8, grosor });
    const repetidos = igual.contorno.filter(
      (p, i) => i > 0 && p[0] === igual.contorno[i - 1][0] && p[1] === igual.contorno[i - 1][1],
    );
    expect(repetidos).toEqual([]);
  });
});

describe('el zócalo es parte de la misma pieza', () => {
  it('entra en la ocupación de la baldosa (veta §4)', () => {
    // tapa 30 + frontal 4 + zócalo 10 = 44 cm, más cortes/saneado/tolerancia.
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({ figuraId: 'tabica', medidasMm: medidas, cantidad: 1, mermaPorcentaje: 0 }),
        config,
      ),
    );
    expect(r.componentes.map((c) => c.id)).toEqual(['tapa', 'frontal', 'zocalo']);
    // 300+40+100 = 440 mm + 2 cortes×3 + 2×5 saneado + 2 tolerancia = 458 mm.
    expect(r.ocupacion.ocupacionMm).toBe(458);
    expect(r.ocupacion.numCortes).toBe(2);
  });

  it('un zócalo demasiado alto hace que la pieza no quepa, y se avisa', () => {
    const salida = calcularCotizacion(
      entradaBase({
        figuraId: 'tabica',
        medidasMm: { ...medidas, alturaZocalo: mm(400) },
        material: materialErp(), // baldosa de 60×60
        cantidad: 1,
      }),
      config,
    );
    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    // 30 + 4 + 40 = 74 cm de partes, más cortes y saneado: 75,8 > 60.
    expect(salida.errores.map((e) => e.mensaje).join(' ')).toBe(
      'La pieza necesita 75,8 cm de ancho; el formato solo permite 60 cm.',
    );
  });
});
