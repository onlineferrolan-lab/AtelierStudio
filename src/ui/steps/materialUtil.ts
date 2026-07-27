/**
 * Utilidades de presentación de materiales (solo formato, sin cálculo).
 * Compartidas por `CatalogoPanel` (tarjetas del catálogo) y `PasoMaterial`
 * (tarjeta-resumen del material seleccionado).
 */

import type { Material } from '../../domain/types';
import { formatearEuros } from '../../domain/money';
import { mmACm } from '../../domain/units';

const FORMATO_CM = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

/** Formato de la baldosa en cm: "60×60 cm". */
export function formatoMaterialTexto(material: Material): string {
  const largo = FORMATO_CM.format(mmACm(material.formato.largoMm));
  const ancho = FORMATO_CM.format(mmACm(material.formato.anchoMm));
  return `${largo}×${ancho} cm`;
}

const FORMATO_NUMERO = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 });

/**
 * Datos de caja del material: "6 piezas/caja · 1,08 m²/caja". Solo las partes
 * disponibles; null si no hay ninguna (p. ej. entrada manual sin esos datos).
 */
export function cajaMaterialTexto(material: Material): string | null {
  const partes: string[] = [];
  if (material.piezasPorCaja != null) {
    partes.push(`${FORMATO_NUMERO.format(material.piezasPorCaja)} piezas/caja`);
  }
  if (material.m2PorCaja != null) {
    partes.push(`${FORMATO_NUMERO.format(material.m2PorCaja)} m²/caja`);
  }
  return partes.length > 0 ? partes.join(' · ') : null;
}

/**
 * Precio de tarifa del material: €/m² (TARP, §1 Cotización) o €/unidad para
 * material de entrada manual (§1.①). Null en ambos → sin dato de precio.
 */
export function precioMaterialTexto(material: Material): string {
  if (material.esManual && material.precioUnidadCentimos != null) {
    return `${formatearEuros(material.precioUnidadCentimos)}/unidad`;
  }
  if (material.precioM2Centimos != null) {
    return `${formatearEuros(material.precioM2Centimos)}/m²`;
  }
  return 'Precio no disponible';
}
