/**
 * Resolución de la tarifa lineal de una figura y de la longitud a tarifar.
 *
 * Estas funciones son de bajo nivel: ante configuración incoherente (tarifa
 * inexistente, medida no declarada) lanzan `Error`, porque es un fallo de
 * configuración y NO de entrada de usuario. `calcularCotizacion` comprueba
 * todas las referencias antes de llamarlas y devuelve esos problemas como
 * `ErrorValidacion`, de modo que nunca lanza por entrada de usuario.
 */

import type { Configuracion, Figura, TarifaLineal } from '../config';
import type { Mm } from '../types';
import { mm } from '../units';

/** Ids de tarifa que referencia la regla de una figura (para validación previa). */
export function tarifasReferenciadas(figura: Figura): readonly string[] {
  const regla = figura.tarifa;
  if (regla === null) return [];
  switch (regla.tipo) {
    case 'fija':
      return [regla.tarifaId];
    case 'pintable':
      return [regla.tarifaId, regla.tarifaIdPintado];
    case 'porUmbral':
      return [regla.tarifaIdMenorOIgual, regla.tarifaIdMayor];
  }
}

/** Ids de medida que necesitan la tarifa y la longitud de tarifa de la figura. */
export function medidasReferenciadas(figura: Figura): readonly string[] {
  const ids: string[] = [];
  if (figura.tarifa?.tipo === 'porUmbral') ids.push(figura.tarifa.medida);
  if (figura.longitudTarifa?.tipo === 'medida') ids.push(figura.longitudTarifa.medida);
  if (figura.longitudTarifa?.tipo === 'perimetro') {
    ids.push(figura.longitudTarifa.largoDe, figura.longitudTarifa.anchoDe);
  }
  for (const c of figura.componentes) ids.push(c.largoDe, c.anchoDe);
  return ids;
}

/** Resuelve la tarifa lineal aplicable según la regla de la figura (fija/porUmbral/pintable). */
export function resolverTarifa(
  figura: Figura,
  medidasMm: Readonly<Record<string, Mm>>,
  pintado: boolean,
  config: Configuracion,
): TarifaLineal {
  const regla = figura.tarifa;
  if (regla === null) {
    throw new Error(`La figura '${figura.id}' no tiene tarifa (figura pendiente, §6).`);
  }
  let id: string;
  switch (regla.tipo) {
    case 'fija':
      id = regla.tarifaId;
      break;
    case 'pintable':
      // Regla pintable (§2): el pintado solo cambia la tarifa de los rodapiés.
      id = pintado ? regla.tarifaIdPintado : regla.tarifaId;
      break;
    case 'porUmbral': {
      const valor = medidasMm[regla.medida];
      if (valor === undefined) {
        throw new Error(`Regla porUmbral de '${figura.id}': falta la medida '${regla.medida}'.`);
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

/** Longitud (mm) a la que se aplica la tarifa lineal y los suplementos por cm. */
export function longitudTarifaMm(figura: Figura, medidasMm: Readonly<Record<string, Mm>>): Mm {
  const regla = figura.longitudTarifa;
  if (regla === null) {
    throw new Error(`La figura '${figura.id}' no tiene regla de longitud de tarifa.`);
  }
  if (regla.tipo === 'medida') {
    const valor = medidasMm[regla.medida];
    if (valor === undefined) {
      throw new Error(`Longitud de tarifa de '${figura.id}': falta la medida '${regla.medida}'.`);
    }
    return valor;
  }
  // PROVISIONAL (§4, pendiente del croquis de taller): el corte de piezas se
  // tarifa por el perímetro del rectángulo, 2·(largo+ancho). Confirmar con taller.
  const largo = medidasMm[regla.largoDe];
  const ancho = medidasMm[regla.anchoDe];
  if (largo === undefined || ancho === undefined) {
    throw new Error(
      `Longitud de tarifa de '${figura.id}': faltan '${regla.largoDe}' o '${regla.anchoDe}'.`,
    );
  }
  return mm(2 * (largo + ancho));
}
