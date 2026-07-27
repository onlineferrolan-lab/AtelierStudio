/**
 * Aritmética de dinero en enteros (§1: prohibido `float` para dinero).
 *
 *  - Dinero: céntimos enteros (`Centimos`).
 *  - Tarifas: milésimas de euro enteras (`Milesimas`), p. ej. 0,045 €/cm = 45.
 *  - Único redondeo: al convertir milésimas acumuladas a céntimos, half-up,
 *    una sola vez por línea de cotización. Determinista: mismo input → mismo resultado.
 */

import type { Centimos, Milesimas, Mm } from './types';

export function centimos(n: number): Centimos {
  if (!Number.isInteger(n)) {
    throw new Error(`Los céntimos deben ser enteros; recibido ${n}`);
  }
  return n as Centimos;
}

export function milesimas(n: number): Milesimas {
  if (!Number.isInteger(n)) {
    throw new Error(`Las milésimas deben ser enteras; recibido ${n}`);
  }
  return n as Milesimas;
}

/** Euros (string o number con hasta 2 decimales) → céntimos. Punto de entrada de UI/config. */
export function eurosACentimos(euros: number): Centimos {
  return centimos(Math.round(euros * 100));
}

/** Tarifa en €/cm (hasta 3 decimales) → milésimas de €/cm. */
export function eurosAMilesimas(euros: number): Milesimas {
  return milesimas(Math.round(euros * 1000));
}

/** Milésimas acumuladas → céntimos, redondeo half-up (único redondeo del sistema). */
export function milesimasACentimos(m: number): Centimos {
  return centimos(Math.round(m / 10));
}

export function sumarCentimos(...valores: readonly Centimos[]): Centimos {
  return centimos(valores.reduce((acc, v) => acc + v, 0));
}

/** Multiplica un importe por una cantidad entera (p. ej. precio/pieza × nº piezas). */
export function multiplicarCentimos(importe: Centimos, cantidad: number): Centimos {
  if (!Number.isInteger(cantidad)) {
    throw new Error(`La cantidad debe ser entera; recibido ${cantidad}`);
  }
  return centimos(importe * cantidad);
}

/**
 * Tarifa lineal: milésimas/cm × longitud en mm → céntimos.
 * coste = tarifa × (mm / 10) milésimas, con un único redondeo half-up a céntimos.
 */
export function aplicarTarifaLineal(tarifaPorCm: Milesimas, longitud: Mm): Centimos {
  return milesimasACentimos((tarifaPorCm * longitud) / 10);
}

/** IVA: porcentaje entero sobre céntimos, redondeo half-up. */
export function aplicarPorcentaje(importe: Centimos, porcentaje: number): Centimos {
  return centimos(Math.round((importe * porcentaje) / 100));
}

/** Formatea céntimos como "1.234,56 €" (es-ES). */
export function formatearEuros(c: Centimos): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(c / 100);
}
