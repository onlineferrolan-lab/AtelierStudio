/**
 * De la figura y sus medidas a la SECCIÓN de la pieza y sus cotas.
 *
 * Módulo PURO: no importa three.js. Es lo que permite que el PDF de orden de
 * trabajo dibuje el croquis sin arrastrar el motor 3D al bundle inicial — antes
 * `cotizacion.tsx` importaba `viewer/geometria.ts` y con él los 505 kB de three,
 * aunque el comercial no abriera nunca la pestaña del visor.
 *
 * El visor añade encima la capa three.js (`src/viewer/geometria.ts`): extruye
 * esta sección y monta la malla. La forma en sí vive en `seccionPieza.ts`.
 *
 * Las medidas llegan como `Mm` (enteros del dominio) y aquí se convierten a
 * unidades de escena (1 unidad = 1 cm) como float de dibujo: esta capa solo
 * representa, nunca alimenta cotizaciones.
 */

import type { ComponenteReceta, Figura } from '../domain/config';
import {
  SIN_SUPLEMENTOS,
  grosorConEspesado,
  seccionEscuadra,
  seccionListon,
  seccionPlancha,
  seccionRomo,
  seccionTabica,
  type SeccionPieza,
  type SuplementosSeccion,
} from './seccionPieza';
import type { Mm } from '../domain/types';
import { mm } from '../domain/units';

/** 1 unidad de escena = 1 cm (proporciones reales, §1 "Visor 3D"). */
const UNIDADES_POR_MM = 0.1;

/**
 * PROVISIONAL (TODO taller): grosor de la baldosa. Ni `parametros.json` ni
 * `Material.formato` recogen todavía el grosor, y las props del visor no
 * incluyen configuración; se usa 10 mm (habitual en pavimento) hasta que el
 * dato viva en configuración. SOLO afecta a la representación, no al cálculo.
 */
export const GROSOR_BALDOSA_PROVISIONAL: Mm = mm(10);

/**
 * Dientes tras el frontal por figura, según los dibujos de referencia de la
 * tarifa: la nariz mide `dientes + 1` grosores. La receta `[tapa, frontal]` es
 * idéntica en las Figuras 1–3, así que el nº de dientes se distingue aquí por id
 * de figura — igual que la doble media caña del pasamanos romo. La Figura 4 NO
 * lleva dientes: su seña es el retorno. PROVISIONAL (§3): solo representación;
 * no toca ocupación ni tarifa.
 */
const DIENTES_POR_FIGURA: Readonly<Record<string, number>> = {
  'figura-1': 0,
  'figura-2': 1,
  'figura-3': 2,
  'figura-4': 0,
  'pasamanos-1': 0,
  'pasamanos-2': 1,
  'pasamanos-3': 2,
  'pasamanos-4': 0,
};

/**
 * Suplementos que se ven en la pieza, por id de configuración. Solo están los
 * que se cobran POR CM: al recorrer la pieza de punta a punta son muescas de la
 * sección. «Angular» (por pieza, remate del extremo) y «Material espesado» (no
 * consta cuánto espesa) no se representan — ver PENDIENTES.md; un id que no esté
 * aquí simplemente no cambia la forma, nunca inventa geometría (§0).
 */
const RASGO_POR_SUPLEMENTO: Readonly<Record<string, keyof SuplementosSeccion>> = {
  'ranuras-f14': 'antideslizante',
  'ranuras-romo': 'antideslizante',
  'goteron-f14': 'goteron',
  'goteron-romo': 'goteron',
  'espesado-f14': 'espesado',
  'espesado-romo': 'espesado',
};

/** Traduce los ids de suplemento activos a los rasgos que cambian la sección. */
export function rasgosDeSuplementos(activos: readonly string[]): SuplementosSeccion {
  const rasgos = { ...SIN_SUPLEMENTOS };
  for (const id of activos) {
    const rasgo = RASGO_POR_SUPLEMENTO[id];
    if (rasgo) rasgos[rasgo] = true;
  }
  return rasgos;
}

export type EjeCota = 'x' | 'y' | 'z';

