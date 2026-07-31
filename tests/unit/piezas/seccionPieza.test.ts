/**
 * Suplementos que cambian la forma de la pieza (§ `src/piezas/seccionPieza.ts`).
 *
 * Solo los que se cobran POR CM pueden verse: al ir de punta a punta de la pieza
 * son muescas de la sección. Se comprueba por ÁREA de la sección, que es lo que
 * de verdad cambia: la caja envolvente no se entera de una ranura.
 */

import { describe, expect, it } from 'vitest';
import {
  SIN_SUPLEMENTOS,
  cajaSeccion,
  seccionEscuadra,
  seccionListon,
  seccionRomo,
  type SeccionPieza,
} from '../../../src/piezas/seccionPieza';

/** Área del contorno por la fórmula del cordón de zapato. */
function area(seccion: SeccionPieza): number {
  const p = seccion.contorno;
  let doble = 0;
  for (let i = 0; i < p.length; i += 1) {
    const [z1, y1] = p[i];
    const [z2, y2] = p[(i + 1) % p.length];
    doble += z1 * y2 - z2 * y1;
  }
  return Math.abs(doble) / 2;
}

/** Medidas reales de las ranuras (ver constantes del módulo). */
const AREA_ANTIDESLIZANTES = 3 * 0.3 * 0.2;
const AREA_GOTERON = 0.4 * 0.3;

const PELDANO = { fondo: 33, alto: 7, grosor: 1, dientes: 0, retorno: 0, espejo: false } as const;

describe('ranuras antideslizantes y goterón en la escuadra', () => {
  it('las tres ranuras quitan exactamente su material de la cara de huella', () => {
    const lisa = seccionEscuadra({ ...PELDANO, suplementos: SIN_SUPLEMENTOS });
    const ranurada = seccionEscuadra({
      ...PELDANO,
      suplementos: { antideslizante: true, goteron: false, espesado: false },
    });
    expect(area(lisa) - area(ranurada)).toBeCloseTo(AREA_ANTIDESLIZANTES, 9);
  });

  it('el goterón quita su material de la cara inferior', () => {
    const lisa = seccionEscuadra({ ...PELDANO, suplementos: SIN_SUPLEMENTOS });
    const conGoteron = seccionEscuadra({
      ...PELDANO,
      suplementos: { antideslizante: false, goteron: true, espesado: false },
    });
    expect(area(lisa) - area(conGoteron)).toBeCloseTo(AREA_GOTERON, 9);
  });

  it('los dos a la vez se suman y no se pisan', () => {
    const lisa = seccionEscuadra({ ...PELDANO, suplementos: SIN_SUPLEMENTOS });
    const ambos = seccionEscuadra({
      ...PELDANO,
      suplementos: { antideslizante: true, goteron: true, espesado: false },
    });
    expect(area(lisa) - area(ambos)).toBeCloseTo(AREA_ANTIDESLIZANTES + AREA_GOTERON, 9);
  });

  it('no cambian la caja envolvente: son muescas, no otro tamaño de pieza', () => {
    const lisa = cajaSeccion(seccionEscuadra({ ...PELDANO, suplementos: SIN_SUPLEMENTOS }));
    const ambos = cajaSeccion(
      seccionEscuadra({ ...PELDANO, suplementos: { antideslizante: true, goteron: true, espesado: false } }),
    );
    expect(ambos).toEqual(lisa);
  });

  it('la ranura nunca atraviesa la baldosa, por fina que sea', () => {
    // Grosor 0,2 cm: la profundidad nominal (0,2) partiría la pieza en dos.
    const fina = seccionEscuadra({
      ...PELDANO,
      grosor: 0.2,
      suplementos: { antideslizante: true, goteron: false, espesado: false },
    });
    const caja = cajaSeccion(fina);
    // Todos los puntos siguen dentro de la pieza: no hay muesca que la cruce.
    for (const [, y] of fina.contorno) {
      expect(y).toBeGreaterThanOrEqual(caja.yMin - 1e-9);
      expect(y).toBeLessThanOrEqual(caja.yMax + 1e-9);
    }
    expect(area(fina)).toBeGreaterThan(0);
  });

  it('en una pieza demasiado corta las ranuras se omiten en vez de romper el contorno', () => {
    // Fondo 2 cm: no caben tres ranuras a 2, 3 y 4 cm del canto delantero.
    const corta = seccionEscuadra({
      ...PELDANO,
      fondo: 2,
      suplementos: { antideslizante: true, goteron: false, espesado: false },
    });
    const lisa = seccionEscuadra({ ...PELDANO, fondo: 2, suplementos: SIN_SUPLEMENTOS });
    expect(area(corta)).toBeCloseTo(area(lisa), 9);
  });

  it('el goterón sí cabe en esa misma pieza corta: va en el grueso del frontal', () => {
    // No depende del fondo, solo del grueso del frontal, así que sigue estando.
    const corta = seccionEscuadra({
      ...PELDANO,
      fondo: 2,
      suplementos: { antideslizante: false, goteron: true, espesado: false },
    });
    const lisa = seccionEscuadra({ ...PELDANO, fondo: 2, suplementos: SIN_SUPLEMENTOS });
    expect(area(lisa) - area(corta)).toBeCloseTo(AREA_GOTERON, 9);
  });

  it('el goterón va en la cara inferior, dentro del grueso del frontal', () => {
    const { fondo, grosor } = PELDANO;
    const conGoteron = seccionEscuadra({
      ...PELDANO,
      suplementos: { antideslizante: false, goteron: true, espesado: false },
    });
    // Los puntos del fondo de la muesca están por encima de la base y centrados
    // en el frontal (que ocupa de `fondo - grosor` a `fondo`).
    const fondoMuesca = conGoteron.contorno.filter(([, y]) => y > 0 && y < 0.5);
    expect(fondoMuesca).toHaveLength(2);
    for (const [z] of fondoMuesca) {
      expect(z).toBeGreaterThan(fondo - grosor);
      expect(z).toBeLessThan(fondo);
    }
  });

  it('el pasamanos lleva goterón en los DOS frontales, como el resto de su manipulación', () => {
    const lisa = seccionEscuadra({ ...PELDANO, espejo: true, suplementos: SIN_SUPLEMENTOS });
    const ambos = seccionEscuadra({
      ...PELDANO,
      espejo: true,
      suplementos: { antideslizante: true, goteron: true, espesado: false },
    });
    // Una sola tanda de ranuras en la huella, pero un goterón por canto.
    expect(area(lisa) - area(ambos)).toBeCloseTo(AREA_ANTIDESLIZANTES + 2 * AREA_GOTERON, 9);
  });
});

