/**
 * Tipos del dominio de Atelier Studio.
 *
 * Reglas de la especificación (ATELIER_STUDIO_MVP.md §1 "Unidades y precisión"):
 *  - La entrada del usuario es en cm; el cálculo interno es en MILÍMETROS ENTEROS.
 *  - El dinero se maneja en CÉNTIMOS ENTEROS.
 *  - Prohibido `float` para dinero o geometría: las marcas `Mm` y `Centimos`
 *    solo se construyen a través de las funciones de `units.ts` y `money.ts`,
 *    que redondean en el punto de entrada y garantizan enteros.
 *  - Las tarifas (€/cm con hasta 3 decimales) se representan en MILÉSIMAS DE EURO
 *    (0,001 €) para poder seguir trabajando con enteros.
 */

declare const marcaMm: unique symbol;
declare const marcaCentimos: unique symbol;
declare const marcaMilesimas: unique symbol;

/** Milímetros enteros. */
export type Mm = number & { readonly [marcaMm]: 'mm' };
/** Céntimos de euro enteros. */
export type Centimos = number & { readonly [marcaCentimos]: 'centimos' };
/** Milésimas de euro enteras (unidad de tarifas, p. ej. 0,045 €/cm = 45 milésimas/cm). */
export type Milesimas = number & { readonly [marcaMilesimas]: 'milesimas' };

// ---------------------------------------------------------------------------
// Material (catálogo ERP + imágenes PrestaShop, o entrada manual)
// ---------------------------------------------------------------------------

export interface FormatoBaldosa {
  readonly largoMm: Mm;
  readonly anchoMm: Mm;
}

export interface Material {
  /** ERP.CODIGO, o identificador local para material manual. */
  readonly referencia: string;
  readonly descripcion: string;
  readonly marca: string | null;
  readonly formato: FormatoBaldosa;
  /**
   * Tarifa TARP del artículo, en céntimos por m².
   * PROVISIONAL (§6): se asume que TARP es €/m². Ver PENDIENTES.md.
   */
  readonly precioM2Centimos: Centimos | null;
  /** Precio por baldosa para material de entrada manual. */
  readonly precioUnidadCentimos: Centimos | null;
  /** Dato logístico para facturar por cajas completas. Obligatorio para cotizar. */
  readonly piezasPorCaja: number | null;
  readonly m2PorCaja: number | null;
  /**
   * Subfamilia del artículo (id numérico del ERP). **No se usa en ningún
   * cálculo todavía** (2026-07-30): se recoge para poder aplicar el margen
   * comercial en el futuro, que dependerá del fabricante/familia
   * (ver PENDIENTES.md §6). Hoy solo la rellena el alta manual; los artículos
   * del catálogo la traen a `null` porque el contrato del API no la expone.
   */
  readonly subfamilia: number | null;
  /** URL de la textura/imagen (web service PrestaShop). Null si no hay. */
  readonly imagenUrl: string | null;
  /** true cuando la pieza no está ni en ERP ni en PrestaShop y se da de alta a mano. */
  readonly esManual: boolean;
}

// ---------------------------------------------------------------------------
// Figuras y medidas
// ---------------------------------------------------------------------------

/**
 * Medidas introducidas por el usuario, en cm tal cual se teclean
 * (cadena cruda para permitir validación con mensajes concretos, §1.③).
 */
export type MedidasCrudas = Readonly<Record<string, string>>;

/** Suplementos activados en el paso ④, por id de suplemento de la configuración. */
export type SuplementosActivos = Readonly<Record<string, boolean>>;

// ---------------------------------------------------------------------------
// Entrada y resultado del motor de cotización
// ---------------------------------------------------------------------------

export interface EntradaCotizacion {
  readonly material: Material;
  readonly figuraId: string;
  /** Medidas ya convertidas a milímetros enteros. */
  readonly medidasMm: Readonly<Record<string, Mm>>;
  readonly cantidad: number;
  /** Ids de suplementos activos (deben existir en la figura). */
  readonly suplementos: readonly string[];
  /**
   * A cuántas piezas se aplica cada suplemento POR PIEZA, por id de suplemento.
   *
   * «Angular» es un remate del extremo del peldaño: en un tramo de escalera solo
   * lo llevan las piezas de esquina, no todas (2026-07-30, indicación directa).
   * Los suplementos por CM recorren la pieza entera y no aparecen aquí.
   *
   * Un id activo sin entrada se cobra a UNA pieza; el motor rechaza valores no
   * enteros, menores que 1 o mayores que la cantidad pedida.
   */
  readonly unidadesSuplemento: Readonly<Record<string, number>>;
  /** Tarifa alternativa cuando el rodapié va pintado. */
  readonly pintado: boolean;
  /**
   * Precio de material editado por el comercial (céntimos/m² o céntimos/unidad
   * según el tipo de material). Null = usar la tarifa TARP por defecto.
   *
   * Es un COSTE: el margen comercial se aplica encima (2026-07-31, indicación
   * directa), igual que sobre la tarifa.
   */
  readonly precioMaterialEditado: Centimos | null;
  /** % de merma aplicado (visible/editable en UI; valor por defecto de config). */
  readonly mermaPorcentaje: number;
  /**
   * Qué margen comercial se aplica: PVP (MTP) o contratista (MTC). Se elige en
   * «Parámetros avanzados»; por defecto PVP (2026-07-31, indicación directa).
   */
  readonly tipoMargen: TipoMargen;
  /**
   * Margen indicado A MANO, en centésimas de punto, para los artículos cuya
   * subfamilia no está en la tabla del ERP (486 de 28.732). Null = usar el de la
   * tabla; si la tabla no lo tiene y esto es null, el motor NO cotiza y lo dice.
   */
  readonly margenManualCentesimas: MargenCentesimas | null;
}

