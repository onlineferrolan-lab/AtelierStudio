/**
 * Capa de datos del catálogo de materiales (§1.①).
 *
 * Fuentes:
 *  - Catálogo REAL (`fuenteIndiceCataleg.ts`, origen 'cataleg'): busca por
 *    texto sobre un índice local (referencia/título/imagen) generado del
 *    sitemap público de ferrolan.es (`npm run indice:cataleg`), y trae
 *    tarifa/mides autoritativos en el momento de buscar mediante lotes al
 *    API real (`/api/cataleg/`, proxy same-origin, sin clave en el
 *    navegador). Ver PENDIENTES.md §4.8.
 *  - Catálogo de muestra (public/data/catalogo-muestra.json, origen
 *    'muestra'), claramente marcado como FALSO (§7.3): queda disponible como
 *    alternativa sin red, pero `obtenerFuenteCatalogo` ya no la usa por
 *    defecto.
 *  - Entrada manual: cerámica que no está en el catálogo.
 *
 * La UI de búsqueda solo conoce la interfaz `FuenteCatalogo`.
 */

import type { Material } from '../domain/types';
import { eurosACentimos } from '../domain/money';
import { cmAMm } from '../domain/units';
import { crearFuenteIndiceCataleg } from './fuenteIndiceCataleg';

/**
 * Tope de artículos por página: el lote al API real de catálogo admite como
 * máximo 50 códigos por llamada (§ contrato), así que ninguna página puede
 * pedir más que eso.
 */
export const TAMANO_PAGINA_MAXIMO = 50;

export interface ConsultaCatalogo {
  /** Texto libre (descripción, referencia, marca). */
  readonly texto: string;
  /** Filtro por marca; null = todas. */
  readonly marca: string | null;
  /** Página pedida, 1-indexada. */
  readonly pagina: number;
  /** Artículos por página (≤ `TAMANO_PAGINA_MAXIMO`). */
  readonly tamanoPagina: number;
}

export interface ResultadoBusquedaCatalogo {
  readonly materiales: readonly Material[];
  /** Coincidencias totales (para calcular el número de páginas), no solo las de esta página. */
  readonly totalCoincidencias: number;
}

export interface FuenteCatalogo {
  /** Identifica el origen para mostrarlo en UI ('muestra' se marca como falso, §7.3). */
  readonly origen: 'cataleg' | 'muestra';
  buscar(consulta: ConsultaCatalogo): Promise<ResultadoBusquedaCatalogo>;
  /** Marcas presentes en el catálogo, para el filtro. */
  marcas(): Promise<readonly string[]>;
}

export interface DatosMaterialManual {
  readonly descripcion: string;
  readonly largoCm: number;
  readonly anchoCm: number;
  readonly precioUnidadEuros: number;
  /** Piezas por caja: obligatorio desde 2026-07-30 (se factura por cajas completas). */
  readonly piezasPorCaja: number;
  /**
   * Subfamilia (4 dígitos, los mismos con los que empieza la referencia en el
   * ERP). OBLIGATORIA desde 2026-07-31: es la clave del margen comercial y sin
   * ella el material no se puede cotizar.
   */
  readonly subfamilia: number;
  readonly imagenUrl: string | null;
}

/**
 * Crea un material de entrada manual (campos mínimos §1.①), marcado como manual.
 * Precio por baldosa (unidad); el material manual no tiene tarifa TARP por m².
 *
 * Pide «piezas por caja» porque desde 2026-07-30 se factura por cajas completas
 * también en stock, y sin ese dato el material no se podría cotizar. Los m² por
 * caja NO se piden: se DERIVAN del formato (piezas × largo × ancho), que es
 * exacto y evita que el comercial teclee un par de datos incoherente.
 */
export function crearMaterialManual(datos: DatosMaterialManual): Material {
  // Validación mínima de entrada: mejor fallar aquí que cotizar con un formato a 0.
  if (datos.descripcion.trim() === '') {
    throw new Error('Material manual: la descripción es obligatoria');
  }
  if (!(datos.largoCm > 0) || !(datos.anchoCm > 0)) {
    throw new Error('Material manual: el largo y el ancho deben ser mayores que 0 cm');
  }
  if (!(datos.precioUnidadEuros >= 0)) {
    throw new Error('Material manual: el precio no puede ser negativo');
  }
  if (!Number.isInteger(datos.piezasPorCaja) || datos.piezasPorCaja < 1) {
    throw new Error('Material manual: las piezas por caja deben ser un entero mayor que 0');
  }
  if (!Number.isInteger(datos.subfamilia) || datos.subfamilia < 0) {
    throw new Error('Material manual: la subfamilia es obligatoria (entero de 4 dígitos)');
  }
  const largoMm = cmAMm(datos.largoCm);
  const anchoMm = cmAMm(datos.anchoCm);
  return {
    // Identificador local único; Date.now() basta en una herramienta interna
    // monousuario (no forma parte del cálculo, no afecta al determinismo).
    referencia: `MANUAL-${Date.now()}`,
    descripcion: datos.descripcion.trim(),
    marca: null,
    formato: { largoMm, anchoMm },
    // El material manual se tarifa por unidad, no por m² (sin tarifa TARP).
    precioM2Centimos: null,
    precioUnidadCentimos: eurosACentimos(datos.precioUnidadEuros),
    piezasPorCaja: datos.piezasPorCaja,
    // Derivado, no pedido: mm² exactos de la caja → m². Al cuantizarlo el motor
    // (Math.round(m2PorCaja × 1e6)) recupera el mismo entero, sin pérdida.
    m2PorCaja: (datos.piezasPorCaja * largoMm * anchoMm) / 1_000_000,
    subfamilia: datos.subfamilia,
    imagenUrl: datos.imagenUrl,
    esManual: true,
  };
}

/**
 * Devuelve la fuente de catálogo activa: el índice real (`fuenteIndiceCataleg.ts`).
 * Cada resultado de `buscar()` ya trae tarifa/mides autoritativos (lote al
 * API real) e imagen (real, del índice); no hace falta ningún paso de
 * enriquecido posterior a la selección.
 */
export function obtenerFuenteCatalogo(): FuenteCatalogo {
  // VITE_PRESTASHOP_IMG_BASE: fallback de imagen para artículos encontrados
  // solo por referencia exacta (sin página pública → sin imagen en el índice).
  return crearFuenteIndiceCataleg(
    undefined,
    import.meta.env.VITE_PRESTASHOP_IMG_BASE ?? null,
  );
}
