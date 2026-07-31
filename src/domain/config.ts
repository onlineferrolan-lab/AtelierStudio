/**
 * Configuración de Atelier Studio (tarifas, parámetros de taller, catálogo de figuras).
 *
 * La especificación exige (§0, §2, §3): las tarifas y las figuras se cargan de
 * configuración, NUNCA hardcodeadas en componentes. Dónde vivirá definitivamente
 * la configuración (Google Sheet o JSON) es la pregunta abierta §6.12; de momento
 * son JSON servidos desde /config, tras una interfaz `FuenteConfiguracion` que
 * permitirá cambiar el origen sin tocar el motor ni la UI.
 *
 * Los valores marcados con `provisional: true` están pendientes de taller (§6)
 * y se muestran marcados como PROVISIONAL en la interfaz.
 */

import type { Centimos, MargenSubfamilia, Milesimas, Mm, TablaMargenes } from './types';
import { centimos, eurosACentimos, eurosAMilesimas } from './money';
import { mm } from './units';

// ---------------------------------------------------------------------------
// Parámetros de taller (parametros.json)
// ---------------------------------------------------------------------------

export interface ParametrosTaller {
  /** Ancho del disco de corte. PROVISIONAL (§6.2). */
  readonly discoMm: Mm;
  /** Tolerancia de fabricación por fila de colocación. PROVISIONAL (§6.3). */
  readonly toleranciaMm: Mm;
  /** Saneado por lado de la baldosa. PROVISIONAL (§6.4: cuándo aplica, pendiente). */
  readonly saneadoPorLadoMm: Mm;
  /**
   * % de merma de reserva, solo para cuando todavía no hay material elegido y
   * por tanto no se puede calcular la sugerida por formato.
   */
  readonly mermaPorcentajeDefecto: number;
  /** Si el comercial puede editar la merma en la UI. PROVISIONAL (§6.10). */
  readonly mermaEditable: boolean;
  /**
   * Tramo de merma por formato (indicación directa 2026-07-31). Interpolación
   * LINEAL sobre el LADO MAYOR de la baldosa: en `mermaLadoMenorCm` o menos se
   * aplica `mermaPorcentajeLadoMenor`; en `mermaLadoMayorCm` o más,
   * `mermaPorcentajeLadoMayor`; entre medias, proporcional.
   */
  readonly mermaLadoMenorCm: number;
  readonly mermaPorcentajeLadoMenor: number;
  readonly mermaLadoMayorCm: number;
  readonly mermaPorcentajeLadoMayor: number;
  /** Puntos porcentuales que suman las figuras numeradas (se SUMAN, no multiplican). */
  readonly mermaExtraFiguraPuntos: number;
  /** Ids de figura con el extra. En configuración, no en código (§0). */
  readonly mermaFigurasConExtra: readonly string[];
  /** Arranque de máquina por orden de trabajo, en céntimos (§2: 60 €, editable). */
  readonly arranqueCentimos: Centimos;
  readonly ivaPorcentaje: number;
}

// ---------------------------------------------------------------------------
// Tarifas de manipulación y suplementos (tarifas.json)
// ---------------------------------------------------------------------------

/** Tarifa lineal en milésimas de € por cm lineal. */
export interface TarifaLineal {
  readonly id: string;
  readonly nombre: string;
  readonly milesimasPorCm: Milesimas;
}

export type TipoSuplemento = 'porPieza' | 'porCm';

export interface Suplemento {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: TipoSuplemento;
  /** porPieza → céntimos por pieza; porCm → milésimas por cm lineal. */
  readonly precioCentimos: Centimos | null;
  readonly precioMilesimasPorCm: Milesimas | null;
}

// ---------------------------------------------------------------------------
// Catálogo de figuras (figuras.json)
// ---------------------------------------------------------------------------

export interface CampoMedida {
  /** Id de la medida usado en la receta ('longitud', 'fondo', 'alturaFrontal'...). */
  readonly id: string;
  /** Etiqueta de UI, p. ej. 'Longitud (cm)'. */
  readonly etiqueta: string;
  readonly minCm: number;
  readonly maxCm: number | null;
  /** Si está presente, la medida solo puede tomar uno de estos valores (cm). */
  readonly opcionesCm: readonly number[] | null;
}