describe('material espesado', () => {
  const soloEspesado = { antideslizante: false, goteron: false, espesado: true };

  it('dobla el grosor de la tapa sin tocar la nariz', () => {
    const lisa = seccionEscuadra({ ...PELDANO, suplementos: SIN_SUPLEMENTOS });
    // El llamador sube el alto total al engordar la tapa (ver `grosorConEspesado`).
    const espesada = seccionEscuadra({
      ...PELDANO,
      alto: PELDANO.alto + PELDANO.grosor,
      suplementos: soloEspesado,
    });
    const cajaLisa = cajaSeccion(lisa);
    const cajaEspesada = cajaSeccion(espesada);
    // Más alta en un grosor, mismo fondo.
    expect(cajaEspesada.yMax - cajaLisa.yMax).toBeCloseTo(PELDANO.grosor, 9);
    expect(cajaEspesada.zMax - cajaEspesada.zMin).toBeCloseTo(cajaLisa.zMax - cajaLisa.zMin, 9);
    // La tapa aporta el doble de material; la nariz, el mismo.
    expect(area(espesada) - area(lisa)).toBeCloseTo(PELDANO.fondo * PELDANO.grosor, 9);
  });

  it('en el peldaño romo engorda la losa entera y su media caña', () => {
    const lisa = seccionRomo({ fondo: 33, grosor: 1, doble: false });
    const espesada = seccionRomo({ fondo: 33, grosor: 1, doble: false, suplementos: soloEspesado });
    const caja = cajaSeccion(espesada);
    expect(caja.yMax - caja.yMin).toBeCloseTo(2, 9);
    expect(area(espesada)).toBeGreaterThan(area(lisa));
  });

  it('convive con las ranuras: se restan del material ya espesado', () => {
    const soloEsp = seccionEscuadra({
      ...PELDANO,
      alto: PELDANO.alto + PELDANO.grosor,
      suplementos: soloEspesado,
    });
    const todo = seccionEscuadra({
      ...PELDANO,
      alto: PELDANO.alto + PELDANO.grosor,
      suplementos: { antideslizante: true, goteron: true, espesado: true },
    });
    expect(area(soloEsp) - area(todo)).toBeCloseTo(AREA_ANTIDESLIZANTES + AREA_GOTERON, 9);
  });
});

/**
 * El canto romado NO es una media caña. Cuando lo era (semicircunferencia de
 * radio medio espesor) el taller lo rechazó: en sección salía una «U» tumbada y
 * la pieza real tiene la cara frontal casi recta con las esquinas matadas —una
 * «D»— porque la curva vuela solo un cuarto del espesor (2026-07-31, indicación
 * directa). Estas pruebas fijan esa proporción: es lo único que distingue las dos
 * formas, y las cajas envolventes son idénticas, así que nada más lo detectaría.
 */
