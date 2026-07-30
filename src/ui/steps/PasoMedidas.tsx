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
 *  - El error de una medida se enseña CAMPO A CAMPO, no de golpe: solo cuando
 *    el comercial ya ha pasado por ese campo y lo ha dejado atrás (blur), o
 *    cuando ha cerrado el paso dejándolo sin rellenar. Antes bastaba teclear en
 *    una medida para que TODAS las demás se pintaran en rojo de golpe
 *    (`medidasTecleadas`, criterio de paso completo), lo que señalaba como error
 *    campos que aún no le había tocado el turno (2026-07-29, indicación
 *    directa). «Cantidad» es la excepción: nunca empieza vacía, así que si su
 *    valor es inválido es porque se ha tecleado así, y se avisa al momento.
 *  - Este paso no se cierra solo (ningún paso lo hace: el automatismo solo
 *    abre, ver `pasos-context`). El comercial puede seguir viendo y tocando las
 *    medidas mientras ya mira Suplementos. En cuanto las medidas son válidas se
 *    abre el paso ④, con un pequeño retraso: un solo dígito ya puede ser válido
 *    sin que se haya terminado de teclear.
 */

import { useEffect, useRef, useState } from 'react';
import type { ErrorValidacion } from '../../domain/types';
import { figuraPorId } from '../../domain/engine';
import { useConfig } from '../state/config-context';
import { useAtelier, useSalidaMotor } from '../state/quote-state';
import { usePasoCompletado, usePasos } from '../state/pasos-context';
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
  usePasoCompletado(3, salida != null && salida.ok, RETRASO_ABRIR_MS);
  const abierto = pasos.estado[3] ?? false;

  // Campos por los que el comercial ya ha pasado (ver cabecera del módulo).
  const [tocadas, setTocadas] = useState<Readonly<Record<string, true>>>({});
  const [pasoSaltado, setPasoSaltado] = useState(false);
  const marcarTocada = (medida: string): void =>
    setTocadas((previo) => (previo[medida] ? previo : { ...previo, [medida]: true }));

  // Cerrar el paso cuenta como saltarlo: al volver a abrirlo, lo que quedó sin
  // rellenar ya se ve en rojo.
  const eraAbierto = useRef(abierto);
  useEffect(() => {
    if (eraAbierto.current && !abierto) setPasoSaltado(true);
    eraAbierto.current = abierto;
  }, [abierto]);

  // Otra figura son otros campos: se vuelve a empezar sin nada marcado.
  const figuraId = estado.figuraId;
  useEffect(() => {
    setTocadas({});
    setPasoSaltado(false);
  }, [figuraId]);

  const figura = figuraId ? figuraPorId(config, figuraId) : undefined;

  /** true si el error de esta medida ya se puede enseñar sin ser prematuro. */
  const seEnsena = (medida: string | null | undefined): boolean =>
    pasoSaltado || medida == null || medida === 'cantidad' || tocadas[medida] === true;

  // Errores del motor que pertenecen a este paso, indexados por medida.
  const erroresPaso: readonly ErrorValidacion[] =
    salida != null && !salida.ok
      ? salida.errores.filter((e) => e.paso === 'medidas' && seEnsena(e.medida))
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
                        alCambiar={(v) => {
                          marcarTocada(campo.id);
                          dispatch({ tipo: 'cambiarMedida', medida: campo.id, valor: v });
                        }}
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
                    onBlur={() => marcarTocada(campo.id)}
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
