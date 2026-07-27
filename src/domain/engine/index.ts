/**
 * Motor de cálculo puro de Atelier Studio (§7.2: sin UI, sin red, sin dependencias).
 *
 * Implementa las reglas confirmadas de §4 de la especificación:
 *  - Ocupación: Σ anchos de componentes + nº cortes × ancho de disco + saneados
 *    + tolerancias ≤ dimensión útil de la baldosa (receta PROVISIONAL, §6.2/§6.3/§6.4).
 *  - Merma: % configurable sobre baldosas de origen, redondeo hacia arriba.
 *    La condición "mínimo 3" NO se implementa (§6.1).
 *  - Origen: stock → se factura por piezas; pedido → cajas completas.
 *  - Veta: los componentes de una misma pieza salen de la misma baldosa;
 *    giro de 90° solo cuando la orientación lo permita (regla por figura
 *    pendiente del croquis oficial: de momento se prueban ambas orientaciones,
 *    ver `ocupacion.ts`).
 *
 * Nada de esta carpeta importa React, fetch ni librerías externas.
 *
 * API pública (contrato del scaffold, no modificar): `figuraPorId`,
 * `validarMedidasCrudas`, `resolverTarifa`, `longitudTarifaMm`,
 * `calcularCotizacion`. La implementación vive en los módulos internos de esta
 * carpeta (`validacion.ts`, `tarifas.ts`, `ocupacion.ts`, `cotizacion.ts`).
 */

import type { Configuracion, Figura } from '../config';

export { validarMedidasCrudas } from './validacion';
export { resolverTarifa, longitudTarifaMm } from './tarifas';
export { calcularCotizacion } from './cotizacion';

/** Busca una figura por id en la configuración. */
export function figuraPorId(config: Configuracion, figuraId: string): Figura | undefined {
  return config.figuras.find((f) => f.id === figuraId);
}
