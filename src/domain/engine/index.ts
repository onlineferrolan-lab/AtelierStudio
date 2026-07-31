/**
 * Motor de cálculo puro de Atelier Studio (§7.2: sin UI, sin red, sin dependencias).
 *
 * Implementa las reglas confirmadas de §4 de la especificación:
 *  - Ocupación: Σ anchos de componentes + nº cortes × ancho de disco + saneados
 *    + tolerancias ≤ dimensión útil de la baldosa (receta PROVISIONAL, §6.2/§6.3/§6.4).
 *  - Merma: % sobre baldosas de origen, redondeo hacia arriba. El valor SUGERIDO
 *    sale del formato de la baldosa (`merma.ts`, interpolación lineal sobre el
 *    lado mayor) más el extra de las figuras numeradas; el comercial puede
 *    sobrescribirlo. La condición "mínimo 3" NO se implementa (§6.1).
 *  - Facturación: siempre por cajas completas (el origen stock/pedido se
 *    suprimió el 2026-07-30 al dejar de afectar al importe).
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
export { calcularCotizacion, calcularLinea, facturarMaterial } from './cotizacion';
export type { LineaCalculada, FacturacionMaterial, SalidaLinea } from './cotizacion';
export { calcularPedido, claveGrupoMaterial } from './pedido';
export {
  mermaPorFormatoCentesimas,
  mermaSugeridaCentesimas,
  mermaSugeridaPorcentaje,
} from './merma';
export {
  aplicarMargen,
  margenDeSubfamilia,
  nombreDeSubfamilia,
  subfamiliaDeMaterial,
  subfamiliaDeNumero,
  subfamiliaDeReferencia,
  resolverMargen,
} from './margen';

/** Busca una figura por id en la configuración. */
export function figuraPorId(config: Configuracion, figuraId: string): Figura | undefined {
  return config.figuras.find((f) => f.id === figuraId);
}
