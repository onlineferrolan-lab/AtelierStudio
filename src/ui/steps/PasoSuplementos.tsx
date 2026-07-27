/**
 * Paso ④ Suplementos (§1.④, §2).
 *
 * Para la figura activa: un conmutador por cada suplemento aplicable
 * (`figura.suplementos`), con nombre y precio leídos SIEMPRE de configuración
 * (`config.suplementos`, nunca hardcodeados): «+2,00 €/peldaño» para los de
 * porPieza, «+0,02 €/cm» para los de porCm. Cuando la figura `tienePintado`,
 * conmutador «Pintado» que cambia la tarifa al precio de pintado (rodapiés,
 * §2). Cada cambio actualiza la cotización al momento vía el estado global.
 *
 * El paso ③ Medidas no se cierra solo (ver `PasoMedidas`): este paso es quien
 * lo cierra, y solo cuando el comercial ya está actuando aquí — al activar un
 * suplemento/pintado, o al mover el ratón sobre esta tarjeta (señal de que ha
 * pasado a mirar suplementos, aunque todavía no haya tocado nada).
 */

import type { Suplemento } from '../../domain/config';
import { figuraPorId } from '../../domain/engine';
import { formatearEuros } from '../../domain/money';
import { useConfig } from '../state/config-context';
import { useAtelier } from '../state/quote-state';
import { usePasos } from '../state/pasos-context';
import { FilaConmutador, InfoTooltip, PasoCard } from '../components/primitivas';

/**
 * Precio del suplemento para mostrar junto al conmutador. Las milésimas se
 * convierten a € SOLO para presentación (el cálculo sigue en enteros en el
 * motor). «€/peldaño» sigue el ejemplo de la spec (§1.④); los suplementos
 * porPieza actuales aplican a peldaños.
 */
function precioSuplementoTexto(suplemento: Suplemento): string {
  if (suplemento.tipo === 'porPieza' && suplemento.precioCentimos != null) {
    return `+${formatearEuros(suplemento.precioCentimos)}/peldaño`;
  }
  if (suplemento.tipo === 'porCm' && suplemento.precioMilesimasPorCm != null) {
    const euros = suplemento.precioMilesimasPorCm / 1000;
    const texto = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 3,
    }).format(euros);
    return `+${texto}/cm`;
  }
  return '';
}

/** Conmutador «Pintado» (tarifa alternativa de rodapiés, §2) con tooltip. */
function FilaPintado({
  activo,
  alCambiar,
}: {
  activo: boolean;
  alCambiar: (activo: boolean) => void;
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
      <input
        type="checkbox"
        checked={activo}
        onChange={(e) => alCambiar(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-marca"
      />
      <span className="flex items-center gap-1.5 text-sm text-slate-800">
        Pintado
        <InfoTooltip texto="Cambia la tarifa de la figura al precio de pintado." />
      </span>
    </label>
  );
}

export function PasoSuplementos(): JSX.Element {
  const config = useConfig();
  const { estado, dispatch } = useAtelier();
  const pasos = usePasos();

  const figura = estado.figuraId ? figuraPorId(config, estado.figuraId) : undefined;

  let contenido: JSX.Element;
  if (!figura) {
    contenido = <p className="text-sm text-slate-500">Selecciona primero una figura en el paso 2.</p>;
  } else if (figura.suplementos.length === 0 && !figura.tienePintado) {
    contenido = <p className="text-sm text-slate-500">Esta figura no tiene suplementos.</p>;
  } else {
    contenido = (
      <div className="flex flex-col divide-y divide-slate-100">
        {figura.suplementos.map((idSuplemento) => {
          const suplemento = config.suplementos[idSuplemento];
          if (!suplemento) return null; // validarConfiguracion ya lo impide al cargar
          return (
            <FilaConmutador
              key={idSuplemento}
              etiqueta={suplemento.nombre}
              detalle={precioSuplementoTexto(suplemento)}
              activo={estado.suplementos[idSuplemento] === true}
              alCambiar={(activo) => {
                pasos.cerrar(3);
                dispatch({ tipo: 'alternarSuplemento', suplemento: idSuplemento, activo });
              }}
            />
          );
        })}
        {figura.tienePintado ? (
          <FilaPintado
            activo={estado.pintado}
            alCambiar={(pintado) => {
              pasos.cerrar(3);
              dispatch({ tipo: 'cambiarPintado', pintado });
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    // onMouseMove (no onMouseEnter): cerrar el ③ solo si de verdad se mueve el
    // ratón por aquí, no si simplemente queda quieto tras un scroll o un layout shift.
    <div onMouseMove={() => pasos.cerrar(3)}>
      <PasoCard
        numero={4}
        titulo="Suplementos"
        abierto={pasos.estado[4] ?? false}
        alAlternar={() => pasos.alternar(4)}
      >
        {contenido}
      </PasoCard>
    </div>
  );
}
