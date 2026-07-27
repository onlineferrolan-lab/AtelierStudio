/**
 * Componentes de la pieza y ocupación sobre la baldosa (§4).
 *
 * RECETA PROVISIONAL — pendiente del croquis acotado de taller (§3) y de las
 * respuestas §6.2 (ancho real del disco), §6.3 (tolerancia) y §6.4 (reglas de
 * saneado). NO son valores confirmados por taller:
 *
 *   ocupación = Σ anchos de componentes
 *             + (nº componentes − 1) × ancho de disco   ← nº de cortes provisional
 *             + 2 × saneado por lado                    ← se sanea siempre, ambos lados
 *             + tolerancia                              ← una vez por fila de colocación
 *
 *   ocupación ≤ dimensión útil de la baldosa en la orientación elegida
 *   largo de cada componente ≤ la otra dimensión de la baldosa
 *
 * ORIENTACIÓN PROVISIONAL (§4: "giro de 90° solo cuando la orientación lo
 * permita — regla exacta por figura pendiente del croquis"): de momento se
 * prueban AMBAS orientaciones (los anchos apilados a lo ancho de la baldosa —
 * orientación natural— o a lo largo —baldosa girada 90°—) y se prefiere la
 * natural cuando cabe.
 */

import type { ParametrosTaller } from '../config';
import type {
  ComponentePieza,
  DetalleOcupacion,
  ErrorValidacion,
  FormatoBaldosa,
  Mm,
} from '../types';
import { mm } from '../units';
import { cota } from './formato';

export type ResultadoOcupacion =
  | { readonly ok: true; readonly detalle: DetalleOcupacion }
  | { readonly ok: false; readonly error: ErrorValidacion };

interface IntentoOrientacion {
  readonly girada: boolean;
  /** Dimensión de la baldosa en la que se apilan los anchos de los componentes. */
  readonly dimColocacionMm: Mm;
  /** Dimensión de la baldosa disponible para los largos de los componentes. */
  readonly dimLargosMm: Mm;
  readonly cabeOcupacion: boolean;
  readonly cabeLargos: boolean;
}

/**
 * Evalúa si los componentes de UNA pieza caben en la baldosa, probando ambas
 * orientaciones. Devuelve el detalle de ocupación o un error concreto con los
 * números reales (estilo §1.③).
 */
export function evaluarOcupacion(
  componentes: readonly ComponentePieza[],
  formato: FormatoBaldosa,
  parametros: ParametrosTaller,
): ResultadoOcupacion {
  // Receta PROVISIONAL §4 (ver cabecera): nº de cortes = nº componentes − 1.
  const numCortes = componentes.length - 1;
  const sumaAnchos = componentes.reduce((acc, c) => acc + c.anchoMm, 0);
  const ocupacion = mm(
    sumaAnchos +
      numCortes * parametros.discoMm +
      2 * parametros.saneadoPorLadoMm +
      parametros.toleranciaMm,
  );
  const largoMax = mm(Math.max(...componentes.map((c) => c.largoMm)));

  const intentos: IntentoOrientacion[] = [
    {
      girada: false,
      dimColocacionMm: formato.anchoMm,
      dimLargosMm: formato.largoMm,
      cabeOcupacion: ocupacion <= formato.anchoMm,
      cabeLargos: largoMax <= formato.largoMm,
    },
    {
      girada: true,
      dimColocacionMm: formato.largoMm,
      dimLargosMm: formato.anchoMm,
      cabeOcupacion: ocupacion <= formato.largoMm,
      cabeLargos: largoMax <= formato.anchoMm,
    },
  ];

  // Preferencia PROVISIONAL: primero la orientación natural; si no cabe, el giro de 90°.
  const elegido = intentos.find((i) => i.cabeOcupacion && i.cabeLargos);
  if (elegido) {
    return {
      ok: true,
      detalle: {
        ocupacionMm: ocupacion,
        dimensionUtilMm: elegido.dimColocacionMm,
        numCortes,
        baldosaGirada: elegido.girada,
      },
    };
  }

  // No cabe en ninguna orientación: mensaje concreto con los números reales.
  const maxDimLargos = mm(Math.max(formato.largoMm, formato.anchoMm));
  let mensaje: string;
  if (largoMax > maxDimLargos) {
    // La pieza es demasiado larga para el formato en cualquier orientación (§1.③).
    mensaje = `La pieza mide ${cota(largoMax)}; el formato solo llega a ${cota(maxDimLargos)}.`;
  } else {
    // Los largos caben, pero los anchos apilados no caben en la dimensión que
    // queda libre en la orientación que admitiría los largos.
    const viables = intentos.filter((i) => i.cabeLargos);
    const mejor =
      viables.length > 0
        ? viables.reduce((a, b) => (a.dimColocacionMm >= b.dimColocacionMm ? a : b))
        : intentos.reduce((a, b) => (a.dimColocacionMm >= b.dimColocacionMm ? a : b));
    mensaje = `La pieza necesita ${cota(ocupacion)} de ancho; el formato solo permite ${cota(mejor.dimColocacionMm)}.`;
  }
  return { ok: false, error: { paso: 'medidas', mensaje } };
}