/** Dónde se apoya visualmente la línea de cota respecto a la pieza. */
export type PlanoCota =
  'frenteInferior' | 'lateralDerecho' | 'lateralIzquierdo' | 'verticalFrontal';

export interface CotaPieza {
  /** Id de la medida de la figura ('longitud', 'fondo', 'retorno'...). */
  readonly medida: string;
  readonly valorMm: Mm;
  readonly eje: EjeCota;
  readonly plano: PlanoCota;
  /** Extremos de la cota sobre su eje, en unidades de escena ya centradas. */
  readonly desde: number;
  readonly hasta: number;
}

/** true si a la receta le falta alguna medida (figura sin receta o medidas incompletas). */
export function faltanMedidasParaPieza(
  figura: Figura,
  medidasMm: Readonly<Record<string, Mm>>,
): boolean {
  return figura.componentes.some(
    (c) => medidasMm[c.largoDe] === undefined || medidasMm[c.anchoDe] === undefined,
  );
}

interface CotaCruda extends Omit<CotaPieza, 'desde' | 'hasta'> {
  readonly desde: number;
  readonly hasta: number;
}

/** Sección de la pieza, su largo de extrusión y las cotas de sus medidas. */
export interface Ensamblaje {
  readonly seccion: SeccionPieza;
  readonly largo: number;
  readonly cotas: readonly CotaCruda[];
}

/**
 * Decide la sección y el largo a partir de la receta. Devuelve null cuando la
 * figura no tiene receta representable, faltan medidas o los componentes son una
 * combinación que el visor no sabe ensamblar (no inventar geometría, §0).
 */