export interface ComponenteReceta {
  readonly id: string;
  /** Medida de la que sale el largo del componente. */
  readonly largoDe: string;
  /** Medida de la que sale el ancho del componente. */
  readonly anchoDe: string;
}

/**
 * Cómo se obtiene la tarifa de una figura:
 *  - fija: una sola tarifa.
 *  - porUmbral: según una medida (Figura 1: frontal ≤ 5 cm / > 5 cm).
 */
export type ReglaTarifa =
  | { readonly tipo: 'fija'; readonly tarifaId: string }
  | {
      readonly tipo: 'porUmbral';
      readonly medida: string;
      readonly umbralMm: Mm;
      readonly tarifaIdMenorOIgual: string;
      readonly tarifaIdMayor: string;
    };

/**
 * Longitud a la que se aplica la tarifa lineal:
 *  - medida: una medida de la pieza (habitualmente 'longitud').
 *  - perimetro: 2·(largo+ancho) — solo 'corte'. PROVISIONAL, ver PENDIENTES.md.
 */
export type ReglaLongitudTarifa =
  | { readonly tipo: 'medida'; readonly medida: string }
  | { readonly tipo: 'perimetro'; readonly largoDe: string; readonly anchoDe: string };

export interface Figura {
  readonly id: string;
  readonly nombre: string;
  /** 'activa' → usable; 'pendiente' → visible en la galería pero bloqueada (§6.5/§6.6). */
  readonly estado: 'activa' | 'pendiente';
  readonly motivoPendiente: string | null;
  /**
   * true mientras el croquis acotado oficial de taller siga pendiente (§3).
   * La receta actual es PROVISIONAL, deducida de los dibujos de la tarifa PDF.
   */
  readonly croquisPendiente: boolean;
  readonly medidas: readonly CampoMedida[];
  readonly componentes: readonly ComponenteReceta[];
  /** Null en figuras 'pendiente' (sin tarifa confirmada, §6.5/§6.6). */
  readonly tarifa: ReglaTarifa | null;
  readonly longitudTarifa: ReglaLongitudTarifa | null;
  /**
   * SEGUNDA tarifa de la misma pieza, para figuras COMPUESTAS (indicación
   * directa 2026-07-31: la tabica es «una figura 1 con un corte debajo de
   * zócalo, y el precio es el de las dos combinadas»).
   *
   * Genera su propia línea de manipulación, no se funde con la principal: en
   * taller y en el presupuesto se ve de qué se compone el precio. Null en las
   * figuras normales, que es el caso de todas menos la tabica.
   */
  readonly tarifaAdicional: {
    readonly tarifa: ReglaTarifa;
    readonly longitudTarifa: ReglaLongitudTarifa;
  } | null;
  /** Ids de suplementos aplicables (definidos en tarifas.json). */
  readonly suplementos: readonly string[];
}

// ---------------------------------------------------------------------------
// Configuración completa
// ---------------------------------------------------------------------------

export interface Configuracion {
  readonly parametros: ParametrosTaller;
  readonly tarifas: Readonly<Record<string, TarifaLineal>>;
  readonly suplementos: Readonly<Record<string, Suplemento>>;
  readonly figuras: readonly Figura[];
  /**
   * Márgenes comerciales por subfamilia (2026-07-31). Generado del CSV del ERP
   * por `scripts/generar-margenes.mjs`; ver `engine/margen.ts`.
   */
  readonly margenes: TablaMargenes;
}

export interface FuenteConfiguracion {
  cargar(): Promise<Configuracion>;
}

// ---------------------------------------------------------------------------
// Parseo y validación de los JSON (falla rápido y con mensaje claro)
// ---------------------------------------------------------------------------

interface ParametrosJson {
  discoMm: number;
  toleranciaMm: number;
  saneadoPorLadoMm: number;
  mermaPorcentajeDefecto: number;
  mermaEditable: boolean;
  mermaLadoMenorCm: number;
  mermaPorcentajeLadoMenor: number;
  mermaLadoMayorCm: number;
  mermaPorcentajeLadoMayor: number;
  mermaExtraFiguraPuntos: number;
  mermaFigurasConExtra: string[];
  arranqueMaquinaEuros: number;
  ivaPorcentaje: number;
}

interface TarifasJson {
  tarifas: { id: string; nombre: string; eurosPorCm: number }[];
  suplementos: (
    | { id: string; nombre: string; tipo: 'porPieza'; eurosPorPieza: number }
    | { id: string; nombre: string; tipo: 'porCm'; eurosPorCm: number }
  )[];
}

