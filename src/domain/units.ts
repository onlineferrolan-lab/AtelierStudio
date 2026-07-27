/**
 * Conversión de unidades de geometría (§1: entrada en cm, cálculo en mm enteros).
 */

import type { Mm } from './types';

export function mm(n: number): Mm {
  if (!Number.isInteger(n)) {
    throw new Error(`Los milímetros deben ser enteros; recibido ${n}`);
  }
  return n as Mm;
}

/** cm (admite decimales, p. ej. 7,2 cm) → milímetros enteros. */
export function cmAMm(cm: number): Mm {
  return mm(Math.round(cm * 10));
}

export function mmACm(milimetros: Mm): number {
  return milimetros / 10;
}

/** m² de un rectángulo, a partir de mm enteros. */
export function mm2Am2(largoMm: Mm, anchoMm: Mm): number {
  return (largoMm * anchoMm) / 1_000_000;
}

/** Formatea mm como cota en cm: "120,5 cm". */
export function formatearCotaCm(milimetros: Mm): string {
  const cm = milimetros / 10;
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(cm)} cm`;
}