// ---------------------------------------------------------------------------
// Margen comercial por subfamilia (2026-07-31)
// ---------------------------------------------------------------------------

/** Margen en centésimas de punto porcentual: 66 % = 6600, 44,93 % = 4493. */
export type MargenCentesimas = number;

/** Los dos márgenes que da el ERP: MTP (PVP) y MTC (contratista). */
export type TipoMargen = 'pvp' | 'contratista';

export interface MargenSubfamilia {
  readonly nombre: string;
  /** MTP, margen PVP. */
  readonly pvp: MargenCentesimas;
  /** MTC, margen contratista. */
  readonly contratista: MargenCentesimas;
}

export interface TablaMargenes {
  /** Cuántos dígitos de la referencia forman la subfamilia (4 hoy). */
  readonly longitudSubfamilia: number;
  readonly subfamilias: Readonly<Record<string, MargenSubfamilia>>;
}

/** Margen efectivamente aplicado, para poder mostrarlo y auditarlo. */
export interface MargenAplicado {
  readonly tipo: TipoMargen;
  /** Centésimas de punto: 6600 = 66 %. */
  readonly centesimas: MargenCentesimas;
  /** Subfamilia de la que sale, o null si es un margen indicado a mano. */
  readonly subfamilia: string | null;
  readonly nombreSubfamilia: string | null;
  /** true si lo ha escrito el comercial porque la subfamilia no está en la tabla. */
  readonly manual: boolean;
}

/** Error de validación con mensaje concreto para el comercial (§1.③). */
export interface ErrorValidacion {
  /** Paso al que pertenece el error (p. ej. 'medidas'). */
  readonly paso: 'material' | 'figura' | 'medidas' | 'suplementos';
  /** Medida concreta que falla, si aplica (p. ej. 'longitud'). */
  readonly medida?: string;
  readonly mensaje: string;
}

export interface ComponentePieza {
  /** Id del componente según la receta de la figura ('tapa', 'frontal', ...). */
  readonly id: string;
  readonly largoMm: Mm;
  readonly anchoMm: Mm;
}

export interface DetalleOcupacion {
  /** Ocupación total en la dimensión de colocación (§4). */
  readonly ocupacionMm: Mm;
  /** Dimensión útil de la baldosa en esa orientación. */
  readonly dimensionUtilMm: Mm;
  readonly numCortes: number;
  /** true si la baldosa se ha girado 90° para que la pieza quepa. */
  readonly baldosaGirada: boolean;
  /**
   * Piezas COMPLETAS que salen de una baldosa en la orientación elegida
   * (empaquetado en rejilla, receta provisional §4; ≥ 1 porque la pieza cabe).
   */
  readonly piezasPorBaldosa: number;
}

export interface LineaManipulacion {
  readonly concepto: string;
  readonly centimos: Centimos;
}

export interface DesgloseCotizacion {
  readonly materialCentimos: Centimos;
  /** Manipulación incluyendo suplementos (§1 "Cotización"). */
  readonly manipulacionCentimos: Centimos;
  readonly arranqueCentimos: Centimos;
  readonly totalSinIvaCentimos: Centimos;
  readonly ivaCentimos: Centimos;
  readonly totalConIvaCentimos: Centimos;
}

export interface ResultadoCotizacion {
  /** Componentes de UNA pieza, ya calculados a partir de las medidas. */
  readonly componentes: readonly ComponentePieza[];
  readonly ocupacion: DetalleOcupacion;
  /** Baldosas de origen necesarias (geometría pura, sin merma). */
  readonly baldosasNecesarias: number;
  /** Baldosas tras aplicar el % de merma (redondeo hacia arriba). */
  readonly baldosasConMerma: number;
  /** Piezas facturadas: las de las cajas completas, sobrante incluido. */
  readonly unidadesFacturadas: number;
  /** Cajas completas facturadas; siempre ≥ 1 (se factura por cajas). */
  readonly cajasFacturadas: number;
  readonly m2Facturados: number;
  readonly lineasManipulacion: readonly LineaManipulacion[];
  readonly desglose: DesgloseCotizacion;
  /** Precio de tarifa antes de la edición del comercial (para mostrarlo junto al editado). */
  readonly precioMaterialOriginal: Centimos;
  /**
   * Margen aplicado a los importes de este resultado. Todos los importes del
   * desglose y de las líneas ya lo llevan incorporado.
   */
  readonly margen: MargenAplicado;
}

/**
 * El motor devuelve errores de validación como valor (nunca lanza excepciones
 * por entrada de usuario). `null` solo cuando aún faltan datos para calcular.
 */
export type SalidaMotor =
  | { readonly ok: true; readonly resultado: ResultadoCotizacion }
  | { readonly ok: false; readonly errores: readonly ErrorValidacion[] };
