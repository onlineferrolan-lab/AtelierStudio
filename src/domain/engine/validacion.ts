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

    // Medida fija por la figura (altura de los rodapiés de 7,2 y de 8): no la
    // teclea el comercial, así que no puede faltar ni fallar. Que el valor esté
    // dentro de sus propios límites lo garantiza `validarConfiguracion` al
    // cargar, no una comprobación por cotización.
    if (campo.valorFijoCm !== null) {
      medidasMm[campo.id] = cmAMm(campo.valorFijoCm);
      continue;
    }

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
 * Los dos modos de entrada del paso ③ para las figuras que se venden por metro
 * lineal (rodapiés, 2026-07-31, indicación directa):
 *  - 'largo': el de siempre, el comercial teclea el largo de la pieza.
 *  - 'metros': teclea cuántos METROS quiere en total y en cuántas unidades, y el
 *    largo de cada pieza se deduce.
 */
export type ModoMedida = 'largo' | 'metros';

/** Id del campo de los metros; los errores del modo 'metros' se cuelgan de él. */
export const MEDIDA_METROS = 'metros';

/**
 * Largo de cada pieza a partir de los metros pedidos: `metros × 100 ÷ unidades`,
 * en cm. Se devuelve en cm sin redondear — el redondeo a milímetros enteros lo
 * hace `cmAMm` en el mismo punto de entrada que cualquier otra medida tecleada,
 * para que 30 m en 7 unidades no dependa de por dónde se redondee.
 */
export function largoCmPorMetros(metros: number, unidades: number): number {
  return (metros * 100) / unidades;
}

/**
 * Valida las medidas cuando el largo NO se teclea sino que sale de los metros
 * pedidos (`figura.medidaPorMetros`). El resto de medidas se validan igual que
 * siempre.
 *
 * Los errores del largo deducido se cuelgan del campo «metros», que es el que el
 * comercial tiene delante: colgarlos de un campo que en este modo ni se ve
 * dejaría el error sin sitio donde pintarse (§1.③).
 */
export function validarMedidasPorMetros(
  figura: Figura,
  crudas: MedidasCrudas,
  metrosCrudos: string,
  unidades: number,
): ResultadoValidacionMedidas {
  const idDerivada = figura.medidaPorMetros;
  // Figura que no se vende por metros: el modo no aplica y se valida normal.
  if (idDerivada === null) return validarMedidasCrudas(figura, crudas);

  const errorMetros = (mensaje: string): ResultadoValidacionMedidas => ({
    ok: false,
    errores: [{ paso: 'medidas', medida: MEDIDA_METROS, mensaje }],
  });

  const texto = metrosCrudos.trim();
  if (texto === '') return errorMetros('«Metros» es obligatorio.');

  const metros = Number(texto.replace(',', '.'));
  if (!Number.isFinite(metros)) {
    return errorMetros(
      `«${texto}» no es un número válido para los metros. Usa coma o punto para los decimales (p. ej. 12,5).`,
    );
  }
  if (metros <= 0) return errorMetros('Los metros tienen que ser mayores que 0.');
  // Sin unidades válidas no hay entre cuántas piezas repartir. La cantidad ya se
  // valida antes que esto, así que aquí solo se cubre la llamada directa.
  if (!Number.isInteger(unidades) || unidades < 1) {
    return {
      ok: false,
      errores: [
        {
          paso: 'medidas',
          medida: 'cantidad',
          mensaje: 'La cantidad debe ser un número entero mayor que 0.',
        },
      ],
    };
  }

  const largoCm = largoCmPorMetros(metros, unidades);
  // El largo deducido entra por la misma puerta que uno tecleado: mismo
  // redondeo a mm y mismos límites de la figura. `String` de un número JS
  // vuelve a leerse exacto, así que el rodeo por texto no pierde precisión.
  const resultado = validarMedidasCrudas(figura, { ...crudas, [idDerivada]: String(largoCm) });
  if (resultado.ok) return resultado;

  const nombreDerivada = nombreMedida(
    figura.medidas.find((m) => m.id === idDerivada)?.etiqueta ?? idDerivada,
  );
  return {
    ok: false,
    errores: resultado.errores.map((error) =>
      error.medida === idDerivada
        ? {
            ...error,
            medida: MEDIDA_METROS,
            mensaje: `Con ${fmtCm(metros)} m en ${unidades} ${unidades === 1 ? 'unidad' : 'unidades'} cada pieza sale de ${fmtCm(largoCm)} cm de ${nombreDerivada.toLowerCase()}. ${error.mensaje}`,
          }
        : error,
    ),
  };
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
