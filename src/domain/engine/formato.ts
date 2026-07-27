/**
 * Helpers internos de formato para los mensajes del motor (español, es-ES).
 * Sin dependencias externas: solo `Intl` y las primitivas de dominio.
 */

import type { Mm } from '../types';
import { formatearCotaCm } from '../units';

const formatoNumeroCm = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/** Número de cm legible para mensajes: 7.2 → "7,2". */
export function fmtCm(cm: number): string {
  return formatoNumeroCm.format(cm);
}

/** Cota en cm a partir de mm enteros: 900 mm → "90 cm". */
export function cota(milimetros: Mm): string {
  return formatearCotaCm(milimetros);
}

/** Nombre legible de una medida a partir de su etiqueta UI: "Altura frontal (cm)" → "Altura frontal". */
export function nombreMedida(etiqueta: string): string {
  return etiqueta.replace(/\s*\(cm\)\s*$/i, '');
}

/**
 * Une opciones en español: [7.2, 8] → "7,2 u 8"; [10, 12, 15] → "10, 12 o 15".
 * («u» delante de sonido /o/ — p. ej. «8» = «ocho»—, «o» en el resto.)
 */
export function listaOpciones(opcionesCm: readonly number[]): string {
  const partes = opcionesCm.map(fmtCm);
  if (partes.length <= 1) return partes.join('');
  const ultima = partes[partes.length - 1];
  const conjuncion = /^[oO8]/.test(ultima) ? ' u ' : ' o ';
  return `${partes.slice(0, -1).join(', ')}${conjuncion}${ultima}`;
}
