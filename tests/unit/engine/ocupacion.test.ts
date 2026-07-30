/**
 * Tests de ocupación §4 (receta PROVISIONAL §6.2/§6.3/§6.4): colocación de
 * componentes, giro de 90° y mensajes de «no cabe» con los números reales.
 *
 * Parámetros de config reales (PROVISIONALES): disco 3 mm, tolerancia 2 mm,
 * saneado 5 mm/lado.
 */

import { evaluarOcupacion } from '../../../src/domain/engine/ocupacion';
import type { ComponentePieza, FormatoBaldosa } from '../../../src/domain/types';
import { mm } from '../../../src/domain/units';
import { cargarConfigReal } from './util';

const config = cargarConfigReal();
const parametros = config.parametros;

function formato(largoMm: number, anchoMm: number): FormatoBaldosa {
  return { largoMm: mm(largoMm), anchoMm: mm(anchoMm) };
}

/** Componentes tipo Figura 2: tapa (longitud×fondo) + frontal (longitud×alturaFrontal). */
function componentesF2(longitud: number, fondo: number, frontal: number): ComponentePieza[] {
  return [
    { id: 'tapa', largoMm: mm(longitud), anchoMm: mm(fondo) },
    { id: 'frontal', largoMm: mm(longitud), anchoMm: mm(frontal) },
  ];
}

describe('evaluarOcupacion — receta PROVISIONAL §4', () => {
  it('ocupación = Σ anchos + (n−1)·disco + 2·saneado + tolerancia', () => {
    // 300 + 40 + 1·3 + 2·5 + 2 = 355 mm
    const r = evaluarOcupacion(componentesF2(500, 300, 40), formato(600, 600), parametros);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.detalle.ocupacionMm).toBe(355);
      expect(r.detalle.dimensionUtilMm).toBe(600);
      expect(r.detalle.numCortes).toBe(1);
      expect(r.detalle.baldosaGirada).toBe(false);
    }
  });

  it('un solo componente → 0 cortes', () => {
    // Peldaño romo: 300 + 0 + 10 + 2 = 312 mm
    const r = evaluarOcupacion(
      [{ id: 'tapa', largoMm: mm(500), anchoMm: mm(300) }],
      formato(600, 600),
      parametros,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.detalle.ocupacionMm).toBe(312);
      expect(r.detalle.numCortes).toBe(0);
    }
  });

  it('tres componentes (Figura 4) → 2 cortes', () => {
    // 300 + 40 + 100 + 2·3 + 10 + 2 = 458 mm
    const r = evaluarOcupacion(
      [...componentesF2(500, 300, 40), { id: 'retorno', largoMm: mm(500), anchoMm: mm(100) }],
      formato(600, 600),
      parametros,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.detalle.ocupacionMm).toBe(458);
      expect(r.detalle.numCortes).toBe(2);
    }
  });

  it('justo en el límite cabe (ocupación = dimensión útil)', () => {
    // 585 + 3 + 10 + 2 = 600 = ancho útil
    const r = evaluarOcupacion(componentesF2(500, 545, 40), formato(600, 600), parametros);
    expect(r.ok).toBe(true);
  });

  it('un mm por encima del límite no cabe', () => {
    // 586 + 3 + 10 + 2 = 601 > 600 (y largos 500 > 600? no: caben; mensaje de ocupación)
    const r = evaluarOcupacion(componentesF2(500, 546, 40), formato(600, 600), parametros);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.mensaje).toMatch(/necesita 60,1 cm de ancho/);
  });
});

describe('evaluarOcupacion — giro de 90° (regla PROVISIONAL: se prueban ambas)', () => {
  it('gira la baldosa cuando solo cabe en la otra orientación', () => {
    // Baldosa 100×33 cm: a lo ancho (330) no caben 355 mm; girada sí (1000), largos 300 ≤ 330.
    const r = evaluarOcupacion(componentesF2(300, 300, 40), formato(1000, 330), parametros);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.detalle.baldosaGirada).toBe(true);
      expect(r.detalle.dimensionUtilMm).toBe(1000);
    }
  });
  it('prefiere la orientación natural cuando cabe en ambas', () => {
    const r = evaluarOcupacion(componentesF2(500, 300, 40), formato(600, 600), parametros);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.detalle.baldosaGirada).toBe(false);
  });
});

describe('evaluarOcupacion — empaquetado: piezas por baldosa (dirección 2026-07-28)', () => {
  it('pieza grande que apenas cabe → 1 pieza por baldosa', () => {
    // Figura 2 50×35,5 cm en baldosa 60×60: floor(591/346)=1 × floor(603/503)=1 → 1.
    const r = evaluarOcupacion(componentesF2(500, 300, 40), formato(600, 600), parametros);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.detalle.piezasPorBaldosa).toBe(1);
  });

  it('el ejemplo del encargo: piezas de 10×10 cm en baldosa 110×110 → 100 por baldosa', () => {
    // a lo ancho floor((1100−10−2+3)/103) = 10; a lo largo floor((1100+3)/103) = 10.
    const r = evaluarOcupacion(
      [{ id: 'pieza', largoMm: mm(100), anchoMm: mm(100) }],
      formato(1100, 1100),
      parametros,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.detalle.piezasPorBaldosa).toBe(100);
  });

  it('listones (rodapié) de 50×7,2 cm en baldosa 60×60 → 7 por baldosa', () => {
    // a lo ancho floor((600−10−2+3)/75) = 7; a lo largo floor(603/503) = 1.
    const r = evaluarOcupacion(
      [{ id: 'liston', largoMm: mm(500), anchoMm: mm(72) }],
      formato(600, 600),
      parametros,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.detalle.piezasPorBaldosa).toBe(7);
  });

  it('el empaquetado se calcula en la orientación elegida (también girada)', () => {
    // Girada: colocación a lo largo (1000): floor(991/346) = 2; largos (330): floor(333/303) = 1.
    const r = evaluarOcupacion(componentesF2(300, 300, 40), formato(1000, 330), parametros);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.detalle.baldosaGirada).toBe(true);
      expect(r.detalle.piezasPorBaldosa).toBe(2);
    }
  });
});

describe('evaluarOcupacion — mensajes de «no cabe» (acortados a petición de dirección, ver PENDIENTES.md)', () => {
  it('pieza demasiado larga: mensaje corto con los números reales', () => {
    // Figura 2 de 90 cm sobre baldosa 60×60: §1.③.
    const r = evaluarOcupacion(componentesF2(900, 300, 40), formato(600, 600), parametros);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.paso).toBe('medidas');
      expect(r.error.mensaje).toBe('La pieza mide 90 cm; el formato solo llega a 60 cm.');
    }
  });

  it('los anchos apilados no caben en la orientación que admitiría los largos', () => {
    // Baldosa 120×30: largos de 100 cm caben a lo largo, pero 35,5 cm apilados > 30 cm.
    const r = evaluarOcupacion(componentesF2(1000, 300, 40), formato(1200, 300), parametros);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.mensaje).toBe('La pieza necesita 35,5 cm de ancho; el formato solo permite 30 cm.');
    }
  });
});
