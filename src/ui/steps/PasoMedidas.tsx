/**
 * Paso ③ Medidas y cantidad (§1.③).
 *
 * Campos dinámicos según `figura.medidas` de configuración: entrada numérica
 * libre o control segmentado cuando la medida solo admite valores concretos
 * (`opcionesCm`, p. ej. altura de rodapié 7,2 / 8 cm), más el campo cantidad
 * (entero ≥ 1). El usuario introduce cm; la conversión a mm y la validación
 * viven en el motor.
 *
 * Los errores del motor (`useSalidaMotor`) se muestran JUNTO A SU CAMPO
 * (`errores[].medida`), con el mensaje concreto de taller — nunca un genérico
 * "configuración no válida" (§1.③). Los errores del paso sin medida concreta
 * se listan al final del paso.
 *
 * Tres detalles de UX para no ser molesto:
 *  - Los errores no se muestran hasta que el comercial ha tecleado algo en
 *    este paso (`medidasTecleadas`): recién seleccionada la figura, las
 *    medidas están vacías por definición — eso no es todavía un error que
 *    enseñar. El resumen de `PanelCotizacion` aplica el mismo criterio.
 *  - Este paso NUNCA se cierra solo por completarse (a diferencia de los
 *    pasos ①/②): el comercial puede seguir viendo/tocando las medidas
 *    mientras ya mira Suplementos. En cuanto las medidas son válidas, se abre
 *    el paso ④ (`useAbrirAlCompletar`, con un pequeño retraso: un solo dígito
 *    ya puede ser válido sin que se haya terminado de teclear) — pero el ③
 *    solo lo cierra `PasoSuplementos` cuando el comercial empieza a actuar allí.
 */

import type { ErrorValidacion } from '../../domain/types';
import { figuraPorId } from '../../domain/engine';
import { useConfig } from '../state/config-context';
import { medidasTecleadas, useAtelier, useSalidaMotor } from '../state/quote-state';
import { useAbrirAlCompletar, usePasos } from '../state/pasos-context';
import { Campo, ControlSegmentado, EntradaNumero, PasoCard } from '../components/primitivas';
import { CampoGrupo } from './CampoGrupo';

const FORMATO_CM = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
/** Retraso al abrir el paso ④ (ver cabecera del módulo). */
const RETRASO_ABRIR_MS = 700;

export function PasoMedidas(): JSX.Element {
  const config = useConfig();
  const { estado, dispatch } = useAtelier();
  const salida = useSalidaMotor(config);
  const pasos = usePasos();
  useAbrirAlCompletar(4, salida != null && salida.ok, RETRASO_ABRIR_MS);

  const figura = estado.figuraId ? figuraPorId(config, estado.figuraId) : undefined;

  // Errores del motor que pertenecen a este paso, indexados por medida.
  // «Cantidad» nunca empieza vacía (por defecto '1'): su error se enseña en
  // cuanto aparece. Las medidas de la figura sí empiezan vacías al elegirla,
  // así que esperan a `medidasTecleadas` para no ser prematuras.
  const erroresPaso: readonly ErrorValidacion[] =
    salida != null && !salida.ok
      ? salida.errores.filter(
          (e) => e.paso === 'medidas' && (e.medida === 'cantidad' || medidasTecleadas(estado)),
        )
      : [];
  const errorDe = (medida: string): string | undefined =>
    erroresPaso.find((e) => e.medida === medida)?.mensaje;
  const erroresSinMedida = erroresPaso.filter((e) => e.medida == null);

  return (
    <PasoCard
      numero={3}
      titulo="Medidas y cantidad"
      abierto={pasos.estado[3] ?? false}
      alAlternar={() => pasos.alternar(3)}
    >
      {!figura ? (
        <p className="text-sm text-slate-500">Selecciona primero una figura en el paso 2.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {figura.medidas.map((campo) => {
              const valor = estado.medidas[campo.id] ?? '';
              const error = errorDe(campo.id);
              if (campo.opcionesCm) {
                return (
                  <CampoGrupo key={campo.id} etiqueta={campo.etiqueta} error={error}>
                    <div>
                      <ControlSegmentado
                        opciones={campo.opcionesCm.map((opcion) => ({
                          valor: String(opcion),
                          etiqueta: FORMATO_CM.format(opcion),
                        }))}
                        valor={valor}
                        alCambiar={(v) =>
                          dispatch({ tipo: 'cambiarMedida', medida: campo.id, valor: v })
                        }
                        ariaLabel={campo.etiqueta}
                      />
                    </div>
                  </CampoGrupo>
                );
              }
              return (
                <Campo key={campo.id} etiqueta={campo.etiqueta} error={error}>
                  <EntradaNumero
                    valor={valor}
                    alCambiar={(v) =>
                      dispatch({ tipo: 'cambiarMedida', medida: campo.id, valor: v })
                    }
                    invalido={error != null}
                    placeholder={FORMATO_CM.format(campo.minCm)}
                  />
                </Campo>
              );
            })}
            <Campo etiqueta="Cantidad" error={errorDe('cantidad')}>
              <EntradaNumero
                valor={estado.cantidad}
                alCambiar={(v) => dispatch({ tipo: 'cambiarCantidad', cantidad: v })}
                invalido={errorDe('cantidad') != null}
                inputMode="numeric"
                placeholder="1"
              />
            </Campo>
          </div>
          {erroresSinMedida.length > 0 ? (
            <ul className="space-y-1">
              {erroresSinMedida.map((error, i) => (
                <li key={i} className="text-sm text-red-600">
                  {error.mensaje}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </PasoCard>
  );
}
