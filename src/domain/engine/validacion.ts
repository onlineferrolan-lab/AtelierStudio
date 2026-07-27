/**
 * Validación de medidas crudas (texto tecleado por el comercial, en cm) contra
 * los campos declarados por la figura, y conversión a milímetros enteros.
 *
 * §1.③: mensajes de error concretos por medida, nunca un genérico.
 * §1 "Unidades y precisión": la comparación de mínimos/máximos/opciones se
 * hace sobre el valor YA convertido a milímetros enteros, que es la unidad
 * real del sistema (p. ej. 7,15 cm se redondea a 72 mm antes de comparar).
 */

import type { CampoMedida, Figura } from '../config';
import type { ErrorValidacion, MedidasCrudas, Mm } from '../types';
import { cmAMm, mmACm } from '../units';
import { fmtCm, listaOpciones, nombreMedida } from './formato';

export type ResultadoValidacionMedidas =
  | { readonly ok: true; readonly medidasMm: Record<string, Mm> }
  | { readonly ok: false; readonly errores: ErrorValidacion[] };

/**
 * Comprueba un valor ya convertido a mm contra min/max/opciones del campo.
 * Devuelve el mensaje de error (español, concreto) o null si es válido.
 * `cmIndicado` es el valor en cm que se muestra al comercial en el mensaje.
 */
export function comprobarCampoMm(
  campo: CampoMedida,
  valorMm: Mm,
  cmIndicado: number,
): string | null {
  const nombre = nombreMedida(campo.etiqueta);
  const minMm = cmAMm(campo.minCm);
  if (valorMm < minMm) {
    return `La medida «${nombre}» no puede ser menor que ${fmtCm(campo.minCm)} cm (indicado: ${fmtCm(cmIndicado)} cm).`;
  }
  if (campo.maxCm !== null) {
    const maxMm = cmAMm(campo.maxCm);
    if (valorMm > maxMm) {
      return `La medida «${nombre}» no puede ser mayor que ${fmtCm(campo.maxCm)} cm (indicado: ${fmtCm(cmIndicado)} cm).`;
    }
  }
  if (campo.opcionesCm !== null) {
    const opcionesMm = campo.opcionesCm.map(cmAMm);
    if (!opcionesMm.includes(valorMm)) {
      return `La medida «${nombre}» solo admite ${listaOpciones(campo.opcionesCm)} cm (indicado: ${fmtCm(cmIndicado)} cm).`;
    }
  }
  return null;
}

/**
 * Valida las medidas crudas (texto tecleado, en cm) contra los campos de la
 * figura y las convierte a milímetros enteros. Se acepta coma o punto decimal
 * (teclado es-ES). Acumula un error por cada medida incorrecta.
 */
export function validarMedidasCrudas(
  figura: Figura,
  crudas: MedidasCrudas,
): ResultadoValidacionMedidas {
  const errores: ErrorValidacion[] = [];
  const medidasMm: Record<string, Mm> = {};

  for (const campo of figura.medidas) {
    const nombre = nombreMedida(campo.etiqueta);
    const texto = (crudas[campo.id] ?? '').trim();

    if (texto === '') {
      errores.push({
        paso: 'medidas',
        medida: campo.id,
        mensaje: `«${nombre}» es obligatoria.`,
      });
      continue;
    }

    // Se acepta coma o punto decimal. "1,2,3" o "12a" → NaN → no numérico.
    const numero = Number(texto.replace(',', '.'));
    if (!Number.isFinite(numero)) {
      errores.push({
        paso: 'medidas',
        medida: campo.id,
        mensaje: `«${texto}» no es un número válido para la medida «${nombre}». Usa coma o punto para los decimales (p. ej. 7,2).`,
      });
      continue;
    }

    const valorMm = cmAMm(numero);
    const error = comprobarCampoMm(campo, valorMm, numero);
    if (error !== null) {
      errores.push({ paso: 'medidas', medida: campo.id, mensaje: error });
      continue;
    }
    medidasMm[campo.id] = valorMm;
  }

  return errores.length > 0 ? { ok: false, errores } : { ok: true, medidasMm };
}

/**
 * Revalida medidas ya convertidas (entrada del motor) contra los campos de la
 * figura: presencia y rango. Devuelve los errores encontrados (puede ser []).
 * El motor no confía en que la UI haya llamado antes a `validarMedidasCrudas`.
 */
export function revalidarMedidasMm(
  figura: Figura,
  medidasMm: Readonly<Record<string, Mm>>,
): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  for (const campo of figura.medidas) {
    const valor = medidasMm[campo.id];
    const nombre = nombreMedida(campo.etiqueta);
    if (valor === undefined || !Number.isInteger(valor)) {
      errores.push({
        paso: 'medidas',
        medida: campo.id,
        mensaje: `Falta la medida «${nombre}»: es obligatoria para «${figura.nombre}».`,
      });
      continue;
    }
    const error = comprobarCampoMm(campo, valor, mmACm(valor));
    if (error !== null) {
      errores.push({ paso: 'medidas', medida: campo.id, mensaje: error });
    }
  }
  return errores;
}