export function ensamblar(
  figura: Figura,
  medidasMm: Readonly<Record<string, Mm>>,
  grosorMm: Mm,
  suplementos: SuplementosSeccion,
): Ensamblaje | null {
  if (figura.componentes.length === 0 || faltanMedidasParaPieza(figura, medidasMm)) return null;

  const aEscena = (valor: Mm): number => valor * UNIDADES_POR_MM;
  const g = aEscena(grosorMm);
  const cotas: CotaCruda[] = [];
  const ids = new Set(figura.componentes.map((c) => c.id));
  const componente = (id: string): ComponenteReceta | undefined =>
    figura.componentes.find((c) => c.id === id);

  const cota = (
    medida: string,
    eje: EjeCota,
    plano: PlanoCota,
    desde: number,
    hasta: number,
  ): void => {
    cotas.push({ medida, valorMm: medidasMm[medida], eje, plano, desde, hasta });
  };

  if (ids.has('tapa') && ids.has('frontal')) {
    // Peldaños y pasamanos (Figuras 1–4): tapa + frontal, con la nariz de
    // `dientes + 1` grosores y, en la Figura 4, el retorno en la base.
    const tapa = componente('tapa');
    const frontal = componente('frontal');
    if (!tapa || !frontal) return null;
    const largo = aEscena(medidasMm[tapa.largoDe]);
    const F = aEscena(medidasMm[tapa.anchoDe]); // fondo (z)
    const h = aEscena(medidasMm[frontal.anchoDe]); // altura del frontal bajo la tapa (y)
    cota(tapa.largoDe, 'x', 'frenteInferior', 0, largo);
    cota(tapa.anchoDe, 'z', 'lateralDerecho', 0, F);

    // TABICA (2026-07-31): figura 1 con un zócalo colgado POR DETRÁS del
    // frontal, no a ras de él. Como ambos cuelgan de la cara inferior de la
    // tapa, las dos cotas verticales se miden desde arriba hacia abajo.
    const zocalo = componente('zocalo');
    if (zocalo) {
      const hz = aEscena(medidasMm[zocalo.anchoDe]);
      const bajoTapa = Math.max(h, hz);
      cota(frontal.anchoDe, 'y', 'verticalFrontal', bajoTapa - h, bajoTapa);
      cota(zocalo.anchoDe, 'y', 'verticalFrontal', bajoTapa - hz, bajoTapa);
      return {
        seccion: seccionTabica({
          fondo: F,
          alturaFrontal: h,
          alturaZocalo: hz,
          grosor: g,
          suplementos,
        }),
        largo,
        cotas,
      };
    }
    cota(frontal.anchoDe, 'y', 'verticalFrontal', 0, h);

    const dientes = DIENTES_POR_FIGURA[figura.id] ?? 0;
    const retorno = componente('retorno');
    // El retorno engorda la nariz hacia dentro, macizo: la Figura 4 no deja
    // hueco entre la tapa y el retorno (2026-07-29, indicación directa).
    const anchoRetorno = retorno ? aEscena(medidasMm[retorno.anchoDe]) : 0;
    // Pasamanos: la misma sección en espejo en el canto opuesto.
    const espejo = componente('frontal-trasero') !== undefined;
    if (retorno) {
      const zFrontal = F - (dientes + 1) * g;
      cota(retorno.anchoDe, 'z', 'lateralIzquierdo', zFrontal - anchoRetorno, zFrontal);
    }
    const seccion = seccionEscuadra({
      fondo: F,
      // El espesado engorda la tapa, así que la pieza gana altura total.
      alto: h + grosorConEspesado(g, suplementos),
      grosor: g,
      dientes,
      retorno: anchoRetorno,
      espejo,
      suplementos,
    });
    return { seccion, largo, cotas };
  }
  if (ids.has('tapa')) {
    // Peldaño romo: losa con media caña en el canto delantero. Pasamanos romo:
    // la misma media caña también en el trasero. Su receta ([tapa]) es idéntica
    // a la del peldaño romo, así que la doble media caña se distingue aquí por
    // id de figura — PROVISIONAL (§3).
    const tapa = componente('tapa');
    if (!tapa) return null;
    const largo = aEscena(medidasMm[tapa.largoDe]);
    const fondo = aEscena(medidasMm[tapa.anchoDe]);
    cota(tapa.largoDe, 'x', 'frenteInferior', 0, largo);
    cota(tapa.anchoDe, 'z', 'lateralDerecho', 0, fondo);
    const doble = figura.id === 'pasamanos-romo';
    return { seccion: seccionRomo({ fondo, grosor: g, doble, suplementos }), largo, cotas };
  }
  if (ids.has('liston')) {
    // Rodapiés: listón de pie con el canto superior en media caña.
    const liston = componente('liston');
    if (!liston) return null;
    const largo = aEscena(medidasMm[liston.largoDe]);
    const altura = aEscena(medidasMm[liston.anchoDe]);
    cota(liston.largoDe, 'x', 'frenteInferior', 0, largo);
    cota(liston.anchoDe, 'y', 'verticalFrontal', 0, altura);
    return { seccion: seccionListon({ altura, grosor: g }), largo, cotas };
  }
  if (ids.has('pieza')) {
    // Corte: pieza plana rectangular tumbada.
    const pieza = componente('pieza');
    if (!pieza) return null;
    const largo = aEscena(medidasMm[pieza.largoDe]);
    const ancho = aEscena(medidasMm[pieza.anchoDe]);
    cota(pieza.largoDe, 'x', 'frenteInferior', 0, largo);
    cota(pieza.anchoDe, 'z', 'lateralDerecho', 0, ancho);
    return { seccion: seccionPlancha({ ancho, grosor: g }), largo, cotas };
  }
  // Receta con componentes que el visor no sabe ensamblar (no inventar, §0).
  return null;
}

/**
 * Sección transversal de la pieza en el plano (z = fondo, y = alto), en unidades
 * de escena (cm), o null si la figura no es representable. Es la forma que se
 * extruye: expuesta para poder verificarla sin construir la malla.
 */
export function construirSeccion(
  figura: Figura,
  medidasMm: Readonly<Record<string, Mm>>,
  grosorMm: Mm = GROSOR_BALDOSA_PROVISIONAL,
  suplementos: SuplementosSeccion = SIN_SUPLEMENTOS,
): SeccionPieza | null {
  return ensamblar(figura, medidasMm, grosorMm, suplementos)?.seccion ?? null;
}
