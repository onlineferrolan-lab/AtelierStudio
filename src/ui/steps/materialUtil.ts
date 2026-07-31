/**
 * Utilidades de presentación de materiales. Compartidas por `CatalogoPanel`
 * (tarjetas del catálogo) y `PasoMaterial` (tarjeta-resumen del material
 * seleccionado).
 *
 * De cálculo solo tienen el margen comercial, y delegándolo en el motor
 * (`aplicarMargen`): el precio que se enseña de un artículo es de VENTA, igual que
 * el de la cotización.
 */

import type { Material, ResolucionMargen } from '../../domain/types';
import { aplicarMargen } from '../../domain/engine';
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

/** Cómo mostrar el precio de un material: el texto y, si no es de venta, por qué. */
export interface PrecioMaterialVista {
  /** Lo que se pinta en la línea de precio. */
  readonly texto: string;
  /**
   * Motivo por el que ese texto NO es un precio de venta (para el `title` y para
   * teñir la línea). Null cuando sí lo es, que es el caso normal.
   */
  readonly aviso: string | null;
}

/**
 * Precio de VENTA del material: la tarifa —€/m² (TARP, §1 Cotización), o €/unidad
 * si es de entrada manual (§1.①)— **con el margen comercial de su subfamilia
 * aplicado** (2026-07-31, indicación directa).
 *
 * Antes se enseñaba la tarifa pelada, que es COSTE: el comercial leía un precio en
 * el catálogo y luego otro, más alto, en la cotización.
 *
 * Si el artículo no tiene margen (su subfamilia no está en la tabla del ERP y nadie
 * ha escrito uno a mano) NO se enseña la tarifa: sería un coste con pinta de precio
 * de venta, que es justo lo que la regla del margen prohíbe. Se dice que falta y
 * dónde ponerlo, igual que hace el motor al negarse a cotizar.
 */
export function precioMaterialVista(
  material: Material,
  margen: ResolucionMargen,
): PrecioMaterialVista {
  const tarifa =
    material.esManual && material.precioUnidadCentimos != null
      ? { centimos: material.precioUnidadCentimos, unidad: '/unidad' }
      : material.precioM2Centimos != null
        ? { centimos: material.precioM2Centimos, unidad: '/m²' }
        : null;

  if (tarifa === null) return { texto: 'Precio no disponible', aviso: null };

  if (!margen.ok) {
    const cual =
      margen.subfamilia !== null
        ? `La subfamilia ${margen.subfamilia} del artículo «${material.referencia}» no está en la tabla de márgenes del ERP.`
        : `No se puede deducir la subfamilia del artículo «${material.referencia}».`;
    return {
      texto: 'Precio sin margen',
      aviso: `${cual} Indica el margen a mano en «Parámetros avanzados» para ver el precio de venta.`,
    };
  }

  return {
    texto: `${formatearEuros(aplicarMargen(tarifa.centimos, margen.margen.centesimas))}${tarifa.unidad}`,
    aviso: null,
  };
}
