/**
 * Apertura/cierre de las tarjetas de paso (①-④) del panel izquierdo.
 *
 * Empieza con solo el paso 1 abierto; al completarse un paso (transición de
 * incompleto → completo) se cierra automáticamente y se abre el siguiente
 * (decisión de UX: guiar el flujo sin tocar el motor ni el estado de la
 * cotización). El usuario puede reabrir o cerrar cualquier paso a mano en
 * cualquier momento; hacerlo no se deshace por este automatismo.
 *
 * Excepción — paso ③ Medidas (ver `PasoMedidas`/`PasoSuplementos`): NUNCA se
 * cierra solo porque las medidas ya sean válidas (`useAbrirAlCompletar` abre
 * el ④ sin tocar el ③). El ③ solo se cierra si el comercial ya está actuando
 * en Suplementos: activa uno, o mueve el ratón por esa tarjeta.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ContextoPasos {
  readonly estado: Readonly<Record<number, boolean>>;
  readonly alternar: (numero: number) => void;
  readonly avanzar: (numero: number) => void;
  readonly abrir: (numero: number) => void;
  readonly cerrar: (numero: number) => void;
}

const Contexto = createContext<ContextoPasos | null>(null);

export function ProveedorPasos({
  children,
  inicial = { 1: true },
}: {
  children: ReactNode;
  /** Estado de apertura inicial; solo para tests que montan un paso aislado. */
  inicial?: Readonly<Record<number, boolean>>;
}): JSX.Element {
  const [estado, setEstado] = useState<Record<number, boolean>>(inicial);

  const alternar = useCallback((numero: number) => {
    setEstado((previo) => ({ ...previo, [numero]: !(previo[numero] ?? false) }));
  }, []);

  const avanzar = useCallback((numero: number) => {
    setEstado((previo) => ({ ...previo, [numero]: false, [numero + 1]: true }));
  }, []);

  const abrir = useCallback((numero: number) => {
    setEstado((previo) => ({ ...previo, [numero]: true }));
  }, []);

  const cerrar = useCallback((numero: number) => {
    setEstado((previo) => ({ ...previo, [numero]: false }));
  }, []);

  return (
    <Contexto.Provider value={{ estado, alternar, avanzar, abrir, cerrar }}>{children}</Contexto.Provider>
  );
}

export function usePasos(): ContextoPasos {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('usePasos debe usarse dentro de <ProveedorPasos>');
  return ctx;
}

/**
 * Al pasar de incompleto a completo, cierra este paso y abre el siguiente.
 * Cada `PasoX` llama esto con su propia condición de "completo" (§ ver cada
 * paso: material seleccionado, figura elegida, medidas válidas...).
 *
 * `retrasoMs` (por defecto 0, instantáneo): en pasos de texto libre (medidas)
 * un solo dígito ya puede ser un valor válido (p. ej. mínimo 1 cm) sin que el
 * comercial haya terminado de teclear — con retraso, si vuelve a quedar
 * incompleto antes de que pase el tiempo (sigue escribiendo, borra...), el
 * avance se cancela y no se nota. En pasos de una sola acción (seleccionar
 * material/figura) no hace falta: 0 está bien.
 */
export function usePasoCompletado(numero: number, completo: boolean, retrasoMs = 0): void {
  const { avanzar } = usePasos();
  const eraCompleto = useRef(completo);
  useEffect(() => {
    const transicionoACompleto = completo && !eraCompleto.current;
    eraCompleto.current = completo;
    if (!transicionoACompleto) return;

    if (retrasoMs === 0) {
      avanzar(numero);
      return;
    }
    const temporizador = setTimeout(() => avanzar(numero), retrasoMs);
    return () => clearTimeout(temporizador);
  }, [completo, numero, avanzar, retrasoMs]);
}

/**
 * Al pasar de incompleto a completo, ABRE el paso indicado SIN cerrar ningún
 * otro (a diferencia de `usePasoCompletado`). Para el paso ③ Medidas: se
 * quiere que Suplementos se pueda ir viendo/rellenando sin que Medidas se
 * cierre solo (el comercial puede seguir ajustando medidas). Quien cierra el
 * ③ es `usePasos().cerrar(3)`, llamado desde Suplementos (ver PasoSuplementos).
 */
export function useAbrirAlCompletar(numero: number, completo: boolean, retrasoMs = 0): void {
  const { abrir } = usePasos();
  const eraCompleto = useRef(completo);
  useEffect(() => {
    const transicionoACompleto = completo && !eraCompleto.current;
    eraCompleto.current = completo;
    if (!transicionoACompleto) return;

    if (retrasoMs === 0) {
      abrir(numero);
      return;
    }
    const temporizador = setTimeout(() => abrir(numero), retrasoMs);
    return () => clearTimeout(temporizador);
  }, [completo, numero, abrir, retrasoMs]);
}