type ReglaTarifaJson =
  | { tipo: 'fija'; tarifaId: string }
  | {
      tipo: 'porUmbral';
      medida: string;
      umbralCm: number;
      tarifaIdMenorOIgual: string;
      tarifaIdMayor: string;
    };

interface FigurasJson {
  figuras: (Omit<Figura, 'tarifa' | 'medidas' | 'longitudTarifa' | 'tarifaAdicional'> & {
    tarifa: ReglaTarifaJson | null;
    medidas: (Omit<CampoMedida, 'maxCm' | 'opcionesCm'> & {
      maxCm?: number | null;
      opcionesCm?: number[] | null;
    })[];
    longitudTarifa: ReglaLongitudTarifa | null;
    /** Opcional: solo las figuras compuestas (tabica) lo traen. */
    tarifaAdicional?: {
      tarifa: ReglaTarifaJson;
      longitudTarifa: ReglaLongitudTarifa;
    } | null;
  })[];
}

function parsearParametros(json: ParametrosJson): ParametrosTaller {
  return {
    discoMm: mm(json.discoMm),
    toleranciaMm: mm(json.toleranciaMm),
    saneadoPorLadoMm: mm(json.saneadoPorLadoMm),
    mermaPorcentajeDefecto: json.mermaPorcentajeDefecto,
    mermaEditable: json.mermaEditable,
    mermaLadoMenorCm: json.mermaLadoMenorCm,
    mermaPorcentajeLadoMenor: json.mermaPorcentajeLadoMenor,
    mermaLadoMayorCm: json.mermaLadoMayorCm,
    mermaPorcentajeLadoMayor: json.mermaPorcentajeLadoMayor,
    mermaExtraFiguraPuntos: json.mermaExtraFiguraPuntos,
    mermaFigurasConExtra: json.mermaFigurasConExtra,
    arranqueCentimos: eurosACentimos(json.arranqueMaquinaEuros),
    ivaPorcentaje: json.ivaPorcentaje,
  };
}

function parsearTarifas(json: TarifasJson): {
  tarifas: Record<string, TarifaLineal>;
  suplementos: Record<string, Suplemento>;
} {
  const tarifas: Record<string, TarifaLineal> = {};
  for (const t of json.tarifas) {
    tarifas[t.id] = { id: t.id, nombre: t.nombre, milesimasPorCm: eurosAMilesimas(t.eurosPorCm) };
  }
  const suplementos: Record<string, Suplemento> = {};
  for (const s of json.suplementos) {
    suplementos[s.id] =
      s.tipo === 'porPieza'
        ? {
            id: s.id,
            nombre: s.nombre,
            tipo: 'porPieza',
            precioCentimos: eurosACentimos(s.eurosPorPieza),
            precioMilesimasPorCm: null,
          }
        : {
            id: s.id,
            nombre: s.nombre,
            tipo: 'porCm',
            precioCentimos: null,
            precioMilesimasPorCm: eurosAMilesimas(s.eurosPorCm),
          };
  }
  return { tarifas, suplementos };
}

function parsearReglaTarifa(json: ReglaTarifaJson | null): ReglaTarifa | null {
  if (json === null) return null;
  if (json.tipo === 'porUmbral') {
    return {
      tipo: 'porUmbral',
      medida: json.medida,
      umbralMm: mm(Math.round(json.umbralCm * 10)),
      tarifaIdMenorOIgual: json.tarifaIdMenorOIgual,
      tarifaIdMayor: json.tarifaIdMayor,
    };
  }
  return json;
}

function parsearFiguras(json: FigurasJson): Figura[] {
  return json.figuras.map((f) => ({
    ...f,
    medidas: f.medidas.map((m) => ({ ...m, maxCm: m.maxCm ?? null, opcionesCm: m.opcionesCm ?? null })),
    tarifa: parsearReglaTarifa(f.tarifa),
    tarifaAdicional: f.tarifaAdicional
      ? {
          // parsearReglaTarifa nunca devuelve null si la entrada no es null.
          tarifa: parsearReglaTarifa(f.tarifaAdicional.tarifa) as ReglaTarifa,
          longitudTarifa: f.tarifaAdicional.longitudTarifa,
        }
      : null,
  }));
}

