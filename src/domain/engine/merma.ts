/**
 * Merma SUGERIDA según el formato de la baldosa (indicación directa 2026-07-31).
 *
 * LA REGLA. Interpolación **lineal sobre el lado mayor** de la baldosa:
 *
 *     lado mayor ≤ 60 cm  → 10 %
 *     lado mayor ≥ 120 cm → 20 %
 *     en medio            → proporcional
 *
 * Los dos extremos que dio dirección son formatos, «30x60 y menores» y
 * «60x120»: lo que cambia entre uno y otro es el lado mayor (60 → 120), y
 * «escalado lineal» es justo eso, escala de longitud. Por eso interpola sobre el
 * lado mayor y no sobre la superficie. Consecuencia que conviene tener presente:
 * una baldosa de **60x60 se queda en el 10 %**, igual que la de 30x60, porque su
 * lado mayor también es 60 — aunque tenga el doble de superficie.
 *
 * FIGURAS NUMERADAS. Las de `mermaFigurasConExtra` suman
 * `mermaExtraFiguraPuntos` PUNTOS porcentuales (10 → 15), no un 5 % relativo.
 * La lista está en configuración, no aquí (§0).
 *
 * ES UNA SUGERENCIA, NO UN TOPE. El comercial puede sobrescribirla, igual que el
 * precio del material; quien decide el valor final es la UI. Este módulo solo
 * dice cuál sería el propuesto.
 *
 * ARITMÉTICA. Todo en CENTÉSIMAS de punto porcentual (10 % = 1000), enteras, que
 * es la precisión con la que el motor cuantiza la merma. Así un tramo que caiga
 * en 16,666…  % da un entero estable y no un float que arrastre error.
 */

import type { Configuracion } from '../config';
import type { FormatoBaldosa } from '../types';
import { mmACm } from '../units';

/** Centésimas de punto porcentual: 10 % = 1000, 12,5 % = 1250. */
export type CentesimasPorcentaje = number;

/** Redondeo half-up entero para no depender del signo de Math.round con negativos. */
function divisionHalfUp(numerador: number, denominador: number): number {
  return Math.floor((numerador + denominador / 2) / denominador);
}

/**
 * Merma sugerida en centésimas de punto, sin el extra de figura.
 * Fuera del tramo se recorta a los extremos (no extrapola).
 */
export function mermaPorFormatoCentesimas(
  formato: FormatoBaldosa,
  config: Configuracion,
): CentesimasPorcentaje {
  const p = config.parametros;
  const ladoMayorCm = Math.max(mmACm(formato.largoMm), mmACm(formato.anchoMm));
  const minCentesimas = Math.round(p.mermaPorcentajeLadoMenor * 100);
  const maxCentesimas = Math.round(p.mermaPorcentajeLadoMayor * 100);

  if (ladoMayorCm <= p.mermaLadoMenorCm) return minCentesimas;
  if (ladoMayorCm >= p.mermaLadoMayorCm) return maxCentesimas;

  // Interpolación lineal en enteros: min + (max−min) × (lado−ladoMin)/(ladoMax−ladoMin).
  // Se trabaja en décimas de mm para que formatos con decimal (29,5 cm) no pierdan precisión.
  const decimasLado = Math.round(ladoMayorCm * 10);
  const decimasMin = Math.round(p.mermaLadoMenorCm * 10);
  const decimasMax = Math.round(p.mermaLadoMayorCm * 10);
  const recorrido = decimasMax - decimasMin;
  if (recorrido <= 0) return minCentesimas;

  return (
    minCentesimas +
    divisionHalfUp((maxCentesimas - minCentesimas) * (decimasLado - decimasMin), recorrido)
  );
}

/**
 * Merma sugerida completa: tramo por formato + extra si la figura lo lleva.
 * `figuraId` null (aún sin figura elegida) = sin extra.
 */
export function mermaSugeridaCentesimas(
  formato: FormatoBaldosa,
  figuraId: string | null,
  config: Configuracion,
): CentesimasPorcentaje {
  const base = mermaPorFormatoCentesimas(formato, config);
  const llevaExtra = figuraId !== null && config.parametros.mermaFigurasConExtra.includes(figuraId);
  const extra = llevaExtra ? Math.round(config.parametros.mermaExtraFiguraPuntos * 100) : 0;
  return base + extra;
}

/** La misma sugerencia, en puntos porcentuales (12,5 para 12,5 %). */
export function mermaSugeridaPorcentaje(
  formato: FormatoBaldosa,
  figuraId: string | null,
  config: Configuracion,
): number {
  return mermaSugeridaCentesimas(formato, figuraId, config) / 100;
}