describe('forma del canto romado', () => {
  const VUELO = 1 / 4;

  it('la curva recorre el espesor entero pero vuela un cuarto de él', () => {
    const fondo = 33;
    const grosor = 2;
    const s = seccionRomo({ fondo, grosor, doble: false });
    const caja = cajaSeccion(s);
    // Llega al frente y cubre el espesor: el canto no deja ninguna arista viva.
    expect(caja.zMax).toBeCloseTo(fondo, 9);
    expect(caja.yMax - caja.yMin).toBeCloseTo(grosor, 9);
    // Y el vuelo es de un cuarto: la cara frontal arranca en fondo − espesor/4,
    // no en fondo − espesor/2 (que es lo que daba la media caña).
    const arranque = Math.min(...s.contorno.filter(([z]) => z > fondo - grosor).map(([z]) => z));
    expect(fondo - arranque).toBeCloseTo(grosor * VUELO, 9);
  });

  it('a media altura la curva ya está fuera: es un arco, no un chaflán', () => {
    const fondo = 33;
    const grosor = 2;
    const s = seccionRomo({ fondo, grosor, doble: false });
    // El punto más saliente está a media altura (el semieje mayor es el vertical).
    const masSaliente = s.contorno.reduce((a, b) => (b[0] > a[0] ? b : a));
    expect(masSaliente[0]).toBeCloseTo(fondo, 9);
    expect(masSaliente[1]).toBeCloseTo(grosor / 2, 9);
    // Y a un cuarto de altura ya vuela más de la mitad de su vuelo: si fuese un
    // chaflán recto iría justo a la mitad.
    const zCuarto = Math.max(
      ...s.contorno.filter(([, y]) => Math.abs(y - grosor / 4) < 1e-9).map(([z]) => z),
    );
    expect(zCuarto).toBeGreaterThan(fondo - grosor * VUELO * 0.5);
  });

  it('el pasamanos romo lo lleva en los dos cantos, con el mismo vuelo', () => {
    const fondo = 33;
    const grosor = 2;
    const s = seccionRomo({ fondo, grosor, doble: true });
    const caja = cajaSeccion(s);
    expect(caja.zMin).toBeCloseTo(0, 9);
    expect(caja.zMax).toBeCloseTo(fondo, 9);
    // Simétrica: lo que vuela por delante vuela por detrás.
    const zs = s.contorno.map(([z]) => z);
    const dentroDelante = Math.min(...zs.filter((z) => z > fondo - grosor));
    const dentroDetras = Math.max(...zs.filter((z) => z < grosor));
    expect(fondo - dentroDelante).toBeCloseTo(dentroDetras, 9);
    expect(dentroDetras).toBeCloseTo(grosor * VUELO, 9);
  });

  it('el rodapié lleva el mismo canto tumbado: cruza el grueso y sube un cuarto', () => {
    const altura = 8;
    const grosor = 1.2;
    const s = seccionListon({ altura, grosor });
    const caja = cajaSeccion(s);
    expect(caja.yMax).toBeCloseTo(altura, 9);
    expect(caja.zMax - caja.zMin).toBeCloseTo(grosor, 9);
    // La cara superior arranca a altura − grosor/4, no a altura − grosor/2.
    const arranque = Math.min(...s.contorno.filter(([, y]) => y > altura - grosor).map(([, y]) => y));
    expect(altura - arranque).toBeCloseTo(grosor * VUELO, 9);
  });
});

describe('ranuras y goterón en el peldaño romo', () => {
  const ROMO = { fondo: 33, grosor: 1, doble: false } as const;

  it('quitan su material sin tocar la media caña', () => {
    const lisa = seccionRomo({ ...ROMO, suplementos: SIN_SUPLEMENTOS });
    const ambos = seccionRomo({ ...ROMO, suplementos: { antideslizante: true, goteron: true, espesado: false } });
    expect(area(lisa) - area(ambos)).toBeCloseTo(AREA_ANTIDESLIZANTES + AREA_GOTERON, 9);
    expect(cajaSeccion(ambos)).toEqual(cajaSeccion(lisa));
  });

  it('el pasamanos romo (doble media caña) también las lleva', () => {
    const lisa = seccionRomo({ ...ROMO, doble: true, suplementos: SIN_SUPLEMENTOS });
    const ambos = seccionRomo({
      ...ROMO,
      doble: true,
      suplementos: { antideslizante: true, goteron: true, espesado: false },
    });
    expect(area(lisa) - area(ambos)).toBeCloseTo(AREA_ANTIDESLIZANTES + AREA_GOTERON, 9);
  });
});
