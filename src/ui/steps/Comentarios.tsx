/**
 * Comentarios de la orden: texto libre del comercial para taller.
 *
 * Va entre el paso ④ Suplementos y la cotización, y sale tal cual en la orden de
 * trabajo. NO es un paso numerado a propósito: es opcional y no forma parte del
 * flujo de cotizar, así que tampoco se pliega — si estuviera cerrado por defecto
 * nadie lo encontraría.
 *
 * No toca el cálculo: es una anotación para el taller (indicaciones de corte,
 * avisos de obra, quién recoge…).
 */

import { useAtelier } from '../state/quote-state';

/** Tope de longitud: en el PDF hay sitio para unas 6 líneas sin descolocar la hoja. */
const MAX_COMENTARIOS = 400;

export function Comentarios(): JSX.Element {
  const { estado, dispatch } = useAtelier();
  const restantes = MAX_COMENTARIOS - estado.comentarios.length;

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      aria-label="Comentarios para taller"
    >
      <label
        htmlFor="comentarios-orden"
        className="block text-sm font-semibold text-slate-800"
      >
        Comentarios para taller
      </label>
      <p className="pt-0.5 text-xs text-slate-500">
        Opcional. Sale tal cual en la orden de trabajo; no afecta al precio.
      </p>
      <textarea
        id="comentarios-orden"
        value={estado.comentarios}
        maxLength={MAX_COMENTARIOS}
        rows={3}
        onChange={(e) => dispatch({ tipo: 'cambiarComentarios', comentarios: e.target.value })}
        placeholder="P. ej.: cortar el frontal a 45°, entregar antes del viernes, recoge el cliente…"
        className="mt-2 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-marca focus:ring-2 focus:ring-marca/20"
      />
      {estado.comentarios.length > 0 ? (
        <p className="pt-1 text-right text-xs text-slate-400">
          {restantes} caracteres restantes
        </p>
      ) : null}
    </section>
  );
}