/** Valida referencias cruzadas entre figuras, tarifas y suplementos. */
export function validarConfiguracion(config: Configuracion): string[] {
  const errores: string[] = [];
  const idsTarifa = Object.keys(config.tarifas);
  for (const figura of config.figuras) {
    if (figura.estado !== 'activa') continue;
    if (!figura.tarifa) {
      errores.push(`Figura activa '${figura.id}' sin regla de tarifa`);
      continue;
    }
    const tarifaIds =
      figura.tarifa.tipo === 'fija'
        ? [figura.tarifa.tarifaId]
        : [figura.tarifa.tarifaIdMenorOIgual, figura.tarifa.tarifaIdMayor];
    for (const id of tarifaIds) {
      if (!idsTarifa.includes(id)) {
        errores.push(`Figura '${figura.id}': tarifa desconocida '${id}'`);
      }
    }
    for (const idSup of figura.suplementos) {
      if (!config.suplementos[idSup]) {
        errores.push(`Figura '${figura.id}': suplemento desconocido '${idSup}'`);
      }
    }
    const idsMedida = figura.medidas.map((m) => m.id);
    for (const c of figura.componentes) {
      if (!idsMedida.includes(c.largoDe) || !idsMedida.includes(c.anchoDe)) {
        errores.push(
          `Figura '${figura.id}': componente '${c.id}' usa medidas no declaradas (${c.largoDe}, ${c.anchoDe})`,
        );
      }
    }
  }
  return errores;
}

/** Carga la configuración desde los JSON servidos en <base>/config. */
export function crearFuenteConfiguracionJson(
  baseUrl = `${import.meta.env.BASE_URL}config`,
): FuenteConfiguracion {
  return {
    async cargar(): Promise<Configuracion> {
      const [parametrosRes, tarifasRes, figurasRes, margenesRes] = await Promise.all([
        fetch(`${baseUrl}/parametros.json`),
        fetch(`${baseUrl}/tarifas.json`),
        fetch(`${baseUrl}/figuras.json`),
        fetch(`${baseUrl}/margenes.json`),
      ]);
      for (const res of [parametrosRes, tarifasRes, figurasRes, margenesRes]) {
        if (!res.ok) throw new Error(`No se pudo cargar la configuración: ${res.url}`);
      }
      const config: Configuracion = {
        parametros: parsearParametros((await parametrosRes.json()) as ParametrosJson),
        ...parsearTarifas((await tarifasRes.json()) as TarifasJson),
        figuras: parsearFiguras((await figurasRes.json()) as FigurasJson),
        margenes: parsearMargenes((await margenesRes.json()) as MargenesJson),
      };
      const errores = validarConfiguracion(config);
      if (errores.length > 0) {
        throw new Error(`Configuración inválida:\n- ${errores.join('\n- ')}`);
      }
      return config;
    },
  };
}

/** Construye configuración desde objetos ya parseados (tests). */
export function construirConfiguracion(
  parametrosJson: ParametrosJson,
  tarifasJson: TarifasJson,
  figurasJson: FigurasJson,
  margenesJson?: MargenesJson,
): Configuracion {
  return {
    parametros: parsearParametros(parametrosJson),
    ...parsearTarifas(tarifasJson),
    figuras: parsearFiguras(figurasJson),
    margenes: parsearMargenes(margenesJson),
  };
}

interface MargenesJson {
  longitudSubfamilia?: number;
  subfamilias?: Record<string, { nombre?: string; pvp: number; contratista: number }>;
}

/**
 * Parsea la tabla de márgenes. Sin fichero (o vacío) devuelve una tabla VACÍA,
 * no un margen 0: el motor distingue «no hay margen para esta subfamilia» —que
 * bloquea la cotización hasta que se indique a mano— de «margen del 0 %».
 */
function parsearMargenes(json: MargenesJson | undefined): TablaMargenes {
  const subfamilias: Record<string, MargenSubfamilia> = {};
  for (const [codigo, fila] of Object.entries(json?.subfamilias ?? {})) {
    subfamilias[codigo] = {
      nombre: fila.nombre ?? codigo,
      pvp: fila.pvp,
      contratista: fila.contratista,
    };
  }
  return { longitudSubfamilia: json?.longitudSubfamilia ?? 4, subfamilias };
}

/** Guarda de tipo para evitar `any` al leer importes sueltos. */
export function leerCentimos(n: number): Centimos {
  return centimos(n);
}
