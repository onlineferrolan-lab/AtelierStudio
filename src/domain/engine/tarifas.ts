/**
 * Resolución de la tarifa lineal de una figura y de la longitud a tarifar.
 *
 * Estas funciones son de bajo nivel: ante configuración incoherente (tarifa
 * inexistente, medida no declarada) lanzan `Error`, porque es un fallo de
 * configuración y NO de entrada de usuario. `calcularCotizacion` comprueba
 * todas las referencias antes de llamarlas y devuelve esos problemas como
 * `ErrorValidacion`, de modo que nunca lanza por entrada de usuario.
 */

import type {
  Configuracion,
  Figura,
  ReglaLongitudTarifa,
  ReglaTarifa,
  TarifaLineal,
} from '../config';
import type { Mm } from '../types';
import { mm } from '../units';

/** Ids de tarifa de UNA regla. */
function idsDeRegla(regla: ReglaTarifa): readonly string[] {
  switch (regla.tipo) {
    case 'fija':
      return [regla.tarifaId];
    case 'porUmbral':
      return [regla.tarifaIdMenorOIgual, regla.tarifaIdMayor];
  }
}

/**
 * Ids de tarifa que referencia una figura (para validación previa). Incluye la
 * `tarifaAdicional` de las figuras compuestas: si no, una tabica con la tarifa
 * del zócalo mal escrita pasaría la validación y reventaría al calcular.
 */
export function tarifasReferenciadas(figura: Figura): readonly string[] {
  const ids: string[] = [];
  if (figura.tarifa !== null) ids.push(...idsDeRegla(figura.tarifa));
  if (figura.tarifaAdicional !== null) ids.push(...idsDeRegla(figura.tarifaAdicional.tarifa));
  return ids;
}

/** Ids de medida que necesita una regla de longitud de tarifa. */
function medidasDeLongitud(regla: ReglaLongitudTarifa): readonly string[] {
  return regla.tipo === 'medida' ? [regla.medida] : [regla.largoDe, regla.anchoDe];
}

/** Ids de medida que necesitan las tarifas y las longitudes de tarifa de la figura. */
export function medidasReferenciadas(figura: Figura): readonly string[] {
  const ids: string[] = [];
  if (figura.tarifa?.tipo === 'porUmbral') ids.push(figura.tarifa.medida);
  if (figura.longitudTarifa !== null) ids.push(...medidasDeLongitud(figura.longitudTarifa));
  if (figura.tarifaAdicional !== null) {
    if (figura.tarifaAdicional.tarifa.tipo === 'porUmbral') {
      ids.push(figura.tarifaAdicional.tarifa.medida);
    }
    ids.push(...medidasDeLongitud(figura.tarifaAdicional.longitudTarifa));
  }
  for (const c of figura.componentes) ids.push(c.largoDe, c.anchoDe);
  return ids;
}

/** Resuelve una regla de tarifa concreta (la principal o la adicional). */
function resolverRegla(
  regla: ReglaTarifa,
  figuraId: string,
  medidasMm: Readonly<Record<string, Mm>>,
  config: Configuracion,
): TarifaLineal {
  let id: string;
  switch (regla.tipo) {
    case 'fija':
      id = regla.tarifaId;
      break;
    case 'porUmbral': {
      const valor = medidasMm[regla.medida];
      if (valor === undefined) {
        throw new Error(`Regla porUmbral de '${figuraId}': falta la medida '${regla.medida}'.`);
      }
      id = valor <= regla.umbralMm ? regla.tarifaIdMenorOIgual : regla.tarifaIdMayor;
      break;
    }
  }
  const tarifa = config.tarifas[id];
  if (!tarifa) {
    throw new Error(`La tarifa '${id}' no existe en la configuración.`);
  }
  return tarifa;
}

/** Resuelve la tarifa lineal aplicable según la regla de la figura (fija/porUmbral). */
export function resolverTarifa(
  figura: Figura,
  medidasMm: Readonly<Record<string, Mm>>,
  config: Configuracion,
): TarifaLineal {
  if (figura.tarifa === null) {
    throw new Error(`La figura '${figura.id}' no tiene tarifa (figura pendiente, §6).`);
  }
  return resolverRegla(figura.tarifa, figura.id, medidasMm, config);
}

/**
 * Tarifa de la SEGUNDA parte de una figura compuesta (el zócalo de la tabica).
 * Null si la figura no es compuesta, que es el caso normal.
 */
export function resolverTarifaAdicional(
  figura: Figura,
  medidasMm: Readonly<Record<string, Mm>>,
  config: Configuracion,
): TarifaLineal | null {
  if (figura.tarifaAdicional === null) return null;
  return resolverRegla(figura.tarifaAdicional.tarifa, figura.id, medidasMm, config);
}

/** Longitud (mm) de una regla concreta. */
function longitudDeRegla(
  regla: ReglaLongitudTarifa,
  figuraId: string,
  medidasMm: Readonly<Record<string, Mm>>,
): Mm {
  if (regla.tipo === 'medida') {
    const valor = medidasMm[regla.medida];
    if (valor === undefined) {
      throw new Error(`Longitud de tarifa de '${figuraId}': falta la medida '${regla.medida}'.`);
    }
    return valor;
  }
  // PROVISIONAL (§4, pendiente del croquis de taller): el corte de piezas se
  // tarifa por el perímetro del rectángulo, 2·(largo+ancho). Confirmar con taller.
  const largo = medidasMm[regla.largoDe];
  const ancho = medidasMm[regla.anchoDe];
  if (largo === undefined || ancho === undefined) {
    throw new Error(
      `Longitud de tarifa de '${figuraId}': faltan '${regla.largoDe}' o '${regla.anchoDe}'.`,
    );
  }
  return mm(2 * (largo + ancho));
}

/** Longitud (mm) a la que se aplica la tarifa lineal y los suplementos por cm. */
export function longitudTarifaMm(figura: Figura, medidasMm: Readonly<Record<string, Mm>>): Mm {
  if (figura.longitudTarifa === null) {
    throw new Error(`La figura '${figura.id}' no tiene regla de longitud de tarifa.`);
  }
  return longitudDeRegla(figura.longitudTarifa, figura.id, medidasMm);
}

/** Longitud (mm) de la segunda tarifa de una figura compuesta. Null si no lo es. */
export function longitudTarifaAdicionalMm(
  figura: Figura,
  medidasMm: Readonly<Record<string, Mm>>,
): Mm | null {
  if (figura.tarifaAdicional === null) return null;
  return longitudDeRegla(figura.tarifaAdicional.longitudTarifa, figura.id, medidasMm);
}
