/**
 * «Parámetros avanzados»: el margen comercial.
 *
 * Va PLEGADO y al final de la cotización a propósito (2026-07-31, indicación
 * directa: «que no esté en la más pública de las vistas»). No está oculto —el
 * comercial tiene que poder ver con qué margen está presupuestando, porque si no
 * puede dar un precio equivocado sin enterarse— pero tampoco invita a tocarlo.
 *
 * Dos controles, deliberadamente SEPARADOS:
 *
 *  1. **Tipo de margen**: MTP (PVP) o MTC (contratista). Arranca en PVP, que es
 *     el más alto de los dos en las 726 subfamilias.
 *  2. **Margen a mano**: solo para los artículos cuya subfamilia no está en la
 *     tabla del ERP (486 de 28.732). Va en su propio bloque, no debajo del
 *     selector de tipo (indicación expresa), porque no es «otro tipo de margen»:
 *     es el parche para cuando falta el dato.
 */

import { useState } from 'react';
import type { MargenAplicado } from '../../domain/types';
import { Campo, ControlSegmentado, EntradaNumero } from '../components/primitivas';
import { useAtelier } from '../state/quote-state';

/** Solo números positivos con hasta 2 decimales (los márgenes del ERP los tienen). */
const RE_MARGEN = /^\d{0,3}([.,]\d{0,2})?$/;

const FORMATO_MARGEN = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/** Texto de lo que se está aplicando, para que nunca sea una incógnita. */
function textoMargenAplicado(margen: MargenAplicado): string {
  const pct = `${FORMATO_MARGEN.format(margen.centesimas / 100)} %`;
  const tipo = margen.tipo === 'pvp' ? 'PVP' : 'contratista';
  if (margen.manual) return `Aplicando ${pct} (${tipo}), indicado a mano.`;
  const de = margen.nombreSubfamilia
    ? `${margen.subfamilia} · ${margen.nombreSubfamilia}`
    : margen.subfamilia;
  return `Aplicando ${pct} (${tipo}) de la subfamilia ${de}.`;
}

export function ParametrosAvanzados({
  margenAplicado,
  faltaMargen,
}: {
  /** Margen del resultado, si hay cotización. */
  readonly margenAplicado: MargenAplicado | null;
  /** true si el motor no ha podido cotizar por falta de margen. */
  readonly faltaMargen: boolean;
}): JSX.Element {
  const { estado, dispatch } = useAtelier();
  // Si falta el margen, se abre solo: es la única forma de desbloquear el precio
  // y dejarlo plegado sería esconder justo lo que hay que rellenar.
  const [abiertoManual, setAbiertoManual] = useState(false);
  const abierto = abiertoManual || faltaMargen;

  function alCambiarManual(valor: string): void {
    if (RE_MARGEN.test(valor)) {
      dispatch({ tipo: 'cambiarMargenManual', porcentaje: valor });
    }
  }

  return (
    <div className="mt-1 rounded-md border border-slate-200">
      <button
        type="button"
        onClick={() => setAbiertoManual((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Parámetros avanzados
        </span>
        <span className="text-slate-400" aria-hidden>
          {abierto ? '▾' : '▸'}
        </span>
      </button>

      {abierto ? (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
          <Campo etiqueta="Margen comercial">
            <div>
              <ControlSegmentado
                opciones={[
                  { valor: 'pvp' as const, etiqueta: 'PVP' },
                  { valor: 'contratista' as const, etiqueta: 'Contratista' },
                ]}
                valor={estado.tipoMargen}
                alCambiar={(tipoMargen) => dispatch({ tipo: 'cambiarTipoMargen', tipoMargen })}
                ariaLabel="Tipo de margen comercial"
              />
            </div>
          </Campo>
          {margenAplicado !== null ? (
            <p className="text-xs text-slate-500">{textoMargenAplicado(margenAplicado)}</p>
          ) : null}

          {/* Bloque APARTE: no es otro tipo de margen, es el parche para cuando
              el artículo no está en la tabla del ERP. */}
          <div className="border-t border-slate-100 pt-3">
            <Campo
              etiqueta="Margen a mano (%)"
              ayuda="Solo para artículos cuya subfamilia no está en la tabla del ERP. Se aplica en lugar del de la tabla, con el tipo elegido arriba. Déjalo vacío para usar el de la tabla."
            >
              <EntradaNumero
                valor={estado.margenManualPorcentaje}
                alCambiar={alCambiarManual}
                invalido={faltaMargen && estado.margenManualPorcentaje.trim() === ''}
                aria-label="Margen comercial a mano, en por ciento"
                placeholder="p. ej. 66"
              />
            </Campo>
            {faltaMargen ? (
              <p className="pt-1 text-xs text-red-600">
                Este artículo no tiene margen en la tabla: escríbelo aquí para poder calcular el
                precio.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
