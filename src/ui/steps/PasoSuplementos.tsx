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
 * Los suplementos POR PIEZA («Angular») llevan además un campo con a cuántas
 * piezas se aplican: es un remate del extremo y en un tramo de escalera solo lo
 * llevan las de esquina, no todas (2026-07-30, indicación directa). Los de por cm
 * recorren la pieza entera y se aplican siempre a toda la cantidad.
 *
 * Este paso no cierra ninguna otra tarjeta. Antes cerraba el ③ Medidas al
 * activar un suplemento y al pasar el ratón por encima; se quitó (2026-07-29,
 * indicación directa) porque cerraba una tarjeta que el comercial estaba usando,
 * en el caso del ratón sin que hubiera tocado nada. Ver `pasos-context`: el
 * automatismo solo abre pasos.
 */

import type { Suplemento } from '../../domain/config';
import { aplicarMargen, figuraPorId } from '../../domain/engine';
import { formatearEuros } from '../../domain/money';
import type { Centimos, MargenCentesimas } from '../../domain/types';
import { useConfig } from '../state/config-context';
import { useAtelier, useSalidaMotor } from '../state/quote-state';
import { usePasos } from '../state/pasos-context';
import { FilaConmutador, InfoTooltip, PasoCard } from '../components/primitivas';

/**
 * Precio del suplemento para mostrar junto al conmutador. Las milésimas se
 * convierten a € SOLO para presentación (el cálculo sigue en enteros en el
 * motor). «€/peldaño» sigue el ejemplo de la spec (§1.④); los suplementos
 * porPieza actuales aplican a peldaños.
 *
 * **Con el MARGEN aplicado** (2026-07-31, indicación directa: los precios de los
 * suplementos de este paso también lo llevan). Si aquí se enseñara el coste, el
 * comercial leería un precio y luego vería otro en la cotización.
 *
 * `margen` es null mientras no haya cotización (sin material o sin margen
 * resoluble): entonces se muestra el precio de tarifa, que es lo único que se
 * sabe.
 */
function precioSuplementoTexto(suplemento: Suplemento, margen: MargenCentesimas | null): string {
  const conMargen = (centimos: Centimos): Centimos =>
    margen === null ? centimos : aplicarMargen(centimos, margen);

  // Un suplemento a 0 € existe para DEJAR CONSTANCIA de la elección en la orden
  // de trabajo («Sin microbisel», 2026-07-31), no para cobrar. Decirlo con
  // palabras evita que un «+0,00 €/cm» se lea como un precio sin configurar.
  if (suplemento.precioCentimos === 0 || suplemento.precioMilesimasPorCm === 0) {
    return 'Sin coste';
  }
  if (suplemento.tipo === 'porPieza' && suplemento.precioCentimos != null) {
    return `+${formatearEuros(conMargen(suplemento.precioCentimos))}/peldaño`;
  }
  if (suplemento.tipo === 'porCm' && suplemento.precioMilesimasPorCm != null) {
    // Las milésimas se escalan con el mismo factor; se redondea a milésimas para
    // no arrastrar decimales que no se muestran.
    const milesimas =
      margen === null
        ? suplemento.precioMilesimasPorCm
        : Math.round((suplemento.precioMilesimasPorCm * (10_000 + margen)) / 10_000);
    const texto = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 3,
    }).format(milesimas / 1000);
    return `+${texto}/cm`;
  }
  return '';
}

/**
 * Campo «piezas con este remate» de un suplemento por pieza. Va FUERA del
 * `<label>` del conmutador: dentro, cualquier clic en el campo alternaría la
 * casilla.
 */
function UnidadesSuplemento({
  id,
  nombre,
  unidades,
  cantidad,
  error,
  alCambiar,
}: {
  readonly id: string;
  readonly nombre: string;
  readonly unidades: string;
  readonly cantidad: string;
  readonly error: string | undefined;
  readonly alCambiar: (unidades: string) => void;
}): JSX.Element {
  const idCampo = `unidades-${id}`;
  return (
    <div className="px-2 pb-2 pl-9">
      <div className="flex items-center gap-2">
        <label htmlFor={idCampo} className="text-xs text-slate-600">
          Piezas con {nombre.toLowerCase()}
        </label>
        <input
          id={idCampo}
          type="text"
          inputMode="numeric"
          value={unidades}
          onChange={(e) => alCambiar(e.target.value)}
          aria-label={`Piezas con ${nombre}`}
          className={`w-16 rounded-md border px-2 py-1 text-sm shadow-sm outline-none transition-colors focus:border-marca focus:ring-2 focus:ring-marca/20 ${
            error ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'
          }`}
        />
        <span className="text-xs text-slate-500">de {cantidad}</span>
      </div>
      {error ? <p className="pt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
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
  const salida = useSalidaMotor(config);
  const errorDe = (id: string): string | undefined =>
    salida != null && !salida.ok
      ? salida.errores.find((e) => e.paso === 'suplementos' && e.medida === id)?.mensaje
      : undefined;

  const figura = estado.figuraId ? figuraPorId(config, estado.figuraId) : undefined;
  // Margen del resultado, para mostrar los precios de venta y no los de coste.
  const margen = salida != null && salida.ok ? salida.resultado.margen.centesimas : null;

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
          const activo = estado.suplementos[idSuplemento] === true;
          return (
            <div key={idSuplemento}>
              <FilaConmutador
                etiqueta={suplemento.nombre}
                detalle={precioSuplementoTexto(suplemento, margen)}
                activo={activo}
                alCambiar={(marcado) =>
                  dispatch({ tipo: 'alternarSuplemento', suplemento: idSuplemento, activo: marcado })
                }
              />
              {activo && suplemento.tipo === 'porPieza' ? (
                <UnidadesSuplemento
                  id={idSuplemento}
                  nombre={suplemento.nombre}
                  unidades={estado.unidadesSuplemento[idSuplemento] ?? ''}
                  cantidad={estado.cantidad}
                  error={errorDe(idSuplemento)}
                  alCambiar={(unidades) =>
                    dispatch({ tipo: 'cambiarUnidadesSuplemento', suplemento: idSuplemento, unidades })
                  }
                />
              ) : null}
            </div>
          );
        })}
        {figura.tienePintado ? (
          <FilaPintado
            activo={estado.pintado}
            alCambiar={(pintado) => dispatch({ tipo: 'cambiarPintado', pintado })}
          />
        ) : null}
      </div>
    );
  }

  return (
    <PasoCard
      numero={4}
      titulo="Suplementos"
      abierto={pasos.estado[4] ?? false}
      alAlternar={() => pasos.alternar(4)}
    >
      {contenido}
    </PasoCard>
  );
}
